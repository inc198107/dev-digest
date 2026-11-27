---
type: llm
focus: trace
weight: 1
---

The response flags STRIPE_SECRET_KEY as a secret that must not be in client-reachable constants and moves it to server-only code or a server-only env module.
