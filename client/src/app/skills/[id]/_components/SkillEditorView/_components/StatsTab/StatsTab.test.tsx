import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem, SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";

const statsQuery = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillStats: (id: string) => statsQuery(id),
}));

import { StatsTab } from "./StatsTab";

const SKILL: SkillListItem = {
  id: "s1",
  name: "boundary-cases",
  description: "Flag missing tests for boundary inputs.",
  type: "rubric",
  source: "manual",
  body: "# Boundary cases",
  enabled: true,
  version: 4,
  evidence_files: null,
  used_by: [
    { agent_id: "a1", name: "Test Quality Reviewer" },
    { agent_id: "a2", name: "Security Reviewer" },
    { agent_id: "a3", name: "Perf Reviewer" },
  ],
};

const STATS: SkillStats = {
  skill_id: "s1",
  used_by: 3,
  runs_30d: 24,
  skill_runs_30d: 17,
  pull_frequency: 0.71,
  accept_rate: 0.74,
  findings_30d: 96,
  findings_by_category: [
    { category: "bug", count: 22 },
    { category: "security", count: 48 },
    { category: "style", count: 0 },
  ],
};

beforeEach(() => {
  statsQuery.mockReset().mockReturnValue({ data: STATS, isLoading: false, isError: false, refetch: vi.fn() });
});
afterEach(cleanup);

/**
 * @returns The rendered tab.
 */
function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("skill Stats tab", () => {
  it("shows the four numbers of the last 30 days", () => {
    renderTab();
    expect(statsQuery).toHaveBeenCalledWith("s1");
    expect(within(screen.getByRole("group", { name: "Used by" })).getByText("agents")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Used by" })).toHaveTextContent("3agents");
    const pull = screen.getByRole("group", { name: "Pull frequency" });
    expect(pull).toHaveTextContent("71%");
    expect(pull).toHaveTextContent("17 of 24 review runs");
    const accept = screen.getByRole("group", { name: "Accept rate" });
    expect(within(accept).getByText("74%")).toBeInTheDocument();
    expect(within(accept).getByText("74")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Findings (30d)" })).toHaveTextContent("96");
  });

  it("lists the agents using the skill with a link to their Skills tab", () => {
    renderTab();
    const agents = screen.getByRole("list", { name: "Agents using this skill" });
    expect(within(agents).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Open Test Quality Reviewer" })).toHaveAttribute(
      "href",
      "/agents/a1?tab=skills",
    );
  });

  it("charts the findings by category with their counts, largest first, without empty ones", () => {
    renderTab();
    const chart = screen.getByTestId("skill-findings-by-category");
    expect(chart).toHaveTextContent(/security\s*48.*bug\s*22/);
    expect(within(chart).queryByText("style")).toBeNull();
    expect(screen.getByText(/Findings belong to the whole review run/)).toBeInTheDocument();
  });

  it("shows a dash and no ring when no finding was accepted or dismissed", () => {
    statsQuery.mockReturnValue({
      data: { ...STATS, accept_rate: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderTab();
    const accept = screen.getByRole("group", { name: "Accept rate" });
    expect(accept).toHaveTextContent("—");
    expect(accept.querySelector("svg")).toBeNull();
  });

  it("replaces the numbers with an empty state when no run loaded the skill", () => {
    statsQuery.mockReturnValue({
      data: { ...STATS, skill_runs_30d: 0, pull_frequency: 0, accept_rate: null, findings_30d: 0, findings_by_category: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderTab();
    expect(screen.getByText("No review run loaded this skill yet")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Pull frequency" })).toBeNull();
    expect(screen.queryByText("Findings by category")).toBeNull();
    expect(screen.getByRole("link", { name: "Open Security Reviewer" })).toBeInTheDocument();
  });

  it("shows a load error inline", () => {
    statsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the stats.");
  });
});
