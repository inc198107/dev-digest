---
type: llm
focus: trace
weight: 1
---

The server reads the files through a port (the existing GitClient port or a new port in @devdigest/shared implemented in src/adapters), obtained from the container, rather than with node:fs inside the module or service.
