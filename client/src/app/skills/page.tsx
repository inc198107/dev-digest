import { SkillsIndexView } from "./_components/SkillsIndexView";

/**
 * Route /skills (Skills Lab). Thin route entry: the view opens the first skill in the editor, or
 * shows the empty state with "Add skill".
 * @returns The Skills Lab entry view.
 */
export default function SkillsPage() {
  return <SkillsIndexView />;
}
