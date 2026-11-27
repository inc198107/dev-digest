import type {
  CommunitySkillSearchResult,
  Skill,
  SkillBlock,
  SkillCreateBody,
  SkillIgnoredFile,
  SkillImportPreview,
  SkillListItem,
  SkillStats,
  SkillStatsSummary,
  SkillUpdateBody,
  SkillVersion,
} from '@devdigest/shared';
import { MAX_SKILL_IMPORT_BYTES } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  INITIAL_SKILL_VERSION,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_UNPACKED_BYTES,
  MAX_SKILL_CORE_BYTES,
  SKILL_STATS_WINDOW_DAYS,
} from './constants.js';
import {
  baseName,
  cleanVersionNote,
  decodeSkillText,
  draftBodyProblem,
  draftFromMarkdown,
  fileKind,
  fileNameFromUrl,
  fileStem,
  formatSkillBlock,
  hiddenOnlyProblem,
  normalizeSkillUrl,
  planSkillVersion,
  restoreNote,
  selectSkillCore,
  type SkillDraft,
  mergeSkillUsage,
  toSkillStats,
  toSkillStatsSummary,
  withoutHiddenCharacters,
} from './domain.js';
import type {
  AgentSkillsReader,
  ArchiveReader,
  CommunitySkillSearch,
  SkillPatch,
  SkillRunUsageReader,
  SkillStatsReader,
  SkillsStore,
  SkillsUnitOfWork,
  TextFetcher,
  TokenCounter,
} from './ports.js';
import type { SkillsForAgent } from './types.js';

/**
 * Skills use cases (application ring) for the Skills Lab: CRUD with versioned body snapshots,
 * restore, and the import preview. A skill is text only; the import reads the skill core of a
 * Markdown file or an archive and stores nothing until the user confirms with `create`.
 */

/** What the skills use cases need from the outside, injected by the routes plugin. */
export interface SkillsServiceDeps {
  /** Non-transactional reads and single-statement writes. */
  store: SkillsStore;
  /** Atomic multi-statement writes. */
  uow: SkillsUnitOfWork;
  /** Lists and unpacks zip archives in memory. */
  archive: ArchiveReader;
  /** Downloads files for URL imports. */
  fetcher: TextFetcher;
  /** Token counts shown in the import preview. */
  tokens: TokenCounter;
}

/** Where an import's bytes came from. */
interface ImportOrigin {
  /** File name used to detect the kind and derive a name. */
  filename: string;
  source: SkillImportPreview['source'];
  /** What the preview shows as the origin: the upload name or the URL. */
  origin: string;
}

/** The skill text an import found and what it left out. */
interface ImportCore {
  draft: SkillDraft;
  skillFile: string;
  ignored: SkillIgnoredFile[];
}

