---
name: engineering-insights
description: Records a non-obvious engineering lesson into the INSIGHTS.md of the module being worked on (client, server, reviewer-core, e2e, server/src/modules/repo-intel). Use immediately when a fix needed more than one attempt, a library, tool or platform behaved unexpectedly, an approach proved a dead end, a recurring error was diagnosed, or an undocumented convention was found; and as a wrap-up at the end of any non-trivial task. Also use when the user says "remember this", "add to insights", "add to learnings", "запам'ятай" or "додай в інсайти".
argument-hint: "[lesson to record]"
---

# Engineering Insights

1. **Gate.** Record only what a cold agent would act on differently and what saves 5+ minutes next time. Skip what is obvious from the code, already in a CLAUDE.md / README / docs, generic knowledge, or a one-off. Not verified in this session → `Open Questions`, never `What Works`.
2. **Route.** Write to the `INSIGHTS.md` of the deepest module that owns the code the lesson is about (`server/src/modules/repo-intel/` before `server/`). A cross-module lesson goes into every module where an agent would need it.
3. **Section.** Use only the existing sections: What Works · What Doesn't Work · Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes · Session Notes · Open Questions.
4. **Format.** One line: `- YYYY-MM-DD · <file or area> · <imperative action> — <why / symptom>`, with exact names, versions, error text and numbers. If it needs a paragraph, it is documentation, not an insight.
5. **Read before writing.** The same lesson is already there → skip. It contradicts an existing entry → step 6.
6. **Stale entries.** Append by default. Rewrite or delete an existing entry only after verifying in this session that it is obsolete: the file / symbol / API it names is gone (grep), the dependency moved past the quirk (package.json, lockfile), or the problem no longer reproduces. Replace it in place with today's date and `(replaces <old date>: <evidence>)`. Cannot verify → keep it and add an Open Question naming both entries.
7. **Wrap-up.** At the end of a non-trivial task, review the whole session against the triggers in the description; trivial work (config tweaks, typos) gets nothing. Add one `Session Notes` line only if there was a problem, decision or discovery.
8. **Report.** List every added, replaced or deleted line (file → section, plus the evidence for step 6) so the user can spot-check. Do not commit. If a file now holds more than 200 entries, say that a cleanup or a split into `INSIGHTS-<domain>.md` is due.

When invoked with ARGUMENTS, they are the lesson to record: run them through steps 1–6. If they fail the gate, say why and ask the user for the concrete case (file, symptom, fix); do not go investigating the code to make one up.
