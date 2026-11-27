import { describe, it, expect, beforeEach } from 'vitest';
import type { CommunitySkillSearchResult, Skill, SkillListItem, SkillVersion } from '@devdigest/shared';
import { ConflictError, ExternalServiceError, NotFoundError, ValidationError } from '../src/platform/errors.js';
import {
  CommunitySkillsService,
  SkillPromptBlocks,
  SkillStatsService,
  SkillsService,
} from '../src/modules/skills/service.js';
import type {
  ArchiveEntry,
  ArchiveReader,
  CommunitySkillSearch,
  NewSkill,
  SkillPatch,
  SkillStatsReader,
  SkillsStore,
  SkillsUnitOfWork,
  TextFetcher,
} from '../src/modules/skills/ports.js';
import { skillsStoreContract } from './helpers/skills-store-contract.js';

/**
 * Skills use cases against in-memory fakes of their own ports: no Postgres, no Container, no
 * vi.mock. The fake store and the Drizzle repository share skillsStoreContract; the real store
 * is covered by skills.it.test.ts and the real zip reader by skills-archive.test.ts.
 */

/** In-memory SkillsStore with the same uniqueness and ordering rules as Postgres. */
class FakeSkillsStore implements SkillsStore {
  skills = new Map<string, Skill & { workspaceId: string }>();
  versions: SkillVersion[] = [];
  /** Ids passed to getForUpdate, so tests can check that writes lock the row. */
  locked: string[] = [];
  private seq = 0;

  async list(workspaceId: string): Promise<SkillListItem[]> {
    return [...this.skills.values()]
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ ...strip(s), used_by: [] }));
  }
  async get(workspaceId: string, id: string): Promise<SkillListItem | undefined> {
    const s = this.skills.get(id);
    return s && s.workspaceId === workspaceId ? { ...strip(s), used_by: [] } : undefined;
  }
  async getForUpdate(workspaceId: string, id: string): Promise<Skill | undefined> {
    this.locked.push(id);
    const s = this.skills.get(id);
    return s && s.workspaceId === workspaceId ? strip(s) : undefined;
  }
  async insert(workspaceId: string, input: NewSkill, version: number): Promise<Skill> {
    this.assertFree(workspaceId, input.name);
    const skill = {
      id: `skill-${++this.seq}`,
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source,
      body: input.body,
      enabled: input.enabled ?? true,
      version,
      evidence_files: null,
    };
    this.skills.set(skill.id, skill);
    return strip(skill);
  }
  async update(
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    version?: number,
  ): Promise<Skill | undefined> {
    const s = this.skills.get(id);
    if (!s || s.workspaceId !== workspaceId) return undefined;
    if (patch.name !== undefined && patch.name !== s.name) this.assertFree(workspaceId, patch.name);
    /** Only the skill columns, like the repository: a stray `note` never lands on the skill. */
    const columns = ['name', 'description', 'type', 'body', 'enabled'] as const;
    const defined = Object.fromEntries(
      columns.filter((key) => patch[key] !== undefined).map((key) => [key, patch[key]]),
    );
    const next = { ...s, ...defined, ...(version !== undefined ? { version } : {}) };
    this.skills.set(id, next);
    return strip(next);
  }
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const s = this.skills.get(id);
    if (!s || s.workspaceId !== workspaceId) return false;
    this.versions = this.versions.filter((v) => v.skill_id !== id);
    return this.skills.delete(id);
  }
  async snapshotVersion(skillId: string, version: number, body: string, note?: string | null): Promise<void> {
    if (this.versions.some((v) => v.skill_id === skillId && v.version === version)) return;
    this.versions.push({ skill_id: skillId, version, body, note: note ?? null, created_at: '2026-11-27T00:00:00.000Z' });
  }
  async listVersions(skillId: string): Promise<SkillVersion[]> {
    return this.versions.filter((v) => v.skill_id === skillId).sort((a, b) => b.version - a.version);
  }
  async getVersion(skillId: string, version: number): Promise<SkillVersion | undefined> {
    return this.versions.find((v) => v.skill_id === skillId && v.version === version);
  }
  /**
   * @param workspaceId Tenant scope.
   * @param name Name about to be written.
   * @returns Nothing.
   * @throws ConflictError like the unique index on (workspace_id, name).
   */
  private assertFree(workspaceId: string, name: string): void {
    for (const s of this.skills.values()) {
      if (s.workspaceId === workspaceId && s.name === name) throw new ConflictError(`"${name}" exists`);
    }
  }
}

