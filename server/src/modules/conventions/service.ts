import type {
  ConventionCandidate,
  ConventionList,
  ConventionScanResult,
  ConventionUpdateBody,
  LLMProvider,
} from '@devdigest/shared';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '../../platform/errors.js';
import {
  CONFIG_FILES,
  EXTRACTION_SCHEMA,
  LLM_MAX_RETRIES,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  SAMPLE_FILES,
} from './constants.js';
import {
  ConventionExtraction,
  extractionPrompt,
  fitScanFiles,
  groundConventions,
  type PromptText,
  scanFileList,
  type SourceFile,
  toSourceFile,
  withoutAccepted,
} from './domain.js';
import type {
  ConventionsStore,
  ConventionsUnitOfWork,
  FeatureModel,
  RepoSources,
  ScanRepo,
} from './ports.js';

/**
 * Conventions use cases (application ring): scan a repo for house rules, list them, accept,
 * reword or reject them. Code alone picks what a scan reads (the repo's config files from a fixed
 * allowlist and the top repo-intel sample); the model is asked once, and only conventions grounded
 * in the lines it read are stored. The model is never called inside a transaction.
 */

/** What the conventions use cases need from the outside, injected by the routes plugin. */
export interface ConventionsServiceDeps {
  /** Non-transactional reads and single-statement writes. */
  store: ConventionsStore;
  /** Atomic replace of a repo's pending conventions. */
  uow: ConventionsUnitOfWork;
  /** The repo, its ranked sample and its files. */
  sources: RepoSources;
  /** Resolves the model the workspace chose for conventions (throws ConfigError without a key). */
  model: (workspaceId: string) => Promise<FeatureModel>;
}

export class ConventionsService {
  /**
   * @param deps Ports this service depends on.
   */
  constructor(private readonly deps: ConventionsServiceDeps) {}

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo's conventions and the time of the last scan.
   * @throws NotFoundError when the repo is not in this workspace.
   */
  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    await this.requireRepo(workspaceId, repoId);
    return this.deps.store.list(workspaceId, repoId);
  }

  /**
   * Scan the repo: the top repo-intel sample and the config files that exist (both chosen by
   * code) → read them within the budget → ONE model call extracts rules → ground → replace the
   * not-accepted conventions in one transaction. Accepted ones stay (stamped with this scan's
   * time), and a new rule that repeats one of them is skipped. A failure stores nothing.
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo's conventions after the scan and the files the model read (configs first).
   * @throws NotFoundError when the repo is not in this workspace.
   * @throws ConflictError when the repo is not cloned or not indexed, or no sampled file can be
   *   read (config files alone are not enough to scan).
   * @throws ExternalServiceError when the model call fails.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScanResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.cloned) {
      throw new ConflictError('Repository is not cloned yet. Wait for the clone to finish, then scan again.');
    }
    const samples = await this.deps.sources.samplePaths(repoId, SAMPLE_FILES);
    if (samples.length === 0) {
      throw new ConflictError('Repository is not indexed yet. Wait for indexing or run Resync, then scan again.');
    }
    const model = await this.deps.model(workspaceId);

    const [configs, sources] = await Promise.all([
      this.readFiles(repo, CONFIG_FILES),
      this.readFiles(repo, samples),
    ]);
    const files = fitScanFiles(configs, sources);
    if (files.sources.length === 0) {
      throw new ConflictError('None of the sampled files could be read from the clone. Run Resync, then scan again.');
    }

    const shown = scanFileList(files);
    const extraction = await this.askModel(model, `conventions-${repoId}`, extractionPrompt(repo.name, files));
    const drafts = groundConventions(extraction.conventions, shown);

    const list = await this.deps.uow.run(async (store) => {
      const accepted = await store.listAccepted(workspaceId, repoId);
      await store.deletePending(workspaceId, repoId);
      await store.insertMany(workspaceId, repoId, withoutAccepted(drafts, accepted));
      await store.touchAccepted(workspaceId, repoId);
      return store.list(workspaceId, repoId);
    });
    return { ...list, analyzed_files: shown.map((file) => file.path) };
  }

  /**
   * Reword a convention and/or accept it (the evidence never changes).
   * @param workspaceId Tenant scope.
   * @param id Convention id.
   * @param patch New rule and/or accepted flag.
   * @returns The updated convention, or undefined (route → 404).
   */
  update(workspaceId: string, id: string, patch: ConventionUpdateBody): Promise<ConventionCandidate | undefined> {
    return this.deps.store.update(workspaceId, id, patch);
  }

  /**
   * Reject a convention: it is deleted; a later scan may propose it again.
   * @param workspaceId Tenant scope.
   * @param id Convention id.
   * @returns False when no such convention existed (route → 404).
   */
  reject(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.store.delete(workspaceId, id);
  }

  /**
   * Accept every convention of the repo, or none.
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @param accepted The flag every convention gets.
   * @returns The repo's conventions afterwards.
   * @throws NotFoundError when the repo is not in this workspace.
   */
  async setAllAccepted(workspaceId: string, repoId: string, accepted: boolean): Promise<ConventionList> {
    await this.requireRepo(workspaceId, repoId);
    await this.deps.store.setAllAccepted(workspaceId, repoId, accepted);
    return this.deps.store.list(workspaceId, repoId);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo.
   * @throws NotFoundError when the repo is not in this workspace.
   */
  private async requireRepo(workspaceId: string, repoId: string): Promise<ScanRepo> {
    const repo = await this.deps.sources.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /**
   * Read files from the clone, keeping their order; missing, unreadable, binary or blank files
   * are skipped (a config file the repo does not have is simply absent).
   * @param repo The clone.
   * @param paths Paths chosen by code: the sample or the config allowlist, never the model.
   * @returns The files as the model will see them.
   */
  private async readFiles(repo: ScanRepo, paths: readonly string[]): Promise<SourceFile[]> {
    const read = await Promise.all(
      paths.map(async (path) => {
        const content = await this.deps.sources.readFile(repo.ref, path);
        return content === null ? null : toSourceFile(path, content);
      }),
    );
    return read.filter((file): file is SourceFile => file !== null);
  }

  /**
   * The scan's single structured model call; failures that are not already application errors
   * become ExternalServiceError (502).
   * @param model The feature's model.
   * @param session OpenRouter session id.
   * @param prompt System and user text.
   * @returns The validated answer.
   * @throws ExternalServiceError when the call or the validation fails.
   */
  private async askModel(model: FeatureModel, session: string, prompt: PromptText): Promise<ConventionExtraction> {
    const llm: LLMProvider = model.llm;
    try {
      const result = await llm.completeStructured({
        model: model.model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: LLM_TEMPERATURE,
        timeoutMs: LLM_TIMEOUT_MS,
        maxRetries: LLM_MAX_RETRIES,
        sessionId: session,
      });
      return result.data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError(`Convention extraction failed: ${reason}`);
    }
  }
}
