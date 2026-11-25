import { describe, it, expect } from 'vitest';
import type { AgentsStore, NewAgent } from '../../src/modules/agents/ports.js';

/**
 * Behaviour every AgentsStore must share, run against the in-memory fake (agents-service.test.ts)
 * and the Drizzle repository (agents-versions.it.test.ts), so the fake used by the use-case
 * tests cannot drift from Postgres on scoping, ordering or idempotency.
 */

/** What one contract test needs from an implementation. */
export interface AgentsStoreFixture {
  /** A fresh store; the tests only touch agents they create. */
  store: AgentsStore;
  /** Workspace the tests write to. */
  workspaceId: string;
  /** A second workspace that must never see the first one's agents. */
  otherWorkspaceId: string;
  /** Two existing skills of `workspaceId` that may be linked to agents. */
  skillIds: [string, string];
  /** An existing skill of `otherWorkspaceId`. */
  foreignSkillId: string;
}

const INPUT: NewAgent = {
  name: 'Contract agent',
  provider: 'openai',
  model: 'gpt-4o-mini',
  system_prompt: 'Review the diff.',
  createdBy: null,
};

/**
 * Register the contract suite.
 * @param name Implementation name shown in the test report.
 * @param make Builds a fixture; called once per test.
 * @returns Nothing; registers a describe block.
 */
export function agentsStoreContract(name: string, make: () => Promise<AgentsStoreFixture>): void {
  describe(`AgentsStore contract: ${name}`, () => {
    it('reads, updates and deletes only inside the agent workspace', async () => {
      const { store, workspaceId, otherWorkspaceId } = await make();
      const agent = await store.insert(workspaceId, INPUT, 1);
      expect(await store.get(otherWorkspaceId, agent.id)).toBeUndefined();
      expect(await store.getForUpdate(otherWorkspaceId, agent.id)).toBeUndefined();
      expect(await store.update(otherWorkspaceId, agent.id, { model: 'x' }, 2)).toBeUndefined();
      expect(await store.delete(otherWorkspaceId, agent.id)).toBe(false);
      expect((await store.list(otherWorkspaceId)).map((a) => a.id)).not.toContain(agent.id);
      expect(await store.getForUpdate(workspaceId, agent.id)).toMatchObject({ id: agent.id, version: 1 });
    });

    it('update without a version keeps the stored one', async () => {
      const { store, workspaceId } = await make();
      const agent = await store.insert(workspaceId, INPUT, 3);
      expect(await store.update(workspaceId, agent.id, { enabled: false })).toMatchObject({
        enabled: false,
        version: 3,
      });
      expect(await store.update(workspaceId, agent.id, {})).toMatchObject({ version: 3 });
      expect(await store.update(workspaceId, agent.id, { model: 'gpt-4o' }, 4)).toMatchObject({
        model: 'gpt-4o',
        version: 4,
      });
    });

    it('snapshotVersion is idempotent per version and captures linked skills', async () => {
      const { store, workspaceId, skillIds } = await make();
      const agent = await store.insert(workspaceId, INPUT, 1);
      await store.replaceSkills(agent.id, skillIds);
      await store.snapshotVersion(workspaceId, agent.id, 1);
      await store.snapshotVersion(workspaceId, agent.id, 1);
      const versions = await store.listVersions(agent.id);
      expect(versions).toHaveLength(1);
      expect(versions[0]?.config.skills).toEqual(skillIds);
    });

    it('snapshotVersion ignores an agent of another workspace', async () => {
      const { store, workspaceId, otherWorkspaceId } = await make();
      const agent = await store.insert(workspaceId, INPUT, 1);
      await store.snapshotVersion(otherWorkspaceId, agent.id, 1);
      expect(await store.listVersions(agent.id)).toEqual([]);
    });

    it('knownSkillIds returns only skills of the given workspace', async () => {
      const { store, workspaceId, skillIds, foreignSkillId } = await make();
      const unknown = '00000000-0000-4000-8000-000000000000';
      const known = await store.knownSkillIds(workspaceId, [...skillIds, foreignSkillId, unknown]);
      expect([...known].sort()).toEqual([...skillIds].sort());
      expect(await store.knownSkillIds(workspaceId, [])).toEqual([]);
    });

    it('keeps skill links ordered; replaceSkills replaces the set, linkSkill upserts', async () => {
      const { store, workspaceId, skillIds } = await make();
      const [a, b] = skillIds;
      const agent = await store.insert(workspaceId, INPUT, 1);
      await store.replaceSkills(agent.id, [b, a]);
      expect((await store.skillLinks(agent.id)).map((l) => [l.skill_id, l.order])).toEqual([
        [b, 0],
        [a, 1],
      ]);
      await store.linkSkill(agent.id, b, 5);
      expect((await store.skillLinks(agent.id)).map((l) => [l.skill_id, l.order])).toEqual([
        [a, 1],
        [b, 5],
      ]);
      await store.replaceSkills(agent.id, []);
      expect(await store.skillLinks(agent.id)).toEqual([]);
    });
  });
}
