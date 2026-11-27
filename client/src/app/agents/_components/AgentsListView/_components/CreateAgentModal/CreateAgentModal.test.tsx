import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/agents.json";

/** Live model lists per provider, as `GET /providers/:id/models` would return them. */
const MODELS: Record<string, { id: string; provider: string }[]> = {
  openai: [],
  anthropic: [
    { id: "claude-sonnet-4-5", provider: "anthropic" },
    { id: "claude-haiku-4-5", provider: "anthropic" },
  ],
  openrouter: [
    { id: "deepseek/deepseek-v4-flash", provider: "openrouter" },
    { id: "qwen/qwen3-coder", provider: "openrouter" },
  ],
};
const mutateAsync = vi.fn(async () => ({ id: "ag-new" }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../../../../../lib/hooks/agents", () => ({
  useCreateAgent: () => ({ mutateAsync, isPending: false }),
  useProviderModels: (provider: string) => ({ data: MODELS[provider] }),
}));

import { CreateAgentModal } from "./CreateAgentModal";

afterEach(() => {
  cleanup();
  mutateAsync.mockClear();
});

/**
 * Render the modal with the agents messages.
 * @returns the testing-library render result
 */
function renderModal() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <CreateAgentModal onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

/**
 * Switch the Provider select.
 * @param provider - the provider value to choose
 */
function chooseProvider(provider: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: provider } });
}

/**
 * Open the Model picker and list the model ids it offers.
 * @param current - the model the picker currently shows (its trigger text)
 * @returns the option texts of the open list
 */
function openModelList(current: string): string[] {
  fireEvent.click(screen.getByText(current));
  const list = screen.getByPlaceholderText("Search models…").closest("[popover]") as HTMLElement;
  return within(list)
    .getAllByRole("button")
    .map((b) => b.textContent ?? "");
}

describe("CreateAgentModal — model picker follows the provider", () => {
  it("starts on the openai default and explains an empty model list", () => {
    renderModal();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText(/No models loaded — set the openai API key/)).toBeInTheDocument();
  });

  it("lists the new provider's models and preselects its default", () => {
    renderModal();
    chooseProvider("openrouter");
    expect(openModelList("deepseek/deepseek-v4-flash")).toEqual([
      "deepseek/deepseek-v4-flash",
      "qwen/qwen3-coder",
    ]);
  });

  it("requires a model pick for a provider without a default, then creates with it", async () => {
    renderModal();
    chooseProvider("anthropic");
    const create = screen.getByRole("button", { name: "Create agent" });
    expect(create).toBeDisabled();

    expect(openModelList("Search models…")).toEqual(["claude-sonnet-4-5", "claude-haiku-4-5"]);
    fireEvent.click(screen.getByRole("button", { name: "claude-haiku-4-5" }));
    expect(create).toBeEnabled();

    fireEvent.click(create);
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "anthropic", model: "claude-haiku-4-5" }),
      ),
    );
  });
});
