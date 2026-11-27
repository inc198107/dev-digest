/**
 * Line diff of two skill bodies for the Versions tab: a longest-common-subsequence diff over
 * lines (no dependency), then unchanged runs collapsed around the changes.
 */

/** What happened to a line between the two texts. */
export type DiffLineKind = "same" | "add" | "del";

/** One line of the diff with its number in the old and the new text (null where absent). */
export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

/** Unchanged lines folded away between two changes. */
export interface DiffSkip {
  kind: "skip";
  count: number;
}

/** A row to render: a line, or a fold of unchanged lines. */
export type DiffRow = DiffLine | DiffSkip;

/**
 * Most cells of the LCS table (about 16 MB). A larger changed middle falls back to "every old
 * line removed, every new line added", which is still a correct diff, only a coarse one.
 */
export const MAX_LCS_CELLS = 4_000_000;

/** Unchanged lines kept around each change by `collapseUnchanged`. */
export const DEFAULT_CONTEXT_LINES = 3;

/**
 * @param text A body (LF or CRLF line ends).
 * @returns Its lines.
 */
function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Diff the changed middle of two line lists (the part between their common prefix and suffix).
 * @param a Old lines.
 * @param b New lines.
 * @param start First index after the common prefix (same in both lists).
 * @param endA End of the middle in `a` (exclusive).
 * @param endB End of the middle in `b` (exclusive).
 * @returns The middle's diff lines, deletions before additions at each change.
 */
function diffMiddle(a: string[], b: string[], start: number, endA: number, endB: number): DiffLine[] {
  const n = endA - start;
  const m = endB - start;
  const out: DiffLine[] = [];
  const del = (i: number) => out.push({ kind: "del", text: a[i]!, oldNo: i + 1, newNo: null });
  const add = (j: number) => out.push({ kind: "add", text: b[j]!, oldNo: null, newNo: j + 1 });

  if (n * m > MAX_LCS_CELLS) {
    for (let i = start; i < endA; i++) del(i);
    for (let j = start; j < endB; j++) add(j);
    return out;
  }

  /** lcs[i * (m + 1) + j] = LCS length of a[start + i ..] and b[start + j ..] within the middle. */
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[start + i] === b[start + j]
          ? lcs[(i + 1) * width + j + 1]! + 1
          : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      out.push({ kind: "same", text: a[start + i]!, oldNo: start + i + 1, newNo: start + j + 1 });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) {
      del(start + i);
      i++;
    } else {
      add(start + j);
      j++;
    }
  }
  for (; i < n; i++) del(start + i);
  for (; j < m; j++) add(start + j);
  return out;
}

/**
 * Line diff of two texts.
 * @param before The older text.
 * @param after The newer text.
 * @returns Every line of both texts in order, marked same, added or removed.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ kind: "same", text: a[i]!, oldNo: i + 1, newNo: i + 1 });
  out.push(...diffMiddle(a, b, start, endA, endB));
  for (let i = endA, j = endB; i < a.length; i++, j++) {
    out.push({ kind: "same", text: a[i]!, oldNo: i + 1, newNo: j + 1 });
  }
  return out;
}

/**
 * @param lines A diff.
 * @returns How many lines it adds and removes.
 */
export function diffCounts(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added++;
    else if (line.kind === "del") removed++;
  }
  return { added, removed };
}

/**
 * Keep `context` unchanged lines around each change and fold longer unchanged runs into one
 * skip row. A diff without changes folds into a single skip.
 * @param lines A diff.
 * @param context Unchanged lines kept before and after each change.
 * @returns The rows to render.
 */
export function collapseUnchanged(lines: DiffLine[], context: number = DEFAULT_CONTEXT_LINES): DiffRow[] {
  const keep = lines.map(() => false);
  lines.forEach((line, index) => {
    if (line.kind === "same") return;
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length - 1, index + context);
    for (let k = from; k <= to; k++) keep[k] = true;
  });

  const rows: DiffRow[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (skipped > 0) rows.push({ kind: "skip", count: skipped });
      skipped = 0;
      rows.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) rows.push({ kind: "skip", count: skipped });
  return rows;
}
