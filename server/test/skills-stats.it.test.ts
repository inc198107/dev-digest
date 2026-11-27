import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Review, SkillStats, SkillStatsSummary } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { SkillStatsService } from '../src/modules/skills/service.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * Skills Lab stats on Postgres: one real review run (mock LLM) proves that the trace the run
 * executor writes is what the stats query matches; hand-inserted runs cover the window, the
 * finished-only rule, traces without skill blocks, accepted / dismissed findings and workspace
 * isolation.
 */

/** A diff whose line 11 is added, so the grounding gate keeps a finding there. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** The model's answer: one grounded security finding. */
const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/** A finding of a hand-inserted run and how the user judged it. */
type SeededFinding = { category: string; state: 'accepted' | 'dismissed' | 'open' };

d('skill stats (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'stats-other' }).returning();
    otherWorkspaceId = other!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * @returns The API with a mock LLM that reports one grounded finding.
   */
  function makeApp() {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW }) },
      },
    });
  }

  let prSeq = 0;
  /**
   * @param ws Workspace of the repo and PR.
   * @returns A fresh open PR in a fresh repo.
   */
  async function newPr(ws: string) {
    const name = `stats-${prSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 9,
        title: 'Stats PR',
        author: 'dev',
        branch: 'feat/stats',
        base: 'main',
        headSha: 'abc123',
        status: 'needs_review',
      })
      .returning();
    return pr!;
  }

  /**
   * Insert a run as the executor would leave it: the run, its trace, one review and findings.
   * @param opts Workspace, status, age, the skills its trace recorded (`null`: a trace without
   *   skill blocks; `undefined`: no trace at all) and its findings.
   * @returns The run id.
   */
  async function insertRun(opts: {
    ws: string;
    status: string;
    daysAgo: number;
    skills?: { id: string; name: string }[] | null;
    findings?: SeededFinding[];
  }): Promise<string> {
    const db = pg.handle.db;
    const pr = await newPr(opts.ws);
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId: opts.ws,
        prId: pr.id,
        status: opts.status,
        ranAt: new Date(Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000),
      })
      .returning();
    if (opts.skills !== undefined) {
      const assembly: Record<string, unknown> = { system: 'Review.', user: '' };
      if (opts.skills !== null) {
        assembly.skill_blocks = opts.skills.map((s) => ({
          id: s.id,
          name: s.name,
          type: 'rubric',
          version: 1,
          tokens: 10,
          text: `### Skill: ${s.name}`,
        }));
      }
      await db.insert(t.runTraces).values({ runId: run!.id, trace: { prompt_assembly: assembly, log: [] } });
    }
    const [review] = await db
      .insert(t.reviews)
      .values({ workspaceId: opts.ws, prId: pr.id, runId: run!.id, kind: 'review', verdict: 'comment', score: 80 })
      .returning();
    for (const [i, f] of (opts.findings ?? []).entries()) {
      await db.insert(t.findings).values({
        reviewId: review!.id,
        file: 'src/a.ts',
        startLine: i + 1,
        endLine: i + 1,
        severity: 'WARNING',
        category: f.category,
        title: `Finding ${i}`,
        rationale: 'Because.',
        confidence: 0.9,
        acceptedAt: f.state === 'accepted' ? new Date() : null,
        dismissedAt: f.state === 'dismissed' ? new Date() : null,
      });
    }
    return run!.id;
  }

  it('counts finished runs of the last 30 days per skill, with rates and categories', async () => {
    const app = await makeApp();
    const create = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/skills',
          payload: { name, description: `Flag ${name}.`, type: 'rubric', body: `# ${name}` },
        })
      ).json() as { id: string; name: string };
    const a = await create('stats-a');
    const b = await create('stats-b');
    const idle = await create('stats-idle');

    const agent = async (name: string, skillIds: string[]) => {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.', repo_intel: false },
      });
      const id = res.json().id as string;
      await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_ids: skillIds } });
      return id;
    };
    const reviewer = await agent('Stats Reviewer', [a.id]);
    await agent('Stats Idle Linker', [a.id, b.id]);

    /** A real run: its trace is written by the run executor, its finding is accepted. */
    const pr = await newPr(workspaceId);
    const started = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: reviewer } });
    const runId = started.json().runs[0].run_id as string;
    const [run] = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(run?.status).toBe('done');
    const [finding] = await pg.handle.db
      .select({ id: t.findings.id })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(eq(t.reviews.runId, runId));
    expect((await app.inject({ method: 'POST', url: `/findings/${finding!.id}/accept` })).statusCode).toBe(200);

    await insertRun({
      ws: workspaceId,
      status: 'done',
      daysAgo: 29,
      skills: [a, b],
      findings: [
        { category: 'bug', state: 'accepted' },
        { category: 'bug', state: 'dismissed' },
        { category: 'style', state: 'open' },
      ],
    });
    /** Counted as runs, but without skills: an older trace, and a run with no trace at all. */
    await insertRun({ ws: workspaceId, status: 'done', daysAgo: 1, skills: null, findings: [{ category: 'perf', state: 'accepted' }] });
    await insertRun({ ws: workspaceId, status: 'done', daysAgo: 2 });
    /** Not counted: failed, cancelled, running, outside the window, another workspace. */
    await insertRun({ ws: workspaceId, status: 'failed', daysAgo: 1, skills: [a], findings: [{ category: 'bug', state: 'accepted' }] });
    await insertRun({ ws: workspaceId, status: 'cancelled', daysAgo: 1, skills: [a] });
    await insertRun({ ws: workspaceId, status: 'running', daysAgo: 0, skills: [a] });
    await insertRun({ ws: workspaceId, status: 'done', daysAgo: 31, skills: [a, b], findings: [{ category: 'bug', state: 'dismissed' }] });
    await insertRun({ ws: otherWorkspaceId, status: 'done', daysAgo: 1, skills: [a], findings: [{ category: 'bug', state: 'dismissed' }] });

    const one = await app.inject({ method: 'GET', url: `/skills/${a.id}/stats` });
    expect(one.statusCode).toBe(200);
    const stats = one.json() as SkillStats;
    expect(stats).toEqual({
      skill_id: a.id,
      used_by: 2,
      runs_30d: 4,
      skill_runs_30d: 2,
      pull_frequency: 0.5,
      accept_rate: 2 / 3,
      findings_30d: 4,
      findings_by_category: [
        { category: 'bug', count: 2 },
        { category: 'security', count: 1 },
        { category: 'style', count: 1 },
      ],
    });
    expect((await app.inject({ method: 'GET', url: `/skills/${b.id}/stats` })).json()).toMatchObject({
      used_by: 1,
      skill_runs_30d: 1,
      pull_frequency: 0.25,
      accept_rate: 0.5,
      findings_30d: 3,
    });
    expect((await app.inject({ method: 'GET', url: `/skills/${idle.id}/stats` })).json()).toEqual({
      skill_id: idle.id,
      used_by: 0,
      runs_30d: 4,
      skill_runs_30d: 0,
      pull_frequency: 0,
      accept_rate: null,
      findings_30d: 0,
      findings_by_category: [],
    });

    const summary = (await app.inject({ method: 'GET', url: '/skills/stats' })).json() as SkillStatsSummary[];
    const byId = new Map(summary.map((s) => [s.skill_id, s]));
    expect(byId.get(a.id)).toEqual({ skill_id: a.id, used_by: 2, pull_frequency: 0.5, accept_rate: 2 / 3 });
    expect(byId.get(b.id)).toEqual({ skill_id: b.id, used_by: 1, pull_frequency: 0.25, accept_rate: 0.5 });
    expect(byId.get(idle.id)).toEqual({ skill_id: idle.id, used_by: 0, pull_frequency: 0, accept_rate: null });
    const workspaceSkills = await pg.handle.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    expect(summary).toHaveLength(workspaceSkills.length);
    await app.close();
  });

  it('stats of an unknown skill or a skill of another workspace are a 404', async () => {
    const app = await makeApp();
    const foreign = await new SkillsRepository(pg.handle.db).insert(
      otherWorkspaceId,
      { name: 'stats-foreign', description: 'Flag.', type: 'rubric', body: '# b', source: 'manual' },
      1,
    );
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}/stats` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/skills/${crypto.randomUUID()}/stats` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid/stats' })).statusCode).toBe(422);
    const summary = (await app.inject({ method: 'GET', url: '/skills/stats' })).json() as SkillStatsSummary[];
    expect(summary.map((s) => s.skill_id)).not.toContain(foreign.id);
    await app.close();
  });

  it('a workspace without runs has null rates for every skill', async () => {
    const db = pg.handle.db;
    const [empty] = await db.insert(t.workspaces).values({ name: 'stats-empty' }).returning();
    const skills = new SkillsRepository(db);
    const lonely = await skills.insert(
      empty!.id,
      { name: 'stats-lonely', description: 'Flag.', type: 'rubric', body: '# b', source: 'manual' },
      1,
    );
    const reviews = new ReviewRepository(db);
    const service = new SkillStatsService({
      stats: skills,
      runs: {
        runUsage: (ws, ids, days) => reviews.skillRunUsage(ws, ids, days),
        findingsByCategory: (ws, id, days) => reviews.skillFindingsByCategory(ws, id, days),
      },
    });
    expect(await service.summary(empty!.id)).toEqual([
      { skill_id: lonely.id, used_by: 0, pull_frequency: null, accept_rate: null },
    ]);
    expect(await service.forSkill(empty!.id, lonely.id)).toMatchObject({
      runs_30d: 0,
      skill_runs_30d: 0,
      findings_30d: 0,
      findings_by_category: [],
    });
  });
});
