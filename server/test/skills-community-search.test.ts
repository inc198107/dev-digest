import { describe, it, expect } from 'vitest';
import {
  GitHubSkillSearch,
  fileUrl,
  octokitSkillSearchClient,
  skillNameFromPath,
  toSearchError,
  type CodeSearchHit,
  type RepoFacts,
  type SkillSearchClient,
} from '../src/adapters/github/skill-search.js';
import { ExternalServiceError } from '../src/platform/errors.js';

/**
 * Community skill search adapter against a fake REST client: mapping, cache, the no-token path,
 * partial lookups, error mapping and deadlines. Hermetic: no Octokit request is ever sent.
 */

/**
 * @param fullName `owner/name`.
 * @param path File path in the repository.
 * @returns A code-search hit with a github.com blob URL.
 */
function hit(fullName: string, path: string): CodeSearchHit {
  const [owner = '', name = ''] = fullName.split('/');
  return {
    path,
    htmlUrl: `https://github.com/${fullName}/blob/abc123/${path}`,
    repo: { owner, name, fullName, description: `${name} (search)` },
  };
}

/** Fake client: canned hits and repositories, records every call. */
class FakeClient implements SkillSearchClient {
  queries: { q: string; perPage: number }[] = [];
  lookups: string[] = [];
  /**
   * @param hits What the code search returns.
   * @param repos `owner/name` → facts; a missing repository makes its lookup fail.
   * @param searchError Thrown by the code search instead of answering.
   */
  constructor(
    private readonly hits: CodeSearchHit[],
    private readonly repos: Record<string, RepoFacts>,
    public searchError?: unknown,
  ) {}
  async searchCode(q: string, perPage: number): Promise<CodeSearchHit[]> {
    this.queries.push({ q, perPage });
    if (this.searchError) throw this.searchError;
    return this.hits;
  }
  async getRepo(owner: string, name: string): Promise<RepoFacts> {
    this.lookups.push(`${owner}/${name}`);
    const facts = this.repos[`${owner}/${name}`];
    if (!facts) throw Object.assign(new Error('Not Found'), { status: 404 });
    return facts;
  }
}

const HITS = [
  hit('acme/skills', 'security/owasp-review/SKILL.md'),
  hit('acme/skills', 'testing/flaky-tests/SKILL.md'),
  hit('solo/owasp-skill', 'SKILL.md'),
];
const REPOS: Record<string, RepoFacts> = {
  'acme/skills': { stars: 120, language: 'Markdown', description: 'Acme skills' },
  'solo/owasp-skill': { stars: 3, language: null, description: null },
};

/**
 * @param client The fake client.
 * @param options Token, clock and deadline overrides.
 * @returns The adapter wired to the fake and a counter of client constructions.
 */
function makeSearch(
  client: SkillSearchClient,
  options: { token?: string | undefined; now?: () => number; timeoutMs?: number } = {},
) {
  const built: string[] = [];
  const token = 'token' in options ? options.token : 'ghp_test';
  const search = new GitHubSkillSearch({
    token: async () => token,
    client: (t) => {
      built.push(t);
      return client;
    },
    now: options.now,
    timeoutMs: options.timeoutMs,
  });
  return { search, built };
}

