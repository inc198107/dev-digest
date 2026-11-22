import { SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

/** Bucket a PR into S/M/L by total changed lines. */
export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}

/** Compact relative time for the list's UPDATED column (e.g. "3h", "2d"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Shorter lists always open the Findings popover downwards: upwards it would cover the filters. */
export const POPOVER_UP_MIN_ROWS = 5;

/**
 * Where a row's Findings popover opens (the design opens lower-half rows upwards).
 * @param index - row position in the visible list
 * @param total - number of visible rows
 * @returns "up" for the lower half of a list of at least {@link POPOVER_UP_MIN_ROWS} rows, else "down"
 */
export function popoverPlacementFor(index: number, total: number): "up" | "down" {
  return total >= POPOVER_UP_MIN_ROWS && index >= Math.ceil(total / 2) ? "up" : "down";
}
