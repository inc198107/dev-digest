import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor; `labelKey` resolves under the `skills` namespace. */
export interface SkillEditorTab {
  key: SkillTabKey;
  labelKey: string;
  icon: IconName;
}

/** Tabs of the skill editor (Evals and Stats from the design are out of scope). */
export type SkillTabKey = "config" | "preview" | "versions";

export const SKILL_TABS: readonly SkillEditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "editor.tabs.preview", icon: "Eye" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
];

/** Width of the skill list column (px), as in the design. */
export const LIST_WIDTH = 290;
