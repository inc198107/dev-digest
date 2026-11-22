/**
 * FindingsPeek — severity counts that open a findings popover on hover, focus or click,
 * close on Escape, and never let a click reach a clickable parent row.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FindingsPeek, type PeekFinding } from "./FindingsPeek";

afterEach(cleanup);

/**
 * Build a popover finding.
 * @param id - finding id
 * @param severity - review level
 * @returns a finding with fixed metadata
 */
function item(id: string, severity: PeekFinding["severity"]): PeekFinding {
  return {
    id,
    severity,
    category: "security",
    title: `Title ${id}`,
    file: "src/a.ts",
    start_line: 3,
    end_line: 5,
    confidence: 0.9,
    rationale: "Uses **bold** and `code`.",
  };
}

const ITEMS = [item("c1", "CRITICAL"), item("c2", "CRITICAL"), item("w1", "WARNING")];

describe("FindingsPeek", () => {
  it("shows only non-zero levels and keeps the popover closed by default", () => {
    render(<FindingsPeek items={ITEMS} title="3 findings in this run" />);
    expect(screen.getByRole("img", { name: "2 Critical" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "1 Warning" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Suggestion/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on hover with the title and the findings, and closes when the pointer leaves", () => {
    render(<FindingsPeek items={ITEMS} title="3 findings in this run" />);
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger.parentElement!);
    const dialog = screen.getByRole("dialog", { name: "3 findings in this run" });
    expect(dialog).toHaveTextContent("Title c1");
    expect(dialog).toHaveTextContent("src/a.ts:3-5");
    expect(dialog).toHaveTextContent("Uses bold and code.");
    fireEvent.mouseLeave(trigger.parentElement!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pins open on click, closes on Escape, and never bubbles the click", () => {
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <FindingsPeek items={ITEMS} title="3 findings" />
      </div>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus and closes on blur", () => {
    render(<FindingsPeek items={ITEMS} title="3 findings" />);
    const trigger = screen.getByRole("button");
    fireEvent.focus(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes after a mouse click once the pointer leaves (pointer focus does not keep it open)", () => {
    render(<FindingsPeek items={ITEMS} title="3 findings" />);
    const trigger = screen.getByRole("button");
    const area = trigger.parentElement!;
    fireEvent.mouseEnter(area);
    fireEvent.pointerDown(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseLeave(area);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Escape from reaching outer handlers while it is open", () => {
    const onOuterKey = vi.fn();
    render(
      <div onKeyDown={onOuterKey}>
        <FindingsPeek items={ITEMS} title="3 findings" />
      </div>,
    );
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onOuterKey).not.toHaveBeenCalled();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(onOuterKey).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there are no findings", () => {
    const { container } = render(<FindingsPeek items={[]} title="0 findings" />);
    expect(container).toBeEmptyDOMElement();
  });
});
