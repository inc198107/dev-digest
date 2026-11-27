import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SearchableSelect } from "./SearchableSelect";

afterEach(cleanup);

const OPTIONS = ["gpt-4.1", "deepseek/deepseek-v4-flash", "claude-opus"];

/**
 * @param value Selected value.
 * @returns The onChange spy.
 */
function renderSelect(value = "gpt-4.1") {
  const onChange = vi.fn();
  render(<SearchableSelect value={value} onChange={onChange} options={OPTIONS} ariaLabel="Model" placeholder="Search models…" />);
  return onChange;
}

describe("SearchableSelect keyboard access", () => {
  it("is a button named by its label and value that opens with the arrow key and picks with Enter", () => {
    const onChange = renderSelect();
    const trigger = screen.getByRole("button", { name: "Model: gpt-4.1" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const search = screen.getByPlaceholderText("Search models…");
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "deepseek" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("deepseek/deepseek-v4-flash");
    expect(screen.queryByPlaceholderText("Search models…")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes with Escape or Tab and gives focus back to the trigger", () => {
    const onChange = renderSelect();
    const trigger = screen.getByRole("button", { name: /^Model/ });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByPlaceholderText("Search models…"), { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search models…")).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByPlaceholderText("Search models…"), { key: "Tab" });
    expect(screen.queryByPlaceholderText("Search models…")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is named by the label alone when nothing is selected", () => {
    renderSelect("");
    expect(screen.getByRole("button", { name: "Model" })).toBeInTheDocument();
  });
});
