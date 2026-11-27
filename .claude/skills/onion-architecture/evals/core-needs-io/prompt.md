---
tags: [onion-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

I want the review engine in reviewer-core to also see the full contents of each changed file (not just the diff hunks), capped at 400 lines per file, so the model has more context. The files are in the repo clone that the server already has on disk. How should this be implemented across reviewer-core and server? Plan only: which files change and what goes where.
