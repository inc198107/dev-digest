# client — Insights

> Lessons for this module, written via `/engineering-insights`. Read before working here.
> One entry = one actionable fact a cold reader can apply: `YYYY-MM-DD · area · what to do — why`.
> If it is obvious to anyone reading the code, do not write it. Add new entries; rewrite or delete
> an existing one only after verifying in the session that it is obsolete, and note the evidence.

## What Works
<!-- Approaches and solutions that worked here. -->

## What Doesn't Work
<!-- Dead ends and anti-patterns. The most skipped section and the most valuable one. -->

## Codebase Patterns
<!-- Conventions and architectural decisions not stated in CLAUDE.md or README.md. -->
- 2026-11-22 · [number]/_components/SeverityCounters, `SeverityBadge` · Query severity labels in tests by their DOM text ("2 Critical", "Critical") — the upper case ("CRITICAL") is only CSS `textTransform`, so `getByText("CRITICAL")` / `{ name: "2 CRITICAL" }` find nothing.
- 2026-11-25 · src/vendor/shared · Mirror every change to `@devdigest/shared` in both copies (server/src/vendor/shared is canonical) — the onion PostToolUse hook and `check-shared-parity.mjs` fail on drift not recorded in `server/.shared-parity-known.json` (4 files already drift: `adapters.ts`, `contracts/{knowledge,eval-ci,productionize}.ts`); identical additions to both copies pass, and after syncing a drifted file refresh the baseline with `node .claude/skills/onion-architecture/scripts/check-shared-parity.mjs --update-baseline` — but only after removing drift: the refresh records *all* current drift, so check that `git diff server/.shared-parity-known.json` only deletes lines; a new entry needs the user's agreement.
- 2026-11-21 · [number]/_components/RunHistory/RunHistory.tsx, RunTraceDrawer/TraceBody · The "{tok} tok · $cost" timeline line (commit `58c6ac7`) and the COST trace stat (`d45ab0d`) were removed on purpose for the L01 lab — not regressions; `git show` those commits to see the removed markup.
- 2026-11-27 · skills/[id]/…/ConfigTab, agents/[id]/AgentEditor · Keep a form tab mounted under `<div hidden>`, resync it during render when the stored fields change (exact `sameForm`, not `version`, not the trimming `changedFields`) and merge per field (`mergeStored`: edited fields keep the draft, the rest take the stored value) — a version-keyed sync missed type-only saves, keeping the whole draft made a rename saved after a restore revert the restored body, and a trimmed comparison of stored values with trailing spaces would re-run `setState` on every render

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->
- 2026-11-21 · DevDigest Design (standalone).html · Decode the bundler manifest instead of grepping the HTML — screen code is gzip+base64 in `<script type="__bundler/manifest">` (grep "Duration" → 0 hits); in Python `gzip.decompress(base64.b64decode(entry['data']))`, plus `sys.stdout.reconfigure(encoding='utf-8')` since the console is cp1251 and `py -I` ignores PYTHONIOENCODING. Key files: screen_dashboard.jsx, prdetail_runs.jsx, screen_trace.jsx, primitives.jsx (CostBadge).
- 2026-11-22 · DevDigest Design (standalone).html in Claude in Chrome · To see a screen rendered, copy the file into the scratchpad and serve it with `py -I -m http.server 8765 --bind 127.0.0.1` — the extension refuses `file://` ("Can't interact with browser-internal or unparseable URLs"); then open one artboard full-screen by clicking the `.dc-expand` button of the `[data-dc-slot]` whose text matches its label (e.g. "PR Detail · Agent runs").
- 2026-11-27 · jsdom (vitest) drag and drop, `agents/[id]/…/SkillsTab` · Don't rely on `clientY` in `fireEvent.dragOver/drop` tests — jsdom has no `DragEvent`, so testing-library builds a plain `Event` and drops mouse coordinates (only `dataTransfer` is attached); the handler saw `clientY === undefined` and placed the row after the target. Make position logic tolerate a missing coordinate (`dropPosition` falls back to "before") and unit-test the geometry separately.
- 2026-11-27 · popover API, kit/SearchableSelect · Always set both `top` and `bottom` (one of them `"auto"`) in a popover's inline style — when the placement switched from `top` to `bottom`, React cleared inline `top`, the UA `[popover] { inset: 0 }` came back and the list stuck to the viewport top (top 0 instead of 6px above the trigger). In jsdom 25 there is no popover API and `el.matches(":popover-open")` throws "SyntaxError: unknown pseudo-class selector" (nwsapi) — guard with `typeof el.showPopover === "function"`.
- 2026-11-27 · Claude in Chrome · `resize_window` left `innerHeight` at 1311 (the window did not shrink) — to test near-bottom placement, push the element down with a temporary inline `marginTop` via `javascript_tool` and measure `getBoundingClientRect()` instead.

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->
- 2026-11-27 · src/vendor/ui/styles.css `.dd-select`, kit/SelectInput · Style the option list via `appearance: base-select` (`::picker(select)`, `option:hover`, `::checkmark`; works in Chrome 158 and survives the Tailwind/lightningcss prod build), keeping `color-scheme` in every `[data-theme]` block + the global `option` rule as the fallback — a classic `<select>` list is drawn by the OS: no row padding, a loud OS-accent hover, and a UA-white background under the dark theme's light `--text-primary` text (unreadable). The `base-select` picker renders in-page, so Claude in Chrome screenshots show it; the native list is checked only via `getComputedStyle(option)`. (replaces 2026-11-27 entry from this session: native-only advice superseded by the `base-select` styling)
- 2026-11-22 · `@devdigest/shared` runtime imports · Import only types from `@devdigest/shared` in client code (`import type …`); derive value lists with a typed literal such as `Record<Severity, true>` — a value import (`Severity.options`) made the Next dev build fail with "Module not found: Can't resolve './contracts/findings.js'" (the barrel uses `.js` specifiers) while `pnpm test` and `pnpm typecheck` both passed, so open the page in `pnpm dev` after touching shared imports.
- 2026-11-27 · kit/Modal, kit/SearchableSelect · A popup inside a `Modal` (its body is `overflow: auto`) is clipped at the footer and adds a body scrollbar when positioned `absolute` → render it as `popover="manual"` + `showPopover()` with `position: fixed` coordinates from the trigger rect, recomputed on `resize` and capture-phase `scroll`, as `SearchableSelect` does (also flips above when space below is short).

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->
- 2026-11-21 · run cost (M1) planning · Decided with user: cost on PR list (latest batch sum), on both the Agent runs Timeline and Review-runs accordion, and as a COST stat in the run drawer; reference-solution branches deliberately not consulted.
- 2026-11-22 · severity counters (L01 homework, spec `client/specs/severity-counters.md`) · Followed the homework criteria over the design's multi-toggle `Chip` row: one active level, highlighted with its own `SEV` colours; counts are taken after "Hide low confidence" so a counter equals the cards it reveals; `origin/feat/findings-by-severity` (reference solution) deliberately not consulted; this skill was run by the agent at wrap-up per CLAUDE.md, it did not fire on its own when the webpack error above was fixed.
- 2026-11-22 · findings severity summary (spec `specs/findings-severity-summary.md`) · The homework's P1 video (`hw-1.mp4`, embedded inside the first P1 criterion; the page screenshots are outdated) is the real reference: it shows the PR-list Findings column, timeline severity icons + hover popover and bordered counter chips, which the starter lacks on purpose — inspect it frame by frame by moving the `<video>` to `<body>`, setting `currentTime` via JS and screenshotting. It hides zero levels while P3 and the design show `0`; the approved plan follows design + P3 (show `0`).
- 2026-11-27 · Skills Lab (spec `specs/skills.md`) · Requirement said "grid of cards + side preview", the design shows list + tabbed editor: both were built — `/skills` is the card grid with a preview `Drawer`, `/skills/:id` mirrors the agent editor (Config · Preview · Versions; Evals/Stats out of scope). Nav now has a SKILLS LAB section (Skills, Agents). `Markdown` gained a `doc` mode (`.dd-md-doc` rules in `vendor/ui/styles.css`) because Tailwind preflight strips list bullets and heading sizes.

## Open Questions
<!-- What is still unclear. -->
