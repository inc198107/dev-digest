import { describe, it, expect, beforeEach } from 'vitest';
import type { ConventionCandidate, ConventionList, ConventionUpdateBody, RepoRef } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { CONFIG_FILES } from '../src/modules/conventions/constants.js';
import type { ConventionDraft } from '../src/modules/conventions/domain.js';
import type { ConventionsStore, RepoSources, ScanRepo } from '../src/modules/conventions/ports.js';
import { ConfigError, ConflictError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';

/**
 * Conventions use cases against in-memory fakes of their own ports and the MockLLMProvider
 * (`structuredBySchema` answers the scan's single call): no Postgres, no Container, no vi.mock.
 * The real store and routes are covered by conventions.it.test.ts.
 */

const WS = 'ws-1';
const REPO = 'repo-1';

/** In-memory ConventionsStore; keeps insertion order as `created_at`. */
class FakeStore implements ConventionsStore {
  rows: (ConventionCandidate & { workspaceId: string; repoId: string; createdAt: number })[] = [];
  private seq = 0;
  private clock = 0;

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const rows = this.rows.filter((r) => r.workspaceId === workspaceId && r.repoId === repoId);
    const newest = rows.reduce((max, r) => Math.max(max, r.createdAt), 0);
    return {
      candidates: rows.sort((a, b) => b.confidence - a.confidence).map(strip),
      last_scan_at: newest ? new Date(newest).toISOString() : null,
    };
  }
  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    return (await this.list(workspaceId, repoId)).candidates.filter((c) => c.accepted);
  }
  async update(workspaceId: string, id: string, patch: ConventionUpdateBody) {
    const row = this.rows.find((r) => r.id === id && r.workspaceId === workspaceId);
    if (!row) return undefined;
    Object.assign(row, patch);
    return strip(row);
  }
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && r.workspaceId === workspaceId));
    return this.rows.length < before;
  }
  async setAllAccepted(workspaceId: string, repoId: string, accepted: boolean): Promise<void> {
    for (const r of this.rows) if (r.workspaceId === workspaceId && r.repoId === repoId) r.accepted = accepted;
  }
  async deletePending(workspaceId: string, repoId: string): Promise<void> {
    this.rows = this.rows.filter((r) => !(r.workspaceId === workspaceId && r.repoId === repoId && !r.accepted));
  }
  async insertMany(workspaceId: string, repoId: string, drafts: ConventionDraft[]): Promise<void> {
    this.clock += 1000;
    for (const d of drafts) {
      this.rows.push({ ...d, id: `c-${++this.seq}`, accepted: false, workspaceId, repoId, createdAt: this.clock });
    }
  }
  async touchAccepted(workspaceId: string, repoId: string): Promise<void> {
    for (const r of this.rows) {
      if (r.workspaceId === workspaceId && r.repoId === repoId && r.accepted) r.createdAt = this.clock;
    }
  }
}

/**
 * @param row A fake row.
 * @returns The contract shape.
 */
function strip(row: FakeStore['rows'][number]): ConventionCandidate {
  const { workspaceId: _w, repoId: _r, createdAt: _c, ...rest } = row;
  return rest;
}

const FILES: Record<string, string> = {
  'src/api/users.ts': 'export async function getUser(id: string) {\n  const user = await db.users.find(id);\n  return user;\n}\n',
  'src/lib/redis.ts': "import Redis from 'ioredis';\nexport const redis = new Redis(config.redisUrl);\n",
  'src/api/public/index.ts': 'export function handler(): Result<Item[], ApiError> {\n  return ok(items);\n}\n',
};

const TSCONFIG = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
const ESLINTRC = '{\n  "rules": { "no-default-export": "error" }\n}\n';

/** RepoSources fake that records every read and every sample size asked for. */
class FakeSources implements RepoSources {
  reads: string[] = [];
  sampleSizes: number[] = [];
  repo: ScanRepo | undefined = { ref: { owner: 'acme', name: 'payments-api' }, name: 'payments-api', cloned: true };
  pool = Object.keys(FILES);
  files: Record<string, string> = { ...FILES };

