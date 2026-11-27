import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions Extractor on Postgres: every route with its response schema, the scan through the
 * real repo-intel facade (`file_rank` rows → `getConventionSamples`) plus the root config files,
 * read by the mock git client, with a single model call; re-scan keeping accepted conventions,
 * workspace scoping, `created_at` as the last scan, and a skill saved from conventions
 * (`source: extracted`, `evidence_files`).
 */

/** Ranked files (`file_rank` rows); the test file is dropped by repo-intel's junk filter. */
const SOURCES: Record<string, string> = {
  'src/api/users.ts': 'export async function getUser(id: string) {\n  const user = await db.users.find(id);\n  return user;\n}\n',
  'src/lib/redis.ts': "import Redis from 'ioredis';\nexport const redis = new Redis(config.redisUrl);\n",
  'src/api/users.test.ts': "it('works', () => {});\n",
};

/** Everything in the clone: the ranked files and a root tsconfig.json (not ranked). */
const FILES: Record<string, string> = {
  ...SOURCES,
  'tsconfig.json': '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n',
};

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
    { rule: 'Compile with strict type checks', evidence_path: 'tsconfig.json', start_line: 3, end_line: 3, confidence: 0.8 },
    { rule: 'Rule from a test file', evidence_path: 'src/api/users.test.ts', start_line: 1, end_line: 1, confidence: 0.7 },
  ],
};

