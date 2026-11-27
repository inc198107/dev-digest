import { describe, it, expect } from 'vitest';
import { TiktokenTokenizer, encodeSlices } from '../src/adapters/tokenizer/index.js';

/**
 * The token counter encodes bounded slices: js-tiktoken's BPE merge is quadratic in the length
 * of one pre-token, so untrusted text (an imported skill) must not reach it as one long word.
 */
describe('TiktokenTokenizer slices', () => {
  it('splits text into slices that rebuild it, cutting at whitespace when possible', () => {
    const text = `${'word '.repeat(200)}${'x'.repeat(700)}`;
    const slices = encodeSlices(text);
    expect(slices.join('')).toBe(text);
    for (const s of slices) expect(s.length).toBeLessThanOrEqual(256);
    expect(slices[0]!.endsWith('word')).toBe(true);
  });

  it('counts a 20,000-letter run quickly', () => {
    const tok = new TiktokenTokenizer();
    tok.count('warm up the encoder');
    const started = Date.now();
    expect(tok.count('a'.repeat(20_000))).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('stays close to the exact count for ordinary prose', () => {
    const tok = new TiktokenTokenizer();
    const prose = 'Flag every branch, guard or error path added in the diff that no test exercises. '.repeat(40);
    const count = tok.count(prose);
    expect(count).toBeGreaterThan(600);
    expect(count).toBeLessThan(800);
  });
});
