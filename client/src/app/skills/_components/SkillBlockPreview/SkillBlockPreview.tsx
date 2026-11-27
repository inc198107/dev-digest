"use client";

import React from "react";
import { Markdown } from "@devdigest/ui";
import { formatSkillBlock, type SkillBlockFields } from "@/lib/skill-block";
import { s } from "./styles";

/**
 * A skill rendered exactly as the reviewing agent receives it: name heading, description line,
 * body.
 * @param props.skill Name, description and body.
 * @returns The rendered block.
 */
export function SkillBlockPreview({ skill }: { skill: SkillBlockFields }) {
  return (
    <div style={s.card} data-testid="skill-block-preview">
      <Markdown doc>{formatSkillBlock(skill)}</Markdown>
    </div>
  );
}
