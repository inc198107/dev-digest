---
type: llm
focus: trace
weight: 1
---

The response loads the runs through a hook in src/lib/hooks (reusing or extending an existing one) and does not have the component call fetch or the API client directly.
