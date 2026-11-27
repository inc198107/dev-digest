import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const restoreMutate = vi.fn();

const VERSIONS: SkillVersion[] = [
  {
    skill_id: "s1",
    version: 3,
    body: "# Boundary cases\n\n- null input\n- empty arrays",
    note: "Cover empty arrays",
    created_at: "2026-11-27T10:00:00.000Z",
  },
  {
    skill_id: "s1",
    version: 2,
    body: "# Boundary cases\n\n- null input\n- empty strings",
    note: null,
    created_at: "2026-11-26T10:00:00.000Z",
  },
  { skill_id: "s1", version: 1, body: "# Boundary cases", created_at: "2026-11-25T10:00:00.000Z" },
];

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL: SkillListItem = {
  id: "s1",
  name: "boundary-cases",
  description: "Flag missing tests for boundary inputs.",
  type: "rubric",
  source: "manual",
  body: VERSIONS[0]!.body,
  enabled: true,
  version: 3,
  evidence_files: null,
  used_by: [],
};

beforeEach(() => restoreMutate.mockReset());
afterEach(cleanup);

/**
 * @returns The rendered tab.
 */
function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("skill Versions tab", () => {
  it("titles a version with its note, else with the body's first line, and marks the current one", () => {
    renderTab();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    const v3 = screen.getByTestId("skill-version-3");
    expect(within(v3).getByText("Cover empty arrays")).toBeInTheDocument();
    expect(within(v3).getByText("Current")).toBeInTheDocument();
    expect(within(v3).queryByText("Restore")).toBeNull();
    const v2 = screen.getByTestId("skill-version-2");
    expect(within(v2).getByText("Boundary cases")).toBeInTheDocument();
    fireEvent.click(within(v2).getByText("Restore"));
    expect(restoreMutate).toHaveBeenCalledWith({ id: "s1", version: 2 }, expect.anything());
  });

  it("Diff expands the line diff against the previous version and collapses it again", () => {
    renderTab();
    expect(within(screen.getByTestId("skill-version-1")).queryByText("Diff")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Diff v3 against v2" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const diff = screen.getByTestId("version-diff");
    expect(diff).toHaveTextContent("Changes from v2");
    expect(diff).toHaveTextContent("+1");
    expect(diff).toHaveTextContent("−1");
    const removed = diff.querySelector('[data-kind="del"]');
    const added = diff.querySelector('[data-kind="add"]');
    expect(removed).toHaveTextContent("- empty strings");
    expect(added).toHaveTextContent("- empty arrays");

    fireEvent.click(toggle);
    expect(screen.queryByTestId("version-diff")).toBeNull();
  });

  it("opening another version's diff closes the first one", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff v3 against v2" }));
    fireEvent.click(screen.getByRole("button", { name: "Diff v2 against v1" }));
    const diffs = screen.getAllByTestId("version-diff");
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toHaveTextContent("Changes from v1");
    expect(within(screen.getByTestId("skill-version-2")).getByTestId("version-diff")).toBeInTheDocument();
  });
});
