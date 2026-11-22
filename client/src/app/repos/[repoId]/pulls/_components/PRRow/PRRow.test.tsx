/**
 * PRRow — the PR list's Cost cell shows the latest review batch's cost, and a
 * muted em-dash (never "$0") when the PR was never reviewed or the cost is unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

/** Shared router spy so a test can assert a click did not navigate. */
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 200,
    deletions: 85,
    files_count: 4,
    status: "reviewed",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: 0.014,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — Cost cell", () => {
  it("shows the latest batch cost with a tooltip", () => {
    renderRow(pr({}));
    expect(screen.getByText("$0.014")).toHaveAttribute("title", "Cost of the latest review");
  });

  it("shows an em-dash when the PR has no known cost", () => {
    renderRow(pr({ score: null, cost_usd: null }));
    expect(screen.getByTitle("Cost of the latest review")).toHaveTextContent("—");
  });
});

describe("PRRow — Findings cell", () => {
  it("shows the latest batch's severity icons; clicking them opens the popover, not the PR", () => {
    push.mockClear();
    renderRow(
      pr({
        findings: {
          counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 1 },
          items: [
            {
              id: "f1",
              severity: "CRITICAL",
              category: "security",
              title: "Hardcoded secret",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              confidence: 0.98,
              rationale: "A secret is committed.",
            },
            {
              id: "f2",
              severity: "SUGGESTION",
              category: "style",
              title: "Rename helper",
              file: "src/util.ts",
              start_line: 3,
              end_line: 3,
              confidence: 0.7,
              rationale: "Clearer name.",
            },
          ],
        },
      }),
    );
    expect(screen.getByRole("img", { name: "1 Critical" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 Suggestion" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("dialog", { name: "2 findings in the latest review" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows an em-dash when the latest batch has no findings", () => {
    renderRow(pr({ findings: null, updated_at: new Date().toISOString() }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
