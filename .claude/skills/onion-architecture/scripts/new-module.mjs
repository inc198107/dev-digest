#!/usr/bin/env node
/**
 * Scaffold a server module laid out by Onion rings (onion-architecture skill §7).
 *
 *   node .claude/skills/onion-architecture/scripts/new-module.mjs <module-name> [--entity <Name>]
 *   e.g. node …/new-module.mjs labels            → entity "Label"
 *
 * Writes server/src/modules/<name>/{domain,ports,service,repository,schemas,routes}.ts and
 * server/test/<name>-{domain,service}.test.ts. Domain, ports, service and their tests work on
 * their own; persistence is marked `TODO(scaffold)` until the table exists, and routes.ts
 * type-checks once the container getters exist. Nothing is registered: the script prints the
 * wiring steps (contract, table, container, registry).
 * Refuses to overwrite an existing module.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith('--'));
const entityFlag = argv.indexOf('--entity');

if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('usage: new-module.mjs <module-name (kebab-case)> [--entity <PascalName>]');
  process.exit(1);
}

/**
 * kebab-case → PascalCase.
 * @param {string} s Kebab-case text.
 * @returns {string} PascalCase text.
 */
const pascal = (s) => s.replace(/(^|-)([a-z0-9])/g, (_m, _d, c) => c.toUpperCase());
/**
 * PascalCase → camelCase.
 * @param {string} s PascalCase text.
 * @returns {string} camelCase text.
 */
const camel = (s) => s.charAt(0).toLowerCase() + s.slice(1);

const Entity = entityFlag >= 0 ? argv[entityFlag + 1] : pascal(name).replace(/s$/, '');
if (!Entity || !/^[A-Z][A-Za-z0-9]*$/.test(Entity)) {
  console.error('--entity must be PascalCase, e.g. --entity Label');
  process.exit(1);
}
const Module = pascal(name);
const mod = camel(Module);
const entity = camel(Entity);
const dir = join(ROOT, 'server/src/modules', name);
if (existsSync(dir)) {
  console.error(`server/src/modules/${name} already exists; refusing to overwrite.`);
  process.exit(1);
}

