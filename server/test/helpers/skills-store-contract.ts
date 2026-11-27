import { describe, it, expect } from 'vitest';
import { ConflictError } from '../../src/platform/errors.js';
import type { NewSkill, SkillPatch, SkillsStore } from '../../src/modules/skills/ports.js';

/**
 * Behaviour every SkillsStore must share, run against the in-memory fake (skills-service.test.ts)
 * and the Drizzle repository (skills.it.test.ts), so the fake used by the use-case tests cannot
 * drift from Postgres on scoping, name uniqueness, ordering or idempotency.
 */

/** What one contract test needs from an implementation. */
export interface SkillsStoreFixture {
  /** A fresh store; the tests only touch skills they create. */
  store: SkillsStore;
  /** Workspace the tests write to. */
  workspaceId: string;
  /** A second workspace that must never see the first one's skills. */
  otherWorkspaceId: string;
}

/**
 * @param name Skill name, unique per test.
 * @returns A valid new skill.
 */
function input(name: string): NewSkill {
  return { name, description: 'Flag things.', type: 'rubric', body: '# Body', source: 'manual' };
}

/**
 * Register the contract suite.
 * @param name Implementation name shown in the test report.
 * @param make Builds a fixture; called once per test.
 * @returns Nothing; registers a describe block.
 */
export function skillsStoreContract(name: string, make: () => Promise<SkillsStoreFixture>): void {
  describe(`SkillsStore contract: ${name}`, () => {
    it('reads, updates and deletes only inside the skill workspace', async () => {
      const { store, workspaceId, otherWorkspaceId } = await make();
      const skill = await store.insert(workspaceId, input('contract-scope'), 1);
      expect(await store.get(otherWorkspaceId, skill.id)).toBeUndefined();
      expect(await store.getForUpdate(otherWorkspaceId, skill.id)).toBeUndefined();
      expect(await store.update(otherWorkspaceId, skill.id, { body: 'x' }, 2)).toBeUndefined();
      expect(await store.delete(otherWorkspaceId, skill.id)).toBe(false);
      expect((await store.list(otherWorkspaceId)).map((s) => s.id)).not.toContain(skill.id);
      expect(await store.get(workspaceId, skill.id)).toMatchObject({ id: skill.id, version: 1, used_by: [] });
      expect(await store.delete(workspaceId, skill.id)).toBe(true);
      expect(await store.get(workspaceId, skill.id)).toBeUndefined();
    });

    it('stores every field and defaults enabled to true', async () => {
      const { store, workspaceId } = await make();
      const skill = await store.insert(workspaceId, { ...input('contract-fields'), source: 'imported_file' }, 1);
      expect(skill).toMatchObject({
        name: 'contract-fields',
        description: 'Flag things.',
        type: 'rubric',
        source: 'imported_file',
        body: '# Body',
        enabled: true,
        version: 1,
      });
    });

    it('keeps names unique per workspace, on insert and on rename', async () => {
      const { store, workspaceId, otherWorkspaceId } = await make();
      await store.insert(workspaceId, input('contract-dup'), 1);
      await expect(store.insert(workspaceId, input('contract-dup'), 1)).rejects.toBeInstanceOf(ConflictError);
      await expect(store.insert(otherWorkspaceId, input('contract-dup'), 1)).resolves.toMatchObject({
        name: 'contract-dup',
      });
      const other = await store.insert(workspaceId, input('contract-dup-2'), 1);
      await expect(store.update(workspaceId, other.id, { name: 'contract-dup' })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('update without a version keeps the stored one', async () => {
      const { store, workspaceId } = await make();
      const skill = await store.insert(workspaceId, input('contract-version'), 3);
      expect(await store.update(workspaceId, skill.id, { enabled: false })).toMatchObject({
        enabled: false,
        version: 3,
      });
      expect(await store.update(workspaceId, skill.id, {})).toMatchObject({ version: 3 });
      expect(await store.update(workspaceId, skill.id, { body: 'new' }, 4)).toMatchObject({
        body: 'new',
        version: 4,
      });
    });

    it('snapshots are idempotent per version and listed newest first', async () => {
      const { store, workspaceId } = await make();
      const skill = await store.insert(workspaceId, input('contract-snapshots'), 1);
      await store.snapshotVersion(skill.id, 1, 'v1 body');
      await store.snapshotVersion(skill.id, 1, 'ignored rewrite');
      await store.snapshotVersion(skill.id, 2, 'v2 body');
      const versions = await store.listVersions(skill.id);
      expect(versions.map((v) => [v.version, v.body])).toEqual([
        [2, 'v2 body'],
        [1, 'v1 body'],
      ]);
      expect(await store.getVersion(skill.id, 1)).toMatchObject({ skill_id: skill.id, body: 'v1 body' });
      expect(await store.getVersion(skill.id, 9)).toBeUndefined();
    });

    it('keeps a note on its snapshot only', async () => {
      const { store, workspaceId } = await make();
      const skill = await store.insert(workspaceId, input('contract-notes'), 1);
      await store.snapshotVersion(skill.id, 1, 'v1 body');
      await store.snapshotVersion(skill.id, 2, 'v2 body', 'Covers early returns');
      await store.snapshotVersion(skill.id, 2, 'v2 again', 'ignored rewrite');
      expect((await store.listVersions(skill.id)).map((v) => [v.version, v.note ?? null])).toEqual([
        [2, 'Covers early returns'],
        [1, null],
      ]);
      expect((await store.getVersion(skill.id, 2))?.note).toBe('Covers early returns');
      /** A caller that leaks the note into the patch must not get it onto the skill. */
      const leaked = { body: 'new', note: 'not a column' } as SkillPatch;
      const updated = await store.update(workspaceId, skill.id, leaked, 2);
      expect(updated).toMatchObject({ body: 'new', version: 2 });
      expect(updated).not.toHaveProperty('note');
      expect(await store.get(workspaceId, skill.id)).not.toHaveProperty('note');
    });

    it('lists the workspace skills by name', async () => {
      const { store, workspaceId } = await make();
      await store.insert(workspaceId, input('contract-list-b'), 1);
      await store.insert(workspaceId, input('contract-list-a'), 1);
      const names = (await store.list(workspaceId)).map((s) => s.name).filter((n) => n.startsWith('contract-list'));
      expect(names).toEqual(['contract-list-a', 'contract-list-b']);
    });
  });
}
