# Severity counters

**Status:** done
**Milestone:** L01 homework
**Modules touched:** client (server · reviewer-core · e2e: none — the data is already on the page)

## Goal
In an expanded review run on the PR page's **Agent runs** tab, show how that run's findings split
by severity — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" — above the finding cards, and let a click
on a level narrow the run's list to that level, so nobody has to scroll and count by eye.

Design: `DevDigest Design (standalone).html` → `findings.jsx` `FindingsPanel` (severity chips on the
left of the panel toolbar, "Hide low confidence" on the right) and `prdetail_runs.jsx`
`ReviewRunCard` (finding cards in the run body). The homework criteria override the design's
behaviour: one active level at a time, highlighted in its own severity colour.

## Scope
- In: a counters row in `FindingsPanel` (one per expanded run); single-level filter that combines
  with "Hide low confidence"; labels in `messages/en/prReview.json`; component tests.
- Out: new route, table, hook or model call (counts come from `ReviewRecord.findings`, already
  loaded by `usePrReviews`); keeping the filter when the run is collapsed (the panel unmounts, as
  `hideLow` already does); filter state in the URL; multi-level selection; the "N blockers" count
  in the `ReviewRunAccordion` header (unchanged — it counts non-dismissed CRITICAL only); the
  Timeline severity icons (separate, existing feature).

## Contract changes
None. Levels come from the Zod enum `Severity` in `@devdigest/shared`
(`client/src/vendor/shared/contracts/findings.ts`): CRITICAL, WARNING, SUGGESTION. Colours and
icons come from `SEV` in `@devdigest/ui`; `SEV` / `tokens.ts` stay untouched.

## Behaviour
- The row shows all three levels in contract order as "count LABEL", separated by "·"; a level
  with no findings shows `0` and stays clickable.
- Counts are computed on the client from the run's findings **after** "Hide low confidence"
  (confidence ≥ 0.65 when on) and **before** the severity filter, so a counter's number always
  equals the cards shown after clicking it.
- Click a level → the list shows only that level. Click another level → the filter and the
  highlight move to it. Click the active level again → the filter clears.
- Active counter: border and background from its `SEV` entry (`c` / `bg`); the other two are
  dimmed while a filter is on. The highlight never depends on hover, so the state is readable
  from a screenshot. Buttons expose `aria-pressed`.
- No finding matches (e.g. a `0` level, or the toggle hides them all) → the panel's existing
  "No findings match" empty state; the toolbar stays visible so the filter can be cleared.
- Accepted / dismissed findings stay in the list (muted), so they are counted. Accept / dismiss
  invalidates `["reviews", prId]`; counters and list derive from the same refetched findings and
  stay in sync without a reload.
- Clicking a counter sends no request and starts no agent: it is local component state.
- Changing either filter (severity or "Hide low confidence") resets the j/k keyboard focus to
  the first card, so it never points past the end of the narrowed list.
- A severity value outside the contract (the DB column is plain text) is not counted.

## Acceptance criteria
- [x] An expanded run shows "N CRITICAL · N WARNING · N SUGGESTION" above its finding cards.
- [x] The numbers match the cards of each level in that run's list.
- [x] Clicking a level leaves only that level's findings; clicking it again restores the full list.
- [x] The severity filter and "Hide low confidence" combine (both conditions apply) — covered by
      a component test; no real run so far had a finding below 0.65 to show it in the browser.
- [x] The active level is highlighted with its `SEV` colour; the other two are dimmed.
- [x] Clicking a counter sends no network request.
- [x] Tests: client (`FindingsPanel.test.tsx` — counts, filter, toggle combo, empty state, SEV
      highlight, sync after accept/dismiss refetch, no fetch) ✔ · `pnpm test` / `pnpm typecheck` ✔ ·
      server / reviewer-core / e2e untouched.
- [x] Manual check (2026-11-22, Claude in Chrome, `pnpm dev`): seed PR #482 run shows
      1 CRITICAL · 1 WARNING · 0 SUGGESTION; CRITICAL → WARNING → clear; the 0 level shows the empty
      state; no request to the API on counter clicks. Demo PR `inc198107/dev-digest#5`: with the
      WARNING filter on, Accept → `POST /findings/:id/accept` + `GET /pulls/:id/reviews`, the filter
      stays and the counter still matches the list.

## Open questions
- None blocking.
