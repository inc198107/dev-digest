import { describe, it, expect } from "vitest";
import { collapseUnchanged, diffCounts, lineDiff, MAX_LCS_CELLS, type DiffLine } from "./line-diff";

/**
 * @param lines A diff.
 * @returns The diff as compact strings (" a", "+b", "-c").
 */
function compact(lines: DiffLine[]): string[] {
  return lines.map((l) => (l.kind === "same" ? " " : l.kind === "add" ? "+" : "-") + l.text);
}

describe("lineDiff", () => {
  it("marks every line of identical texts as unchanged", () => {
    const diff = lineDiff("# Rule\n\n- one", "# Rule\n\n- one");
    expect(compact(diff)).toEqual([" # Rule", " ", " - one"]);
    expect(diffCounts(diff)).toEqual({ added: 0, removed: 0 });
  });

  it("finds an added line in the middle and numbers both sides", () => {
    const diff = lineDiff("a\nb\nc", "a\nb\nnew\nc");
    expect(compact(diff)).toEqual([" a", " b", "+new", " c"]);
    expect(diff[2]).toEqual({ kind: "add", text: "new", oldNo: null, newNo: 3 });
    expect(diff[3]).toEqual({ kind: "same", text: "c", oldNo: 3, newNo: 4 });
  });

  it("shows a changed line as a removal followed by an addition", () => {
    const diff = lineDiff("- check nulls\n- check empty", "- check nulls\n- check empty arrays");
    expect(compact(diff)).toEqual([" - check nulls", "-- check empty", "+- check empty arrays"]);
    expect(diffCounts(diff)).toEqual({ added: 1, removed: 1 });
  });

  it("keeps the longest common subsequence when lines move around", () => {
    const diff = lineDiff("a\nb\nc\nd", "b\nc\na\nd");
    expect(compact(diff).filter((l) => l.startsWith(" "))).toEqual([" b", " c", " d"]);
    expect(diffCounts(diff)).toEqual({ added: 1, removed: 1 });
  });

  it("treats CRLF and LF line ends alike", () => {
    expect(diffCounts(lineDiff("a\r\nb", "a\nb"))).toEqual({ added: 0, removed: 0 });
  });

  it("falls back to remove-all/add-all for a huge changed middle", () => {
    const size = Math.ceil(Math.sqrt(MAX_LCS_CELLS)) + 1;
    const before = Array.from({ length: size }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: size }, (_, i) => `new ${i}`).join("\n");
    const diff = lineDiff(before, after);
    expect(diffCounts(diff)).toEqual({ added: size, removed: size });
    expect(diff[0]?.kind).toBe("del");
    expect(diff[size]?.kind).toBe("add");
  });
});

describe("collapseUnchanged", () => {
  it("folds unchanged runs outside the context around a change", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8"].join("\n");
    const after = ["1", "2", "3", "4", "five", "6", "7", "8"].join("\n");
    const rows = collapseUnchanged(lineDiff(before, after), 1);
    expect(rows.map((r) => (r.kind === "skip" ? `…${r.count}` : r.kind[0] + r.text))).toEqual([
      "…3",
      "s4",
      "d5",
      "afive",
      "s6",
      "…2",
    ]);
  });

  it("folds a diff without changes into one skip row", () => {
    expect(collapseUnchanged(lineDiff("a\nb", "a\nb"))).toEqual([{ kind: "skip", count: 2 }]);
  });
});
