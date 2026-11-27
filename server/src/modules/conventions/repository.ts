import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { ConventionCandidate, ConventionList, ConventionUpdateBody } from '@devdigest/shared';
import type { Db, DbExecutor } from '../../db/client.js';
import type { ConventionRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import type { ConventionDraft } from './domain.js';
import type { ConventionsStore, ConventionsUnitOfWork } from './ports.js';

/**
 * Conventions persistence (infrastructure ring). Owns the `conventions` table; rows are mapped
 * to the `ConventionCandidate` contract before they leave this file. Every query is scoped by
 * workspace (and by repo where the operation is per repo).
 */

/**
 * Map a stored row to the public contract. Columns the extractor always fills are nullable in
 * the reserved schema, so missing values read as empty.
 * @param row Drizzle row from `conventions`.
 * @returns The contract shape.
 */
function toCandidate(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: Math.min(1, Math.max(0, row.confidence ?? 0)),
    accepted: row.accepted,
  };
}

export class ConventionsRepository implements ConventionsStore {
  /**
   * @param db The shared client, or a transaction when built by the unit of work.
   */
  constructor(private readonly db: DbExecutor) {}

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns Conventions most confident first (then by rule) and the newest `created_at`.
   */
  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(sql`${t.conventions.confidence} desc nulls last`, asc(t.conventions.rule));
    const newest = rows.reduce<Date | null>(
      (max, row) => (max === null || row.createdAt > max ? row.createdAt : max),
      null,
    );
    return { candidates: rows.map(toCandidate), last_scan_at: newest ? newest.toISOString() : null };
  }

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns The repo's accepted conventions.
   */
  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, true),
        ),
      )
      .orderBy(desc(t.conventions.createdAt));
    return rows.map(toCandidate);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Convention id.
   * @param patch New rule and/or accepted flag.
   * @returns The updated convention, or undefined when it is not in this workspace.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdateBody,
  ): Promise<ConventionCandidate | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.accepted !== undefined ? { accepted: patch.accepted } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row ? toCandidate(row) : undefined;
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Convention id.
   * @returns False when no such convention existed in the workspace.
   */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @param accepted The flag every convention of the repo gets.
   * @returns Resolves when stored.
   */
  async setAllAccepted(workspaceId: string, repoId: string, accepted: boolean): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ accepted })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns Resolves when the repo's not-accepted conventions are deleted.
   */
  async deletePending(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, false),
        ),
      );
  }

  /**
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @param drafts Grounded conventions; stored not accepted, `created_at` = now.
   * @returns Resolves when stored.
   */
  async insertMany(workspaceId: string, repoId: string, drafts: ConventionDraft[]): Promise<void> {
    if (drafts.length === 0) return;
    await this.db.insert(t.conventions).values(
      drafts.map((draft) => ({
        workspaceId,
        repoId,
        rule: draft.rule,
        evidencePath: draft.evidence_path,
        evidenceSnippet: draft.evidence_snippet,
        confidence: draft.confidence,
        accepted: false,
      })),
    );
  }

  /**
   * Inside the scan's transaction `now()` is the transaction start, the same time the new rows
   * get from the column default.
   * @param workspaceId Tenant scope.
   * @param repoId Repository id.
   * @returns Resolves when the repo's accepted conventions carry the current scan time.
   */
  async touchAccepted(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .update(t.conventions)
      .set({ createdAt: sql`now()` })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.accepted, true),
        ),
      );
  }
}

/** Unit of work over Drizzle: one transaction, a store bound to it. */
export class DrizzleConventionsUnitOfWork implements ConventionsUnitOfWork {
  /**
   * @param db The shared client that opens transactions.
   */
  constructor(private readonly db: Db) {}

  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What `work` returns, after the transaction commits.
   */
  run<T>(work: (store: ConventionsStore) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new ConventionsRepository(tx)));
  }
}