export class SkillsService {
  /**
   * @param deps Ports this service depends on.
   */
  constructor(private readonly deps: SkillsServiceDeps) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns Every skill of the workspace with the agents that link it.
   */
  list(workspaceId: string): Promise<SkillListItem[]> {
    return this.deps.store.list(workspaceId);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns The skill with its users, or undefined (route → 404).
   */
  get(workspaceId: string, id: string): Promise<SkillListItem | undefined> {
    return this.deps.store.get(workspaceId, id);
  }

  /**
   * Create a skill and snapshot its body as version 1 in one transaction.
   * @param workspaceId Tenant scope.
   * @param input The new skill; `source` defaults to `manual`.
   * @returns The created skill.
   * @throws ConflictError when the name is taken in the workspace.
   */
  create(workspaceId: string, input: SkillCreateBody): Promise<Skill> {
    const visible = withoutHiddenCharacters(input);
    const problem = hiddenOnlyProblem(visible);
    if (problem) return Promise.reject(new ValidationError(problem));
    return this.deps.uow.run(async (store) => {
      const skill = await store.insert(
        workspaceId,
        { ...visible, source: visible.source ?? 'manual' },
        INITIAL_SKILL_VERSION,
      );
      await store.snapshotVersion(skill.id, INITIAL_SKILL_VERSION, skill.body);
      return skill;
    });
  }

  /**
   * Update a skill. Changing what the model sees (name, description, body) bumps the version
   * and snapshots the body; `type` and `enabled` keep it. The patch's `note` is stored with
   * that snapshot only: it is dropped when the update creates no version, and it never reaches
   * the skill row or the prompt. The row stays locked from the read to the commit, so
   * concurrent edits get consecutive versions.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @param patch Fields to change, optionally with a "what changed" note.
   * @returns The updated skill, or undefined (route → 404).
   * @throws ConflictError when the new name is taken in the workspace.
   */
  update(workspaceId: string, id: string, patch: SkillUpdateBody): Promise<Skill | undefined> {
    const { note, ...fields } = withoutHiddenCharacters(patch);
    const problem = hiddenOnlyProblem(fields);
    if (problem) return Promise.reject(new ValidationError(problem));
    const versionNote = cleanVersionNote(note);
    return this.deps.uow.run((store) => this.applyUpdate(store, workspaceId, id, fields, versionNote));
  }

  /**
   * Delete a skill; agent links and snapshots cascade.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns False when no such skill existed.
   */
  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.store.delete(workspaceId, id);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns Body snapshots newest first, or undefined when the skill is not in this workspace.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    if (!(await this.deps.store.get(workspaceId, id))) return undefined;
    return this.deps.store.listVersions(id);
  }

  /**
   * Make an old snapshot's body current again. The restored body becomes a new version noted
   * `Restored from v<N>`, so history is never rewritten; restoring the current body changes
   * nothing.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @param version Snapshot to restore.
   * @returns The updated skill, or undefined when the skill is not in this workspace.
   * @throws NotFoundError when that version was never recorded.
   */
  restore(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    return this.deps.uow.run(async (store) => {
      if (!(await store.getForUpdate(workspaceId, id))) return undefined;
      const snapshot = await store.getVersion(id, version);
      if (!snapshot) throw new NotFoundError('Skill version not found');
      return this.applyUpdate(store, workspaceId, id, { body: snapshot.body }, restoreNote(version));
    });
  }

