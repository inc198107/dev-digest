---
tags: [frontend-ui-architecture]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

I'm starting a new Next.js 15 App Router app (TypeScript strict, TanStack Query 5, Zod) that talks to a separate REST backend. Before writing any code, lay out where each of these should go: the HTTP client, the fetchers and query keys for "projects", a "create project" mutation, the backend base URL and an internal API token, the Zod schemas and their TypeScript types, and the projects list page's filter/sort/page state.
