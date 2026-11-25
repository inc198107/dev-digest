---
tags: [frontend-ui-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

In client/ both the findings panel on the PR page and the diff viewer need a map from finding severity (CRITICAL, WARNING, SUGGESTION, INFO) to a colour. Where should this map live so both of them can use it? Just tell me the plan, don't edit anything.