/**
 * @param s A stored skill.
 * @returns The contract shape without the workspace id.
 */
function strip(s: Skill & { workspaceId: string }): Skill {
  const { workspaceId: _ws, ...skill } = s;
  return skill;
}

/**
 * @param store The fake store.
 * @returns A unit of work that runs the callback on the same store and counts calls.
 */
function fakeUow(store: SkillsStore): SkillsUnitOfWork & { runs: number } {
  return {
    runs: 0,
    run(work) {
      this.runs += 1;
      return work(store);
    },
  };
}

/** Archive reader over a fixed listing; `reads` records which entries were unpacked. */
class FakeArchive implements ArchiveReader {
  reads: string[] = [];
  /**
   * @param entries Entry name → content.
   * @param declared Entry name → declared size, when it should differ from the content length.
   */
  constructor(
    private readonly entries: Record<string, string>,
    private readonly declared: Record<string, number> = {},
  ) {}
  list(): ArchiveEntry[] {
    return Object.entries(this.entries).map(([name, text]) => ({ name, size: this.declared[name] ?? text.length }));
  }
  read(_bytes: Uint8Array, name: string): Uint8Array {
    this.reads.push(name);
    return new TextEncoder().encode(this.entries[name] ?? '');
  }
}

/**
 * @param text File content.
 * @returns Its base64.
 */
const b64 = (text: string): string => Buffer.from(text).toString('base64');
/** Zip magic bytes, enough for fileKind to pick the archive path. */
const ZIP_B64 = Buffer.from([0x50, 0x4b, 3, 4, 0, 0]).toString('base64');
const WS = 'ws-1';
const body = { name: 'untested-branches', description: 'Flag untested branches.', type: 'rubric' as const, body: '# B' };
const tokens = { count: (text: string) => text.length };

skillsStoreContract('FakeSkillsStore', async () => ({
  store: new FakeSkillsStore(),
  workspaceId: WS,
  otherWorkspaceId: 'ws-other',
}));

