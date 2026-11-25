---
type: llm
focus: trace
weight: 1
---

The plan keeps reviewer-core free of filesystem, process.env and clone-path access; the file contents reach the engine as plain data through a new optional ReviewInput field.
