import type { SkillVersion } from "@devdigest/shared";

/**
 * First meaningful line of a body snapshot, used as the row summary.
 * @param body Markdown body.
 * @returns The first non-empty line without heading markers.
 */
export function bodySummary(body: string): string {
  const line = body.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.replace(/^#+\s*/, "").trim();
}

/**
 * Row title of a version: the author's "what changed" note, or the body's first line when the
 * version has none (older versions, restores, saves without a note).
 * @param version A snapshot.
 * @returns The title.
 */
export function versionTitle(version: Pick<SkillVersion, "body" | "note">): string {
  return version.note?.trim() || bodySummary(version.body);
}

/**
 * The version a snapshot was made from: the highest version number below it.
 * @param versions Every snapshot of the skill (any order).
 * @param version The snapshot's number.
 * @returns The previous snapshot, or null for the first one.
 */
export function previousVersion(versions: SkillVersion[], version: number): SkillVersion | null {
  let previous: SkillVersion | null = null;
  for (const v of versions) {
    if (v.version < version && (previous === null || v.version > previous.version)) previous = v;
  }
  return previous;
}

/**
 * @param iso ISO timestamp of a snapshot.
 * @returns Date and time in the browser's locale.
 */
export function formatSnapshotDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
