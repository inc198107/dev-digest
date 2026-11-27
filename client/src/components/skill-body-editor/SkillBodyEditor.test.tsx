import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/skills.json";
import { SkillBodyEditor, type SkillBodyEditorProps } from "./SkillBodyEditor";

afterEach(cleanup);

/**
 * @param props Props that override the defaults.
 * @returns The rendered editor and its change spy.
 */
function renderEditor(props: Partial<SkillBodyEditorProps> = {}) {
  const onChange = vi.fn();
  const result = render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillBodyEditor
        fileName="boundary-cases.md"
        value={"# Boundary cases\n\n- empty input"}
        onChange={onChange}
        label="Skill body"
        tokensLabel="≈ 12 tokens"
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { ...result, onChange };
}

describe("SkillBodyEditor", () => {
  it("shows the file header with the token count and a number per line", () => {
    const { container } = renderEditor();
    expect(screen.getByText("boundary-cases.md")).toBeInTheDocument();
    expect(screen.getByText("≈ 12 tokens")).toBeInTheDocument();
    const gutter = container.querySelector("[aria-hidden=true]");
    expect(gutter?.textContent).toBe("123");
    expect(screen.getByLabelText("Skill body")).toHaveValue("# Boundary cases\n\n- empty input");
  });

  it("shows the unsaved badge only when asked", () => {
    const { rerender } = renderEditor();
    expect(screen.queryByText("unsaved")).toBeNull();
    rerender(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillBodyEditor
          fileName="boundary-cases.md"
          value="# Boundary cases"
          onChange={vi.fn()}
          label="Skill body"
          tokensLabel="≈ 4 tokens"
          unsaved
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("reports every edit", () => {
    const { onChange } = renderEditor();
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# Edited" } });
    expect(onChange).toHaveBeenCalledWith("# Edited");
  });

  it("keeps at least minRows lines of height for a short body", () => {
    renderEditor({ value: "", minRows: 12, placeholder: "# Rule" });
    const area = screen.getByLabelText("Skill body");
    expect(area).toHaveAttribute("rows", "12");
    expect(area).toHaveAttribute("placeholder", "# Rule");
  });
});
