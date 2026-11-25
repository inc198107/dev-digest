---
tags: [onion-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

In server/ I need a new "labels" feature: users can create, list, rename and delete labels for pull requests in their workspace, and a `POST /pulls/:id/labels/suggest` endpoint asks the LLM to suggest up to five labels for a PR from its title and description. Don't write the code yet: tell me exactly which files to create or change, what goes in each one, how the pieces are wired together, and how you would test it.