  /**
   * Preview an uploaded Markdown file or zip archive. Stores nothing.
   * @param filename The upload's file name.
   * @param contentBase64 The file, base64-encoded.
   * @returns What the import would create.
   * @throws ValidationError when the file is unreadable, too large, or holds no skill core.
   */
  async previewFile(filename: string, contentBase64: string): Promise<SkillImportPreview> {
    const compact = contentBase64.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
      throw new ValidationError('content_base64 is not valid base64');
    }
    const bytes = new Uint8Array(Buffer.from(compact, 'base64'));
    if (bytes.length > MAX_SKILL_IMPORT_BYTES) throw tooLarge();
    return this.preview(bytes, { filename, source: 'imported_file', origin: filename });
  }

  /**
   * Preview a skill fetched from an https URL (GitHub file pages are read raw). Stores nothing.
   * @param url The link the user pasted.
   * @returns What the import would create.
   * @throws ValidationError when the URL is not allowed or holds no skill core;
   *   ExternalServiceError when the download fails.
   */
  async previewUrl(url: string): Promise<SkillImportPreview> {
    const file = await this.deps.fetcher.fetch(normalizeSkillUrl(url), MAX_SKILL_IMPORT_BYTES);
    return this.preview(file.bytes, { filename: fileNameFromUrl(file.url), source: 'imported_url', origin: url });
  }

  /**
   * Shared update path of `update` and `restore`, inside a unit of work.
   * @param store Transaction-bound store.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @param patch Fields to change.
   * @param note Note of the version the update creates; unused when it creates none.
   * @returns The updated skill, or undefined when it is not in this workspace.
   */
  private async applyUpdate(
    store: SkillsStore,
    workspaceId: string,
    id: string,
    patch: SkillPatch,
    note: string | null,
  ): Promise<Skill | undefined> {
    const existing = await store.getForUpdate(workspaceId, id);
    if (!existing) return undefined;
    const plan = planSkillVersion(existing, patch);
    if (!plan.bump) return store.update(workspaceId, id, patch);
    const updated = await store.update(workspaceId, id, patch, plan.version);
    if (updated) await store.snapshotVersion(id, plan.version, updated.body, note);
    return updated;
  }

  /**
   * Turn import bytes into a preview: find the skill core, read its frontmatter, count tokens.
   * @param bytes The file or archive.
   * @param from Where the bytes came from.
   * @returns The preview.
   * @throws ValidationError when the bytes hold no usable skill.
   */
  private preview(bytes: Uint8Array, from: ImportOrigin): SkillImportPreview {
    const kind = fileKind(from.filename, bytes);
    let core: ImportCore;
    if (kind === 'archive') core = this.coreFromArchive(bytes, from.filename);
    else if (kind === 'markdown' || from.source === 'imported_url') core = coreFromMarkdown(bytes, from.filename);
    else throw new ValidationError('Unsupported file: upload a Markdown file (.md) or a zip archive (.zip, .skill)');

    const problem = draftBodyProblem(core.draft);
    if (problem) throw new ValidationError(problem);

    const executables = core.ignored.filter((f) => f.reason === 'executable').length;
    const warnings = [...core.draft.warnings];
    if (executables > 0) {
      warnings.push(
        `${executables} executable file(s) were not processed: a skill is text only, nothing from the archive runs.`,
      );
    }
    return {
      name: core.draft.name,
      description: core.draft.description,
      type: core.draft.type,
      body: core.draft.body,
      source: from.source,
      origin: from.origin,
      skill_file: core.skillFile,
      tokens: this.deps.tokens.count(formatSkillBlock(core.draft)),
      ignored_files: core.ignored,
      warnings,
    };
  }

  /**
   * Read the skill core of a zip archive. Only the core entry is unpacked, under a byte cap.
   * @param bytes The archive.
   * @param filename The archive's file name (fallback for the skill name).
   * @returns The draft, the core's path and the ignored entries.
   * @throws ValidationError when the archive is too big, unreadable or has no core.
   */
  private coreFromArchive(bytes: Uint8Array, filename: string): ImportCore {
    const entries = this.deps.archive.list(bytes, MAX_ARCHIVE_ENTRIES);
    if (entries.length > MAX_ARCHIVE_ENTRIES) {
      throw new ValidationError(`The archive has ${entries.length} files; the limit is ${MAX_ARCHIVE_ENTRIES}.`);
    }
    const declared = entries.reduce((sum, e) => sum + e.size, 0);
    if (declared > MAX_ARCHIVE_UNPACKED_BYTES) {
      throw new ValidationError(
        `The archive unpacks to more than ${MAX_ARCHIVE_UNPACKED_BYTES / 1024 / 1024} MiB; it is not imported.`,
      );
    }
    const selection = selectSkillCore(entries.map((e) => e.name));
    if (!selection.ok) throw new ValidationError(selection.problem);
    const text = decodeSkillText(this.deps.archive.read(bytes, selection.core, MAX_SKILL_CORE_BYTES));
    if (text === null) throw new ValidationError(`${selection.core} is not UTF-8 text.`);
    return {
      draft: draftFromMarkdown(text, selection.folderName || fileStem(filename)),
      skillFile: selection.core.replace(/\\/g, '/'),
      ignored: selection.ignored,
    };
  }
}

/**
 * Read a single Markdown skill file.
 * @param bytes The file.
 * @param filename Its name (fallback for the skill name).
 * @returns The draft; nothing is ignored.
 * @throws ValidationError when the bytes are not UTF-8 text.
 */
function coreFromMarkdown(bytes: Uint8Array, filename: string): ImportCore {
  const text = decodeSkillText(bytes);
  if (text === null) throw new ValidationError('The file is not UTF-8 text.');
  return { draft: draftFromMarkdown(text, fileStem(filename)), skillFile: baseName(filename) || filename, ignored: [] };
}

