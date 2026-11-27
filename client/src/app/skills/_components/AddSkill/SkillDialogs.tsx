"use client";

import React from "react";
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
  return null;
}
