---
type: llm
focus: trace
weight: 1
---

The planned service receives narrow dependencies (for example a labels repository port and an LLM port/provider) through its constructor; it does not take the whole Container and does not construct its own repository with new.
