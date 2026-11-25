---
type: llm
focus: trace
weight: 1
---

The plan wraps the new file contents with wrapUntrusted (or the existing untrusted-section mechanism) when assembling the prompt, and does not put them in the system message.
