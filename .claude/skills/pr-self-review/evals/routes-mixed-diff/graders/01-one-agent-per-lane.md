---
type: llm
focus: trace
weight: 1
---

The answer starts one subagent per lane listed in the plan (eight lanes, including the built-in project-rules lane), all in a single message so they run in parallel, and does not merge several skills into one subagent.
