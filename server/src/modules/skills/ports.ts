import type {
  Skill,
  SkillCreateBody,
  SkillListItem,
  SkillUpdateBody,
  SkillVersion,
} from '@devdigest/shared';

/**
 * Ports of the skills use cases. Declared here, in the core's vocabulary (contract shapes, no
 * Drizzle, fflate or node:https types); implemented by ./repository.ts and the archive and
 * web adapters, wired by the composition root.
 */

/** A new skill as stored: the create body with its source resolved. */
export interface NewSkill extends Omit<SkillCreateBody, 'source'> {
  source: NonNullable<SkillCreateBody['source']>;
}

/** Persistence of skills and their body snapshots. */
export interface SkillsStore {
  /**
   * @param workspaceId Tenant scope.
   * @returns Every skill of the workspace with the agents that link it, by name.
   */
  list(workspaceId: string): Promise<SkillListItem[]>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns The skill with its users, or undefined when it is not in this workspace.
   */
  get(workspaceId: string, id: string): Promise<SkillListItem | undefined>;
  /**
   * Read the skill and lock its row until the surrounding unit of work ends, so concurrent
   * read-then-write updates run one after another. Use it only inside `SkillsUnitOfWork.run`.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns The skill, or undefined when it is not in this workspace.
   */
  getForUpdate(workspaceId: string, id: string): Promise<Skill | undefined>;
  /**
   * @param workspaceId Tenant scope.
   * @param input The new skill.
   * @param version The version to store on the skill.
   * @returns The stored skill.
   * @throws ConflictError when the workspace already has a skill with this name.
   */
  insert(workspaceId: string, input: NewSkill, version: number): Promise<Skill>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @param patch Fields to change.
   * @param version The new version when a model-visible field changed; omit it to keep it.
   * @returns The updated skill, or undefined when it is not in this workspace.
   * @throws ConflictError when the new name is taken in the workspace.
   */
  update(
    workspaceId: string,
    id: string,
    patch: SkillUpdateBody,
    version?: number,
  ): Promise<Skill | undefined>;
  /**
   * Agent links and snapshots cascade.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns False when no such skill existed in the workspace.
   */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /**
   * Record a body as an immutable snapshot. Idempotent per version.
   * @param skillId Skill id (already checked to be in the caller's workspace).
   * @param version Version number of the snapshot.
   * @param body The body at that version.
   * @returns Resolves when stored.
   */
  snapshotVersion(skillId: string, version: number, body: string): Promise<void>;
  /**
   * @param skillId Skill id.
   * @returns Body snapshots, newest first.
   */
  listVersions(skillId: string): Promise<SkillVersion[]>;
  /**
   * @param skillId Skill id.
   * @param version Version number.
   * @returns The snapshot, or undefined when that version was never recorded.
   */
  getVersion(skillId: string, version: number): Promise<SkillVersion | undefined>;
}

/** Runs several store operations atomically. */
export interface SkillsUnitOfWork {
  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What `work` returns, after the transaction commits.
   */
  run<T>(work: (store: SkillsStore) => Promise<T>): Promise<T>;
}

/** The skills an agent's prompt receives, read for a review run. */
export interface AgentSkillsReader {
  /**
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns The agent's linked skills that are enabled, in link order.
   */
  enabledForAgent(workspaceId: string, agentId: string): Promise<Skill[]>;
}

/** One file entry of an archive. */
export interface ArchiveEntry {
  /** Entry name exactly as stored in the archive. */
  name: string;
  /** Size the archive declares for the unpacked entry (bytes). */
  size: number;
}

/** Reads zip archives in memory. Never writes to disk and never runs an entry. */
export interface ArchiveReader {
  /**
   * @param bytes The archive.
   * @param maxEntries Most records to walk; the archive's own count is not trusted.
   * @returns Its file entries (directories excluded), without unpacking any of them.
   * @throws ValidationError when the bytes are not a readable zip archive or hold more than
   *   `maxEntries` records.
   */
  list(bytes: Uint8Array, maxEntries: number): ArchiveEntry[];
  /**
   * Unpack one entry, stopping as soon as it exceeds `maxBytes` (the declared size is not
   * trusted).
   * @param bytes The archive.
   * @param name Entry name as returned by `list`.
   * @param maxBytes Most bytes to unpack.
   * @returns The entry's bytes.
   * @throws ValidationError when the entry is missing, unreadable or larger than `maxBytes`.
   */
  read(bytes: Uint8Array, name: string, maxBytes: number): Uint8Array;
}

/** A file downloaded for an import. */
export interface FetchedFile {
  /** The URL the content came from, after redirects. */
  url: string;
  bytes: Uint8Array;
}

/** Downloads a public file over https for an import. */
export interface TextFetcher {
  /**
   * @param url An https URL.
   * @param maxBytes Most bytes to download.
   * @returns The downloaded file.
   * @throws ValidationError when the URL or its address is not allowed or the file is too
   *   large; ExternalServiceError when the server cannot be reached or does not answer 200.
   */
  fetch(url: string, maxBytes: number): Promise<FetchedFile>;
}

/** Counts the tokens a text adds to a prompt. */
export interface TokenCounter {
  /**
   * @param text Prompt text.
   * @returns Its token count.
   */
  count(text: string): number;
}
