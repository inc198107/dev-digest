/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: 0.0013,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Record<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} findingsByRun={findingsByRun} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — usage line", () => {
  it("a done run shows total tokens and cost under the time", () => {
    renderRuns([run({ status: "done", score: 95 })]);
    expect(screen.getByText("150 tok · $0.0013")).toBeInTheDocument();
  });

  it("a done run with an unknown cost shows an em-dash, never $0", () => {
    renderRuns([run({ status: "done", score: 95, cost_usd: null })]);
    expect(screen.getByText("150 tok · —")).toBeInTheDocument();
  });

  it("failed and running runs show no usage line", () => {
    renderRuns([
      run({ run_id: "f", status: "failed", error: "boom", cost_usd: null }),
      run({ run_id: "r", status: "running", cost_usd: null }),
    ]);
    expect(screen.queryByText(/ tok · /)).not.toBeInTheDocument();
  });
});

/**
 * Build a finding of run-1's review.
 * @param id - finding id
 * @param severity - review level
 * @returns a complete finding record
 */
function finding(id: string, severity: FindingRecord["severity"]): FindingRecord {
  return {
    id,
    severity,
    category: "security",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "Because.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

describe("RunHistory — findings by severity", () => {
  it("shows the run's severity icons and opens its findings on hover", () => {
    renderRuns([run({ findings_count: 2, blockers: 1, score: 50 })], {
      "run-1": [finding("c1", "CRITICAL"), finding("w1", "WARNING")],
    });
    expect(screen.getByRole("img", { name: "1 Critical" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 Warning" })).toBeInTheDocument();
    expect(screen.getByText(/1 blockers/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("dialog", { name: "2 findings in this run" })).toHaveTextContent(
      "Finding c1",
    );
  });

  it("falls back to the finding count when the run's review is not loaded", () => {
    renderRuns([run({ findings_count: 3, blockers: 0, score: 70 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Critical/ })).not.toBeInTheDocument();
  });
});
