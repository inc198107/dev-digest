# Flaky patterns and their fixes

Reference material for people. The import ignores this file: only `SKILL.md` becomes the skill.

| Flaky | Deterministic |
|---|---|
| `expect(token.expiresAt).toBe(Date.now() + 3600_000)` | `vi.useFakeTimers(); vi.setSystemTime(t0)` then compare with `t0 + 3600_000` |
| `await sleep(200); expect(queue.size).toBe(0)` | `await queue.onIdle(); expect(queue.size).toBe(0)` |
| `const id = Math.random().toString(36)` asserted on | inject an id generator and pass a fixed one |
| `fetch('https://api.example.com')` in a unit test | a fake of the owned HTTP port |
| `let cache = new Map()` at module level, no reset | create it in `beforeEach` |
| `expect(Object.keys(result)).toEqual(['a', 'b'])` | `expect(result).toEqual({ a: …, b: … })` |
