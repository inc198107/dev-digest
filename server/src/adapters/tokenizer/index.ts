/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process, used by modules/repo-intel (repo-map budget) and modules/skills
 * (token count of each skill block in the prompt and the import preview). Swappable in
 * tests via a mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Longest slice handed to the encoder at once. js-tiktoken's BPE merge is quadratic in the length
 * of one pre-token, so a long run without whitespace (e.g. 20,000 identical letters in an
 * imported skill) blocks the event loop for seconds; bounded slices keep every call linear.
 */
const MAX_ENCODE_SLICE = 256;

/**
 * Split text into slices of at most MAX_ENCODE_SLICE characters, cutting at the last whitespace
 * of a slice when there is one, so ordinary words stay whole and counts stay close to exact.
 * @param text Any text.
 * @returns The slices, in order; their concatenation is `text`.
 */
export function encodeSlices(text: string): string[] {
  const slices: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_ENCODE_SLICE, text.length);
    if (end < text.length) {
      for (let i = end; i > start + MAX_ENCODE_SLICE / 2; i--) {
        if (/\s/.test(text[i] ?? '')) {
          end = i;
          break;
        }
      }
    }
    slices.push(text.slice(start, end));
    start = end;
  }
  return slices;
}

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  /**
   * @param text Any text, trusted or not.
   * @returns Its cl100k_base token count (sum over bounded slices), or the heuristic when the
   *   encoder cannot load.
   */
  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      const enc = this.enc;
      return encodeSlices(text).reduce((sum, slice) => sum + enc.encode(slice).length, 0);
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }
}
