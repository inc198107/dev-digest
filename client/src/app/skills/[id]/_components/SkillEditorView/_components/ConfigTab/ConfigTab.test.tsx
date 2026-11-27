import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { ConfigTab } from "./ConfigTab";

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
  used_by: [{ agent_id: "a1", name: "Test Quality Reviewer" }],
};

beforeEach(() => {
  updateMutate.mockReset();
  deleteMutate.mockReset();
});
afterEach(cleanup);

/**
 * @param skill The skill to edit.
 * @returns The tab element with its providers.
 */
function tab(skill: SkillListItem = SKILL) {
  return (
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>
  );
}

/**
 * @returns The rendered tab.
 */
function renderTab() {
  return render(tab());
}

describe("skill Config tab", () => {
  it("explains the description as a directive interface", () => {
    renderTab();
    expect(screen.getByText(/write it as a directive/)).toBeInTheDocument();
  });

  it("saves only the changed fields and announces the next version for a body edit", () => {
    renderTab();
    expect(screen.getByText("Save skill")).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "" }), { target: { value: "# Boundary cases v5" } });
    expect(screen.getByText("Saving snapshots the body as v5.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save skill"));
    expect(updateMutate).toHaveBeenCalledWith(
      { id: "s1", patch: { body: "# Boundary cases v5" } },
      expect.anything(),
    );
  });

  it("a type change keeps the version", () => {
    renderTab();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    expect(screen.getByText("Type and enabled are metadata: the skill stays at v4.")).toBeInTheDocument();
  });

  it("a new version refreshes untouched fields and keeps the edited ones", () => {
    const { rerender } = renderTab();
    rerender(tab({ ...SKILL, version: 5, description: "Saved elsewhere." }));
    expect(screen.getByLabelText("Description")).toHaveValue("Saved elsewhere.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "boundary-draft" } });
    rerender(tab({ ...SKILL, version: 6, description: "Saved again." }));
    expect(screen.getByLabelText("Name")).toHaveValue("boundary-draft");
    expect(screen.getByLabelText("Description")).toHaveValue("Saved again.");
  });

  it("saving a rename after a restore keeps the restored body", () => {
    const { rerender } = renderTab();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "boundary-renamed" } });
    rerender(tab({ ...SKILL, version: 5, body: "# Restored v2 body" }));
    expect(screen.getByRole("textbox", { name: "" })).toHaveValue("# Restored v2 body");

    fireEvent.click(screen.getByText("Save skill"));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s1", patch: { name: "boundary-renamed" } }, expect.anything());
  });

  it("after a type-only save (same version) a restored body still replaces the form", () => {
    const { rerender } = renderTab();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    rerender(tab({ ...SKILL, type: "security" }));
    expect(screen.getByText("Save skill")).toBeDisabled();

    rerender(tab({ ...SKILL, type: "security", version: 5, body: "# Restored v2 body" }));
    expect(screen.getByRole("textbox", { name: "" })).toHaveValue("# Restored v2 body");
    expect(screen.getByText("Save skill")).toBeDisabled();
  });

  it("stored values with surrounding whitespace do not loop the sync", () => {
    const { rerender } = renderTab();
    rerender(tab({ ...SKILL, version: 5, description: "Padded description. " }));
    expect(screen.getByLabelText("Description")).toHaveValue("Padded description. ");
  });

  it("cannot save an invalid name", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Not Kebab" } });
    expect(screen.getByText("Save skill")).toBeDisabled();
  });

  it("asks before deleting and names the agents that lose the skill", () => {
    renderTab();
    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete “boundary-cases”?")).toBeInTheDocument();
    expect(screen.getAllByText(/Linked to 1 agent: Test Quality Reviewer/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(deleteMutate).toHaveBeenCalledWith("s1", expect.anything());
  });
});
