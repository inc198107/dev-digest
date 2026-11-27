import type {
  ConventionCandidate,
  ConventionList,
  ConventionUpdateBody,
  LLMProvider,
  RepoRef,
} from '@devdigest/shared';
import type { ConventionDraft } from './domain.js';

/**
 * Ports of the conventions use cases. Declared here, in the core's vocabulary (contract shapes,
 * no Drizzle or git types); implemented by ./repository.ts and by the composition root, which
 * builds the repo reader over the repos store, repo-intel and the git client.
 */

/** Persistence of a repo's conventions. Every method is scoped to one workspace. */
export interface ConventionsStore {
  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo's conventions, most confident first, and the time of the newest one.
   */
  list(workspaceId: string, repoId: string): Promise<ConventionList>;
  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo's accepted conventions.
   */
  listAccepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Convention id.
   * @param patch New rule text and/or accepted flag.
   * @returns The updated convention, or undefined when it is not in this workspace.
   */
  update(workspaceId: string, id: string, patch: ConventionUpdateBody): Promise<ConventionCandidate | undefined>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Convention id.
   * @returns False when no such convention existed in the workspace.
   */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @param accepted The flag every convention of the repo gets.
   * @returns Resolves when stored.
   */
  setAllAccepted(workspaceId: string, repoId: string, accepted: boolean): Promise<void>;
  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns Resolves when the repo's not-accepted conventions are gone.
   */
  deletePending(workspaceId: string, repoId: string): Promise<void>;
  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @param drafts Grounded conventions to store, not accepted.
   * @returns Resolves when stored.
   */
  insertMany(workspaceId: string, repoId: string, drafts: ConventionDraft[]): Promise<void>;
  /**
   * Stamp the repo's accepted conventions with the time of the current scan, so "last scan" (the
   * newest stamp) moves even when a scan stores no new convention.
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns Resolves when stamped.
   */
  touchAccepted(workspaceId: string, repoId: string): Promise<void>;
}

/** Runs several store operations atomically. */
export interface ConventionsUnitOfWork {
  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What `work` returns, after the transaction commits.
   */
  run<T>(work: (store: ConventionsStore) => Promise<T>): Promise<T>;
}

/** The repository a scan reads. */
export interface ScanRepo {
  /** Address of the clone for the git client. */
  ref: RepoRef;
  /** Short name shown to the model (`payments-api`). */
  name: string;
  /** False until the first clone has finished. */
  cloned: boolean;
}

/** Read access to a repository's clone and its repo-intel index. */
export interface RepoSources {
  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo, or undefined when it is not in this workspace.
   */
  findRepo(workspaceId: string, repoId: string): Promise<ScanRepo | undefined>;
  /**
   * @param repoId Repository id.
   * @param n Most paths.
   * @returns The repo's most central files (no tests, configs or migrations), most central
   *   first; empty when the repo is not indexed.
   */
  samplePaths(repoId: string, n: number): Promise<string[]>;
  /**
   * @param repo The clone.
   * @param path Repo-relative path chosen by code: a `samplePaths` result or a `CONFIG_FILES`
   *   entry, never a path from the model.
   * @returns The file's text, or null when it does not exist or cannot be read.
   */
  readFile(repo: RepoRef, path: string): Promise<string | null>;
}

/** The model the workspace chose for this feature (Settings → Feature models). */
export interface FeatureModel {
  llm: LLMProvider;
  model: string;
}
