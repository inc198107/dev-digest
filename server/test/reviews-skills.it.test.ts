import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Review, RunTrace } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Skills in a review run: the enabled linked skills of the agent reach the model's user message
 * in link order, each as its own block; the trace lists every block with its tokens and the
 * live log has one line per skill. A disabled or unlinked skill appears nowhere.
 */

const DIFF = `diff --git a/src/refund.ts b/src/refund.ts
--- a/src/refund.ts
+++ b/src/refund.ts
@@ -1,2 +1,3 @@
 export function refund(a: number) {
+  if (a <= 0) throw new RangeError('positive');
   return a;`;

const APPROVE: Review = { verdict: 'approve', summary: 'Nothing to report.', score: 100, findings: [] };

d('skills in review runs (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * @returns The API with a recording mock LLM and a fixed diff.
   */
  function makeApp() {
    llm = new MockLLMProvider('openai', { structured: APPROVE });
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), llm: { openai: llm } },
    });
  }

  let prSeq = 0;
  /**
   * @returns A fresh repo with one open PR.
   */
  async function newPr() {
    const name = `skills-api-${prSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Guard refunds',
        author: 'dev',
        branch: 'feat/guard',
        base: 'main',
        headSha: 'abc123',
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  /**
   * @param app The API.
   * @param name Agent name.
   * @returns The created agent's id.
   */
  async function newAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review tests.', repo_intel: false },
    });
    return res.json().id as string;
  }

  /**
   * @param app The API.
   * @param agentId Reviewing agent.
   * @returns The persisted trace and the user message the model received.
   */
  async function review(app: Awaited<ReturnType<typeof makeApp>>, agentId: string) {
    const pr = await newPr();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId } });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json() as RunTrace;
    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const messages = (call?.req as { messages: { role: string; content: string }[] } | undefined)?.messages ?? [];
    return {
      trace,
      user: messages.find((m) => m.role === 'user')?.content ?? '',
      system: messages.find((m) => m.role === 'system')?.content ?? '',
    };
  }

  it('sends enabled linked skills in link order and records each with its tokens', async () => {
    const app = await makeApp();
    const create = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: `Flag ${name} problems.`, type: 'rubric', body: `# ${name}\n- rule of ${name}` },
        })
      ).json() as { id: string };
    const first = await create('run-first');
    const off = await create('run-disabled');
    const second = await create('run-second');
    await create('run-unlinked');
    await app.inject({ method: 'PUT', url: `/skills/${off.id}`, payload: { enabled: false } });

    const agentId = await newAgent(app, 'Run Skills Agent');
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [second.id, off.id, first.id] },
    });

    const { trace, user, system } = await review(app, agentId);

    expect(user).toContain('## Skills / rules');
    expect(user.indexOf('### Skill: run-second')).toBeGreaterThan(-1);
    expect(user.indexOf('### Skill: run-second')).toBeLessThan(user.indexOf('### Skill: run-first'));
    expect(user).toContain('> Flag run-first problems.');
    expect(user).not.toContain('run-disabled');
    expect(user).not.toContain('run-unlinked');
    expect(system).not.toContain('### Skill:');

    const blocks = trace.prompt_assembly.skill_blocks ?? [];
    expect(blocks.map((b) => [b.name, b.version])).toEqual([
      ['run-second', 1],
      ['run-first', 1],
    ]);
    for (const b of blocks) expect(b.tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.skills).toContain('### Skill: run-second');

    const log = trace.log.map((l) => l.msg);
    expect(log).toContain(`Skill loaded: run-second v1 (+${blocks[0]!.tokens} tokens)`);
    expect(log).toContain(`Skills: 2 attached, +${blocks[0]!.tokens + blocks[1]!.tokens} prompt tokens`);
    expect(log.join('\n')).not.toContain('run-disabled');
    await app.close();
  });

  it('an agent without enabled skills gets no skills section', async () => {
    const app = await makeApp();
    const agentId = await newAgent(app, 'Run No Skills Agent');
    const { trace, user } = await review(app, agentId);
    expect(user).not.toContain('## Skills / rules');
    expect(trace.prompt_assembly.skill_blocks).toEqual([]);
    expect(trace.prompt_assembly.skills ?? null).toBeNull();
    expect(trace.log.map((l) => l.msg)).toContain('Skills: none enabled for this agent');
    await app.close();
  });

  it('saves the trace before the run turns terminal, on success and on failure', async () => {
    const seen: { status: string; trace: boolean }[] = [];
    const complete = ReviewRepository.prototype.completeAgentRun;
    /**
     * Wrap our own repository (not a library) to look at the trace at the exact moment the
     * terminal status is written: a reader polling the status must already find the trace.
     */
    const spy = vi
      .spyOn(ReviewRepository.prototype, 'completeAgentRun')
      .mockImplementation(async function (this: ReviewRepository, runId, values) {
        seen.push({ status: values.status, trace: (await this.getRunTrace(runId)) !== undefined });
        return complete.call(this, runId, values);
      });
    try {
      const app = await makeApp();
      await review(app, await newAgent(app, 'Run Order Agent'));
      await app.close();

      /** No Anthropic key: resolving the provider throws inside the run, so it fails. */
      const failing = await buildApp({
        config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        db: pg.handle.db,
        overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: DIFF }), secrets: new MockSecretsProvider() },
      });
      const created = await failing.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Run Order Failing', provider: 'anthropic', model: 'claude-x', system_prompt: 'Review.', repo_intel: false },
      });
      const pr = await newPr();
      await failing.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: created.json().id } });
      const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      expect(run?.status).toBe('failed');
      await failing.close();
    } finally {
      spy.mockRestore();
    }
    expect(seen).toEqual([
      { status: 'done', trace: true },
      { status: 'failed', trace: true },
    ]);
  });
});