  async findRepo(workspaceId: string, repoId: string) {
    return workspaceId === WS && repoId === REPO ? this.repo : undefined;
  }
  async samplePaths(_repoId: string, n: number): Promise<string[]> {
    this.sampleSizes.push(n);
    return this.pool;
  }
  async readFile(_repo: RepoRef, path: string): Promise<string | null> {
    this.reads.push(path);
    return this.files[path] ?? null;
  }
}

const EXTRACTION = {
  conventions: [
    {
      rule: 'Always use async/await instead of .then() chains',
      evidence_path: 'src/api/users.ts',
      start_line: 1,
      end_line: 3,
      confidence: 0.91,
    },
    {
      rule: 'Redis access goes through the src/lib/redis.ts singleton',
      evidence_path: 'src/lib/redis.ts',
      start_line: 2,
      end_line: 2,
      confidence: 0.85,
    },
    { rule: 'Ungrounded rule', evidence_path: 'src/secret.ts', start_line: 1, end_line: 2, confidence: 0.99 },
  ],
};

describe('ConventionsService', () => {
  let store: FakeStore;
  let sources: FakeSources;
  let llm: MockLLMProvider;
  let service: ConventionsService;

  /**
   * @param fixtures structuredBySchema fixtures of the mock model.
   * @returns A service wired to the fakes.
   */
  function build(fixtures: Record<string, unknown>): ConventionsService {
    llm = new MockLLMProvider('openai', { structuredBySchema: fixtures });
    return new ConventionsService({
      store,
      uow: { run: (work) => work(store) },
      sources,
      model: async () => ({ llm, model: 'cheap-model' }),
    });
  }

  beforeEach(() => {
    store = new FakeStore();
    sources = new FakeSources();
    service = build({ ConventionExtraction: EXTRACTION });
  });

  /**
   * @returns The user message of the scan's model call.
   */
  function promptOfCall(): string {
    const req = llm.calls[0]!.req as { messages: { role: string; content: string }[] };
    return req.messages[1]!.content;
  }

  it('scans with exactly one model call and stores only grounded conventions', async () => {
    const result = await service.extract(WS, REPO);

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ method: 'completeStructured', req: { schemaName: 'ConventionExtraction' } });
    expect(result.analyzed_files).toEqual(['src/api/users.ts', 'src/lib/redis.ts', 'src/api/public/index.ts']);
    expect(result.candidates.map((c) => [c.rule, c.evidence_path, c.accepted])).toEqual([
      ['Always use async/await instead of .then() chains', 'src/api/users.ts:1-3', false],
      ['Redis access goes through the src/lib/redis.ts singleton', 'src/lib/redis.ts:2', false],
    ]);
    expect(result.candidates[1]?.evidence_snippet).toBe('export const redis = new Redis(config.redisUrl);');
    expect(result.last_scan_at).not.toBeNull();
  });

  it('asks repo-intel for the top 12 files', async () => {
    await service.extract(WS, REPO);
    expect(sources.sampleSizes).toEqual([12]);
  });

  it('reads only paths chosen by code: the sample and the config allowlist', async () => {
    await service.extract(WS, REPO);
    expect(sources.reads.every((p) => sources.pool.includes(p) || CONFIG_FILES.includes(p))).toBe(true);
    expect(sources.reads).toEqual(expect.arrayContaining([...CONFIG_FILES, ...sources.pool]));
  });

  it('sends the files as untrusted, numbered data with the chosen model', async () => {
    await service.extract(WS, REPO);
    const req = llm.calls[0]!.req as { model: string };
    expect(req.model).toBe('cheap-model');
    expect(promptOfCall()).toContain('<untrusted source="file:src/api/users.ts">');
    expect(promptOfCall()).toContain('2|   const user = await db.users.find(id);');
  });

  it('includes the config files that exist, before the sample, and grounds rules in them', async () => {
    sources.files = { ...FILES, 'tsconfig.json': TSCONFIG, '.eslintrc.json': ESLINTRC };
    service = build({
      ConventionExtraction: {
        conventions: [
          ...EXTRACTION.conventions,
          { rule: 'Compile with strict type checks', evidence_path: 'tsconfig.json', start_line: 3, end_line: 3, confidence: 0.8 },
        ],
      },
    });

    const result = await service.extract(WS, REPO);
    expect(llm.calls).toHaveLength(1);
    expect(result.analyzed_files).toEqual(['.eslintrc.json', 'tsconfig.json', ...sources.pool]);
    expect(promptOfCall()).toContain('Config files (2)');
    expect(promptOfCall()).toContain('<untrusted source="file:tsconfig.json">');
    expect(result.candidates.find((c) => c.rule === 'Compile with strict type checks')).toMatchObject({
      evidence_path: 'tsconfig.json:3',
      evidence_snippet: '"strict": true',
    });
  });

  it('leaves configs out of the prompt when the repo has none', async () => {
    const result = await service.extract(WS, REPO);
    expect(result.analyzed_files).toEqual(sources.pool);
    expect(promptOfCall()).not.toContain('Config files');
  });

  it('keeps accepted (reworded) conventions on a re-scan and skips their repeats', async () => {
    const first = await service.extract(WS, REPO);
    const kept = first.candidates[0]!;
    await service.update(WS, kept.id, { accepted: true, rule: 'always use async/await instead of .then() chains.' });

    const second = await service.extract(WS, REPO);
    const rules = second.candidates.map((c) => c.rule);
    expect(rules.filter((r) => r.toLowerCase().includes('async/await'))).toHaveLength(1);
    expect(second.candidates.find((c) => c.id === kept.id)?.accepted).toBe(true);
    expect(rules).toContain('Redis access goes through the src/lib/redis.ts singleton');
  });

  it('moves the last scan time even when a re-scan stores nothing new', async () => {
    const first = await service.extract(WS, REPO);
    await service.setAllAccepted(WS, REPO, true);

    const second = await service.extract(WS, REPO);
    expect(second.candidates.map((c) => c.id).sort()).toEqual(first.candidates.map((c) => c.id).sort());
    expect(Date.parse(second.last_scan_at!)).toBeGreaterThan(Date.parse(first.last_scan_at!));
  });

  it('stores nothing when the extraction call fails', async () => {
    await service.extract(WS, REPO);
    const before = store.rows.map((r) => r.id);
    service = build({ ConventionExtraction: { wrong: 1 } });

    await expect(service.extract(WS, REPO)).rejects.toBeInstanceOf(ExternalServiceError);
    expect(store.rows.map((r) => r.id)).toEqual(before);
  });

  it('passes a missing key through as ConfigError', async () => {
    service = new ConventionsService({
      store,
      uow: { run: (work) => work(store) },
      sources,
      model: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    });
    await expect(service.extract(WS, REPO)).rejects.toBeInstanceOf(ConfigError);
  });

  it('refuses a repo that is unknown, not cloned or not indexed', async () => {
    await expect(service.extract(WS, 'other-repo')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.extract('other-ws', REPO)).rejects.toBeInstanceOf(NotFoundError);

    sources.repo = { ...sources.repo!, cloned: false };
    await expect(service.extract(WS, REPO)).rejects.toThrow(/not cloned/);

    sources.repo = { ...sources.repo, cloned: true };
    sources.pool = [];
    await expect(service.extract(WS, REPO)).rejects.toBeInstanceOf(ConflictError);
    expect(llm.calls).toHaveLength(0);
  });

  it('does not scan on config files alone', async () => {
    sources.files = { 'tsconfig.json': TSCONFIG };

    sources.pool = [];
    await expect(service.extract(WS, REPO)).rejects.toThrow(/not indexed/);

    sources.pool = ['src/gone.ts'];
    await expect(service.extract(WS, REPO)).rejects.toThrow(/None of the sampled files could be read/);
    expect(llm.calls).toHaveLength(0);
  });

  it('accepts all, deselects all and rejects one', async () => {
    await service.extract(WS, REPO);
    const all = await service.setAllAccepted(WS, REPO, true);
    expect(all.candidates.every((c) => c.accepted)).toBe(true);

    const none = await service.setAllAccepted(WS, REPO, false);
    expect(none.candidates.some((c) => c.accepted)).toBe(false);

    const id = none.candidates[0]!.id;
    expect(await service.reject(WS, id)).toBe(true);
    expect(await service.reject(WS, id)).toBe(false);
    expect((await service.list(WS, REPO)).candidates.map((c) => c.id)).not.toContain(id);
  });
});