const files = {
  [`src/modules/${name}/domain.ts`]: `import { z } from 'zod';

/**
 * ${Module} domain (domain ring): the entity contract, pure rules, no I/O, no clock.
 * TODO(scaffold): once the client reads ${Entity}, move ${Entity} and New${Entity} into
 * @devdigest/shared (both copies: server/src/vendor/shared and client/src/vendor/shared).
 */

export const ${Entity} = z.object({
  id: z.string(),
  name: z.string(),
});
export type ${Entity} = z.infer<typeof ${Entity}>;

export const New${Entity} = z.object({
  name: z.string().min(1),
});
export type New${Entity} = z.infer<typeof New${Entity}>;

/** Longest allowed ${entity} name. */
export const MAX_${Entity.toUpperCase()}_NAME = 64;

/**
 * Normalise a user-entered ${entity} name: trim, collapse inner whitespace, cap the length.
 * @param raw Name as typed by the user.
 * @returns The normalised name, or null when nothing usable remains.
 */
export function normalize${Entity}Name(raw: string): string | null {
  const name = raw.trim().replace(/\\s+/g, ' ').slice(0, MAX_${Entity.toUpperCase()}_NAME);
  return name.length > 0 ? name : null;
}
`,
  [`src/modules/${name}/ports.ts`]: `import type { ${Entity}, New${Entity} } from './domain.js';

/**
 * Ports of the ${name} use cases (application ring), in contract vocabulary.
 * Implemented in ./repository.ts and wired by the composition root.
 */

/** Persistence of ${entity} records. */
export interface ${Entity}Store {
  /**
   * @param workspaceId Tenant scope.
   * @returns Every ${entity} in the workspace.
   */
  list(workspaceId: string): Promise<${Entity}[]>;
  /**
   * @param workspaceId Tenant scope.
   * @param input Validated, normalised input.
   * @returns The stored ${entity}.
   */
  insert(workspaceId: string, input: New${Entity}): Promise<${Entity}>;
}

/** Runs several store operations atomically. */
export interface ${Module}UnitOfWork {
  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What \`work\` returns, after the transaction commits.
   */
  run<T>(work: (store: ${Entity}Store) => Promise<T>): Promise<T>;
}
`,
  [`src/modules/${name}/service.ts`]: `import { ValidationError } from '../../platform/errors.js';
import { normalize${Entity}Name, type ${Entity}, type New${Entity} } from './domain.js';
import type { ${Module}UnitOfWork, ${Entity}Store } from './ports.js';

/** What the ${name} use cases need, injected by the routes plugin. */
export interface ${Module}ServiceDeps {
  store: ${Entity}Store;
  uow: ${Module}UnitOfWork;
}

/** ${Module} use cases (application ring): load → decide (domain) → persist. */
export class ${Module}Service {
  /**
   * @param deps Ports this service depends on.
   */
  constructor(private readonly deps: ${Module}ServiceDeps) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns Every ${entity} in the workspace.
   */
  list(workspaceId: string): Promise<${Entity}[]> {
    return this.deps.store.list(workspaceId);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param input Parsed request body.
   * @returns The created ${entity}.
   */
  async create(workspaceId: string, input: New${Entity}): Promise<${Entity}> {
    const name = normalize${Entity}Name(input.name);
    if (!name) throw new ValidationError('${Entity} name must not be empty');
    return this.deps.uow.run((store) => store.insert(workspaceId, { ...input, name }));
  }
}
`,
  [`src/modules/${name}/schemas.ts`]: `import { z } from 'zod';
import { ${Entity} } from './domain.js';

/** Route-only Zod schemas of the ${name} module (http ring): params and response wrappers. */

export const ${Entity}List = z.array(${Entity});
`,
  [`src/modules/${name}/repository.ts`]: `import type { Db, DbExecutor } from '../../db/client.js';
import type { ${Entity}, New${Entity} } from './domain.js';
import type { ${Module}UnitOfWork, ${Entity}Store } from './ports.js';

/**
 * ${Module} persistence (infrastructure ring): Drizzle only here; rows are mapped to
 * contract shapes before they leave this file. Every query is scoped by workspaceId.
 */
export class ${Module}Repository implements ${Entity}Store {
  /**
   * @param db The shared client, or a transaction when built by the unit of work.
   */
  constructor(private readonly db: DbExecutor) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns Every ${entity} in the workspace.
   */
  async list(workspaceId: string): Promise<${Entity}[]> {
    // TODO(scaffold): add the table in src/db/schema/, run \`pnpm db:generate\`, then:
    // const rows = await this.db.select().from(t.${mod}).where(eq(t.${mod}.workspaceId, workspaceId));
    // return rows.map(to${Entity});
    void this.db;
    void workspaceId;
    throw new Error('TODO(scaffold): ${Module}Repository.list is not implemented');
  }

  /**
   * @param workspaceId Tenant scope.
   * @param input Validated, normalised input.
   * @returns The stored ${entity}.
   */
  async insert(workspaceId: string, input: New${Entity}): Promise<${Entity}> {
    // TODO(scaffold): insert into the table and map the returned row.
    void workspaceId;
    void input;
    throw new Error('TODO(scaffold): ${Module}Repository.insert is not implemented');
  }
}

/** Unit of work over Drizzle: one transaction, a store bound to it. */
export class Drizzle${Module}UnitOfWork implements ${Module}UnitOfWork {
  /**
   * @param db The shared client that opens transactions.
   */
  constructor(private readonly db: Db) {}

  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What \`work\` returns, after the transaction commits.
   */
  run<T>(work: (store: ${Entity}Store) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new ${Module}Repository(tx)));
  }
}
`,
  [`src/modules/${name}/routes.ts`]: `import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { ${Entity}, New${Entity} } from './domain.js';
import { ${Entity}List } from './schemas.js';
import { ${Module}Service } from './service.js';

/**
 * ${Module} routes (http ring): parse → one use-case call → typed response.
 *   GET  /${name}  → list (workspace-scoped)
 *   POST /${name}  → create
 *
 * @param appBase Encapsulated Fastify instance for this module.
 * @returns Resolves when the routes are registered.
 */
export default async function ${mod}Routes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ${Module}Service({
    store: container.${mod}Repo,
    uow: container.${mod}Uow,
  });

  app.get('/${name}', { schema: { response: { 200: ${Entity}List } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post(
    '/${name}',
    { schema: { body: New${Entity}, response: { 201: ${Entity} } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await service.create(workspaceId, req.body);
      reply.code(201);
      return created;
    },
  );
}
`,
  [`test/${name}-domain.test.ts`]: `import { describe, it, expect } from 'vitest';
import { MAX_${Entity.toUpperCase()}_NAME, normalize${Entity}Name } from '../src/modules/${name}/domain.js';

/** Pure ${name} rules: plain values in and out, no database. */
describe('normalize${Entity}Name', () => {
  it('trims and collapses whitespace', () => {
    expect(normalize${Entity}Name('  a   b ')).toBe('a b');
  });

  it('returns null when nothing usable remains', () => {
    expect(normalize${Entity}Name('   ')).toBeNull();
  });

  it('caps the length', () => {
    expect(normalize${Entity}Name('x'.repeat(200))).toHaveLength(MAX_${Entity.toUpperCase()}_NAME);
  });
});
`,
  [`test/${name}-service.test.ts`]: `import { describe, it, expect } from 'vitest';
import { ${Module}Service } from '../src/modules/${name}/service.js';
import type { ${Module}UnitOfWork, ${Entity}Store } from '../src/modules/${name}/ports.js';
import type { ${Entity}, New${Entity} } from '../src/modules/${name}/domain.js';

/** ${Module} use cases against in-memory fakes of their own ports (no DB, no Container). */
class Fake${Entity}Store implements ${Entity}Store {
  rows: (${Entity} & { workspaceId: string })[] = [];

  async list(workspaceId: string): Promise<${Entity}[]> {
    return this.rows.filter((r) => r.workspaceId === workspaceId).map(({ id, name }) => ({ id, name }));
  }

  async insert(workspaceId: string, input: New${Entity}): Promise<${Entity}> {
    const row = { id: \`${entity}-\${this.rows.length + 1}\`, name: input.name, workspaceId };
    this.rows.push(row);
    return { id: row.id, name: row.name };
  }
}

/**
 * A unit of work that runs the callback on the same fake store.
 * @param store Fake store.
 * @returns The fake unit of work.
 */
const fakeUow = (store: ${Entity}Store): ${Module}UnitOfWork => ({ run: (work) => work(store) });

describe('${Module}Service', () => {
  it('creates with a normalised name and lists per workspace', async () => {
    const store = new Fake${Entity}Store();
    const service = new ${Module}Service({ store, uow: fakeUow(store) });
    await service.create('ws-1', { name: '  first  one ' });
    await service.create('ws-2', { name: 'other' });
    expect(await service.list('ws-1')).toEqual([{ id: '${entity}-1', name: 'first one' }]);
  });

  it('rejects an empty name', async () => {
    const store = new Fake${Entity}Store();
    const service = new ${Module}Service({ store, uow: fakeUow(store) });
    await expect(service.create('ws-1', { name: '   ' })).rejects.toThrow(/must not be empty/);
  });
});
`,
};

