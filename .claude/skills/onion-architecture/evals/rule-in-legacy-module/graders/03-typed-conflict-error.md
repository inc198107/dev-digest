---
type: llm
focus: trace
weight: 1
---

The 409 is produced by throwing a typed application error (an AppError subclass such as a new ConflictError) handled by the central error handler, not by calling reply.code(409) in the route.
