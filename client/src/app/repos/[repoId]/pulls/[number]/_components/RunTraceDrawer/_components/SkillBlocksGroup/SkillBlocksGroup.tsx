"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillBlock } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { PromptBlock } from "../PromptBlock";
import { s } from "./styles";

/**
 * The Skills part of a run's prompt assembly: a header with how many skills the run loaded and
 * how many tokens they added, then one expandable block per skill in prompt order.
 * @param props.blocks The skill blocks recorded in the trace (non-empty).
 * @returns The group.
 */
export function SkillBlocksGroup({ blocks }: { blocks: SkillBlock[] }) {
  const t = useTranslations("runs");
  const tokens = blocks.reduce((sum, b) => sum + b.tokens, 0);
  return (
    <div style={s.group} data-testid="trace-skill-blocks">
      <div style={s.header}>
        <span style={s.dot} />
        {t("trace.prompt.skillsGroup", { count: blocks.length, tokens })}
      </div>
      <div style={s.blocks}>
        {blocks.map((b) => (
          <PromptBlock
            key={b.id}
            label={t("trace.prompt.skillBlock", { name: b.name, version: b.version, tokens: b.tokens })}
            text={b.text}
            color={PROMPT_COLORS.skills}
          />
        ))}
      </div>
    </div>
  );
}
