import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DepCruiseGraph, isGlobPath } from '../src/adapters/depgraph/index.js';

/**
 * DepCruiseGraph on a real temporary repo: edges come back repo-relative with `/` separators on
 * every OS, ESM `.js` specifiers resolve to `.ts` files, and only files in the given list produce
 * edges. A path that is a glob as written (`app/[id]/page.tsx`) is never handed to cruise, so its
 * outgoing edges are skipped while edges into it remain; cruise never walks a symlinked folder, a
 * symlink loop (also one under a glob's prefix) or a folder walkClone skips. Before the fix the
 * adapter passed absolute paths to cruise, which on Windows mangled them and returned 0 edges.
 */

const FILES: Record<string, string> = {
  'src/a.ts': "import { b } from './b.js';\nexport const a = b;\n",
  'src/b.ts': 'export const b = 1;\n',
  'src/uses-node.ts': "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n",
  'src/uses-page.ts': "import Page from '../app/[id]/page';\nexport const p = Page;\n",
  'app/[id]/page.tsx': "import { a } from '../../src/a';\nexport default function Page() { return a; }\n",
  'src/not-indexed.ts': "import { b } from './b.js';\nexport const n = b;\n",
  'src/uses-dist.ts': "import { d } from '../dist/bundle.js';\nexport const u = d;\n",
  'dist/bundle.js': "import { b } from '../src/b.js';\nexport const d = b;\n",
  'src/amd.js': "define(['./b'], function (b) { return b; });\n",
};

/** A file outside the repo, reachable only through a symlinked folder inside it. */
const OUTSIDE_FILE = 'secret.ts';

describe('DepCruiseGraph.buildEdges', () => {
  let base: string;
  let root: string;
  const graph = new DepCruiseGraph({ excludedDirs: ['dist'] });

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'depgraph-'));
    root = join(base, 'repo');
    for (const [path, content] of Object.entries(FILES)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    await mkdir(join(base, 'outside'), { recursive: true });
    await writeFile(join(base, 'outside', OUTSIDE_FILE), "import { b } from '../repo/src/b.js';\nexport const s = b;\n");
    /** A junction needs no privileges on Windows; elsewhere it is a plain directory symlink. */
    await symlink(join(base, 'outside'), join(root, 'linked'), 'junction');
    /** Links back to the repo root: a walker that follows links never ends (ELOOP, path too long). */
    await symlink(root, join(root, 'src', 'loop'), 'junction');
    await symlink(root, join(root, 'app', 'loop'), 'junction');
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('returns repo-relative POSIX edges among the indexed files only', async () => {
    const indexed = ['src/a.ts', 'src/b.ts', 'src/uses-node.ts', 'src/uses-page.ts', 'app/[id]/page.tsx'];
    const edges = await graph.buildEdges(root, indexed);

    /** page.tsx is not a cruise argument, but the import from uses-page.ts reaches it by resolution. */
    expect(edges).toEqual(
      expect.arrayContaining([
        { from: 'src/a.ts', to: 'src/b.ts' },
        { from: 'src/uses-page.ts', to: 'app/[id]/page.tsx' },
        { from: 'app/[id]/page.tsx', to: 'src/a.ts' },
      ]),
    );
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => !e.from.includes('\\') && !e.to.includes('\\'))).toBe(true);
  });

  it('skips the outgoing edges of a glob-named file no indexed file imports', async () => {
    const edges = await graph.buildEdges(root, ['src/a.ts', 'app/[id]/page.tsx']);
    expect(edges).toEqual([]);
  });

  it('ignores AMD define() dependencies (their names resolve without realpath)', async () => {
    const edges = await graph.buildEdges(root, ['src/amd.js', 'src/b.ts']);
    expect(edges).toEqual([]);
  });

  it('stays out of symlinked folders and folders walkClone skips', async () => {
    const edges = await graph.buildEdges(root, ['src/a.ts', 'src/b.ts', 'src/uses-dist.ts']);
    expect(edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }]);
  });

  it('returns no edges for an empty file list', async () => {
    expect(await graph.buildEdges(root, [])).toEqual([]);
  });
});

describe('isGlobPath', () => {
  it('flags paths cruise would expand as globs and keeps plain ones', () => {
    for (const path of ['app/[id]/page.tsx', 'app/(group)/page.tsx', 'src/{a,b}.ts', 'src/a*.ts', 'src/a?.ts', '!x.ts']) {
      expect(isGlobPath(path)).toBe(true);
    }
    for (const path of ['packages/@scope/a.ts', 'src/a+b.ts', 'src/x!.ts', 'plain/file.ts']) {
      expect(isGlobPath(path)).toBe(false);
    }
  });
});
