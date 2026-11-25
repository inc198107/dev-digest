---
type: llm
focus: trace
weight: 1
---

The test plan is split by ring: unit tests for the domain and service with hand-written fakes of the module's own ports (not vi.mock of drizzle-orm or openai), and a *.it.test.ts integration test for the repository or routes against real Postgres.
