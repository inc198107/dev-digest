---
type: llm
focus: trace
weight: 1
---

The use case (the reviews service method that deletes a run) loads the run through a port, applies the domain rule, and only then asks the repository to delete; the repository does not decide whether deletion is allowed.
