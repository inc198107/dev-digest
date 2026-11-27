import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

/**
 * @param prompt Prompt assembly overrides.
 * @returns A trace fixture.
 */
function trace(prompt: Partial<RunTrace["prompt_assembly"]>): RunTrace {
  return {
    config: { agent: "Test Quality Reviewer", version: "1", provider: "openrouter", model: "m", pr: 483, source: "local" },
    stats: { duration_ms: 1000, tokens_in: 5000, tokens_out: 300, cost_usd: null, findings: 0, grounding: "0/0 passed" },
    prompt_assembly: { system: "You review tests.", user: "Review PR #483", ...prompt },
    tool_calls: [],
    raw_output: "{}",
    memory_pulled: [],
    specs_read: [],
    log: [],
  };
}

/**
 * @param t The trace to show.
 * @returns The rendered body, with the Prompt assembly section opened.
 */
function renderBody(t: RunTrace) {
  const result = render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={t} findings={[]} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText("Prompt assembly"));
  return result;
}

describe("TraceBody skills", () => {
  it("lists each loaded skill and its tokens as its own prompt block", () => {
    renderBody(
      trace({
        skills: "### Skill: untested-branches\n…\n\n### Skill: boundary-cases\n…",
        skill_blocks: [
          { id: "s1", name: "untested-branches", type: "rubric", version: 2, tokens: 310, text: "### Skill: untested-branches\n…" },
          { id: "s2", name: "boundary-cases", type: "rubric", version: 1, tokens: 280, text: "### Skill: boundary-cases\n…" },
        ],
      }),
    );
    expect(screen.getByText("untested-branches v2")).toBeInTheDocument();
    const group = screen.getByTestId("trace-skill-blocks");
    expect(within(group).getByText("Skills · 2 skills · +590 tokens")).toBeInTheDocument();
    expect(within(group).getByText("untested-branches · v2 · 310 tokens")).toBeInTheDocument();
    expect(within(group).getByText("boundary-cases · v1 · 280 tokens")).toBeInTheDocument();
    expect(screen.queryByText("Skills (dynamic)")).toBeNull();
  });

  it("shows no skills when the run had none", () => {
    renderBody(trace({ skills: null, skill_blocks: [] }));
    expect(screen.queryByTestId("trace-skill-blocks")).toBeNull();
    expect(screen.queryByText("Skills (dynamic)")).toBeNull();
  });

  it("keeps the single Skills block for traces written before per-skill blocks", () => {
    renderBody(trace({ skills: "### legacy skill" }));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
  });
});
