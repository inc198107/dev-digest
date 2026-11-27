import { SkillsListView } from "./_components/SkillsListView";

/**
 * Route /skills (Skills Lab list). Thin route entry: the view, its dialogs and drawer live
 * under _components.
 * @returns The skills list.
 */
export default function SkillsPage() {
  return <SkillsListView />;
}
