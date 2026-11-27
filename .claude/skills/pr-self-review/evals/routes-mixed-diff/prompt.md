---
tags: [pr-self-review]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

I ran `/pr-self-review` and `plan.mjs` printed this (shortened). Don't run anything yet: tell me
exactly which subagents you will start and with which files, write out the full prompt for the
`onion-architecture` lane and for the `frontend-ui-architecture` lane, and tell me what you do
about anything else in this plan.

```json
{
  "runDir": "D:/repo/.git/pr-self-review/runs/20261125-101500-000",
  "branch": "feat/run-timeline",
  "base": { "ref": "origin/main", "sha": "d7d8216549eb0a82ac63016a0f9b83b84fbe819f" },
  "hooksInstalled": true,
  "counts": { "files": 6, "reviewed": 6, "lanes": 8, "checks": 5, "carried": 0 },
  "lanes": [
    { "id": "onion-architecture", "skill": "onion-architecture", "skillFile": ".claude/skills/onion-architecture/SKILL.md",
      "files": [ { "path": "server/src/modules/runs/routes.ts", "status": "A" }, { "path": "server/src/modules/runs/service.ts", "status": "U" } ] },
    { "id": "fastify-best-practices", "skill": "fastify-best-practices", "skillFile": ".claude/skills/fastify-best-practices/SKILL.md",
      "files": [ { "path": "server/src/modules/runs/routes.ts", "status": "A" } ] },
    { "id": "zod", "skill": "zod", "skillFile": ".claude/skills/zod/SKILL.md",
      "files": [ { "path": "server/src/vendor/shared/contracts/runs.ts", "status": "M" }, { "path": "client/src/vendor/shared/contracts/runs.ts", "status": "M" } ] },
    { "id": "frontend-ui-architecture", "skill": "frontend-ui-architecture", "skillFile": ".claude/skills/frontend-ui-architecture/SKILL.md",
      "files": [ { "path": "client/src/app/repos/[repoId]/runs/RunTimeline.tsx", "status": "U" }, { "path": "client/src/lib/hooks/useRuns.ts", "status": "M" } ] },
    { "id": "react-best-practices", "skill": "react-best-practices", "skillFile": ".claude/skills/react-best-practices/SKILL.md",
      "files": [ { "path": "client/src/app/repos/[repoId]/runs/RunTimeline.tsx", "status": "U" } ] },
    { "id": "next-best-practices", "skill": "next-best-practices", "skillFile": ".claude/skills/next-best-practices/SKILL.md",
      "files": [ { "path": "client/src/app/repos/[repoId]/runs/RunTimeline.tsx", "status": "U" } ] },
    { "id": "security", "skill": "security", "skillFile": ".claude/skills/security/SKILL.md",
      "files": [ { "path": "server/src/modules/runs/routes.ts", "status": "A" }, { "path": "server/src/modules/runs/service.ts", "status": "U" }, { "path": "client/src/app/repos/[repoId]/runs/RunTimeline.tsx", "status": "U" }, { "path": "client/src/lib/hooks/useRuns.ts", "status": "M" } ] },
    { "id": "project-rules", "skill": "project-rules", "source": "builtin", "skillFile": ".claude/skills/pr-self-review/references/project-rules.md",
      "files": [ { "path": "client/src/app/repos/[repoId]/runs/RunTimeline.tsx", "status": "U" }, { "path": "client/src/lib/hooks/useRuns.ts", "status": "M" }, { "path": "server/src/modules/runs/routes.ts", "status": "A" }, { "path": "server/src/modules/runs/service.ts", "status": "U" }, { "path": "server/src/vendor/shared/contracts/runs.ts", "status": "M" }, { "path": "client/src/vendor/shared/contracts/runs.ts", "status": "M" } ] }
  ],
  "checks": [ { "id": "onion-boundaries" }, { "id": "server-typecheck" }, { "id": "server-unit-tests" }, { "id": "client-typecheck" }, { "id": "client-unit-tests" } ],
  "unroutedSkills": [ { "name": "css-guide", "description": "Styling rules for the studio: CSSProperties objects in styles.ts, CSS variables only, no hard-coded colours. Use when writing or reviewing component styles." } ],
  "missingSkills": [],
  "uncoveredFiles": []
}
```