describe('GitHubSkillSearch', () => {
  it('answers configured: false without a token and builds no client', async () => {
    const client = new FakeClient(HITS, REPOS);
    const { search, built } = makeSearch(client, { token: undefined });
    expect(await search.search('owasp')).toEqual({ configured: false, items: [] });
    expect(built).toEqual([]);
    expect(client.queries).toEqual([]);
  });

  it('searches SKILL.md files and enriches each hit with its repository, one lookup per repo', async () => {
    const client = new FakeClient(HITS, REPOS);
    const { search } = makeSearch(client);
    const result = await search.search('owasp');
    expect(client.queries).toEqual([{ q: 'owasp filename:SKILL.md', perPage: 10 }]);
    expect(client.lookups.sort()).toEqual(['acme/skills', 'solo/owasp-skill']);
    expect(result).toEqual({
      configured: true,
      items: [
        {
          name: 'owasp-review',
          description: 'Acme skills',
          repo: 'acme/skills',
          path: 'security/owasp-review/SKILL.md',
          url: 'https://github.com/acme/skills/blob/abc123/security/owasp-review/SKILL.md',
          stars: 120,
          language: 'Markdown',
        },
        {
          name: 'flaky-tests',
          description: 'Acme skills',
          repo: 'acme/skills',
          path: 'testing/flaky-tests/SKILL.md',
          url: 'https://github.com/acme/skills/blob/abc123/testing/flaky-tests/SKILL.md',
          stars: 120,
          language: 'Markdown',
        },
        {
          name: 'owasp-skill',
          description: 'owasp-skill (search)',
          repo: 'solo/owasp-skill',
          path: 'SKILL.md',
          url: 'https://github.com/solo/owasp-skill/blob/abc123/SKILL.md',
          stars: 3,
          language: null,
        },
      ],
    });
  });

  it('serves a repeated query from the cache for 10 minutes, then searches again', async () => {
    let now = 1_000_000;
    const client = new FakeClient(HITS, REPOS);
    const { search } = makeSearch(client, { now: () => now });
    const first = await search.search('OWASP');
    now += 9 * 60_000;
    expect(await search.search('  owasp ')).toEqual(first);
    expect(client.queries).toHaveLength(1);
    now += 2 * 60_000;
    await search.search('owasp');
    expect(client.queries).toHaveLength(2);
  });

  it('shares one request between identical searches in flight', async () => {
    const client = new FakeClient(HITS, REPOS);
    const { search } = makeSearch(client);
    const [a, b] = await Promise.all([search.search('owasp'), search.search('OWASP')]);
    expect(a).toEqual(b);
    expect(client.queries).toHaveLength(1);
  });

  it('keeps a hit whose repository lookup failed, and does not cache that partial result', async () => {
    const client = new FakeClient(HITS, { 'acme/skills': REPOS['acme/skills']! });
    const { search } = makeSearch(client);
    const result = await search.search('owasp');
    expect(result.items[2]).toMatchObject({ repo: 'solo/owasp-skill', stars: 0, language: null, description: 'owasp-skill (search)' });
    await search.search('owasp');
    expect(client.queries).toHaveLength(2);
  });

  it('maps a refused search to a 502 with an actionable message and never caches it', async () => {
    const client = new FakeClient(HITS, REPOS, Object.assign(new Error('rate limited'), { status: 403 }));
    const { search } = makeSearch(client);
    const err = await search.search('owasp').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err).toMatchObject({ statusCode: 502, message: expect.stringMatching(/rate limit/), details: { status: 403 } });
    client.searchError = undefined;
    expect((await search.search('owasp')).items).toHaveLength(3);
  });

  it('fails with a timeout when the search does not answer before the deadline', async () => {
    const client: SkillSearchClient = {
      searchCode: () => new Promise(() => undefined),
      getRepo: async () => ({ stars: 0, language: null, description: null }),
    };
    const { search } = makeSearch(client, { timeoutMs: 20 });
    await expect(search.search('owasp')).rejects.toThrow(/did not answer in time/);
  });

  it('rebuilds the client when the token changes', async () => {
    const client = new FakeClient(HITS, REPOS);
    let token = 'ghp_one';
    const built: string[] = [];
    const search = new GitHubSkillSearch({
      token: async () => token,
      client: (t) => {
        built.push(t);
        return client;
      },
    });
    await search.search('owasp');
    await search.search('flaky');
    token = 'ghp_two';
    await search.search('boundary');
    expect(built).toEqual(['ghp_one', 'ghp_two']);
  });
});

describe('community search helpers', () => {
  it('names a skill after its folder, or the repository for a root file', () => {
    expect(skillNameFromPath('skills/owasp-review/SKILL.md', 'repo')).toBe('owasp-review');
    expect(skillNameFromPath('SKILL.md', 'repo')).toBe('repo');
  });

  it('links the github.com page of the file, with a blob/HEAD fallback', () => {
    expect(fileUrl(hit('acme/skills', 'a/SKILL.md'))).toBe('https://github.com/acme/skills/blob/abc123/a/SKILL.md');
    expect(fileUrl({ ...hit('acme/skills', 'my skill/SKILL.md'), htmlUrl: '' })).toBe(
      'https://github.com/acme/skills/blob/HEAD/my%20skill/SKILL.md',
    );
  });

  it('maps upstream failures to ExternalServiceError messages', () => {
    expect(toSearchError({ status: 401 }, false).message).toMatch(/rejected the token/);
    expect(toSearchError({ status: 429 }, false).message).toMatch(/rate limit/);
    expect(toSearchError({ status: 422 }, false).message).toMatch(/could not run this search/);
    expect(toSearchError({ status: 500 }, false).message).toBe('GitHub search failed (500)');
    expect(toSearchError(new Error('boom'), true).message).toMatch(/did not answer in time/);
    expect(toSearchError(new Error('socket hang up'), false).message).toBe('GitHub search failed');
  });

  it('builds the Octokit client without sending a request', () => {
    const client = octokitSkillSearchClient('ghp_test');
    expect(typeof client.searchCode).toBe('function');
    expect(typeof client.getRepo).toBe('function');
  });
});
