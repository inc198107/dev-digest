#!/usr/bin/env node
/**
 * Onion Architecture convention check (ast-grep) for server/ and reviewer-core/.
 *
 * dependency-cruiser sees only imports; this script checks what imports can't show:
 *   route-declares-response   every Fastify route declares a `response` schema
 *   route-throws-errors       routes throw AppError subclasses instead of reply.code(4xx/5xx)
 *   core-no-ambient-io        no process.env / Date.now() / new Date() / Math.random() /
 *                             randomUUID() in domain or application code (inject them)
 *   service-takes-narrow-deps use-case constructors don't take the whole Container
 *   tests-fake-own-ports      tests don't vi.mock() libraries we don't own (drizzle, openai…)
 *
 * Rings come from server/.onion-rings.cjs. Existing violations live in
 * server/.onion-conventions-known.json and are ignored; only new ones fail.
 * Suppress one line deliberately with a comment on the line above:
 *   // onion-allow route-declares-response: SSE stream has no JSON body
 *
 * Usage: node check-conventions.mjs [--no-ignore-known] [--update-baseline]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SERVER = join(ROOT, 'server');
const BASELINE = join(SERVER, '.onion-conventions-known.json');
const requireFromServer = createRequire(join(SERVER, 'package.json'));
const { parse, Lang } = requireFromServer('@ast-grep/napi');
const rings = requireFromServer('./.onion-rings.cjs');

const args = new Set(process.argv.slice(2));
const ignoreKnown = !args.has('--no-ignore-known');
const updateBaseline = args.has('--update-baseline');

/**
 * Compile a list of path regexes into one predicate.
 * @param {string[]} patterns Regex sources relative to server/.
 * @returns {(rel: string) => boolean} True when a path matches any pattern.
 */
const matcher = (patterns) => {
  const res = patterns.map((p) => new RegExp(p));
  return (rel) => res.some((re) => re.test(rel));
};

