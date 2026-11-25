---
type: llm
focus: trace
weight: 1
---

The review replaces the ad-hoc reply.code(...).send(...) calls with typed application errors (such as NotFoundError or a domain-specific error) that the central error handler maps to HTTP.
