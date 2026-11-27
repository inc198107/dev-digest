import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_READ_FILE_BYTES, SimpleGitClient } from '../src/adapters/git/simple-git.js';

/**
 * SimpleGitClient.readFile treats the clone as untrusted: it returns regular files inside the
 * clone and refuses links that lead out of it, `..` paths, folders and oversized files. The
 * conventions scan reads root config files (tsconfig.json, .eslintrc…) by fixed names, so a repo
 * could otherwise commit `tsconfig.json` as a link to a secrets file and have it sent to a model.
 */

const REPO = { owner: 'acme', name: 'repo' };

describe('SimpleGitClient.readFile', () => {
  let base: string;
  let git: SimpleGitClient;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'git-read-'));
    const clone = join(base, 'clones', 'acme', 'repo');
    await mkdir(join(clone, 'src'), { recursive: true });
    await writeFile(join(clone, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(clone, 'big.ts'), 'x'.repeat(MAX_READ_FILE_BYTES + 1));
    await mkdir(join(base, 'outside'), { recursive: true });
    await writeFile(join(base, 'outside', 'secrets.json'), '{"token":"t"}');
    /** A junction needs no privileges on Windows; elsewhere it is a plain directory symlink. */
    await symlink(join(base, 'outside'), join(clone, 'linked'), 'junction');
    git = new SimpleGitClient(join(base, 'clones'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('reads a regular file inside the clone', async () => {
    expect(await git.readFile(REPO, 'src/a.ts')).toBe('export const a = 1;\n');
  });

  it('refuses a file reached through a symlinked folder', async () => {
    await expect(git.readFile(REPO, 'linked/secrets.json')).rejects.toThrow(/outside the clone/);
  });

  it('refuses a path that climbs out of the clone', async () => {
    await expect(git.readFile(REPO, '../../../outside/secrets.json')).rejects.toThrow(/outside the clone/);
  });

  it('refuses folders, missing files and files over the size cap', async () => {
    await expect(git.readFile(REPO, 'src')).rejects.toThrow(/Not a regular file/);
    await expect(git.readFile(REPO, 'missing.ts')).rejects.toThrow();
    await expect(git.readFile(REPO, 'big.ts')).rejects.toThrow(/too large/);
  });
});
