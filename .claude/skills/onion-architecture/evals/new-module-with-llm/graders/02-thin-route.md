---
type: llm
focus: trace
weight: 1
---

The planned routes.ts handlers only take Zod-typed params/body, resolve the request context (getContext), call one service method and return its result, declare a response schema, and contain no Drizzle queries or business rules.
