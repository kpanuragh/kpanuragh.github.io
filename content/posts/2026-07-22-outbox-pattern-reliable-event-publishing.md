---
title: "📬 The Outbox Pattern: How to Stop Lying to Your Message Broker"
date: "2026-07-22"
excerpt: "You write to the database, then publish an event. What happens when the process dies between those two lines? The outbox pattern is the boring, reliable answer to a problem every event-driven system eventually hits."
tags: ["backend", "messaging", "distributed-systems", "databases", "architecture"]
featured: true
---

Here's a bug that doesn't show up in your happy-path tests, doesn't show up in staging, and doesn't show up in the demo you gave to leadership. It shows up three weeks into production, when a pod gets OOM-killed at exactly the wrong millisecond, and suddenly a customer's order exists in the database but no "OrderCreated" event ever reached the message broker. Nobody gets notified. Inventory never reserves stock. The warehouse finds out when the customer calls asking where their package is.

The code that caused it looks completely reasonable:

```javascript
async function createOrder(orderData) {
  const order = await db.orders.insert(orderData);
  await messageBroker.publish('order.created', { orderId: order.id, ...orderData });
  return order;
}
```

Two operations, two different systems, one line apart. Your database and your message broker do not share a transaction. If the process crashes, the network blips, or the broker is momentarily unreachable right after the `insert` commits, you've written the order and silently dropped the event. Nothing throws. Nothing logs an error. The system just quietly disagrees with itself.

## Dual writes: the trap that looks like it isn't one

This is called the "dual write" problem, and it's sneaky because both orderings of the two calls are wrong in different ways:

- **DB first, then publish** (the code above): if publish fails after the DB commit, the event is lost forever. The order exists, nobody downstream knows.
- **Publish first, then DB**: if the DB insert fails after the event goes out, you've told the world about an order that doesn't exist. Now inventory reserves stock for a phantom order.

You can't wrap a database commit and a Kafka/RabbitMQ publish in the same ACID transaction — they're different systems with different consistency models. Distributed transactions (2PC) technically exist, but brokers mostly don't support them well, and even when they do, you've just reintroduced the "everyone blocks on a coordinator" problem that got everyone excited about message queues in the first place.

## The outbox pattern: write the event to the same database, same transaction

The trick is almost embarrassingly simple once you see it: don't publish to the broker directly. Instead, write the event as a row in an `outbox` table, in the **same local transaction** as the business data. A separate process then reads that table and relays events to the broker, at its own pace, with retries.

```sql
BEGIN;
  INSERT INTO orders (id, customer_id, total) VALUES ($1, $2, $3);
  INSERT INTO outbox (id, aggregate_id, event_type, payload, created_at)
  VALUES (gen_random_uuid(), $1, 'order.created', $4, now());
COMMIT;
```

Both inserts live or die together — that's a guarantee your database already gives you for free, no new infrastructure required. The order and the fact that an event needs to be sent are now atomically consistent. You've moved the hard problem (cross-system atomicity) into a problem you already know how to solve (single-database atomicity).

The relay side is a separate worker — a polling loop, or better, a **change data capture (CDC)** process like Debezium tailing the database's write-ahead log:

```javascript
async function relayOutboxEvents() {
  const events = await db.outbox.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  for (const event of events) {
    await messageBroker.publish(event.eventType, event.payload);
    await db.outbox.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
  }
}
```

If the relay crashes mid-batch, it just re-reads unpublished rows next cycle and tries again. Worst case, a consumer sees a duplicate event — which is why every consumer of outbox-relayed events needs to be idempotent (dedupe on event ID, upsert instead of insert, whatever fits). At-least-once delivery plus idempotent consumers is a far easier problem than exactly-once delivery across two systems, and it's the same trade every reliable messaging system makes under the hood.

## CDC vs. polling: pick based on how much lag you can tolerate

Polling the outbox table every second is simple to reason about and easy to debug — it's also extra read load on a table that's purely a delivery mechanism, and it adds up to a second of latency by design. CDC tools that tail the transaction log (Debezium + Kafka Connect is the usual pairing) get near-real-time delivery with zero polling overhead, but now you're operating another piece of infrastructure and learning its failure modes.

On my team at Cubet Techno Labs, we started with plain polling for a notifications service — it was one cron-style worker and a `WHERE published_at IS NULL` query, and it was good enough for months. We only reached for Debezium once event volume made polling latency actually matter for a downstream SLA. That ordering — start boring, upgrade when the numbers demand it — saved us from operating Kafka Connect for a problem that didn't need it yet.

## The part everyone forgets: cleaning up the outbox

An outbox table that only grows is a slow-motion disaster — reindex times creep up, and eventually a `SELECT * FROM outbox` for debugging takes down a connection pool. Once an event is published (and you're confident downstream consumers have had time to process it), archive or delete the row. A nightly job that purges `published_at < now() - interval '7 days'` is usually enough; keep a short retention window for replay/debugging, not forever.

## When you don't need this

If your "event" is really just "call this other internal service synchronously and you're fine waiting for the response," the outbox pattern is overkill — just make the call and handle the error. The pattern earns its keep specifically when you need **fire-and-forget, eventually-consistent notification of other systems**, and losing that notification silently is worse than the complexity of a relay process. Order confirmations, inventory updates, audit trails, search index updates — anywhere "the event arrives a little late" beats "the event never arrives."

If you've got a service writing to a database and separately publishing to a broker with no shared transaction, that's not a hypothetical bug — it's a bug on a timer, waiting for the one crash at the one bad moment. Go check. The fix is one extra table and a worker loop, and it's a lot cheaper to add now than to explain in a postmortem later.