/**
 * @returns The error for an import over the size limit.
 */
function tooLarge(): ValidationError {
  return new ValidationError(`The file is larger than ${MAX_SKILL_IMPORT_BYTES / 1024 / 1024} MiB.`);
}

/** What `SkillPromptBlocks` needs: the enabled linked skills and a token counter. */
export interface SkillPromptBlocksDeps {
  skills: AgentSkillsReader;
  tokens: TokenCounter;
}

/**
 * The skill blocks of one agent's review prompt (the reviews module reads them through
 * `container.skillsForAgent`). Only skills that are linked and enabled, in link order.
 */
export class SkillPromptBlocks implements SkillsForAgent {
  /**
   * @param deps Ports this use case depends on.
   */
  constructor(private readonly deps: SkillPromptBlocksDeps) {}

  /**
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns One block per enabled linked skill, with the tokens it adds.
   */
  async forAgent(workspaceId: string, agentId: string): Promise<SkillBlock[]> {
    const skills = await this.deps.skills.enabledForAgent(workspaceId, agentId);
    return skills.map((skill) => {
      const text = formatSkillBlock(skill);
      return {
        id: skill.id,
        name: skill.name,
        type: skill.type,
        version: skill.version,
        tokens: this.deps.tokens.count(text),
        text,
      };
    });
  }
}

/** What the stats use cases need: the skills side (links) and the review runs' side. */
export interface SkillStatsServiceDeps {
  stats: SkillStatsReader;
  runs: SkillRunUsageReader;
}

/**
 * Skills Lab stats (last 30 days): how often each skill was in a finished review's prompt and
 * how the findings of those runs were judged. The reader counts; the rates are domain rules.
 */
export class SkillStatsService {
  /**
   * @param deps Ports this use case depends on.
   */
  constructor(private readonly deps: SkillStatsServiceDeps) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns The card numbers of every skill of the workspace, by skill name (one read).
   */
  async summary(workspaceId: string): Promise<SkillStatsSummary[]> {
    const links = await this.deps.stats.linkCounts(workspaceId);
    const usage = await this.deps.runs.runUsage(
      workspaceId,
      links.map((link) => link.skillId),
      SKILL_STATS_WINDOW_DAYS,
    );
    return mergeSkillUsage(links, usage.skills).map((counts) => toSkillStatsSummary(counts, usage.runs));
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns The stats of the skill, or undefined when it is not in this workspace (route → 404).
   */
  async forSkill(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const [link] = await this.deps.stats.linkCounts(workspaceId, id);
    if (!link) return undefined;
    const [usage, categories] = await Promise.all([
      this.deps.runs.runUsage(workspaceId, [id], SKILL_STATS_WINDOW_DAYS),
      this.deps.runs.findingsByCategory(workspaceId, id, SKILL_STATS_WINDOW_DAYS),
    ]);
    const [counts] = mergeSkillUsage([link], usage.skills);
    return toSkillStats(counts!, usage.runs, categories);
  }
}

/** What the community search use case needs. */
export interface CommunitySkillsServiceDeps {
  search: CommunitySkillSearch;
}

/** Search public GitHub repositories for community skills (`SKILL.md` files). */
export class CommunitySkillsService {
  /**
   * @param deps Ports this use case depends on.
   */
  constructor(private readonly deps: CommunitySkillsServiceDeps) {}

  /**
   * @param query Search text as typed; whitespace runs are collapsed, so equal searches share
   *   the adapter cache.
   * @returns The hits, or `{ configured: false, items: [] }` without a GitHub token.
   * @throws ExternalServiceError when GitHub fails, refuses or does not answer in time.
   */
  search(query: string): Promise<CommunitySkillSearchResult> {
    return this.deps.search.search(query.replace(/\s+/g, ' ').trim());
  }
}
