/**
 * PRRow — the PR list's Cost cell shows the latest review batch's cost, and a
 * muted em-dash (never "$0") when the PR was never reviewed or the cost is unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