describe('SkillsService', () => {
  let store: FakeSkillsStore;
  let uow: ReturnType<typeof fakeUow>;
  let archive: FakeArchive;
  let fetched: string[];
  let service: SkillsService;

  /**
   * @param files Archive content served by the fake reader.
   * @param declared Declared sizes that differ from the content.
   * @returns A service wired with that archive.
   */
  function withArchive(files: Record<string, string>, declared: Record<string, number> = {}): SkillsService {
    archive = new FakeArchive(files, declared);
    return new SkillsService({ store, uow, archive, fetcher: fakeFetcher(), tokens });
  }

  /**
   * @returns A fetcher that records URLs and serves a Markdown skill.
   */
  function fakeFetcher(): TextFetcher {
    return {
      fetch: async (url) => {
        fetched.push(url);
        return { url, bytes: new TextEncoder().encode('---\nname: remote\ndescription: Flag remote.\n---\nbody') };
      },
    };
  }

  beforeEach(() => {
    store = new FakeSkillsStore();
    uow = fakeUow(store);
    fetched = [];
    service = withArchive({});
  });

  it('create stores version 1 with a body snapshot in one unit of work, source manual by default', async () => {
    const skill = await service.create(WS, body);
    expect(skill).toMatchObject({ version: 1, source: 'manual', enabled: true });
    expect(await store.listVersions(skill.id)).toMatchObject([{ version: 1, body: '# B' }]);
    expect(uow.runs).toBe(1);
  });

  it('create and update strip invisible characters and refuse a field that held only them', async () => {
    const skill = await service.create(WS, { ...body, description: 'Flag\u200B it.', body: '# B\u{E0041}' });
    expect(skill).toMatchObject({ description: 'Flag it.', body: '# B' });
    expect(await service.update(WS, skill.id, { body: '# B2\u202E' })).toMatchObject({ body: '# B2', version: 2 });
    await expect(service.update(WS, skill.id, { body: '\u200B' })).rejects.toThrow(/body holds only invisible/);
    await expect(service.create(WS, { ...body, name: 'other', description: '\uFE0F' })).rejects.toThrow(ValidationError);
  });

  it('create keeps an import source', async () => {
    expect(await service.create(WS, { ...body, source: 'imported_file' })).toMatchObject({ source: 'imported_file' });
  });

  it('a body or description change bumps the version and snapshots the body', async () => {
    const skill = await service.create(WS, body);
    expect(await service.update(WS, skill.id, { body: '# B2' })).toMatchObject({ version: 2 });
    expect(await service.update(WS, skill.id, { description: 'Flag more.' })).toMatchObject({ version: 3 });
    expect((await store.listVersions(skill.id)).map((v) => [v.version, v.body])).toEqual([
      [3, '# B2'],
      [2, '# B2'],
      [1, '# B'],
    ]);
    expect(store.locked).toEqual([skill.id, skill.id]);
  });

  it('type and enabled changes keep the version and record no snapshot', async () => {
    const skill = await service.create(WS, body);
    expect(await service.update(WS, skill.id, { type: 'security', enabled: false })).toMatchObject({
      type: 'security',
      enabled: false,
      version: 1,
    });
    expect(await store.listVersions(skill.id)).toHaveLength(1);
  });

  it('a duplicate name is a conflict', async () => {
    await service.create(WS, body);
    await expect(service.create(WS, body)).rejects.toBeInstanceOf(ConflictError);
  });

  it('update, versions and restore return undefined for a skill of another workspace', async () => {
    const skill = await service.create(WS, body);
    expect(await service.update('ws-other', skill.id, { body: 'x' })).toBeUndefined();
    expect(await service.listVersions('ws-other', skill.id)).toBeUndefined();
    expect(await service.restore('ws-other', skill.id, 1)).toBeUndefined();
  });

  it('restore makes an old body current as a new version', async () => {
    const skill = await service.create(WS, body);
    await service.update(WS, skill.id, { body: '# B2' });
    expect(await service.restore(WS, skill.id, 1)).toMatchObject({ body: '# B', version: 3 });
    expect((await store.listVersions(skill.id)).map((v) => v.version)).toEqual([3, 2, 1]);
  });

  it('restoring the current body changes nothing', async () => {
    const skill = await service.create(WS, body);
    expect(await service.restore(WS, skill.id, 1)).toMatchObject({ version: 1 });
  });

  it('stores a note with the version an update creates, never on the skill', async () => {
    const skill = await service.create(WS, body);
    const updated = await service.update(WS, skill.id, { body: '# B2', note: '  Covers\n  early returns\u200B ' });
    expect(updated).toMatchObject({ version: 2, body: '# B2' });
    expect(updated).not.toHaveProperty('note');
    expect(store.skills.get(skill.id)).not.toHaveProperty('note');
    expect((await store.listVersions(skill.id)).map((v) => [v.version, v.note])).toEqual([
      [2, 'Covers early returns'],
      [1, null],
    ]);
  });

  it('drops the note when the update creates no version', async () => {
    const skill = await service.create(WS, body);
    expect(await service.update(WS, skill.id, { enabled: false, note: 'Paused' })).toMatchObject({
      enabled: false,
      version: 1,
    });
    expect(await service.update(WS, skill.id, { body: '# B', note: 'Same body' })).toMatchObject({ version: 1 });
    expect((await store.listVersions(skill.id)).map((v) => v.note)).toEqual([null]);
  });

  it('a blank or invisible-only note is stored as no note', async () => {
    const skill = await service.create(WS, body);
    await service.update(WS, skill.id, { body: '# B2', note: '\u200B  ' });
    expect((await store.getVersion(skill.id, 2))?.note).toBeNull();
  });

  it('restore notes the version it creates', async () => {
    const skill = await service.create(WS, body);
    await service.update(WS, skill.id, { body: '# B2', note: 'Draft' });
    await service.restore(WS, skill.id, 1);
    expect((await store.listVersions(skill.id)).map((v) => [v.version, v.note])).toEqual([
      [3, 'Restored from v1'],
      [2, 'Draft'],
      [1, null],
    ]);
  });

  it('restoring an unknown version is a 404', async () => {
    const skill = await service.create(WS, body);
    await expect(service.restore(WS, skill.id, 7)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('previews a Markdown upload without storing anything', async () => {
    const md = '---\nname: boundary-cases\ndescription: Flag edges.\ntype: rubric\n---\n# Boundaries\n';
    const preview = await service.previewFile('boundary.md', b64(md));
    expect(preview).toMatchObject({
      name: 'boundary-cases',
      description: 'Flag edges.',
      type: 'rubric',
      body: '# Boundaries',
      source: 'imported_file',
      origin: 'boundary.md',
      skill_file: 'boundary.md',
      ignored_files: [],
      warnings: [],
    });
    expect(preview.tokens).toBe('### Skill: boundary-cases\n> Flag edges.\n\n# Boundaries'.length);
    expect(store.skills.size).toBe(0);
    expect(uow.runs).toBe(0);
  });

  it('previews an archive: unpacks only the core and lists executables as not processed', async () => {
    service = withArchive({
      'flaky/SKILL.md': '---\ndescription: Flag flaky tests.\n---\n# Flaky',
      'flaky/scripts/detect.sh': 'rm -rf /',
      'flaky/references/notes.md': '# Notes',
    });
    const preview = await service.previewFile('pack.zip', ZIP_B64);
    expect(preview).toMatchObject({
      name: 'flaky',
      skill_file: 'flaky/SKILL.md',
      ignored_files: [
        { path: 'flaky/scripts/detect.sh', reason: 'executable' },
        { path: 'flaky/references/notes.md', reason: 'not_skill_core' },
      ],
    });
    expect(preview.warnings.join(' ')).toMatch(/1 executable file\(s\) were not processed/);
    expect(archive.reads).toEqual(['flaky/SKILL.md']);
  });

  it('rejects an archive with more entries than the cap without unpacking anything', async () => {
    service = withArchive(Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`f${i}.txt`, 'x'])));
    await expect(service.previewFile('a.zip', ZIP_B64)).rejects.toThrow(/limit is 200/);
    expect(archive.reads).toEqual([]);
  });

  it('rejects archives that declare too much unpacked data or have no core', async () => {
    service = withArchive({ 'SKILL.md': 'x' }, { 'SKILL.md': 6 * 1024 * 1024 });
    await expect(service.previewFile('a.zip', ZIP_B64)).rejects.toThrow(/more than 5 MiB/);
    service = withArchive({ 'run.sh': 'echo' });
    await expect(service.previewFile('a.zip', ZIP_B64)).rejects.toThrow(/no SKILL.md/);
    expect(archive.reads).toEqual([]);
  });

  it('rejects unsupported files, bad base64, non-UTF-8 text and an empty body', async () => {
    await expect(service.previewFile('run.sh', b64('echo'))).rejects.toThrow(/Unsupported file/);
    await expect(service.previewFile('a.md', '%%%')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.previewFile('a.md', Buffer.from([0xff, 0xfe]).toString('base64'))).rejects.toThrow(/UTF-8/);
    await expect(service.previewFile('a.md', b64('---\nname: x\n---\n   '))).rejects.toThrow(/no body/);
  });

  it('previews a URL through the fetcher, reading GitHub pages raw', async () => {
    const preview = await service.previewUrl('https://github.com/acme/skills/blob/main/remote/SKILL.md');
    expect(fetched).toEqual(['https://raw.githubusercontent.com/acme/skills/main/remote/SKILL.md']);
    expect(preview).toMatchObject({
      name: 'remote',
      source: 'imported_url',
      origin: 'https://github.com/acme/skills/blob/main/remote/SKILL.md',
      skill_file: 'SKILL.md',
    });
  });
});

