---
type: llm
focus: trace
weight: 1
---

The label suggestion goes through the LLMProvider port obtained from the container (container.llm(...)) with a Zod schema for the structured output; the service never imports the openai SDK or reads an API key.
