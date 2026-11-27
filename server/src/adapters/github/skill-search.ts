/**
 * github adapter — community skill search for the Skills Lab: finds `SKILL.md` files in public
 * repositories with the GitHub REST code search and enriches each hit with its repository's
 * stars, language and description.
 *
 * - No `GITHUB_TOKEN` (code search needs one): `{ configured: false, items: [] }`, no request.
 * - One code search (`<query> filename:SKILL.md`, 10 hits), then at most 10 repository lookups
 *   in parallel, one per distinct repository. A failed lookup keeps the hit with what the
 *   search returned (0 stars); such a partial result is not cached.
 * - Each phase has its own deadline: an `AbortSignal` cancels the request, and `withTimeout`
 *   bounds a client that ignores the signal. Octokit's retry and rate-limit waiting are off,
 *   so a rate limit fails fast instead of holding the request for a minute.
 * - Complete results are cached in memory per normalized query for 10 minutes; identical
 *   searches in flight share one request.
 * - Every failure becomes an `ExternalServiceError` (502) with a message the user can act on.
 *
 * Implements the skills module's `CommunitySkillSearch` port structurally (adapters do not
 * import module code); the composition root wires it.
 */
import { Octokit } from 'octokit';
import type { CommunitySkillHit, CommunitySkillSearchResult } from '@devdigest/shared';
import { ExternalServiceError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';

/** Hits requested from the code search, and so the most repository lookups. */
const SEARCH_PAGE_SIZE = 10;
/** Default deadline of each phase (the search, then the lookups), in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10_000;
/** Default lifetime of a cached result (10 minutes). */
const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
/** Default number of cached queries; the oldest is evicted first. */
const DEFAULT_MAX_CACHE_ENTRIES = 100;
/** GitHub web origin of the file links. */
const GITHUB_WEB = 'https://github.com/';

/** One code-search hit: the file and the repository it lives in. */
export interface CodeSearchHit {
  /** Path of the file in the repository. */
  path: string;
  /** github.com page of the file (`…/blob/<sha>/<path>`). */
  htmlUrl: string;
  repo: {
    owner: string;
    name: string;
    /** `owner/name`. */
    fullName: string;
    description: string | null;
  };
}

/** What a repository lookup adds to a hit. */
export interface RepoFacts {
  stars: number;
  language: string | null;
  description: string | null;
}

/** The two GitHub REST calls the search needs: Octokit in production, a fake in tests. */
export interface SkillSearchClient {
  /**
   * @param q GitHub code-search query.
   * @param perPage Most hits to return.
   * @param signal Aborts the request.
   * @returns The hits, best match first.
   */
  searchCode(q: string, perPage: number, signal: AbortSignal): Promise<CodeSearchHit[]>;
  /**
   * @param owner Repository owner.
   * @param name Repository name.
   * @param signal Aborts the request.
   * @returns Stars, main language and description of the repository.
   */
  getRepo(owner: string, name: string, signal: AbortSignal): Promise<RepoFacts>;
}

/** Construction options; everything but `token` has a production default. */
export interface GitHubSkillSearchOptions {
  /** Reads the GitHub token on every search, so a token saved in Settings applies at once. */
  token: () => Promise<string | undefined>;
  /** Builds the REST client for a token (default: Octokit). */
  client?: (token: string) => SkillSearchClient;
  /** Clock of the cache, in milliseconds (default `Date.now`). */
  now?: () => number;
  /** Deadline of each phase, in milliseconds. */
  timeoutMs?: number;
  /** Lifetime of a cached result, in milliseconds. */
  cacheTtlMs?: number;
  /** Most cached queries. */
  maxCacheEntries?: number;
}

/**
 * The production client: Octokit REST with its retry and throttling plugins off (the deadline
 * and the error message are this adapter's decisions, not a silent wait).
 * @param token GitHub token.
 * @returns A client for the code search and repository lookups.
 */
export function octokitSkillSearchClient(token: string): SkillSearchClient {
  const octokit = new Octokit({
    auth: token,
    retry: { enabled: false },
    throttle: { enabled: false, onRateLimit: () => false, onSecondaryRateLimit: () => false },
  });
  return {
    async searchCode(q, perPage, signal) {
      const { data } = await octokit.rest.search.code({ q, per_page: perPage, request: { signal } });
      return data.items.map((item) => ({
        path: item.path,
        htmlUrl: item.html_url,
        repo: {
          owner: item.repository.owner?.login ?? item.repository.full_name.split('/')[0] ?? '',
          name: item.repository.name,
          fullName: item.repository.full_name,
          description: item.repository.description ?? null,
        },
      }));
    },
    async getRepo(owner, name, signal) {
      const { data } = await octokit.rest.repos.get({ owner, repo: name, request: { signal } });
      return { stars: data.stargazers_count, language: data.language ?? null, description: data.description ?? null };
    },
  };
}

/**
 * Skill name of a hit: the folder that holds the `SKILL.md`, or the repository name for a file
 * at the repository root.
 * @param path Path of the file in the repository.
 * @param repoName Repository name.
 * @returns The name shown in the search results.
 */
export function skillNameFromPath(path: string, repoName: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments.length >= 2 ? (segments[segments.length - 2] ?? repoName) : repoName;
}

/**
 * github.com link of the file, which the URL import reads raw. Falls back to a `blob/HEAD`
 * link when the search returned no github.com page.
 * @param hit The code-search hit.
 * @returns The file's github.com URL.
 */
export function fileUrl(hit: CodeSearchHit): string {
  if (hit.htmlUrl.startsWith(GITHUB_WEB)) return hit.htmlUrl;
  const path = hit.path.split('/').map(encodeURIComponent).join('/');
  return `${GITHUB_WEB}${hit.repo.fullName}/blob/HEAD/${path}`;
}

/**
 * Turn whatever a GitHub call threw into the error the user sees.
 * @param err The thrown value.
 * @param timedOut True when the phase deadline passed.
 * @returns A 502 with an actionable message and the upstream status in `details`.
 */
export function toSearchError(err: unknown, timedOut: boolean): ExternalServiceError {
  if (err instanceof ExternalServiceError) return err;
  if (timedOut || err instanceof TimeoutError) return new ExternalServiceError('GitHub search did not answer in time');
  const status = (err as { status?: unknown } | null)?.status;
  const code = typeof status === 'number' ? status : undefined;
  if (code === 401) {
    return new ExternalServiceError('GitHub rejected the token: check GITHUB_TOKEN in Settings', { status: code });
  }
  if (code === 403 || code === 429) {
    return new ExternalServiceError('GitHub search rate limit reached: try again in a minute', { status: code });
  }
  if (code === 422) return new ExternalServiceError('GitHub could not run this search', { status: code });
  return new ExternalServiceError(`GitHub search failed${code ? ` (${code})` : ''}`, { status: code ?? null });
}

/** A cached result and when it was stored. */
interface CacheEntry {
  at: number;
  result: CommunitySkillSearchResult;
}

/** A search result and whether it is complete enough to cache. */
interface SearchOutcome {
  result: CommunitySkillSearchResult;
  complete: boolean;
}

export class GitHubSkillSearch {
  private readonly makeClient: (token: string) => SkillSearchClient;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly maxCacheEntries: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<CommunitySkillSearchResult>>();
  private client?: { token: string; client: SkillSearchClient };

  /**
   * @param options Token source and optional overrides of the client, clock, deadline and cache.
   */
  constructor(private readonly options: GitHubSkillSearchOptions) {
    this.makeClient = options.client ?? octokitSkillSearchClient;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  }

  /**
   * @param query Search text.
   * @returns Up to 10 `SKILL.md` hits, best match first; `configured: false` without a token.
   * @throws ExternalServiceError when the code search fails, is refused or times out.
   */
  async search(query: string): Promise<CommunitySkillSearchResult> {
    const token = await this.options.token();
    if (!token) return { configured: false, items: [] };

    const key = query.replace(/\s+/g, ' ').trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < this.cacheTtlMs) return cached.result;
    if (cached) this.cache.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const work = this.run(this.clientFor(token), query.trim())
      .then(({ result, complete }) => {
        if (complete) this.remember(key, result);
        return result;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }

  /**
   * @param token The current GitHub token.
   * @returns The client for that token, rebuilt when the token changed.
   */
  private clientFor(token: string): SkillSearchClient {
    if (this.client?.token !== token) this.client = { token, client: this.makeClient(token) };
    return this.client.client;
  }

  /**
   * The code search, then the repository lookups.
   * @param client REST client.
   * @param query Search text.
   * @returns The mapped hits and whether every lookup succeeded.
   * @throws ExternalServiceError when the code search fails.
   */
  private async run(client: SkillSearchClient, query: string): Promise<SearchOutcome> {
    const hits = await this.phase((signal) =>
      client.searchCode(`${query} filename:SKILL.md`, SEARCH_PAGE_SIZE, signal),
    );
    const repos = [...new Map(hits.map((h) => [h.repo.fullName, h.repo])).values()].slice(0, SEARCH_PAGE_SIZE);
    const facts = new Map<string, RepoFacts>();
    let complete = true;
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const settled = await Promise.allSettled(
      repos.map((r) => withTimeout(client.getRepo(r.owner, r.name, deadline), this.timeoutMs)),
    );
    settled.forEach((outcome, i) => {
      const repo = repos[i];
      if (!repo) return;
      if (outcome.status === 'fulfilled') facts.set(repo.fullName, outcome.value);
      else complete = false;
    });

    const items: CommunitySkillHit[] = hits.map((hit) => {
      const known = facts.get(hit.repo.fullName);
      return {
        name: skillNameFromPath(hit.path, hit.repo.name),
        description: known?.description ?? hit.repo.description ?? null,
        repo: hit.repo.fullName,
        path: hit.path,
        url: fileUrl(hit),
        stars: known?.stars ?? 0,
        language: known?.language ?? null,
      };
    });
    return { result: { configured: true, items }, complete };
  }

  /**
   * Run one call under the phase deadline and map its failure.
   * @param call The call, given the abort signal.
   * @returns What the call returns.
   * @throws ExternalServiceError on any failure.
   */
  private async phase<T>(call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    try {
      return await withTimeout(call(signal), this.timeoutMs);
    } catch (err) {
      throw toSearchError(err, signal.aborted);
    }
  }

  /**
   * Cache a complete result, evicting the oldest entry when full.
   * @param key Normalized query.
   * @param result The result.
   * @returns Nothing.
   */
  private remember(key: string, result: CommunitySkillSearchResult): void {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { at: this.now(), result });
  }
}
