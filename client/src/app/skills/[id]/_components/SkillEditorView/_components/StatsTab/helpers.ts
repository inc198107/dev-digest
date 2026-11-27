import type { DonutSegment } from "@devdigest/ui";
import type { SkillCategoryCount } from "@devdigest/shared";
import { CATEGORY_COLOR, OTHER_CATEGORY_COLOR } from "./constants";

/**
 * Donut slices of the findings by category, largest first; empty categories are left out.
 * @param counts Findings per category.
 * @returns One slice per category with findings.
 */
export function categorySegments(counts: SkillCategoryCount[]): DonutSegment[] {
  return counts
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((c) => ({ label: c.category, value: c.count, color: CATEGORY_COLOR[c.category] ?? OTHER_CATEGORY_COLOR }));
}
