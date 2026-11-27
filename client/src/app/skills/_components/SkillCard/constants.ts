import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon of each skill source, as in the Skills Lab design. */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Link",
  extracted: "Wrench",
  community: "Globe",
};
