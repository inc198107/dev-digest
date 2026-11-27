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
 * @param iso ISO timestamp of a snapshot.
 * @returns Date and time in the browser's locale.
 */
export function formatSnapshotDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
