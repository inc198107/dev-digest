# Before → after

Refactors of the common mistakes, in a neutral "room bookings" domain so the patterns transfer.
The full, real implementation of these patterns is `server/src/modules/agents/`.

## Contents

- [1. Fat route → thin route + use case + repository](#1-fat-route--thin-route--use-case--repository)
- [2. Service locator → narrow deps](#2-service-locator--narrow-deps)
- [3. Rule in the repository → domain function + unit of work](#3-rule-in-the-repository--domain-function--unit-of-work)
- [4. Row in the response → mapping + response schema](#4-row-in-the-response--mapping--response-schema)
- [5. External call inside a transaction → before/after, idempotent](#5-external-call-inside-a-transaction--beforeafter-idempotent)
- [6. Ambient clock → injected time](#6-ambient-clock--injected-time)
- [7. Adapter importing a module → config through the root](#7-adapter-importing-a-module--config-through-the-root)
- [8. vi.mock of a library → fake of your port](#8-vimock-of-a-library--fake-of-your-port)

## 1. Fat route → thin route + use case + repository

**Before** (`routes.ts` does everything):

```ts
app.post('/rooms/:id/bookings', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { from: string; to: string };
  const clash = await db.select().from(t.bookings)
    .where(and(eq(t.bookings.roomId, id), lt(t.bookings.from, body.to), gt(t.bookings.to, body.from)));
  if (clash.length) return reply.code(409).send({ error: 'taken' });
  const [row] = await db.insert(t.bookings).values({ roomId: id, ...body }).returning();
  return row;
});
```

**After**:

```ts
// domain.ts — pure
export function overlaps(a: Interval, b: Interval): boolean { return a.from < b.to && b.from < a.to; }

// ports.ts — core vocabulary
export interface BookingsStore {
  forRoom(workspaceId: string, roomId: string, window: Interval): Promise<Booking[]>;
  insert(workspaceId: string, booking: NewBooking): Promise<Booking>;
}
export interface BookingsUnitOfWork { run<T>(work: (store: BookingsStore) => Promise<T>): Promise<T>; }

// service.ts — orchestrates, owns the transaction
book(workspaceId: string, input: NewBooking): Promise<Booking> {
  return this.deps.uow.run(async (store) => {
    const existing = await store.forRoom(workspaceId, input.roomId, input);
    if (existing.some((b) => overlaps(b, input))) throw new ConflictError('Room already booked');
    return store.insert(workspaceId, input);
  });
}

// routes.ts — HTTP only
app.post('/rooms/:id/bookings',
  { schema: { params: IdParams, body: BookingBody, response: { 201: Booking } } },
  async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    reply.code(201);
    return bookings.book(workspaceId, { roomId: req.params.id, ...req.body });
  });
```

(`ConflictError` would be a new `AppError` subclass with code `conflict`; the global handler maps it.)

## 2. Service locator → narrow deps

**Before**:

```ts
export class BookingsService {
  private repo: BookingsRepository;
  constructor(private container: Container) { this.repo = new BookingsRepository(container.db); }
}
// test: (service as any).repo = fakeRepo;   ← patching a private field
```

**After**:

```ts
export interface BookingsServiceDeps { store: BookingsStore; uow: BookingsUnitOfWork; now: () => Date }
export class BookingsService { constructor(private readonly deps: BookingsServiceDeps) {} }

// routes.ts
const bookings = new BookingsService({
  store: container.bookingsRepo, uow: container.bookingsUow, now: () => new Date(),
});
```

The dependencies are visible in the type; the test passes fakes to the constructor.

## 3. Rule in the repository → domain function + unit of work

**Before** (the repository decides and writes twice without a transaction):

```ts
async cancel(id: string) {
  const [b] = await this.db.select().from(t.bookings).where(eq(t.bookings.id, id));
  const fee = b.from.getTime() - Date.now() < 24 * 3600e3 ? b.price * 0.5 : 0;   // business rule
  await this.db.update(t.bookings).set({ status: 'cancelled' }).where(eq(t.bookings.id, id));
  if (fee) await this.db.insert(t.charges).values({ bookingId: id, amount: fee });
}
```

**After**:

```ts
// domain.ts
export function cancellationFee(booking: Pick<Booking, 'from' | 'price'>, now: Date): number {
  return booking.from.getTime() - now.getTime() < LATE_CANCEL_MS ? booking.price * LATE_FEE_RATE : 0;
}

// service.ts
cancel(workspaceId: string, id: string) {
  return this.deps.uow.run(async (store) => {
    const booking = await store.get(workspaceId, id);
    if (!booking) throw new NotFoundError('Booking not found');
    const fee = cancellationFee(booking, this.deps.now());
    await store.markCancelled(workspaceId, id);
    if (fee > 0) await store.addCharge(workspaceId, id, fee);
  });
}
```

The repository keeps three dumb methods (`get`, `markCancelled`, `addCharge`); the rule gets
table-driven unit tests with fixed dates.

## 4. Row in the response → mapping + response schema

**Before**: `return row;` — every column, including `internal_notes` and `deleted_at`, reaches the
client, and the route's return type is the Drizzle row.

**After**:

```ts
// repository.ts
function toBooking(row: BookingRow): Booking {
  return { id: row.id, room_id: row.roomId, from: row.from.toISOString(), to: row.to.toISOString() };
}
// routes.ts
{ schema: { response: { 200: Booking } } }   // Booking: Zod contract in @devdigest/shared
```

## 5. External call inside a transaction → before/after, idempotent

**Before**:

```ts
await db.transaction(async (tx) => {
  await tx.update(t.bookings).set({ status: 'paid' }).where(eq(t.bookings.id, id));
  await stripe.paymentIntents.capture(intentId);     // network call holding locks; can't roll back
});
```

**After**:

```ts
// service.ts
async pay(workspaceId: string, id: string) {
  const booking = await this.deps.store.get(workspaceId, id);
  if (!booking) throw new NotFoundError('Booking not found');
  await this.deps.payments.capture({ intentId: booking.intentId, idempotencyKey: `booking:${id}` });
  await this.deps.store.markPaid(workspaceId, id);   // single statement; retry-safe thanks to the key
}
```

If the write fails after a successful capture, retrying the use case is safe because the gateway
call is idempotent. For multi-step flows, record the intent first (`status: 'capturing'`) and let a
JobRunner job reconcile.

## 6. Ambient clock → injected time

**Before**: `if (Date.now() > booking.to.getTime()) …` inside a use case: tests depend on the
real clock.

**After**: `const now = this.deps.now();` in the use case, `isOver(booking, now)` in the domain,
`now: () => new Date('2026-01-01T10:00:00Z')` in the test. The convention check flags the
"before" form in domain and application files.

## 7. Adapter importing a module → config through the root

**Before**:

```ts
// src/adapters/search/index.ts
import { MAX_RESULTS } from '../../modules/bookings/constants.js';   // adapter → module
```

**After**: the adapter takes `{ maxResults }` in its constructor; `platform/container.ts` passes
the value (from config or the port's defaults declared in `@devdigest/shared`). The adapter knows
nothing about modules.

## 8. vi.mock of a library → fake of your port

**Before**:

```ts
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));
vi.mock('../src/db/client.js', () => ({ db: { select: () => ({ from: () => ({ where: async () => [] }) }) } }));
```

The test asserts on the query builder's call chain and breaks on any query rewrite.

**After**:

```ts
class FakeBookingsStore implements BookingsStore {
  rows: (Booking & { workspaceId: string })[] = [];
  async forRoom(ws: string, roomId: string) { return this.rows.filter((r) => r.workspaceId === ws && r.room_id === roomId); }
  async insert(ws: string, b: NewBooking) { const row = { ...b, id: `b${this.rows.length + 1}`, workspaceId: ws }; this.rows.push(row); return row; }
}
const store = new FakeBookingsStore();
const service = new BookingsService({ store, uow: { run: (w) => w(store) }, now: () => fixedNow });
```

The real `BookingsRepository` gets a `*.it.test.ts` against Postgres, ideally sharing a contract
suite with the fake ([testing.md](testing.md#3-keep-fakes-honest-contract-tests)).
