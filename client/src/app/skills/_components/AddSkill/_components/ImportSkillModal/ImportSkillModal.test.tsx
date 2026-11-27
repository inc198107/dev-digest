import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const push = vi.fn();
const previewMutateAsync = vi.fn();
const createMutateAsync = vi.fn();

const PREVIEW: SkillImportPreview = {
  name: "flaky-test-patterns",
  description: "Flag tests that depend on real time.",
  type: "custom",
  body: "# Flaky test patterns\n\n- Real time",
  source: "imported_file",
  origin: "flaky-test-patterns.zip",
  skill_file: "flaky-test-patterns/SKILL.md",
  tokens: 412,
  ignored_files: [
    { path: "flaky-test-patterns/scripts/detect-flaky.sh", reason: "executable" },
    { path: "flaky-test-patterns/references/patterns.md", reason: "not_skill_core" },
  ],
  warnings: ["1 executable file(s) were not processed: a skill is text only, nothing from the archive runs."],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

beforeEach(() => {
  push.mockReset();
  previewMutateAsync.mockReset().mockResolvedValue(PREVIEW);
  createMutateAsync.mockReset().mockResolvedValue({ id: "new-id", name: "flaky-test-patterns" });
});
afterEach(cleanup);

/**
 * @param source Import from a file or a URL.
 * @returns The rendered modal.
 */
function renderModal(source: "file" | "url") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ImportSkillModal source={source} onClose={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ImportSkillModal", () => {
  it("previews an uploaded package, flags executables and saves only on confirm", async () => {
    renderModal("file");
    const file = new File(["PK\u0003\u0004"], "flaky-test-patterns.zip", { type: "application/zip" });
    fireEvent.change(screen.getByTestId("skill-import-file"), { target: { files: [file] } });
    fireEvent.click(screen.getByText("Preview"));

    await screen.findByText("You are importing someone else's instructions");
    expect(previewMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "file", filename: "flaky-test-patterns.zip" }),
    );
    expect(screen.getByText("executable — not processed")).toBeInTheDocument();
    expect(screen.getByText("flaky-test-patterns/scripts/detect-flaky.sh")).toBeInTheDocument();
    expect(screen.getByText("Adds ≈ 412 tokens to a prompt")).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({
        name: "flaky-test-patterns",
        description: "Flag tests that depend on real time.",
        type: "custom",
        body: "# Flaky test patterns\n\n- Real time",
        source: "imported_file",
      }),
    );
    expect(push).toHaveBeenCalledWith("/skills/new-id?tab=config");
  });

  it("lets the user edit the proposed fields before saving", async () => {
    renderModal("url");
    fireEvent.change(screen.getByLabelText("Skill URL"), { target: { value: "https://example.com/SKILL.md" } });
    fireEvent.click(screen.getByText("Preview"));
    await screen.findByText("You are importing someone else's instructions");
    expect(previewMutateAsync).toHaveBeenCalledWith({ kind: "url", url: "https://example.com/SKILL.md" });

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "flaky-tests" } });
    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ name: "flaky-tests" })));
  });

  it("previews a handed-over URL at once and reports the save through onSaved", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <ImportSkillModal
            source="url"
            initialUrl="https://github.com/org/repo/blob/main/SKILL.md"
            onClose={onClose}
            onSaved={onSaved}
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    await screen.findByText("You are importing someone else's instructions");
    expect(previewMutateAsync).toHaveBeenCalledTimes(1);
    expect(previewMutateAsync).toHaveBeenCalledWith({ kind: "url", url: "https://github.com/org/repo/blob/main/SKILL.md" });

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByLabelText("Skill URL")).toHaveValue("https://github.com/org/repo/blob/main/SKILL.md");
    fireEvent.click(screen.getByText("Preview"));
    await screen.findByText("You are importing someone else's instructions");
    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows a refused preview inline and stores nothing", async () => {
    previewMutateAsync.mockRejectedValueOnce(new Error("The archive holds no SKILL.md or Markdown file."));
    renderModal("file");
    fireEvent.change(screen.getByTestId("skill-import-file"), {
      target: { files: [new File(["x"], "empty.zip")] },
    });
    fireEvent.click(screen.getByText("Preview"));
    expect(await screen.findByRole("alert")).toHaveTextContent("no SKILL.md");
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
