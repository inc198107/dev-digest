---
name: flaky-test-patterns
description: Flag tests that depend on real time, sleeps, randomness, the network, shared state or execution order.
type: custom
metadata:
  version: "1.0.0"
---

# Flaky test patterns

A test is flaky when it can pass and fail on the same code. Look at every test the diff adds
or changes and flag the patterns below.

## Flag
- Real time: `Date.now()`, `new Date()`, timers or time zones without a fake clock
  (`vi.useFakeTimers()`, an injected `now`).
- Sleeps and fixed-delay polling (`setTimeout`, `await sleep(500)`) instead of awaiting the
  event or the promise itself.
- Randomness without a seed: `Math.random()`, random ids or ports that an assertion depends on.
- Real network or shared services: HTTP calls, DNS, a shared database without isolation.
- Shared mutable state between tests: module-level variables, singletons, leftovers without
  cleanup in `afterEach`.
- Order dependence: a test that relies on data another test created; `.only` or `.skip` left
  behind.
- Assertions on unordered data (object key order, `Promise.all` timing, `Set` iteration) as
  if it were ordered.

## Reporting
- Cite the test lines and name the run condition that makes the test fail: a slow CI
  machine, another time zone, parallel workers.
- Severity: WARNING; SUGGESTION when the risk is only theoretical.
- Category: `test`. Suggest the deterministic replacement.

## Not part of the skill
`references/patterns.md` holds longer examples and `scripts/detect-flaky.sh` a helper for
humans. DevDigest imports only this file: the rest of the package is listed in the preview
and never read or run.
