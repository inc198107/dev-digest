import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildLanes, selectChecks } from '../scripts/lib/routing.mjs';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/** @type {import('../scripts/lib/routing.mjs').Routing} */
const routing = JSON.parse(readFileSync(join(SKILL_DIR, 'routing.json'), 'utf8'));

const UI_SKILLS = ['frontend-ui-architecture', 'react-best-practices', 'next-best-practices', 'react-testing-library'];
const BACKEND_SKILLS = ['onion-architecture', 'fastify-best-practices', 'drizzle-orm-patterns', 'postgresql-table-design'];

/**
 * Skill list as discovered on disk: every routed skill exists.
 * @param {string[]} [extra] Additional skill folders.
 * @returns {import('../scripts/lib/skills.mjs').SkillInfo[]} Skills.
 */
function skills(extra = []) {
  const names = [...routing.lanes.filter((l) => !l.builtin).map((l) => l.skill), ...routing.ignore, ...extra];
  return names.map((name) => ({ name, dir: name, description: `${name} skill`, paths: [] }));
}

/**
 * Build a plan file entry.
 * @param {string} path Path.
 * @param {string} [status] Status letter.
 * @returns {import('../scripts/lib/routing.mjs').PlanFile} Entry.
 */
function file(path, status = 'M') {
  return { path, status, blob: status === 'D' ? 'deleted' : 'abc', binary: false };
}

/**
 * Skills of the lanes that review a path.
 * @param {ReturnType<typeof buildLanes>['lanes']} lanes Lanes.
 * @param {string} path Path.
 * @returns {string[]} Sorted skill names.
 */
function skillsFor(lanes, path) {
  return lanes.filter((l) => l.files.some((f) => f.path === path)).map((l) => l.skill).sort();
}

const FILES = [
  file('client/src/app/repos/page.tsx'),
  file('client/src/components/Badge/Badge.test.tsx'),
  file('client/src/lib/hooks/useRuns.ts'),
  file('client/src/vendor/shared/contracts/knowledge.ts'),
  file('server/src/modules/agents/routes.ts'),
  file('server/src/modules/agents/repository.ts'),
  file('server/src/modules/agents/schemas.ts'),
  file('server/src/db/schema/agents.ts'),
  file('server/src/db/migrations/0003_minor_overlord.sql'),
  file('reviewer-core/src/run.ts'),
  file('docs/notes.md'),
  file('server/src/modules/agents/helpers.ts', 'D'),
];

test('UI skills review only client files, backend skills only server and reviewer-core files', () => {
  const { lanes } = buildLanes(FILES, routing, skills());
  for (const lane of lanes) {
    const paths = lane.files.map((f) => f.path);
    if (UI_SKILLS.includes(lane.skill)) assert.ok(paths.every((p) => p.startsWith('client/')), `${lane.skill}: ${paths}`);
    if (BACKEND_SKILLS.includes(lane.skill)) {
      assert.ok(paths.every((p) => p.startsWith('server/') || p.startsWith('reviewer-core/')), `${lane.skill}: ${paths}`);
    }
  }
});

test('each file gets the lanes that own it', () => {
  const { lanes } = buildLanes(FILES, routing, skills());
  assert.deepEqual(skillsFor(lanes, 'client/src/app/repos/page.tsx'), ['frontend-ui-architecture', 'next-best-practices', 'project-rules', 'react-best-practices', 'security']);
  assert.deepEqual(skillsFor(lanes, 'client/src/components/Badge/Badge.test.tsx'), ['frontend-ui-architecture', 'project-rules', 'react-testing-library', 'security']);
  assert.deepEqual(skillsFor(lanes, 'client/src/vendor/shared/contracts/knowledge.ts'), ['project-rules', 'security', 'zod']);
  assert.deepEqual(skillsFor(lanes, 'server/src/modules/agents/routes.ts'), ['fastify-best-practices', 'onion-architecture', 'project-rules', 'security']);
  assert.deepEqual(skillsFor(lanes, 'server/src/modules/agents/repository.ts'), ['drizzle-orm-patterns', 'onion-architecture', 'project-rules', 'security']);
  assert.deepEqual(skillsFor(lanes, 'server/src/db/schema/agents.ts'), ['drizzle-orm-patterns', 'onion-architecture', 'postgresql-table-design', 'project-rules', 'security']);
  assert.deepEqual(skillsFor(lanes, 'server/src/db/migrations/0003_minor_overlord.sql'), ['postgresql-table-design', 'project-rules']);
  assert.deepEqual(skillsFor(lanes, 'docs/notes.md'), ['project-rules']);
  assert.deepEqual(skillsFor(lanes, 'server/src/modules/agents/helpers.ts'), ['project-rules']);
});

test('reports skills without routing and routed skills that are missing', () => {
  const present = skills(['brand-new-skill']).filter((s) => s.name !== 'zod');
  const res = buildLanes(FILES, routing, present);
  assert.deepEqual(res.unroutedSkills.map((s) => s.name), ['brand-new-skill']);
  assert.deepEqual(res.missingSkills, ['zod']);
  assert.ok(!res.lanes.some((l) => l.skill === 'zod'));
});

test('a skill with paths frontmatter but no routing entry gets its own lane', () => {
  const present = [...skills(), { name: 'css-guide', dir: 'css-guide', description: '', paths: ['client/src/**/*.tsx'] }];
  const { lanes, unroutedSkills } = buildLanes(FILES, routing, present);
  assert.deepEqual(unroutedSkills, []);
  const lane = lanes.find((l) => l.skill === 'css-guide');
  assert.equal(lane?.source, 'paths');
  assert.deepEqual(lane?.files.map((f) => f.path), ['client/src/app/repos/page.tsx', 'client/src/components/Badge/Badge.test.tsx']);
});

test('lanes are chunked by size', () => {
  const many = Array.from({ length: 30 }, (_, i) => file(`server/src/modules/m${i}/service.ts`));
  const { lanes } = buildLanes(many, { ...routing, defaultChunk: 25 }, skills());
  assert.deepEqual(lanes.filter((l) => l.skill === 'onion-architecture').map((l) => [l.id, l.files.length]), [
    ['onion-architecture#1', 25],
    ['onion-architecture#2', 5],
  ]);
});

test('checks follow the touched packages', () => {
  const ids = (/** @type {string[]} */ paths) => selectChecks(paths.map((p) => file(p)), routing.checks).map((c) => c.id);
  assert.deepEqual(ids(['client/src/app/page.tsx']), ['client-typecheck', 'client-unit-tests']);
  assert.deepEqual(ids(['reviewer-core/src/run.ts']), ['onion-boundaries', 'server-typecheck', 'server-unit-tests', 'reviewer-core-typecheck', 'reviewer-core-unit-tests']);
  assert.deepEqual(ids(['docs/notes.md', 'server/CLAUDE.md']), []);
  assert.ok(ids(['client/src/vendor/shared/contracts/x.ts']).includes('onion-boundaries'));
});