const isRoute = matcher(rings.ROUTES);
const isCore = (() => {
  const inner = matcher([...rings.DOMAIN, ...rings.APPLICATION, ...rings.REVIEWER_CORE]);
  const coreInfra = matcher(rings.REVIEWER_CORE_INFRA);
  return (rel) => inner(rel) && !coreInfra(rel);
})();
const isApplication = matcher(rings.APPLICATION);
const isTest = matcher(rings.TESTS);

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const FASTIFY_INSTANCE = /^(app|appBase|fastify|instance|server|scoped)$/;
const FOREIGN_LIBS =
  /^['"`](drizzle-orm(\/.*)?|postgres|openai(\/.*)?|@anthropic-ai\/sdk|octokit|@octokit\/.*|simple-git|fastify|@ast-grep\/napi)['"`]$/;

/**
 * @typedef {{ line: number, text: string }} Hit
 * @typedef {{ id: string, message: string, applies: (rel: string) => boolean,
 *             find: (root: import('@ast-grep/napi').SgNode) => Hit[] }} Rule
 */

/**
 * Turn an ast-grep node into a reportable hit.
 * @param {import('@ast-grep/napi').SgNode} node Matched node.
 * @returns {Hit} 1-based line and whitespace-normalised source text.
 */
const hit = (node) => ({
  line: node.range().start.line + 1,
  text: node.text().replace(/\s+/g, ' ').slice(0, 160),
});

/** @type {Rule[]} */
const RULES = [
  {
    id: 'route-declares-response',
    message:
      'Declare `schema.response` for every route: it serializes faster and drops fields that are not ' +
      'in the contract, so rows and internal fields cannot leak. Use the shared Zod contract.',
    applies: isRoute,
    find: (root) =>
      root
        .findAll('$APP.$METHOD($$$ARGS)')
        .filter((n) => {
          const method = n.getMatch('METHOD')?.text() ?? '';
          const app = n.getMatch('APP')?.text() ?? '';
          if (!HTTP_METHODS.has(method) || !FASTIFY_INSTANCE.test(app)) return false;
          const argNodes = n.getMultipleMatches('ARGS').filter((a) => a.isNamed());
          const first = argNodes[0];
          if (!first || !['string', 'template_string'].includes(first.kind())) return false;
          const opts = argNodes.find((a) => a.kind() === 'object');
          return !opts || !/\bresponse\s*:/.test(opts.text());
        })
        .map((n) => ({ ...hit(n), text: n.text().split('\n')[0].trim().slice(0, 160) })),
  },
  {
    id: 'route-throws-errors',
    message:
      'Throw an AppError subclass (NotFoundError, ValidationError, …) and let the central error handler ' +
      'build the envelope; reply.code() in a route is only for success statuses (201, 202, 204).',
    applies: isRoute,
    find: (root) =>
      [...root.findAll('$R.code($N)'), ...root.findAll('$R.status($N)')]
        .filter((n) => {
          const status = n.getMatch('N');
          return status?.kind() === 'number' && Number(status.text()) >= 400;
        })
        .map(hit),
  },
  {
    id: 'core-no-ambient-io',
    message:
      'Domain and application code must be deterministic: inject the clock (`now: () => Date`), id ' +
      'generation and configuration through the constructor deps, or pass them as arguments. ' +
      'Secrets come only from the SecretsProvider port.',
    applies: isCore,
    find: (root) =>
      [
        ...root.findAll('process.env'),
        ...root.findAll('Date.now()'),
        ...root.findAll('new Date()'),
        ...root.findAll('Math.random()'),
        ...root.findAll('randomUUID()'),
        ...root.findAll('$C.randomUUID()'),
      ].map(hit),
  },
  {
    id: 'service-takes-narrow-deps',
    message:
      'A use case receives the 2–4 ports it needs through a `deps` object, not the whole Container ' +
      '(service locator). The routes plugin builds it from container getters.',
    applies: isApplication,
    find: (root) =>
      root
        .findAll({
          rule: {
            kind: 'required_parameter',
            has: { kind: 'type_annotation', regex: '\\bContainer\\b', stopBy: 'end' },
            inside: { kind: 'method_definition', regex: '^constructor', stopBy: 'end' },
          },
        })
        .map(hit),
  },
  {
    id: 'tests-fake-own-ports',
    message:
      "Don't mock what you don't own: replace vi.mock of a library with a hand-written fake of your own " +
      'port (in-memory store, fake unit of work), or test the adapter against the real thing (*.it.test.ts).',
    applies: isTest,
    find: (root) =>
      root
        .findAll('vi.mock($LIB $$$REST)')
        .filter((n) => FOREIGN_LIBS.test(n.getMatch('LIB')?.text() ?? ''))
        .map(hit),
  },
];

/**
 * Recursively list TypeScript files under a directory.
 * @param {string} dir Absolute directory.
 * @returns {string[]} Absolute file paths.
 */
function listTs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'migrations' || name === 'clones' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * True when the line above a hit carries `onion-allow <rule>`.
 * @param {string[]} lines Source lines.
 * @param {number} line 1-based line of the hit.
 * @param {string} ruleId Rule id.
 * @returns {boolean} Whether the hit is deliberately allowed.
 */
const isAllowed = (lines, line, ruleId) =>
  new RegExp(`onion-allow:?\\s+${ruleId}\\b`).test(lines[line - 2] ?? '');

const files = [
  ...listTs(join(SERVER, 'src')),
  ...listTs(join(SERVER, 'test')),
  ...listTs(join(ROOT, 'reviewer-core', 'src')),
  ...listTs(join(ROOT, 'reviewer-core', 'test')),
];

/** @type {{ rule: string, file: string, line: number, text: string, message: string }[]} */
const violations = [];
for (const abs of files) {
  const rel = relative(SERVER, abs).split(sep).join('/');
  const rules = RULES.filter((r) => r.applies(rel));
  if (rules.length === 0) continue;
  const source = readFileSync(abs, 'utf8');
  const lines = source.split(/\r?\n/);
  const root = parse(abs.endsWith('.tsx') ? Lang.Tsx : Lang.TypeScript, source).root();
  for (const rule of rules) {
    for (const h of rule.find(root)) {
      if (isAllowed(lines, h.line, rule.id)) continue;
      violations.push({ rule: rule.id, file: rel, line: h.line, text: h.text, message: rule.message });
    }
  }
}

/**
 * Baseline key: rule + file + text (line numbers drift, text rarely does).
 * @param {{ rule: string, file: string, text: string }} v Violation.
 * @returns {string} Stable key.
 */
const keyOf = (v) => `${v.rule}|${v.file}|${v.text}`;

if (updateBaseline) {
  const known = violations.map(({ rule, file, text }) => ({ rule, file, text }));
  writeFileSync(BASELINE, `${JSON.stringify(known, null, 2)}\n`);
  console.log(`baseline written: ${known.length} known convention violations → ${relative(ROOT, BASELINE)}`);
  process.exit(0);
}

const budget = new Map();
if (ignoreKnown && existsSync(BASELINE)) {
  for (const v of JSON.parse(readFileSync(BASELINE, 'utf8'))) budget.set(keyOf(v), (budget.get(keyOf(v)) ?? 0) + 1);
}
let ignored = 0;
const fresh = violations.filter((v) => {
  const left = budget.get(keyOf(v)) ?? 0;
  if (left > 0) {
    budget.set(keyOf(v), left - 1);
    ignored += 1;
    return false;
  }
  return true;
});

for (const v of fresh) {
  console.log(`  error ${v.rule}: ${v.file}:${v.line}\n    ${v.text}\n    ${v.message}\n`);
}
const resolved = [...budget.values()].reduce((a, b) => a + b, 0);
const summary = fresh.length === 0 ? '✔ no convention violations found' : `✘ ${fresh.length} convention violation(s)`;
console.log(`${summary} (${files.length} files checked)`);
if (ignored > 0) console.log(`‼ ${ignored} known violations ignored. Run with --no-ignore-known to see them.`);
if (resolved > 0) {
  console.log(`ℹ ${resolved} known violation(s) no longer occur: refresh the baseline with --update-baseline.`);
}
process.exit(fresh.length === 0 ? 0 : 1);
