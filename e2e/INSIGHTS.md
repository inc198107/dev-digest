# e2e — Insights

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

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->
- 2026-11-27 · agent-browser 0.45 on Windows (`run.ts` `execFile`) · Run the suite with `AGENT_BROWSER_BIN="C:/Users/<you>/AppData/Roaming/npm/node_modules/agent-browser/bin/agent-browser-win32-x64.exe"` — `execFile("agent-browser")` cannot start the npm `.cmd` shim and every step fails with `spawn agent-browser ENOENT`; `agent-browser install` (Chrome for Testing 158, ~205 MB) is still needed once.
- 2026-11-27 · agent-browser 0.45 locators, specs 02/04/05/08 · Write `wait --text` against the rendered text and click only elements with a role: CSS `text-transform: uppercase` makes `wait --text Cost` fail on the `COST` header, and `find text "<PR title>" click` reports "No element found" on the non-semantic PR row `div`, while a `role=button` card (`SkillCard`) and `find role button click --name …` work. Flows 02/04/05 fail this way on a clean `HEAD` (76b40cf) too, so CI's unpinned `npm i -g agent-browser` breaks them as well.
- 2026-11-27 · Running one flow against the dev stack · `npm test` has no flow filter, so a single flow was run with a throwaway script that execs `agent-browser` per step; on Windows it needs `shell: true` (the CLI is a .cmd shim) AND each argument quoted (`JSON.stringify`) — unquoted, `wait --text "Type at least 2 characters"` was split into words and failed while other steps passed by accident. Skills flows do not depend on the first repo, so they are safe against the dev DB.

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->
- 2026-11-21 · scripts/e2e.sh · Check `e2e/node_modules` and a global `agent-browser` BEFORE running the script — it boots Postgres + API + web (~1 min) and only then runs `cd e2e && npm test`, which fails with `"tsx" is not recognized as an internal or external command` (garbled cp866 on a RU-locale console) when e2e deps are missing; fix: `cd e2e && npm install`, plus `npm i -g agent-browser && agent-browser install`.
- 2026-11-27 · `scripts/e2e.sh` while `./scripts/dev.sh` runs · Restart the dev web server (`next dev` :3000) after an e2e run — e2e.sh starts a second `next dev` in the same `client/` folder (shared `.next`), and afterwards :3000 served `200` pages whose route chunks were `404` (`/_next/static/chunks/app/agents/%5Bid%5D/page.js`), so pages stayed on their skeleton with no console error; touching the page file did not bring the chunk back.

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->
- 2026-11-27 · Skills Lab (spec `specs/skills.md`) · Added `08-skills` (skills grid → side preview → editor: linked agent + version history); it passes in `./scripts/e2e.sh` (5/8 overall, the 3 failures are the pre-existing agent-browser 0.45 issue above). The drawer's "Used by" link was not clickable via `find text` either, so the flow reaches the agent link from the editor text instead. (replaces 2026-11-27 Open Question: the flow was run this session)
- 2026-11-27 · `08-skills` · Added the Stats tab (subtitle text) and the community drawer (Add skill → "Search community skills…" → hint text, no query typed, so no GitHub call); 20/20 steps green against the dev stack.

## Open Questions
<!-- What is still unclear. -->
