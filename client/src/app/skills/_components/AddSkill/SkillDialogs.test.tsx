import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CommunitySkillHit, SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../lib/toast";

const mocks = vi.hoisted(() => ({ push: vi.fn(), previewMutateAsync: vi.fn(), createMutateAsync: vi.fn() }));

const HIT: CommunitySkillHit = {
  name: "owasp-top-10-review",
  description: "Maps diff changes to the OWASP Top 10 with CWE references.",
  repo: "secdev/agent-skills",
  path: "owasp-top-10-review/SKILL.md",
  url: "https://github.com/secdev/agent-skills/blob/main/owasp-top-10-review/SKILL.md",
  stars: 1240,
  language: "TypeScript",
};

const PREVIEW: SkillImportPreview = {
  name: "owasp-top-10-review",
  description: "Flag diff changes that match an OWASP Top 10 risk.",
  type: "security",
  body: "# OWASP Top 10 review",
  source: "imported_url",
  origin: HIT.url,
  skill_file: "SKILL.md",
  tokens: 120,
  ignored_files: [],
  warnings: [],
};

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useCommunitySkillSearch: (q: string) =>
    q.trim().length >= 2
      ? { data: { configured: true, items: [HIT] }, isError: false, isFetching: false, error: null }
      : { data: undefined, isError: false, isFetching: false, error: null },
  useImportSkillPreview: () => ({ mutateAsync: mocks.previewMutateAsync, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: mocks.createMutateAsync, isPending: false }),
}));

import { SkillDialogs } from "./SkillDialogs";

beforeEach(() => {
  mocks.push.mockReset();
  mocks.previewMutateAsync.mockReset().mockResolvedValue(PREVIEW);
  mocks.createMutateAsync.mockReset().mockResolvedValue({ id: "new-id", name: PREVIEW.name });
});
afterEach(cleanup);

/**
 * Open the community drawer and search until the result card shows.
 * @returns The close spy of the dialogs.
 */
async function searchCommunity() {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillDialogs mode="community" onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Search community skills"), { target: { value: "owasp" } });
  await screen.findByText(HIT.name, undefined, { timeout: 2000 });
  return { onClose };
}

describe("SkillDialogs · community", () => {
  it("Import opens the URL import with the result's URL previewed, and saving closes everything", async () => {
    const { onClose } = await searchCommunity();
    fireEvent.click(screen.getByRole("button", { name: `Import ${HIT.name} from ${HIT.repo}` }));

    expect(await screen.findByText("You are importing someone else's instructions")).toBeInTheDocument();
    expect(mocks.previewMutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.previewMutateAsync).toHaveBeenCalledWith({ kind: "url", url: HIT.url });
    expect(screen.getByText("Import skill from URL")).toBeInTheDocument();
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Save skill"));
    await waitFor(() =>
      expect(mocks.createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ source: "imported_url" })),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.push).toHaveBeenCalledWith("/skills/new-id?tab=config");
  });

  it("closing the import returns to the search results", async () => {
    const { onClose } = await searchCommunity();
    fireEvent.click(screen.getByRole("button", { name: `Import ${HIT.name} from ${HIT.repo}` }));
    await screen.findByText("You are importing someone else's instructions");

    const closeButtons = screen.getAllByRole("button", { name: "Close" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    expect(screen.queryByText("You are importing someone else's instructions")).toBeNull();
    expect(screen.getByText(HIT.name)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
