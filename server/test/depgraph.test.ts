import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DepCruiseGraph } from '../src/adapters/depgraph/index.js';

/**
 * DepCruiseGraph on a real temporary repo: edges come back repo-relative with `/` separators on
 * every OS, ESM `.js` specifiers resolve to `.ts` files, a Next.js `[id]` folder is read as a
 * folder (not a glob class), and only files in the given list produce edges. Before the fix the
 * adapter passed absolute paths to cruise, which on Windows mangled them and returned 0 edges.
 */

const FILES: Record<string, string> = {
  'src/a.ts': "import { b } from './b.js';\nexport const a = b;\n",
  'src/b.ts': 'export const b = 1;\n',
  'src/uses-node.ts': "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n",
  'app/[id]/page.tsx': "import { a } from '../../src/a';\nexport default function Page() { return a; }\n",
  'src/not-indexed.ts': "import { b } from './b.js';\nexport const n = b;\n",
};

describe('DepCruiseGraph.buildEdges', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'depgraph-'));
    for (const [path, content] of Object.entries(FILES)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns repo-relative POSIX edges among the indexed files only', async () => {
    const indexed = ['src/a.ts', 'src/b.ts', 'src/uses-node.ts', 'app/[id]/page.tsx'];
    const edges = await new DepCruiseGraph().buildEdges(root, indexed);

    expect(edges).toEqual(
      expect.arrayContaining([
        { from: 'src/a.ts', to: 'src/b.ts' },
        { from: 'app/[id]/page.tsx', to: 'src/a.ts' },
      ]),
    );
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => !e.from.includes('\\') && !e.to.includes('\\'))).toBe(true);
  });

  it('returns no edges for an empty file list', async () => {
    expect(await new DepCruiseGraph().buildEdges(root, [])).toEqual([]);
  });
});
