import type {
  ConventionCandidate,
  ConventionList,
  ConventionScanResult,
  ConventionUpdateBody,
  LLMProvider,
} from '@devdigest/shared';
import type { z } from 'zod';
import {
  AppError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
} from '../../platform/errors.js';
import {
  EXTRACTION_SCHEMA,
  FILE_SELECTION_SCHEMA,
  LLM_MAX_RETRIES,
  LLM_TEMPERATURE,
  LLM_TIMEOUT_MS,
  MAX_TOTAL_CHARS,
  SAMPLE_POOL_SIZE,
} from './constants.js';
import {
  ConventionExtraction,
  ConventionFileSelection,
  extractionPrompt,
  fileSelectionPrompt,
  fitToBudget,
  groundConventions,
  pickFiles,
  type PromptText,
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
 * reword or reject them. A scan reads files only from the repo-intel sample, asks the model in
 * two steps (pick files, then extract rules) and stores only conventions grounded in the lines it
 * read; the model is never called inside a transaction.
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
   * Scan the repo: sample → model picks files → read them → model extracts rules → ground →
   * replace the not-accepted conventions in one transaction. Accepted ones stay (stamped with
   * this scan's time), and a new rule that repeats one of them is skipped. A failure stores
   * nothing.
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo's conventions after the scan and the files the model read.
   * @throws NotFoundError when the repo is not in this workspace.
   * @throws ConflictError when the repo is not cloned or not indexed, or no file can be read.
   * @throws ExternalServiceError when the extraction call fails.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScanResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.cloned) {
      throw new ConflictError('Repository is not cloned yet. Wait for the clone to finish, then scan again.');
    }
    const pool = await this.deps.sources.samplePaths(repoId, SAMPLE_POOL_SIZE);
    if (pool.length === 0) {
      throw new ConflictError('Repository is not indexed yet. Wait for indexing or run Resync, then scan again.');
    }
    const model = await this.deps.model(workspaceId);
    const session = `conventions-${repoId}`;

    const picked = pickFiles(await this.selectFiles(model, session, repo.name, pool), pool);
    const files = fitToBudget(await this.readFiles(repo, picked), MAX_TOTAL_CHARS);
    if (files.length === 0) {
      throw new ConflictError('None of the sampled files could be read from the clone. Run Resync, then scan again.');
    }

    const extraction = await this.ask(
      model,
      session,
      EXTRACTION_SCHEMA,
      ConventionExtraction,
      extractionPrompt(repo.name, files),
    );
    const drafts = groundConventions(extraction.conventions, files);

    const list = await this.deps.uow.run(async (store) => {
      const accepted = await store.listAccepted(workspaceId, repoId);
      await store.deletePending(workspaceId, repoId);
      await store.insertMany(workspaceId, repoId, withoutAccepted(drafts, accepted));
      await store.touchAccepted(workspaceId, repoId);
      return store.list(workspaceId, repoId);
    });
    return { ...list, analyzed_files: files.map((file) => file.path) };
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
   * File-selection step. Best effort: a failed call returns no picks, so the scan falls back to
   * the highest-ranked samples instead of failing.
   * @param model The feature's model.
   * @param session OpenRouter session grouping both calls of a scan.
   * @param repoName Repository name shown to the model.
   * @param pool The ranked sample.
   * @returns The paths the model picked (not yet checked against the sample).
   */
  private async selectFiles(model: FeatureModel, session: string, repoName: string, pool: string[]): Promise<string[]> {
    try {
      const answer = await this.ask(
        model,
        session,
        FILE_SELECTION_SCHEMA,
        ConventionFileSelection,
        fileSelectionPrompt(repoName, pool),
      );
      return answer.files;
    } catch {
      return [];
    }
  }

  /**
   * Read the picked files; unreadable, binary or blank files are skipped.
   * @param repo The clone.
   * @param paths Paths from the sample.
   * @returns The files as the model will see them.
   */
  private async readFiles(repo: ScanRepo, paths: string[]): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    for (const path of paths) {
      const content = await this.deps.sources.readFile(repo.ref, path);
      const file = content === null ? null : toSourceFile(path, content);
      if (file) files.push(file);
    }
    return files;
  }

  /**
   * One structured model call; failures that are not already application errors become
   * ExternalServiceError (502).
   * @param model The feature's model.
   * @param session OpenRouter session id.
   * @param schemaName Name of the answer schema.
   * @param schema The answer schema.
   * @param prompt System and user text.
   * @returns The validated answer.
   * @throws ExternalServiceError when the call or the validation fails.
   */
  private async ask<T>(
    model: FeatureModel,
    session: string,
    schemaName: string,
    schema: z.ZodType<T>,
    prompt: PromptText,
  ): Promise<T> {
    const llm: LLMProvider = model.llm;
    try {
      const result = await llm.completeStructured({
        model: model.model,
        schema,
        schemaName,
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
