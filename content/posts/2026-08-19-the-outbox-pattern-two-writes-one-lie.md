---
title: "📤 The Outbox Pattern: Two Writes, One Lie"
date: "2026-08-19"
excerpt: "Your database commit succeeded. Your Kafka publish failed. Now what? The transactional outbox pattern fixes the dual-write problem that every 'just publish an event after saving' tutorial conveniently skips."
tags: ["backend", "messaging", "distributed-systems", "databases", "architecture"]
featured: true
---

Here's a piece of code that looks completely reasonable and is quietly a ticking time bomb:

```javascript
async function placeOrder(order) {
  await db.orders.insert(order);        // ✅ committed
  await kafka.publish('orders.created', order); // 💥 network blip
}
```

The database write succeeds. The Kafka publish throws because a pod restarted, or the broker had a two-second hiccup, or someone sneezed near a network cable. Your order exists. Nobody downstream — billing, shipping, the warehouse — ever finds out. The order just sits there, alive in your database and dead to the rest of your system.

This is the **dual-write problem**, and it's one of those bugs that doesn't show up in a demo, doesn't show up in staging, and then shows up at 2am three weeks after launch when finance asks why 40 orders never got invoiced.

## Why "just add a retry" doesn't save you

The instinctive fix is to wrap the publish in a retry loop, or flip the order — publish first, then write to the DB. Neither actually closes the gap:

- **Retry the publish**: what if the process crashes *between* the DB commit and the retry loop finishing? You're back to square one, just with better odds.
- **Publish first, write DB second**: now you can tell the world about an order that never actually got saved, which is arguably worse — downstream systems start acting on something that doesn't exist.

The real issue is that you have two separate systems — a database and a message broker — and no way to commit to both atomically. Distributed transactions (2PC) exist on paper, but Kafka doesn't speak XA, and even if it did, you don't actually want your order-placement latency held hostage by a coordinator waiting on a broker ack.

## The trick: only ever write to one system

The transactional outbox pattern sidesteps the whole problem by refusing to do two writes to two systems. Instead, you do **one write to one system** — your database — and let something else worry about the broker.

You add an `outbox` table, and the event you wanted to publish gets inserted into it in the *same transaction* as the business write:

```sql
BEGIN;

INSERT INTO orders (id, customer_id, total_cents, status)
VALUES ('ord_8f2a', 'cust_991', 4599, 'placed');

INSERT INTO outbox (id, aggregate_id, event_type, payload, created_at)
VALUES (
  gen_random_uuid(),
  'ord_8f2a',
  'orders.created',
  '{"orderId":"ord_8f2a","total":4599}',
  now()
);

COMMIT;
```

Because both inserts are in the same ACID transaction, there's no window where one happens without the other. Either the order and its event both exist, or neither does. The database's own transaction guarantee — the thing it's already good at — is doing the heavy lifting instead of a fragile handshake between two unrelated systems.

## Getting the event out of the table and onto the bus

Now you need something to drain that outbox table into Kafka (or SQS, or whatever). Two common approaches:

**Polling publisher** — a background worker queries for unpublished rows every second or so and pushes them:

```javascript
async function drainOutbox() {
  const rows = await db.query(
    `SELECT * FROM outbox WHERE published_at IS NULL
     ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`
  );

  for (const row of rows) {
    await kafka.publish(row.event_type, row.payload);
    await db.query(
      `UPDATE outbox SET published_at = now() WHERE id = $1`,
      [row.id]
    );
  }
}
```

That `FOR UPDATE SKIP LOCKED` matters the moment you scale past one worker — it stops two publisher instances from grabbing and double-publishing the same row.

**Log-tailing (CDC)** — instead of polling, something like Debezium reads the database's write-ahead log directly and streams outbox inserts to Kafka as they're committed. No polling delay, no extra query load on the primary. It's the more "correct" version of this pattern at scale, but it's also another moving piece to operate — worth it once polling latency or DB load actually becomes a problem, not before.

Either way, you've traded "publish might silently vanish" for "publish might be a little late, but it *will* happen" — which is exactly the guarantee you actually wanted.

## The fine print: at-least-once, not exactly-once

The outbox pattern gives you reliable delivery, not exactly-once delivery. If the publisher crashes after the Kafka ack but before marking the row `published_at`, that event goes out again on restart. Your consumers still need to be idempotent — check an event ID against what they've already processed, same as you'd do anyway for any at-least-once system. The outbox solves "did the event get sent," not "did the event get sent exactly once." Don't let it lull you into skipping idempotency on the consumer side.

We use this pattern for order and payment events on my team at Cubet Techno Labs, and the appeal isn't cleverness — it's that the failure mode disappears. Before the outbox table, "the event never fired" was a real incident category. After, it isn't, because there's nothing left that can independently fail; there's one transaction, and either it happened or it didn't.

## Try it before you need it

If you've got a service that writes to a database and then fires an event, go find that code path right now and ask: what happens if the process dies on the line *between* those two calls? If the honest answer is "the event just... doesn't happen," that's your outbox table waiting to be built. Add it before the missing-event bug finds you instead of the other way around.
