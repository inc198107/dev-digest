import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";
import shellMessages from "../../../../../messages/en/shell.json";
import { ToastProvider } from "../../../../lib/toast";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  skills: { data: undefined as SkillListItem[] | undefined, isLoading: false, isError: false, isFetching: false },
}));

const SKILLS: SkillListItem[] = [
  {
    id: "s1",
    name: "boundary-cases",
    description: "Flag missing tests for boundary inputs.",
    type: "rubric",
    source: "manual",
    body: "# Boundary cases",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: [],
  },
  {
    id: "s2",
    name: "untested-branches",
    description: "Flag every branch the diff adds that no test exercises.",
    type: "rubric",
    source: "manual",
    body: "# Untested branches",
    enabled: true,
    version: 1,
    evidence_files: null,
    used_by: [],
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  usePathname: () => "/skills",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ ...mocks.skills, refetch: vi.fn() }),
  useCommunitySkillSearch: () => ({ data: undefined, isError: false, isFetching: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SkillsIndexView } from "./SkillsIndexView";

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.skills = { data: undefined, isLoading: false, isError: false, isFetching: false };
});
afterEach(cleanup);

/**
 * @returns The rendered /skills entry view.
 */
function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages }}>
      <ToastProvider>
        <SkillsIndexView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("/skills entry", () => {
  it("opens the first skill in the editor (no separate list page)", () => {
    mocks.skills = { data: SKILLS, isLoading: false, isError: false, isFetching: false };
    renderView();
    expect(mocks.replace).toHaveBeenCalledWith("/skills/s1");
    expect(screen.queryByText("No skills yet")).toBeNull();
  });

  it("waits for a fresh list: a cached list being refetched (e.g. after a delete) is not the target", () => {
    mocks.skills = { data: SKILLS, isLoading: false, isError: false, isFetching: true };
    const view = renderView();
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.skills = { data: [SKILLS[1]!], isLoading: false, isError: false, isFetching: false };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages }}>
        <ToastProvider>
          <SkillsIndexView />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/skills/s2");
  });

  it("decides once: a skill created from the empty state does not trigger a redirect", () => {
    mocks.skills = { data: [], isLoading: false, isError: false, isFetching: false };
    const view = renderView();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    mocks.skills = { data: SKILLS, isLoading: false, isError: false, isFetching: false };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages }}>
        <ToastProvider>
          <SkillsIndexView />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
  });

  it("shows the editor outline while the skills load, without redirecting", () => {
    mocks.skills = { data: undefined, isLoading: true, isError: false, isFetching: true };
    const { container } = renderView();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("a workspace without skills gets the empty state; its button opens the create dialog", () => {
    mocks.skills = { data: [], isLoading: false, isError: false, isFetching: false };
    renderView();
    expect(screen.getByText("No skills yet")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText("Create from scratch")[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Add skill offers create, both imports and the community search", () => {
    mocks.skills = { data: [], isLoading: false, isError: false, isFetching: false };
    renderView();
    fireEvent.click(screen.getByText("Add skill"));
    expect(screen.getByText("Import from file")).toBeInTheDocument();
    expect(screen.getByText("Import from URL")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Search community skills…"));
    expect(screen.getByLabelText("Search community skills")).toBeInTheDocument();
  });

  it("a failed load shows the error state", () => {
    mocks.skills = { data: undefined, isLoading: false, isError: true, isFetching: false };
    renderView();
    expect(screen.getByText("Could not load skills.")).toBeInTheDocument();
  });
});
