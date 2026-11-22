# Findings severity summary (PR list + Agent runs timeline)

**Status:** done
**Milestone:** L01 homework (M1 "severity filter on findings")
**Modules touched:** server · client (reviewer-core: none, typecheck only — it reads the server
shared contracts · e2e: none)

## Goal
Show how a review's findings split by severity wherever a review is summarised, and let the user
peek at the findings without opening the PR: severity icons with counts plus a details popover on
the Pull Requests list and on every Agent runs timeline card. The severity counter row inside an
expanded run (spec `client/specs/severity-counters.md`) is restyled as the design's chips.

Design: `DevDigest Design (standalone).html` → `screen_dashboard.jsx` `FindingsCell` (PR list
"Findings" column), `prdetail_runs.jsx` `RunFindings` + `FindingsTooltip` (timeline card),
`findings.jsx` `FindingsPanel` / `Chip` (counter chips). Reference video: homework page, P1
(`hw-1.mp4`, 2:30–3:05 timeline popover, 4:26–4:32 PR list column, 3:35 chips, 4:04 trace drawer).

## Scope
- In:
  - `PrMeta.findings` (counts + items of the latest review batch) on `GET /repos/:id/pulls`;
  - the PR list "Findings" column;
  - severity icons and the popover on timeline run cards;
  - chip styling of the in-run counters;
  - SEV colours in the run trace drawer's Findings section.
- Out:
  - findings of runs outside the latest batch on the PR list;
  - category filters (the design's "All categories" chip);
  - persisting the popover state;
  - changes to the trace drawer layout (it already matches the video).

## Contract changes
`@devdigest/shared` `platform.ts` (server and client copies, identical):
- `PrFindingItem = Finding.pick({ id, severity, category, title, file, start_line, end_line,
  confidence, rationale })`
- `PrFindingsSummary = { counts: { CRITICAL, WARNING, SUGGESTION: int ≥ 0 }, items: PrFindingItem[] }`
- `PrMeta.findings: PrFindingsSummary | null | undefined` — list endpoint only; `null` until a
  review batch has a finished run.

No DB migration, no new route.

## Behaviour
- **PR list.**
  - Findings = all findings of the `done` runs of the latest review batch, chosen with the same
    rule as the Cost column (`latestBatchRunIdsByPr` in `server/src/modules/pulls/cost.ts`).
  - PRs without a batched run (pre-0010 data, the seed review of #482) show "—"; a batch whose
    runs found nothing also shows "—".
  - Only non-zero levels are shown, in contract order, as icon + count in the level's `SEV` colour.
- **Timeline.**
  - A `done` run card shows its own findings, joined on the client from the already-loaded
    `GET /pulls/:id/reviews` by `run_id`. No extra request.
  - The icons are followed by "· N blockers" when the run has blockers.
  - A run whose review data is missing (deleted, failed) or empty keeps the "N finding(s)" text.
- **Popover.**
  - Opens on hover and on keyboard focus; a click pins it open (touch) and a second click,
    Escape or leaving the area closes it.
  - Clicks inside never reach the PR-list row (no navigation).
  - Header: "N findings in this run" / "N findings in the latest review".
  - Each item: severity badge, title, category, `file:line`, confidence, the first two lines of
    the rationale without markdown. The list scrolls past 300 px.
  - PR-list rows in the lower half open it upwards.
- **Counter chips.**
  - "icon count Label" (e.g. "1 Critical") in a bordered chip.
  - All three levels are shown, the zero level as "0 Suggestion" (homework P3 + design); the
    video's hiding of zero levels is not followed.
  - The active chip takes its `SEV` border, text and background; the others are dimmed.
  - A divider separates the chips from "Hide low confidence".
- **Trace drawer.** The Findings section takes its severity colours from `SEV`.

## Acceptance criteria
- [x] The PR list shows a Findings column with per-severity icons for reviewed PRs and "—" otherwise.
- [x] Hovering or clicking the icons shows the findings popover; clicking does not open the PR.
- [x] Each done timeline run card shows its severity icons; hover/click shows "N findings in this run".
- [x] The in-run counters render as chips per the design; filter behaviour unchanged.
- [x] The review-run header has a "trace" link that opens the run trace drawer (design screen).
- [x] The trace drawer colours findings from `SEV`.
- [x] Tests:
  - server-unit `pulls-findings.test.ts` (latest batch, counts, order, unknown severity) and
    `pulls-cost.test.ts` unchanged;
  - client `FindingsPeek`, `RunHistory`, `PRRow`, `FindingsPanel`, smoke gallery;
  - typecheck for server, client and reviewer-core.

  Results (2026-11-22):
  - server unit: 110 passed; the 6 known Windows `indexer-pipeline` failures are unrelated;
  - client: 46 passed;
  - all three typechecks clean.
- [x] Manual check (2026-11-22, Claude in Chrome, `pnpm dev`) on `inc198107/fullstack__CRM-test-prj` #1:
  - PR list: ▲1 in Findings; the popover opens on hover and on click, and the click stays on
    the list;
  - timeline: the popover shows "1 finding in this run";
  - Warning chip: active in `SEV` colours;
  - "trace" opens the drawer with the WARNING label in `SEV` orange;
  - no console warnings.

## Open questions
- None blocking.
