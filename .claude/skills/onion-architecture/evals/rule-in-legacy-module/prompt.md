---
tags: [onion-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

In server/src/modules/reviews, deleting an agent run (`DELETE` on a run) also deletes the review it produced; that happens in `deleteAgentRun` in `repository/run.repo.ts`. I need a new rule: a run that is still `running` must not be deletable (the API should answer 409 Conflict), while deleting a finished run keeps removing its review as today. Where should this logic live and what should the delete flow look like? Plan only, don't edit files.