describe('SkillStatsService', () => {
  /**
   * @param runs Finished runs of the workspace in the window.
   * @returns A reader over two fixed skills that records its calls.
   */
  function fakeStats(runs: number): SkillStatsReader & { calls: string[] } {
    const skills = [
      { skillId: 'a', usedBy: 2, skillRuns: 2, findings: 5, accepted: 3, dismissed: 1 },
      { skillId: 'b', usedBy: 0, skillRuns: 0, findings: 0, accepted: 0, dismissed: 0 },
    ];
    return {
      calls: [],
      async usage(workspaceId, skillId) {
        this.calls.push(`usage:${workspaceId}:${skillId ?? '*'}`);
        return { runs, skills: skills.filter((s) => skillId === undefined || s.skillId === skillId) };
      },
      async findingsByCategory(workspaceId, skillId) {
        this.calls.push(`categories:${workspaceId}:${skillId}`);
        return skillId === 'a' ? [{ category: 'testing', count: 4 }, { category: 'bug', count: 1 }] : [];
      },
    };
  }

  it('summarizes every skill from one read, with rates from the domain', async () => {
    const reader = fakeStats(4);
    expect(await new SkillStatsService({ stats: reader }).summary(WS)).toEqual([
      { skill_id: 'a', used_by: 2, pull_frequency: 0.5, accept_rate: 0.75 },
      { skill_id: 'b', used_by: 0, pull_frequency: 0, accept_rate: null },
    ]);
    expect(reader.calls).toEqual([`usage:${WS}:*`]);
  });

  it('returns the full stats of one skill', async () => {
    expect(await new SkillStatsService({ stats: fakeStats(4) }).forSkill(WS, 'a')).toEqual({
      skill_id: 'a',
      used_by: 2,
      runs_30d: 4,
      skill_runs_30d: 2,
      pull_frequency: 0.5,
      accept_rate: 0.75,
      findings_30d: 5,
      findings_by_category: [
        { category: 'testing', count: 4 },
        { category: 'bug', count: 1 },
      ],
    });
  });

  it('rates are null without runs; an unknown skill is undefined', async () => {
    const service = new SkillStatsService({ stats: fakeStats(0) });
    expect(await service.forSkill(WS, 'b')).toMatchObject({ runs_30d: 0, pull_frequency: null, accept_rate: null });
    expect(await service.forSkill(WS, 'missing')).toBeUndefined();
  });
});