d('conventions module (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let uncloned: string;
  let unindexed: string;
  let otherRepoId: string;
  let otherConventionId: string;
  let llm: MockLLMProvider;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv-repo', fullName: 'acme/conv-repo', clonePath: '/mock/clones/acme/conv-repo' })
      .returning();
    repoId = repo!.id;
    await db.insert(t.fileRank).values(
      Object.keys(SOURCES).map((filePath, i) => ({ repoId, filePath, pagerank: 1 - i / 10, hotness: 0, rank: 1 - i / 10, percentile: 90 })),
    );
    const [seeded] = await db.select().from(t.repos).where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
    uncloned = seeded!.id;
    const [notIndexed] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'conv-unranked', fullName: 'acme/conv-unranked', clonePath: '/mock/clones/acme/conv-unranked' })
      .returning();
    unindexed = notIndexed!.id;

    const [other] = await db.insert(t.workspaces).values({ name: 'other-conventions' }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'x', name: 'y', fullName: 'x/y', clonePath: '/mock/clones/x/y' })
      .returning();
    otherRepoId = otherRepo!.id;
    const [conv] = await db
      .insert(t.conventions)
      .values({ workspaceId: other!.id, repoId: otherRepoId, rule: 'Foreign rule', evidencePath: 'a.ts:1', evidenceSnippet: 'a', confidence: 0.5 })
      .returning();
    otherConventionId = conv!.id;
  });

  afterAll(async () => {
    await pg?.stop();
  });

  beforeEach(async () => {
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
    llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionExtraction: EXTRACTION },
    });
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        llm: { openai: llm, openrouter: llm, anthropic: llm },
      },
    });
  });

  /**
   * @returns The parsed body of a scan of the test repo.
   */
  async function scan() {
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);
    return res.json() as {
      candidates: { id: string; rule: string; evidence_path: string; evidence_snippet: string; accepted: boolean }[];
      last_scan_at: string | null;
      analyzed_files: string[];
    };
  }

  it('lists nothing before the first scan', async () => {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ candidates: [], last_scan_at: null });
    await app.close();
  });

  it('scans the root configs and the repo-intel sample in one model call, grounds the rules and records the scan time', async () => {
    const result = await scan();

    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(result.analyzed_files).toEqual(['tsconfig.json', 'src/api/users.ts', 'src/lib/redis.ts']);
    expect(result.candidates.map((c) => [c.rule, c.evidence_path, c.accepted])).toEqual([
      ['Always use async/await instead of .then() chains', 'src/api/users.ts:1-3', false],
      ['Redis access goes through the src/lib/redis.ts singleton', 'src/lib/redis.ts:2', false],
      ['Compile with strict type checks', 'tsconfig.json:3', false],
    ]);
    expect(result.candidates[1]!.evidence_snippet).toBe('export const redis = new Redis(config.redisUrl);');
    expect(result.candidates[2]!.evidence_snippet).toBe('"strict": true');
    expect(Date.parse(result.last_scan_at!)).toBeGreaterThan(Date.now() - 60_000);

    const listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(listed).toEqual({ candidates: result.candidates, last_scan_at: result.last_scan_at });
    await app.close();
  });

  it('rewords, accepts, accepts all, deselects all and rejects', async () => {
    const [first, second] = (await scan()).candidates;

    const reworded = await app.inject({
      method: 'PUT',
      url: `/conventions/${first!.id}`,
      payload: { rule: '  Use async/await, never .then()  ', accepted: true },
    });
    expect(reworded.statusCode).toBe(200);
    expect(reworded.json()).toMatchObject({ id: first!.id, rule: 'Use async/await, never .then()', accepted: true });

    expect((await app.inject({ method: 'PUT', url: `/conventions/${first!.id}`, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'PUT', url: `/conventions/${first!.id}`, payload: { rule: ' ' } })).statusCode).toBe(422);

    const all = await app.inject({ method: 'PUT', url: `/repos/${repoId}/conventions/accepted`, payload: { accepted: true } });
    expect(all.json().candidates.every((c: { accepted: boolean }) => c.accepted)).toBe(true);
    const none = await app.inject({ method: 'PUT', url: `/repos/${repoId}/conventions/accepted`, payload: { accepted: false } });
    expect(none.json().candidates.some((c: { accepted: boolean }) => c.accepted)).toBe(false);

    expect((await app.inject({ method: 'DELETE', url: `/conventions/${second!.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${second!.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('re-scan keeps the accepted convention and replaces the rest', async () => {
    const [first] = (await scan()).candidates;
    await app.inject({ method: 'PUT', url: `/conventions/${first!.id}`, payload: { accepted: true, rule: 'Prefer async/await' } });

    const again = await scan();
    expect(again.candidates.find((c) => c.id === first!.id)).toMatchObject({ rule: 'Prefer async/await', accepted: true });
    expect(again.candidates).toHaveLength(4);
    expect(again.candidates.filter((c) => !c.accepted).map((c) => c.id)).not.toContain(first!.id);
    await app.close();
  });

  it('re-stamps accepted conventions, so the last scan moves when nothing new is stored', async () => {
    const first = await scan();
    await app.inject({ method: 'PUT', url: `/repos/${repoId}/conventions/accepted`, payload: { accepted: true } });

    const second = await scan();
    expect(second.candidates.map((c) => c.id).sort()).toEqual(first.candidates.map((c) => c.id).sort());
    expect(Date.parse(second.last_scan_at!)).toBeGreaterThan(Date.parse(first.last_scan_at!));
    await app.close();
  });

  it('scopes every route to the workspace', async () => {
    expect((await app.inject({ method: 'GET', url: `/repos/${otherRepoId}/conventions` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/repos/${otherRepoId}/conventions/extract` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/conventions/${otherConventionId}`, payload: { accepted: true } })).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/conventions/${otherConventionId}` })).statusCode).toBe(404);
    const [foreign] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.id, otherConventionId));
    expect(foreign).toMatchObject({ accepted: false, rule: 'Foreign rule' });
    await app.close();
  });

  it('answers 409 for a repo that is not cloned, without calling the model', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${uncloned}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/not cloned/);
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('answers 409 for a cloned repo without ranks, even though its clone has a tsconfig.json', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${unindexed}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/not indexed/);
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });

  it('saves a skill from conventions as convention/extracted with its evidence files', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'conv-repo-conventions',
        description: 'Flag changes that break the 2 house conventions of conv-repo.',
        type: 'convention',
        source: 'extracted',
        body: '# conv-repo-conventions\n\n## async-await\nAlways use async/await.',
        enabled: true,
        evidence_files: ['src/api/users.ts:1-3', 'src/lib/redis.ts:2'],
      },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({
      type: 'convention',
      source: 'extracted',
      version: 1,
      evidence_files: ['src/api/users.ts:1-3', 'src/lib/redis.ts:2'],
    });
    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toHaveLength(1);

    const update = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { evidence_files: [] } });
    expect(update.statusCode).toBe(422);
    await app.close();
  });
});
