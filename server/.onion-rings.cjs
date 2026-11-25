/**
 * Onion Architecture rings of server/ and reviewer-core/, as path regexes relative to server/.
 * Single source of truth for .dependency-cruiser.cjs and the onion-architecture skill's
 * convention check (.claude/skills/onion-architecture/scripts/check-conventions.mjs).
 *
 * A file's ring comes from its name and folder, so new code must follow the module layout:
 * domain.ts · constants.ts · ports.ts · service.ts · repository.ts · routes.ts · schemas.ts
 * (or the domain/ application/ infrastructure/ http/ folders once a module grows).
 */

/** Pure center: business rules, value objects, data contracts, literals. */
const DOMAIN = [
  '^src/modules/[^/]+/domain(\\.ts$|/)',
  '^src/modules/[^/]+/constants\\.ts$',
  '^src/vendor/shared/contracts/',
  '^src/modules/pulls/(cost|status|findings)\\.ts$',
  '^src/modules/repo-intel/pipeline/rank\\.ts$',
];

/** Use cases and the ports (interfaces) they need. */
const APPLICATION = [
  '^src/modules/[^/]+/(service|ports)\\.ts$',
  '^src/modules/[^/]+/application/',
  '^src/vendor/shared/adapters\\.ts$',
  '^src/modules/reviews/(run-executor|diff-loader)\\.ts$',
  '^src/modules/repo-intel/pipeline/(full|incremental|walk|repo-map)\\.ts$',
];

/** Driven adapters: persistence and every external system. */
const INFRASTRUCTURE = [
  '^src/modules/[^/]+/repository(\\.ts$|/)',
  '^src/modules/[^/]+/infrastructure/',
  '^src/adapters/',
  '^src/db/',
  '^src/platform/(jobs|sse|resilience|price-book|run-logger)\\.ts$',
];

/** Driving adapters: Fastify routes, request/response schemas, request context. */
const HTTP = [
  '^src/modules/[^/]+/(routes|schemas)\\.ts$',
  '^src/modules/[^/]+/http/',
  '^src/modules/_shared/',
];

/** Route files specifically (subset of HTTP): where handlers are declared. */
const ROUTES = ['^src/modules/[^/]+/routes\\.ts$', '^src/modules/[^/]+/http/.*routes?\\.ts$'];

/** The only place that may wire everything together. */
const COMPOSITION_ROOT = [
  '^src/(app|server)\\.ts$',
  '^src/platform/container\\.ts$',
  '^src/modules/index\\.ts$',
];

/** reviewer-core: the pure review engine (domain + application) … */
const REVIEWER_CORE = ['^\\.\\./reviewer-core/src/'];

/** … and its only infrastructure folder. */
const REVIEWER_CORE_INFRA = ['^\\.\\./reviewer-core/src/llm/'];

/** Test files (server and reviewer-core). */
const TESTS = ['^test/', '^\\.\\./reviewer-core/test/', '\\.test\\.ts$'];

module.exports = {
  DOMAIN,
  APPLICATION,
  INFRASTRUCTURE,
  HTTP,
  ROUTES,
  COMPOSITION_ROOT,
  REVIEWER_CORE,
  REVIEWER_CORE_INFRA,
  TESTS,
};
