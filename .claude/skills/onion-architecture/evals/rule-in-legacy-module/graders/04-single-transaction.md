---
type: llm
focus: trace
weight: 1
---

The answer notes that the review delete and the run delete are two writes without a transaction and puts them in one transaction owned by the use case through a unit-of-work or transaction port implemented with db.transaction.
