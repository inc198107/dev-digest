import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, Severity } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

/** Shared spy so a test can assert that no finding action was fired. */
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate, isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mutate.mockClear();
});

/**
 * Build a finding fixture.
 * @param id - finding id.
 * @param severity - contract severity level.
 * @param confidence - 0..1; below 0.65 counts as low confidence.
 * @param title - card title, used to assert what the list shows.
 * @returns a complete `FindingRecord`.
 */
function mk(id: string, severity: Severity, confidence: number, title: string): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "Rationale.",
    suggestion: null,
    confidence,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const FINDINGS: FindingRecord[] = [mk("f1", "CRITICAL", 0.95, "Hardcoded secret")];

/** Two CRITICAL (one low-confidence), one WARNING, no SUGGESTION. */
const MIXED: FindingRecord[] = [
  mk("c1", "CRITICAL", 0.95, "Hardcoded secret"),
  mk("w1", "WARNING", 0.9, "N+1 query"),
  mk("c2", "CRITICAL", 0.4, "Possible SQL injection"),
];

/**
 * Render inside the intl provider the panel needs.
 * @param ui - element to render.
 * @returns the RTL render result.
 */
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * Titles of the finding cards currently in the list.
 * @returns the titles that are rendered, from the MIXED fixture.
 */
function shownTitles(): string[] {
  return MIXED.map((f) => f.title).filter((title) => screen.queryByText(title) !== null);
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters", () => {
  it("counts every level, showing 0 for a level without findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Filter findings by severity" });
    expect(group).toHaveTextContent("2Critical1Warning0Suggestion");
    expect(screen.getByRole("button", { name: "2 Critical" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("filters to the clicked level, moves to another level, and clears on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const critical = screen.getByRole("button", { name: "2 Critical" });
    const warning = screen.getByRole("button", { name: "1 Warning" });

    fireEvent.click(critical);
    expect(shownTitles()).toEqual(["Hardcoded secret", "Possible SQL injection"]);
    expect(critical).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(warning);
    expect(shownTitles()).toEqual(["N+1 query"]);
    expect(warning).toHaveAttribute("aria-pressed", "true");
    expect(critical).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(warning);
    expect(shownTitles()).toHaveLength(3);
    expect(warning).toHaveAttribute("aria-pressed", "false");
  });

  it("combines with hide low confidence: counts and list honour both filters", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));

    const critical = screen.getByRole("button", { name: "1 Critical" });
    fireEvent.click(critical);
    expect(shownTitles()).toEqual(["Hardcoded secret"]);
  });

  it("shows the empty state for a level with no findings and keeps the counters", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "0 Suggestion" }));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 Suggestion" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("highlights the active level with its SEV colours and dims the others", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const critical = screen.getByRole("button", { name: "2 Critical" });
    fireEvent.click(critical);
    expect(critical.style.borderColor).toBe("var(--crit)");
    expect(critical.style.background).toBe("var(--crit-bg)");
    expect(critical.style.opacity).toBe("1");
    expect(screen.getByRole("button", { name: "1 Warning" }).style.opacity).toBe("0.55");
    expect(screen.getByRole("button", { name: "0 Suggestion" }).style.opacity).toBe("0.55");
  });

  it("stays in sync with the list after accept / dismiss refetches the findings", () => {
    const { rerender } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 Critical" }));

    const refetched = MIXED.map((f) =>
      f.id === "c2" ? { ...f, dismissed_at: "2026-11-22T10:00:00Z" } : f,
    ).filter((f) => f.id !== "c1");
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel findings={refetched} prId="pr1" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "1 Critical" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(shownTitles()).toEqual(["Possible SQL injection"]);
  });

  it("filters locally: no request and no finding action on counter clicks", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: "2 Critical" }));
    fireEvent.click(screen.getByRole("button", { name: "2 Critical" }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });
});