describe('CommunitySkillsService', () => {
  it('passes the collapsed query to the search port and returns its result', async () => {
    const queries: string[] = [];
    const result: CommunitySkillSearchResult = {
      configured: true,
      items: [
        {
          name: 'owasp-review',
          description: 'Security skills',
          repo: 'acme/skills',
          path: 'owasp-review/SKILL.md',
          url: 'https://github.com/acme/skills/blob/main/owasp-review/SKILL.md',
          stars: 12,
          language: null,
        },
      ],
    };
    const search: CommunitySkillSearch = {
      search: async (q) => {
        queries.push(q);
        return result;
      },
    };
    expect(await new CommunitySkillsService({ search }).search('  owasp \t review ')).toBe(result);
    expect(queries).toEqual(['owasp review']);
  });

  it('lets the port errors through', async () => {
    const search: CommunitySkillSearch = {
      search: async () => {
        throw new ExternalServiceError('GitHub search rate limit reached: try again in a minute');
      },
    };
    await expect(new CommunitySkillsService({ search }).search('owasp')).rejects.toBeInstanceOf(ExternalServiceError);
  });
});

describe('SkillPromptBlocks', () => {
  it('formats each enabled linked skill and counts its tokens, in the reader order', async () => {
    const skill = (name: string, version: number): Skill => ({
      id: `id-${name}`,
      name,
      description: `Flag ${name}.`,
      type: 'rubric',
      source: 'manual',
      body: `# ${name}`,
      enabled: true,
      version,
      evidence_files: null,
    });
    const blocks = await new SkillPromptBlocks({
      skills: { enabledForAgent: async () => [skill('b', 2), skill('a', 1)] },
      tokens: { count: (text) => text.split(/\s+/).length },
    }).forAgent(WS, 'agent-1');
    expect(blocks).toEqual([
      { id: 'id-b', name: 'b', type: 'rubric', version: 2, tokens: 8, text: '### Skill: b\n> Flag b.\n\n# b' },
      { id: 'id-a', name: 'a', type: 'rubric', version: 1, tokens: 8, text: '### Skill: a\n> Flag a.\n\n# a' },
    ]);
  });
});
