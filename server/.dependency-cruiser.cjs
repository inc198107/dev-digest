/**
 * Onion Architecture boundary rules for server/src and reviewer-core.
 *
 * Rings (inner → outer): domain → application → infrastructure | http → composition root.
 * The ring of a file is defined by path in .onion-rings.cjs (shared with the convention check).
 * Source-code dependencies may only point inward. Rationale and the fix for every rule:
 * .claude/skills/onion-architecture/references/enforcement.md
 *
 * Run from server/ (the skill script wraps this):
 *   ./node_modules/.bin/depcruise src ../reviewer-core/src ../reviewer-core/test \
 *     --config .dependency-cruiser.cjs --ignore-known --output-type err-long
 *
 * Existing violations are recorded in .dependency-cruiser-known-violations.json (the baseline)
 * and reported as known debt; only new violations fail the check.
 */

const { DOMAIN, APPLICATION, INFRASTRUCTURE, HTTP, COMPOSITION_ROOT } = require('./.onion-rings.cjs');

/** npm packages that perform I/O or bind code to a framework; the core never imports them. */
const IO_LIBRARIES =
  '(^|/)node_modules/(fastify|fastify-[^/]+|@fastify/[^/]+|drizzle-orm|drizzle-kit|postgres|openai|@anthropic-ai/[^/]+|octokit|@octokit/[^/]+|simple-git|@ast-grep/[^/]+|@vscode/ripgrep|p-queue|js-tiktoken|dependency-cruiser|testcontainers|@testcontainers/[^/]+|dotenv)/';

/** Node core modules that perform I/O. */
const IO_CORE_MODULES = '^(node:)?(fs|fs/promises|child_process|net|http|https|dgram|worker_threads)$';

