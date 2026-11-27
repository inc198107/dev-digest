import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: SkillListItem = {
  id: "s1",
  name: "untested-branches",
  description: "Flag every branch the diff adds that no test exercises.",
  type: "rubric",
  source: "imported_file",
  body: "# Untested branches",
  enabled: true,
  version: 3,
  evidence_files: null,
  used_by: [{ agent_id: "a1", name: "Test Quality Reviewer" }],
};

/**
 * @param ui Element to render.
 * @returns The render result.
 */
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("shows the name, description, type, source, users and version", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("untested-branches")).toBeInTheDocument();
    expect(screen.getByText(SKILL.description)).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Imported file")).toBeInTheDocument();
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("the switch toggles the skill without opening it", () => {
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch", { name: "Enable untested-branches" }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("untested-branches"));
    expect(onClick).toHaveBeenCalled();
  });

  it("opens from the keyboard through a title button that does not contain the switch", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} active onClick={onClick} onToggle={vi.fn()} />);
    const open = screen.getByRole("button", { name: /untested-branches/ });
    expect(open).toHaveAttribute("aria-pressed", "true");
    expect(open.querySelector("[role=switch]")).toBeNull();
    fireEvent.click(open);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("an unlinked skill says so", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, used_by: [] }} />);
    expect(screen.getByText("not linked")).toBeInTheDocument();
  });
});
