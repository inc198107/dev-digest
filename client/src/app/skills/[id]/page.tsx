"use client";

import { useParams } from "next/navigation";
import { SkillEditorView } from "./_components/SkillEditorView";

/**
 * Route /skills/:id (skill editor). Thin route entry: reads the id and renders the editor.
 * @returns The skill editor.
 */
export default function SkillEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillEditorView id={id} />;
}
