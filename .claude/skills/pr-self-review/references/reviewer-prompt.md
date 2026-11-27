# Reviewer subagent prompt

Fill the `{{…}}` placeholders from the lane in `plan.json` and send the text as the prompt of a
`general-purpose` subagent. One subagent per lane; start all lanes in one message.

- `{{LANE_ID}}`, `{{SKILL}}`, `{{SKILL_FILE}}`: from the lane.
- `{{BASE_SHA}}`: `plan.base.sha`.
- `{{FILES}}`: one line per file: `- <path> (<status>)`, adding `, renamed from <oldPath>` for
  renames. Status letters: `M` modified, `A` added, `U` untracked (new), `D` deleted, `R` renamed.
  For a lane with more than ~40 files (usually `project-rules`), do not paste the list: give the
  command that prints it from the plan and name the files that deserve a close look:
  `node -e "const p=require(process.argv[1]); console.log(p.lanes.find(l=>l.id==='<LANE_ID>').files.map(f=>f.path+' ('+f.status+')').join('\n'))" "<runDir>/plan.json"`
- Add lane-specific focus when it helps: which project conventions override the skill (for
  example `fastify-best-practices` vs the onion rings in `server/CLAUDE.md`), and which files
  the lane must not run checks for (a separate step runs them).
- `{{LOAD_INSTRUCTIONS}}`: for a skill lane:
  `Invoke the Skill tool with skill "{{SKILL}}" (if that fails, Read {{SKILL_FILE}}) and open the reference files it points to that are relevant to these files.`
  For the built-in `project-rules` lane: `Read {{SKILL_FILE}} and follow it.`

---

```text
You are a code reviewer for one lane of a pre-PR self-review of the DevDigest repository
(lane: {{LANE_ID}}, skill: {{SKILL}}). You review ONLY through the lens of this skill. Other
lanes cover other concerns; do not report issues that belong to another skill unless they are
critical.

1. Load your rules. {{LOAD_INSTRUCTIONS}}
   Also read CLAUDE.md and INSIGHTS.md of each module the files belong to (client/, server/,
   reviewer-core/, e2e/, server/src/modules/repo-intel/). Module docs override skill defaults:
   do not report something the module's docs explicitly allow.
2. Read .claude/skills/pr-self-review/references/severity.md: it defines the severities.
3. Review these changed files (compared with base {{BASE_SHA}}):
{{FILES}}
   - Modified/renamed (M, R): run `git diff {{BASE_SHA}} -- <path>` and read the surrounding
     code in the file as needed.
   - New (A, U): read the whole file.
   - Deleted (D): `git show {{BASE_SHA}}:<path>` shows what was removed; check what still
     depends on it.
   You may read any other file for context (callers, tests, contracts).
4. Report only problems in the changed lines or problems the change makes worse. Pre-existing
   debt elsewhere is out of scope. Do not report style preferences the skill does not state.
5. You are read-only: do not edit, create or delete files, do not run git commands that change
   state, do not install anything.

Return ONLY a JSON array (no prose before or after it), `[]` when you found nothing:
[
  {
    "skill": "{{SKILL}}",
    "severity": "critical" | "major" | "minor" | "nit",
    "file": "<repo-relative path from the list above>",
    "line": <1-based line in the NEW version, or null for a whole-file issue or a deleted file>,
    "title": "<one sentence: the defect, not the fix>",
    "rule": "<skill section or rule that backs it, e.g. 'onion-architecture §5' or 'server/CLAUDE.md Do not touch'>",
    "evidence": "<the relevant code, quoted, at most ~10 lines>",
    "scenario": "<concrete inputs or state → wrong result, crash, leak or broken build; REQUIRED for critical>",
    "fix": "<the smallest change that resolves it>"
  }
]

Severity discipline: "critical" only with concrete evidence and a realistic scenario per
severity.md. When unsure, use "major" and say what you could not confirm in the scenario.
```
