import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';
import { FflateZipReader } from '../src/adapters/archive/zip.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsStore, SkillsUnitOfWork } from '../src/modules/skills/ports.js';
import { ValidationError } from '../src/platform/errors.js';

/**
 * The in-memory zip reader of the skill import, on archives built in the test with fflate,
 * plus the import preview end to end over the example package in docs/examples/skills. Hermetic:
 * nothing is written to disk and nothing is executed.
 */

const reader = new FflateZipReader();

/**
 * @param files Entry name → text.
 * @returns A deflate-compressed zip archive.
 */
function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([name, data]) => [name, typeof data === 'string' ? strToU8(data) : data])),
    { level: 9 },
  );
}

describe('FflateZipReader', () => {
  it('lists file entries with their declared size and leaves directories out', () => {
    const archive = zipSync({ 'pkg/': new Uint8Array(), 'pkg/SKILL.md': strToU8('# Skill'), 'pkg/run.sh': strToU8('echo') });
    expect(reader.list(archive, 200)).toEqual([
      { name: 'pkg/SKILL.md', size: 7 },
      { name: 'pkg/run.sh', size: 4 },
    ]);
  });

  it('unpacks only the requested entry', () => {
    const archive = zip({ 'a.md': '# A', 'b.md': '# B' });
    expect(new TextDecoder().decode(reader.read(archive, 'b.md', 1024))).toBe('# B');
  });

  it('stops a zip bomb at the byte cap instead of trusting the declared size', () => {
    const bomb = zip({ 'SKILL.md': new Uint8Array(20 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(() => reader.read(bomb, 'SKILL.md', 256 * 1024)).toThrow(/more than 262144 bytes/);
  });

  it('reports a missing entry and an invalid archive as validation errors', () => {
    expect(() => reader.read(zip({ 'a.md': 'x' }), 'missing.md', 10)).toThrow(/missing from the archive/);
    expect(() => reader.list(strToU8('not a zip'), 200)).toThrow(ValidationError);
  });

  it('stops walking the central directory at the record cap (crafted ZIP64 declaring 2^32 - 1 records)', () => {
    const crafted = zip64Declaring(0xffffffff);
    expect(crafted.length).toBe(98);
    const started = Date.now();
    expect(() => reader.list(crafted, 200)).toThrow(/more than 200 entries/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('counts directory records against the cap too', () => {
    const dirs = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`d${i}/`, new Uint8Array()]));
    expect(() => reader.list(zipSync({ ...dirs, 'SKILL.md': strToU8('# S') }), 3)).toThrow(/more than 3 entries/);
  });
});

/**
 * A 98-byte archive whose ZIP64 end record declares `records` central-directory records at an
 * offset past the end of the buffer (fflate then reads zeros for every record).
 * @param records Declared record count.
 * @returns The archive bytes.
 */
function zip64Declaring(records: number): Uint8Array {
  const b = Buffer.alloc(98);
  b.writeUInt32LE(0x06064b50, 0);
  b.writeBigUInt64LE(44n, 4);
  b.writeUInt16LE(45, 12);
  b.writeUInt16LE(45, 14);
  b.writeBigUInt64LE(BigInt(records), 24);
  b.writeBigUInt64LE(BigInt(records), 32);
  b.writeBigUInt64LE(200n, 48);
  b.writeUInt32LE(0x07064b50, 56);
  b.writeUInt32LE(1, 72);
  b.writeUInt32LE(0x06054b50, 76);
  b.writeUInt16LE(0xffff, 84);
  b.writeUInt16LE(0xffff, 86);
  b.writeUInt32LE(0xffffffff, 88);
  b.writeUInt32LE(0xffffffff, 92);
  return new Uint8Array(b);
}

describe('skill import of the example package', () => {
  const unused = (): never => {
    throw new Error('the preview must not touch the store');
  };
  const store = new Proxy({}, { get: () => unused }) as SkillsStore;
  const uow: SkillsUnitOfWork = { run: unused };
  const service = new SkillsService({
    store,
    uow,
    archive: reader,
    fetcher: { fetch: unused },
    tokens: { count: (text) => Math.ceil(text.length / 4) },
  });

  it('takes SKILL.md as the core and lists the script as executable, not processed', async () => {
    const path = fileURLToPath(new URL('../../docs/examples/skills/flaky-test-patterns.zip', import.meta.url));
    const preview = await service.previewFile('flaky-test-patterns.zip', readFileSync(path).toString('base64'));
    expect(preview).toMatchObject({
      name: 'flaky-test-patterns',
      type: 'custom',
      source: 'imported_file',
      skill_file: 'flaky-test-patterns/SKILL.md',
      ignored_files: expect.arrayContaining([
        { path: 'flaky-test-patterns/scripts/detect-flaky.sh', reason: 'executable' },
        { path: 'flaky-test-patterns/references/patterns.md', reason: 'not_skill_core' },
      ]),
    });
    expect(preview.description).toMatch(/^Flag tests that depend on real time/);
    expect(preview.body).toMatch(/^# Flaky test patterns/);
    expect(preview.tokens).toBeGreaterThan(0);
  });
});
