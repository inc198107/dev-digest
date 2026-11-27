/**
 * Shared formatting for model-picker dropdowns: turns a model's live pricing +
 * context window into a compact label like
 *   `deepseek/deepseek-v4-flash — $0.14/$0.28 per 1M · 1M ctx`
 *
 * Used by the agent editor (ConfigTab) and the Settings → Feature Models picker
 * so both render OpenRouter prices identically.
 */

/** A model with optional live pricing (USD per 1M tokens) and context window. */
export interface PricedModel {
  id: string;
  pricing?: { promptPerM: number; completionPerM: number } | null;
  contextLength?: number | null;
}

/** Compact USD-per-1M formatter for the model price label. */
const fmt = (n: number) => (n === 0 ? "0" : n < 1 ? n.toFixed(3) : n.toFixed(2));

/** Compact token-count formatter for the context window (e.g. 1048576 → "1M"). */
const ctx = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : `${Math.round(n / 1000)}k`);

/** Build the model dropdown label: price + context window when available. */
export function modelLabel(m: PricedModel): string {
  const parts: string[] = [];
  if (m.pricing) parts.push(`$${fmt(m.pricing.promptPerM)}/$${fmt(m.pricing.completionPerM)} per 1M`);
  if (m.contextLength) parts.push(`${ctx(m.contextLength)} ctx`);
  return parts.length ? `${m.id} — ${parts.join(" · ")}` : m.id;
}

/** A model-picker option: a bare id, or an id with a rich label. */
export type ModelOption = string | { value: string; label: string };

/**
 * Keep the current model selectable when it is missing from the live list (a registry
 * default, a model saved under another key, or an empty list after a failed load).
 * @param options - options built by `toModelOptions`
 * @param current - the selected model id; an empty id adds nothing
 * @returns `options`, prefixed with `current` when it is not among them
 */
export function withCurrentModel(options: ModelOption[], current: string): ModelOption[] {
  if (!current || options.some((o) => (typeof o === "string" ? o : o.value) === current)) return options;
  return [current, ...options];
}

/** Build SearchableSelect/SelectInput options: priced models get a rich label. */
export function toModelOptions(models: PricedModel[] | undefined): ModelOption[] {
  return (models ?? []).map((m) =>
    m.pricing || m.contextLength ? { value: m.id, label: modelLabel(m) } : m.id,
  );
}
