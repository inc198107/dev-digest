import type { Provider } from "@devdigest/shared";

/** Default provider for a new agent. */
export const DEFAULT_PROVIDER: Provider = "openai";

/**
 * Model preselected when a provider is chosen. A provider without an entry starts
 * with no model, so the user picks one from its live list. openai matches the
 * Feature Models registry default, openrouter the seeded agents' model.
 */
export const DEFAULT_MODELS: Partial<Record<Provider, string>> = {
  openai: "gpt-4.1",
  openrouter: "deepseek/deepseek-v4-flash",
};

/** Selectable providers in the create form. */
export const PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];

/** Modal width (px). */
export const MODAL_WIDTH = 620;
