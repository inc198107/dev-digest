import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";
import shellMessages from "../../../../../messages/en/shell.json";
import { ToastProvider } from "../../../../lib/toast";

const push = vi.fn();
const updateMutate = vi.fn();

const SKILLS: SkillListItem[] = [
  {
    id: "s1",
    name: "untested-branches",
    description: "Flag every branch the diff adds that no test exercises.",
    type: "rubric",
    source: "manual",
    body: "# Untested branches\n\n- list the decision points",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: [{ agent_id: "a1", name: "Test Quality Reviewer" }],
  },
  {
    id: "s2",
    name: "mocking-discipline",
    description: "Flag tests that mock the unit under test.",
    type: "convention",
    source: "manual",
    body: "# Mocking",
    enabled: false,
    version: 2,
    evidence_files: null,
    used_by: [],
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/skills",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useUpdateSkill: () => ({ mutate: updateMutate }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

/**
 * @returns The rendered list view.
 */
function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("Skills list", () => {
  it("renders a card per skill and filters by search", () => {
    renderView();
    expect(screen.getByText("untested-branches")).toBeInTheDocument();
    expect(screen.getByText("mocking-discipline")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "mock" } });
    expect(screen.queryByText("untested-branches")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "zzz" } });
    expect(screen.getByText("No skill matches “zzz”.")).toBeInTheDocument();
  });

  it("a click opens the side preview with its users and the block the agent receives", () => {
    renderView();
    fireEvent.click(screen.getByText("untested-branches"));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByText("Test Quality Reviewer")).toBeInTheDocument();
    expect(within(drawer).getByTestId("skill-block-preview")).toHaveTextContent("Skill: untested-branches");
    fireEvent.click(within(drawer).getByText("Edit skill"));
    expect(push).toHaveBeenCalledWith("/skills/s1?tab=config");
  });

  it("the card switch enables or disables the skill for every agent", () => {
    renderView();
    fireEvent.click(screen.getAllByRole("switch")[1]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "s2", patch: { enabled: true } });
  });

  it("Add skill offers create and both imports, and opens the chosen dialog", () => {
    renderView();
    fireEvent.click(screen.getByText("Add skill"));
    expect(screen.getByText("Create from scratch")).toBeInTheDocument();
    expect(screen.getByText("Import from URL")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Import from file"));
    expect(screen.getByText("Import skill from file")).toBeInTheDocument();
  });
});
