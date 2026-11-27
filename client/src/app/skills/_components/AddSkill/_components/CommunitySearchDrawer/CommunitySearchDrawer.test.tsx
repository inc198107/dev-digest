import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CommunitySkillHit, CommunitySkillSearchResult } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";

const search = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useCommunitySkillSearch: (q: string) => search(q),
}));

import { CommunitySearchDrawer } from "./CommunitySearchDrawer";
import { SEARCH_DEBOUNCE_MS } from "./constants";

const OWASP: CommunitySkillHit = {
  name: "owasp-top-10-review",
  description: "Maps diff changes to the OWASP Top 10 with CWE references.",
  repo: "secdev/agent-skills",
  path: "owasp-top-10-review/SKILL.md",
  url: "https://github.com/secdev/agent-skills/blob/main/owasp-top-10-review/SKILL.md",
  stars: 1240,
  language: "TypeScript",
};
const PY: CommunitySkillHit = {
  name: "django-security",
  description: null,
  repo: "py-sec/skills",
  path: "SKILL.md",
  url: "https://github.com/py-sec/skills/blob/main/SKILL.md",
  stars: 87,
  language: "Python",
};

/**
 * @param result The answer of every search of at least two characters.
 * @param state Extra query state (error, fetching).
 */
function answer(result: CommunitySkillSearchResult | undefined, state: Record<string, unknown> = {}) {
  search.mockImplementation((q: string) =>
    q.trim().length >= 2
      ? { data: result, isError: false, isFetching: false, error: null, ...state }
      : { data: undefined, isError: false, isFetching: false, error: null },
  );
}

/**
 * @returns The rendered drawer with its callbacks.
 */
function renderDrawer() {
  const onClose = vi.fn();
  const onImport = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <CommunitySearchDrawer onClose={onClose} onImport={onImport} />
    </NextIntlClientProvider>,
  );
  return { onClose, onImport };
}

/**
 * Type into the search box and let the debounce run out.
 * @param text The search text.
 */
function typeQuery(text: string) {
  fireEvent.change(screen.getByLabelText("Search community skills"), { target: { value: text } });
  act(() => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
  answer({ configured: true, items: [OWASP, PY] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CommunitySearchDrawer", () => {
  it("searches only after typing pauses and lists the results", () => {
    renderDrawer();
    expect(screen.getByText(/Type at least 2 characters/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search community skills"), { target: { value: "owasp" } });
    expect(search).not.toHaveBeenCalledWith("owasp");
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(search).toHaveBeenCalledWith("owasp");

    const results = screen.getByRole("list", { name: "Community skills" });
    expect(within(results).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("owasp-top-10-review")).toBeInTheDocument();
    expect(screen.getByText(OWASP.description!)).toBeInTheDocument();
    expect(screen.getByText("1,240")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "secdev/agent-skills" })).toHaveAttribute("href", OWASP.url);
  });

  it("filters by the languages found in the results", () => {
    renderDrawer();
    typeQuery("security");
    fireEvent.click(screen.getByRole("button", { name: "Python" }));
    expect(screen.queryByText("owasp-top-10-review")).toBeNull();
    expect(screen.getByText("django-security")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All languages" }));
    expect(screen.getByText("owasp-top-10-review")).toBeInTheDocument();
  });

  it("a quick tag adds its word to the search text once", () => {
    renderDrawer();
    const input = screen.getByLabelText("Search community skills");
    fireEvent.click(screen.getByRole("button", { name: "security" }));
    expect(input).toHaveValue("security");
    fireEvent.change(input, { target: { value: "owasp" } });
    fireEvent.click(screen.getByRole("button", { name: "testing" }));
    fireEvent.click(screen.getByRole("button", { name: "testing" }));
    expect(input).toHaveValue("owasp testing");
  });

  it("Import hands the chosen result over", () => {
    const { onImport } = renderDrawer();
    typeQuery("owasp");
    fireEvent.click(screen.getByRole("button", { name: "Import owasp-top-10-review from secdev/agent-skills" }));
    expect(onImport).toHaveBeenCalledWith(OWASP);
  });

  it("without a GitHub token it says where to add one", () => {
    answer({ configured: false, items: [] });
    renderDrawer();
    typeQuery("owasp");
    expect(screen.getByRole("note")).toHaveTextContent("Community search needs a GitHub token");
    expect(screen.getByRole("link", { name: "Settings → API keys" })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("shows a failed search inline", () => {
    answer(undefined, { isError: true, error: new Error("GitHub rate limit exceeded") });
    renderDrawer();
    typeQuery("owasp");
    expect(screen.getByRole("alert")).toHaveTextContent("Community search failed. GitHub rate limit exceeded");
  });

  it("says when nothing was found", () => {
    answer({ configured: true, items: [] });
    renderDrawer();
    typeQuery("zzz-nothing");
    expect(screen.getByText("No SKILL.md found for “zzz-nothing”.")).toBeInTheDocument();
  });
});
