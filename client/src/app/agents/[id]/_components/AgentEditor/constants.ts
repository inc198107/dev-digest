import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs: Config and Skills (Skills Lab); Evals, Stats and CI come in later milestones. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
];

/** Keys of the editor tabs, for validating `?tab=`. */
export const TAB_KEYS: readonly string[] = TABS.map((tab) => tab.key);
