import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, SkillListItem } from "@devdigest/shared";
import agentsMessages from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { dropPosition, moveBy, moveRelative, toggleLink } from "./helpers";

const mutate = vi.fn();
let links: AgentSkillLink[] = [];

/**
 * @param name Skill name.
 * @param enabled Workspace-wide switch.
 * @returns A skill fixture.
 */
function skill(name: string, enabled = true): SkillListItem {
  return {
    id: `id-${name}`,
    name,
    description: `Flag ${name}.`,
    type: "rubric",
    source: "manual",
    body: "# b",
    enabled,
    version: 1,
    evidence_files: null,
    used_by: [],
  };
}

const SKILLS = [skill("alpha"), skill("bravo"), skill("charlie", false), skill("delta")];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useAgentSkills: () => ({ data: links, isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate }),
}));

import { SkillsTab } from "./SkillsTab";

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

/**
 * @param ids Linked skill ids in order.
 * @returns The links the mocked hook returns.
 */
const linksOf = (ids: string[]): AgentSkillLink[] => ids.map((skill_id, order) => ({ agent_id: "ag1", skill_id, order }));

/**
 * @returns The rendered tab.
 */
function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mutate.mockReset();
  links = linksOf(["id-charlie", "id-alpha", "id-bravo"]);
});
afterEach(cleanup);

describe("agent Skills tab", () => {
  it("lists linked skills in prompt order, then the available ones", () => {
    renderTab();
    const linked = within(screen.getByRole("list", { name: "Linked — in prompt order" })).getAllByRole("listitem");
    expect(linked.map((li) => li.getAttribute("data-testid"))).toEqual([
      "linked-skill-charlie",
      "linked-skill-alpha",
      "linked-skill-bravo",
    ]);
    expect(screen.getByTestId("available-skill-delta")).toBeInTheDocument();
    expect(screen.getByText("3 of 4 linked")).toBeInTheDocument();
    expect(within(screen.getByTestId("linked-skill-charlie")).getByText("disabled — not sent")).toBeInTheDocument();
  });

  it("ticking an available skill links it at the end; unticking a linked one unlinks it", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "Link delta" }));
    expect(mutate).toHaveBeenLastCalledWith(["id-charlie", "id-alpha", "id-bravo", "id-delta"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Link alpha" }));
    expect(mutate).toHaveBeenLastCalledWith(["id-charlie", "id-bravo"]);
  });

  it("drag and drop reorders the linked skills and saves the new order", () => {
    renderTab();
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "id-bravo"), effectAllowed: "", dropEffect: "" };
    const source = screen.getByTestId("linked-skill-bravo");
    const target = screen.getByTestId("linked-skill-charlie");
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(mutate).toHaveBeenLastCalledWith(["id-bravo", "id-charlie", "id-alpha"]);
  });

  it("the arrow buttons move a skill from the keyboard", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Move alpha up" }));
    expect(mutate).toHaveBeenLastCalledWith(["id-alpha", "id-charlie", "id-bravo"]);
    expect(screen.getByRole("button", { name: "Move charlie up" })).toBeDisabled();
  });

  it("the filter narrows both lists", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "delt" } });
    expect(screen.queryByTestId("linked-skill-alpha")).toBeNull();
    expect(screen.getByTestId("available-skill-delta")).toBeInTheDocument();
  });
});

describe("skill order helpers", () => {
  const ids = ["a", "b", "c"];
  it("moveRelative places the dragged id before or after the target", () => {
    expect(moveRelative(ids, "c", "a", "before")).toEqual(["c", "a", "b"]);
    expect(moveRelative(ids, "a", "c", "after")).toEqual(["b", "c", "a"]);
    expect(moveRelative(ids, "a", "a", "after")).toEqual(ids);
    expect(moveRelative(ids, "x", "a", "before")).toEqual(ids);
  });

  it("dropPosition picks the half of the row under the pointer", () => {
    expect(dropPosition(5, { top: 0, height: 40 })).toBe("before");
    expect(dropPosition(30, { top: 0, height: 40 })).toBe("after");
    expect(dropPosition(undefined, { top: 0, height: 40 })).toBe("before");
    expect(dropPosition(30, { top: 0, height: 0 })).toBe("before");
  });

  it("moveBy stops at the edges and toggleLink appends or removes", () => {
    expect(moveBy(ids, "a", -1)).toEqual(ids);
    expect(moveBy(ids, "a", 1)).toEqual(["b", "a", "c"]);
    expect(toggleLink(ids, "d")).toEqual(["a", "b", "c", "d"]);
    expect(toggleLink(ids, "b")).toEqual(["a", "c"]);
  });
});
