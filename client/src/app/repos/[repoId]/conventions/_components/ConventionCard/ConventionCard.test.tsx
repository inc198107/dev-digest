import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventionsMessages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CONVENTION: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts:23-31",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  accepted: false,
};

/**
 * @param convention The convention to show.
 * @returns The card with spied callbacks.
 */
function renderCard(convention: ConventionCandidate = CONVENTION) {
  const handlers = {
    onToggleAccepted: vi.fn(),
    onReject: vi.fn(),
    onSaveRule: vi.fn(),
    onCopy: vi.fn(),
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages }}>
      <ConventionCard convention={convention} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("ConventionCard", () => {
  it("shows the rule, the cited code and the confidence", () => {
    renderCard();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("accepts, rejects and copies through its callbacks", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
    expect(h.onToggleAccepted).toHaveBeenCalledOnce();
    expect(h.onReject).toHaveBeenCalledOnce();
    expect(h.onCopy).toHaveBeenCalledOnce();
  });

  it("marks an accepted convention as pressed", () => {
    renderCard({ ...CONVENTION, accepted: true });
    expect(screen.getByRole("button", { name: "Accepted" })).toHaveAttribute("aria-pressed", "true");
  });

  it("saves a reworded rule trimmed, and cancel keeps the old one", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "  Prefer async/await  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSaveRule).toHaveBeenCalledWith("Prefer async/await");

    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "Something else" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onSaveRule).toHaveBeenCalledOnce();
    expect(screen.getByText(CONVENTION.rule)).toBeInTheDocument();
  });

  it("refuses an empty or too long rule", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "   " } });
    expect(screen.getByRole("alert")).toHaveTextContent("The rule cannot be empty.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "x".repeat(301) } });
    expect(screen.getByRole("alert")).toHaveTextContent("At most 300 characters.");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSaveRule).not.toHaveBeenCalled();
  });
});