/** Packages that only the persistence ring may touch. */
const PERSISTENCE_LIBRARIES = '(^|/)node_modules/(drizzle-orm|drizzle-kit|postgres)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-not-to-outer-rings',
      severity: 'error',
      comment:
        'Domain code (pure rules, value objects, contracts) must not import application, infrastructure, ' +
        'HTTP or the composition root. Move the rule so it takes plain values as arguments, or move the ' +
        'importing code outward.',
      from: { path: DOMAIN },
      to: { path: [...APPLICATION, ...INFRASTRUCTURE, ...HTTP, ...COMPOSITION_ROOT] },
    },
    {
      name: 'application-not-to-outer-rings',
      severity: 'error',
      comment:
        'Use cases and ports must not import repositories, adapters, db/, routes or the container. ' +
        'Declare a port (interface) in ports.ts, implement it in infrastructure, and receive the ' +
        'implementation through the service constructor.',
      from: { path: APPLICATION },
      to: { path: [...INFRASTRUCTURE, ...HTTP, ...COMPOSITION_ROOT] },
    },
    {
      name: 'core-no-io-libraries',
      severity: 'error',
      comment:
        'Domain and application code must not import frameworks, drivers, SDKs or I/O core modules ' +
        '(fastify, drizzle-orm, postgres, openai, octokit, simple-git, fs, child_process, ...). ' +
        'Put the call behind a port and implement it in infrastructure. zod is allowed.',
      from: { path: [...DOMAIN, ...APPLICATION] },
      to: { path: [IO_LIBRARIES, IO_CORE_MODULES] },
    },
    {
      name: 'http-not-to-infrastructure',
      severity: 'error',
      comment:
        'Routes stay thin: parse input, call one use case, map the result. They must not import ' +
        'repositories, adapters, db/ or Drizzle. Get the service (or its dependencies) from the ' +
        'container and move queries into a repository.',
      from: { path: HTTP },
      to: { path: [...INFRASTRUCTURE, PERSISTENCE_LIBRARIES] },
    },
    {
      name: 'infrastructure-not-to-http',
      severity: 'error',
      comment:
        'Repositories and adapters must not import routes, request/response schemas or request ' +
        'context. Return contract shapes from @devdigest/shared and let the HTTP ring map them.',
      from: { path: INFRASTRUCTURE },
      to: { path: HTTP },
    },
    {
      name: 'root-only-as-types',
      severity: 'error',
      comment:
        'Nothing imports the composition root (platform/container.ts, app.ts, modules/index.ts) at ' +
        'runtime: it imports everything else. A type-only import (`import type { Container }`) is ' +
        'fine; a value import creates a cycle and a service locator.',
      from: { path: '^src/', pathNot: COMPOSITION_ROOT },
      to: { path: COMPOSITION_ROOT, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'adapters-only-from-composition-root',
      severity: 'error',
      comment:
        'Concrete adapters (src/adapters/**) are constructed only by the composition root ' +
        '(platform/container.ts, app.ts). Everyone else depends on the port interface from ' +
        '@devdigest/shared (vendor/shared/adapters.ts) or a module ports.ts.',
      from: {
        pathNot: ['^src/adapters/', ...COMPOSITION_ROOT],
      },
      to: { path: '^src/adapters/' },
    },
    {
      name: 'adapters-not-to-modules',
      severity: 'error',
      comment:
        'Adapters implement ports; they must not depend on feature modules or seed data. Move the ' +
        'shared constant or type into the port definition (vendor/shared) or pass it in as config.',
      from: { path: '^src/adapters/' },
      to: { path: ['^src/modules/', '^src/db/seed'] },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'A module may use another module only through its public facade (index.ts or types.ts), ' +
        'usually via the container. Do not import another module\'s service, repository, helpers ' +
        'or constants directly.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '^src/modules/[^/]+/(index|types)\\.ts$'],
      },
    },
    {
      name: 'no-test-doubles-in-src',
      severity: 'error',
      comment: 'Production code must not import test doubles (adapters/mocks.ts); inject them from tests.',
      from: { path: '^src/', pathNot: '^src/adapters/mocks\\.ts$' },
      to: { path: '^src/adapters/mocks\\.ts$' },
    },
    {
      name: 'reviewer-core-stays-core',
      severity: 'error',
      comment:
        'reviewer-core is the pure review engine: it may import only @devdigest/shared from the server ' +
        '(src/vendor/shared). Tests use their own fakes of the LLMProvider port, not server adapters.',
      from: { path: '^\\.\\./reviewer-core/(src|test)/' },
      to: { path: '^src/', pathNot: '^src/vendor/shared/' },
    },
    {
      name: 'reviewer-core-no-io',
      severity: 'error',
      comment:
        'reviewer-core has no DB, HTTP framework or filesystem access; everything arrives as arguments ' +
        'and the only side effect is the injected LLMProvider.',
      from: { path: '^\\.\\./reviewer-core/src/' },
      to: { path: [PERSISTENCE_LIBRARIES, '(^|/)node_modules/(fastify|@fastify/[^/]+)/', IO_CORE_MODULES] },
    },
    {
      name: 'reviewer-core-sdk-only-in-llm',
      severity: 'error',
      comment:
        'The openai SDK is an infrastructure detail of reviewer-core: only src/llm/ may import it. ' +
        'Engine code talks to the LLMProvider port.',
      from: { path: '^\\.\\./reviewer-core/src/', pathNot: '^\\.\\./reviewer-core/src/llm/' },
      to: { path: '(^|/)node_modules/openai/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Runtime import cycles break module initialisation order and usually mean a missing port or ' +
        'a rule living in the wrong ring. Type-only cycles are tolerated.',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['type-only'] },
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'An import that cannot be resolved hides real dependencies from these rules; fix the path.',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Do not exclude node_modules: excluded modules vanish as dependency targets, and the
    // core-no-io-libraries / http-not-to-infrastructure rules match on node_modules paths.
    exclude: { path: '(^|/)(dist|clones|migrations)/' },
    moduleSystems: ['es6', 'cjs'],
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
      extensions: ['.ts', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    },
    skipAnalysisNotInRules: true,
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
