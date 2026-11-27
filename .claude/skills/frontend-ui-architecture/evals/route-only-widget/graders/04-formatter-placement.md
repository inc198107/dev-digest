---
type: llm
focus: trace
weight: 1
---

The response either finds the existing formatSeconds helper in the sibling RunTraceDrawer folder and proposes promoting it to a shared location rather than importing the sibling's internal file, or keeps a new duration formatter in the component's own helpers.ts; it does not create a catch-all utils file.
