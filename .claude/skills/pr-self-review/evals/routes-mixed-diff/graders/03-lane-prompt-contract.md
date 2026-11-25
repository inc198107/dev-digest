---
type: llm
focus: trace
weight: 1
---

The written lane prompts tell the subagent to load its skill with the Skill tool (or read its SKILL.md), read the CLAUDE.md and INSIGHTS.md of the touched module, look only at `git diff d7d8216549eb0a82ac63016a0f9b83b84fbe819f -- <file>` (whole file for untracked/added files), stay read-only, and return a JSON array whose findings carry severity, file, line, title, scenario and fix, with "critical" reserved for proven defects per severity.md.
