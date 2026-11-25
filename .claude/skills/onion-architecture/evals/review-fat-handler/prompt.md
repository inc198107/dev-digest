---
tags: [onion-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We're adding an `orders` module to a Fastify 5 + Drizzle + Zod 3 backend (same stack and layout as server/ in this repo). A teammate opened a PR with this handler. Review it from an architecture point of view and tell me how it should be structured instead. Keep the scope to this endpoint.

```ts
// src/modules/orders/routes.ts
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import * as t from '../../db/schema.js';

export default async function orderRoutes(app: FastifyInstance) {
  app.post('/orders/:id/refund', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    const db = app.container.db;
    const [order] = await db.select().from(t.orders).where(eq(t.orders.id, id));
    if (!order) return reply.code(404).send({ error: 'not found' });
    if (order.status !== 'paid' || Date.now() - order.paidAt.getTime() > 30 * 864e5) {
      return reply.code(422).send({ error: 'not refundable' });
    }
    const stripe = new Stripe(process.env.STRIPE_KEY!);
    await stripe.refunds.create({ payment_intent: order.paymentIntentId });
    await db.delete(t.orderLines).where(eq(t.orderLines.orderId, id));
    await db.update(t.orders).set({ status: 'refunded', refundReason: reason }).where(eq(t.orders.id, id));
    return order;
  });
}
```
