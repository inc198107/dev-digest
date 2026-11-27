import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor; `labelKey` resolves under the `skills` namespace. */
export interface SkillEditorTab {
  key: SkillTabKey;
  labelKey: string;
  icon: IconName;
}

/** Tabs of the skill editor (Evals from the design is out of scope). */
export type SkillTabKey = "config" | "preview" | "stats" | "versions";

/** Tab order: Preview first (the default tab), then Config, Stats, Versions. */
export const SKILL_TABS: readonly SkillEditorTab[] = [
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Width of the skill list column (px), as in the design. */
export const LIST_WIDTH = 290;
