import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventionsMessages from "../../../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const mocks = vi.hoisted(() => ({ push: vi.fn(), mutateAsync: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

const ACCEPTED: ConventionCandidate[] = [
  {
    id: "c1",
    rule: "Always use async/await instead of .then() chains",
    evidence_path: "src/api/users.ts:23-31",
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    accepted: true,
  },
  {
    id: "c2",
    rule: "Redis access goes through src/lib/redis.ts singleton",
    evidence_path: "src/lib/redis.ts:1-9",
    evidence_snippet: "export const redis = new Redis(config.redisUrl);",
    confidence: 0.85,
    accepted: true,
  },
];

/**
 * @param takenNames Names already used in the workspace.
 * @returns The modal and its close spy.
 */
function renderModal(takenNames: string[] = []) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: conventionsMessages, skills: skillsMessages }}>
      <ToastProvider>
        <CreateSkillModal repoName="payments-api" accepted={ACCEPTED} takenNames={takenNames} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onClose };
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.mutateAsync.mockReset().mockResolvedValue({ id: "s9", name: "payments-api-conventions" });
});
afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("pre-fills a draft merged from the accepted conventions", () => {
    renderModal();
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-conventions");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Flag changes that break the 2 house conventions of payments-api.",
    );
    expect(screen.getByLabelText("Type")).toHaveValue("convention");
    const body = screen.getByLabelText("Skill body") as HTMLTextAreaElement;
    expect(body.value).toContain("## async-await-then-chains");
    expect(body.value).toContain("Detected in `src/lib/redis.ts:1-9`:");
    expect(screen.getByText("payments-api-conventions.md")).toBeInTheDocument();
  });

  it("saves the edited skill as convention/extracted with the evidence and opens it", async () => {
    const { onClose } = renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "house-rules" } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# house-rules\n\n- one rule" } });
    fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/skills/s9?tab=config"));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: "house-rules",
      description: "Flag changes that break the 2 house conventions of payments-api.",
      type: "convention",
      body: "# house-rules\n\n- one rule",
      enabled: false,
      source: "extracted",
      evidence_files: ["src/api/users.ts:23-31", "src/lib/redis.ts:1-9"],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks a taken or invalid name and an empty body", () => {
    renderModal(["payments-api-conventions"]);
    expect(screen.getByLabelText("Name")).toHaveValue("payments-api-conventions-2");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "payments-api-conventions" } });
    expect(screen.getByRole("alert")).toHaveTextContent("A skill with this name already exists.");
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Not Kebab" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Use kebab-case");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "ok-name" } });
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("cancel closes without saving", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
