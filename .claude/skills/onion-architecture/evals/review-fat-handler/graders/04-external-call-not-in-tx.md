---
type: llm
focus: trace
weight: 1
---

The review points out that the Stripe refund cannot be rolled back together with the database and handles it explicitly, for example by calling it outside the transaction with an idempotency key, or by recording the refund intent first.