for (const [rel, content] of Object.entries(files)) {
  const abs = join(ROOT, 'server', rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  console.log(`created server/${rel}`);
}

console.log(`
Next steps (the module is NOT registered yet):
  1. Contract: when the client reads ${Entity}, move it from domain.ts into @devdigest/shared
     (server/src/vendor/shared AND client/src/vendor/shared).
  2. Table: add src/db/schema/${name}.ts (+ export it from src/db/schema.ts), run \`pnpm db:generate\`,
     then replace the TODO(scaffold) bodies in repository.ts with Drizzle queries + row mapping.
  3. Composition root, src/platform/container.ts:
       import { ${Module}Repository, Drizzle${Module}UnitOfWork } from '../modules/${name}/repository.js';
       get ${mod}Repo(): ${Module}Repository { return (this._${mod}Repo ??= new ${Module}Repository(this.db)); }
       get ${mod}Uow(): Drizzle${Module}UnitOfWork { return (this._${mod}Uow ??= new Drizzle${Module}UnitOfWork(this.db)); }
  4. Registry, src/modules/index.ts: add the ${mod}Routes plugin.
  5. Keep the unit of work only if an operation writes more than once; for single-statement
     writes delete ${Module}UnitOfWork and call the store directly (SKILL.md §9).
  6. Add a *.it.test.ts for the repository and routes (test/helpers/pg.ts), then run:
       bash .claude/skills/onion-architecture/scripts/check-boundaries.sh
  Typecheck fails until step 3 adds container.${mod}Repo / container.${mod}Uow.
`);
console.log(`(generated under ${relative(process.cwd(), dir) || dir})`);
