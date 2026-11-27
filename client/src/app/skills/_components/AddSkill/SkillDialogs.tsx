"use client";

import React from "react";
import { CommunitySearchDrawer } from "./_components/CommunitySearchDrawer";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import type { AddSkillMode } from "./types";

/**
 * The dialog for the chosen way of adding a skill, or nothing.
 * @param props.mode What the user picked in the "Add skill" menu; null when closed.
 * @param props.onClose Close the dialog.
 * @returns The open dialog.
 */
export function SkillDialogs({ mode, onClose }: { mode: AddSkillMode | null; onClose: () => void }) {
  if (mode === "create") return <CreateSkillModal onClose={onClose} />;
  if (mode === "file" || mode === "url") return <ImportSkillModal source={mode} onClose={onClose} />;
  if (mode === "community") return <CommunityImport onClose={onClose} />;
  return null;
}

/**
 * The community search and the URL import it starts. The import modal opens over the drawer with
 * the result's URL already previewed; cancelling it returns to the search with its results, and
 * saving closes both.
 * @param props.onClose Close the drawer (and the import).
 * @returns The drawer, plus the import modal while one runs.
 */
function CommunityImport({ onClose }: { onClose: () => void }) {
  const [importUrl, setImportUrl] = React.useState<string | null>(null);
  return (
    <>
      <CommunitySearchDrawer onClose={onClose} onImport={(hit) => setImportUrl(hit.url)} />
      {importUrl && (
        <ImportSkillModal
          key={importUrl}
          source="url"
          initialUrl={importUrl}
          onClose={() => setImportUrl(null)}
          onSaved={onClose}
        />
      )}
    </>
  );
}
