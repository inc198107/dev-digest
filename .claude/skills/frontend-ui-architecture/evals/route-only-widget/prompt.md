---
tags: [frontend-ui-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

In client/ I want to add a "Run timeline" block to the PR detail page (app/repos/[repoId]/pulls/[number]). It is only used on that page. It lists each review run with its duration formatted like "1m 32s" and loads the runs from the API. Don't write the code yet: tell me exactly which files to create or change and where each piece (component, data loading, duration formatting, labels, test) should live.
