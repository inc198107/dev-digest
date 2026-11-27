import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionList } from "@devdigest/shared";
import conventionsMessages from "../../../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const state = vi.hoisted(() => ({
  list: undefined as ConventionList | undefined,
  extract: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  update: { mutate: vi.fn() },
  reject: { mutate: vi.fn(), isPending: false, variables: undefined as string | undefined },
  setAll: { mutate: vi.fn(), isPending: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/r1/conventions",
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "payments-api", full_name: "acme/payments-api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: state.list, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useExtractConventions: () => state.extract,
  useUpdateConvention: () => state.update,
  useRejectConvention: () => state.reject,
  useSetAllConventionsAccepted: () => state.setAll,
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: [{ name: "payments-api-conventions" }] }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

const NOW = new Date("2026-11-27T12:00:00Z");

/**
 * @param patch Fields to override.
 * @returns A convention.
 */
function convention(patch: Partial<ConventionCandidate>): ConventionCandidate {
  return {
    id: "c1",
    rule: "Always use async/await instead of .then() chains",
    evidence_path: "src/api/users.ts:23-31",
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: false,
    ...patch,
  };
}

const THREE: ConventionCandidate[] = [
  convention({ id: "c1", accepted: true }),
  convention({ id: "c2", rule: "Handlers return Result<T, ApiError>", evidence_path: "src/api/public/index.ts:14-20" }),
  convention({ id: "c3", rule: "Redis goes through the singleton", evidence_path: "src/api/users.ts:40" }),
];

/**
 * @returns The rendered page view.
 */
function renderView() {
  return render(
    <NextIntlClientProvider locale="en" now={NOW} messages={{ conventions: conventionsMessages, skills: skillsMessages }}>
      <ToastProvider>
        <ConventionsView repoId="r1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.list = { candidates: THREE, last_scan_at: "2026-11-27T10:30:00Z" };
  state.extract = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  state.update.mutate = vi.fn();
  state.reject.mutate = vi.fn();
  state.setAll.mutate = vi.fn();
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("shows the empty state and runs the extraction from it", () => {
    state.list = { candidates: [], last_scan_at: null };
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));
    expect(state.extract.mutate).toHaveBeenCalledOnce();
  });

  it("summarises the scan and the accepted count", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "Conventions in payments-api" })).toBeInTheDocument();
    expect(screen.getByText("3 candidates from 2 files · last scan 1h ago")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 accepted")).toBeInTheDocument();
  });

  it("accepts all, then offers to deselect all", () => {
    const { rerender } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(state.setAll.mutate).toHaveBeenCalledWith(true);

    state.list = { candidates: THREE.map((c) => ({ ...c, accepted: true })), last_scan_at: "2026-11-27T10:30:00Z" };
    rerender(
      <NextIntlClientProvider locale="en" now={NOW} messages={{ conventions: conventionsMessages, skills: skillsMessages }}>
        <ToastProvider>
          <ConventionsView repoId="r1" />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(state.setAll.mutate).toHaveBeenCalledWith(false);
  });

  it("wires a card's accept, reject and reword to the mutations", () => {
    renderView();
    const card = screen.getByRole("article", { name: "Handlers return Result<T, ApiError>" });
    fireEvent.click(within(card).getByRole("button", { name: "Accept" }));
    expect(state.update.mutate).toHaveBeenCalledWith({ id: "c2", patch: { accepted: true } });
    fireEvent.click(within(card).getByRole("button", { name: "Reject" }));
    expect(state.reject.mutate).toHaveBeenCalledWith("c2");
  });

  it("disables Create skill until a convention is accepted, then opens the modal with a free name", () => {
    state.list = { candidates: THREE.map((c) => ({ ...c, accepted: false })), last_scan_at: "2026-11-27T10:30:00Z" };
    const { unmount } = renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    unmount();

    state.list = { candidates: THREE, last_scan_at: "2026-11-27T10:30:00Z" };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Create skill from conventions")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("payments-api-conventions-2");
    expect(dialog).toHaveTextContent("Merged from 1 accepted convention in payments-api.");
  });

  it("re-scans from the header and shows a failed extraction inline", () => {
    state.extract = { mutate: vi.fn(), isPending: false, isError: true, error: new Error("Repository is not indexed yet.") };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Extraction failed Repository is not indexed yet.");
    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    expect(state.extract.mutate).toHaveBeenCalledOnce();
  });
});
