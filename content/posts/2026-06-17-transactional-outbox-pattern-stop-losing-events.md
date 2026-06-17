---
title: "The Transactional Outbox Pattern: Stop Losing Events When Your Service Crashes 📬"
date: "2026-06-17"
excerpt: "Every microservice eventually hits the dual-write problem — save to the DB and publish to a queue, hope both succeed. The transactional outbox pattern eliminates that hope and replaces it with a guarantee."
tags:
  - backend
  - messaging
  - distributed-systems
  - databases
  - event-driven
featured: true
---

Here's a scenario that has burned every engineer working with microservices at least once.

A user places an order. Your service:
1. Saves the order to the database ✅
2. Publishes an `order.placed` event to RabbitMQ / Kafka ❌ (broker blipped for 50ms)

The order exists. The downstream inventory service never heard about it. The user gets a confirmation email but the warehouse never picks the order. Support tickets flood in. Someone's Saturday is ruined.

Or the inverse: the event fires, but the DB transaction rolls back due to a constraint violation. Now your inventory service is decrementing stock for an order that doesn't exist. Fun times.

This is the **dual-write problem**, and it's a fundamental trap in distributed systems. You have two independent systems — a database and a message broker — and no way to update both atomically.

The good news: there's a clean, battle-tested solution called the **Transactional Outbox Pattern**. Let's break it down.

## The Core Idea

Instead of writing to the broker directly from your application code, you write the event into an **outbox table** in the *same database transaction* as your business data. A separate relay process then reads from that table and publishes to the broker.

```
Service → [ DB Transaction: order + outbox_event ] → Relay → Message Broker
```

The magic: because the outbox write happens inside the same ACID transaction, it either succeeds with your business data or rolls back with it. You've reduced a two-system problem to a one-system problem.

## Show Me the Code

Here's what this looks like in Node.js with PostgreSQL:

```typescript
// Inside your order service
async function placeOrder(orderData: OrderData): Promise<Order> {
  return db.transaction(async (trx) => {
    // 1. Insert the business data
    const order = await trx('orders').insert(orderData).returning('*');

    // 2. Insert the event into the outbox — same transaction
    await trx('outbox_events').insert({
      id: crypto.randomUUID(),
      aggregate_type: 'Order',
      aggregate_id: order[0].id,
      event_type: 'order.placed',
      payload: JSON.stringify(order[0]),
      created_at: new Date(),
      published: false,
    });

    return order[0];
  });
  // If either insert fails, both roll back. No split-brain state.
}
```

Your outbox table is just a regular table:

```sql
CREATE TABLE outbox_events (
  id          UUID PRIMARY KEY,
  aggregate_type VARCHAR(255) NOT NULL,
  aggregate_id   UUID NOT NULL,
  event_type     VARCHAR(255) NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published      BOOLEAN NOT NULL DEFAULT FALSE,
  published_at   TIMESTAMPTZ
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at)
  WHERE published = FALSE;
```

## The Relay: Closing the Loop

The outbox table is only half the pattern. You need a relay process — often called a **message relay** or **outbox poller** — that reads unpublished events and forwards them to the broker.

```typescript
async function relayOutboxEvents() {
  while (true) {
    const events = await db('outbox_events')
      .where({ published: false })
      .orderBy('created_at', 'asc')
      .limit(50)
      .forUpdate()       // pessimistic lock — prevents double-publish with multiple relay instances
      .skipLocked();     // skip rows locked by other relay pods

    if (events.length === 0) {
      await sleep(500);
      continue;
    }

    for (const event of events) {
      await broker.publish(event.event_type, event.payload);

      await db('outbox_events')
        .where({ id: event.id })
        .update({ published: true, published_at: new Date() });
    }
  }
}
```

The `FOR UPDATE SKIP LOCKED` trick is essential if you run multiple relay instances — each one grabs a different batch of rows, so you get parallelism without double-publishing.

## The Deduplication Catch

"But what if the relay crashes after publishing but before marking the event as published?"

Good instinct. The event will be published again on the next relay run. This means your consumers **will** see duplicate events occasionally. That's not a bug in the outbox pattern — it's a deliberate trade-off. The outbox gives you **at-least-once delivery**, not exactly-once.

The fix is idempotent consumers: each consumer tracks which event IDs it has already processed, usually in a `processed_events` table. If you've seen the ID, skip it. This is the standard contract in event-driven systems, and it's actually more robust than trying to guarantee exactly-once at the broker level.

## CDC: The Fancy Alternative

If polling feels too manual, look at **Change Data Capture (CDC)** via tools like [Debezium](https://debezium.io/). Instead of a poller, Debezium tails your database's write-ahead log (WAL in Postgres, binlog in MySQL) and streams every row change — including inserts into your outbox table — to Kafka.

```
Postgres WAL → Debezium → Kafka → Your consumers
```

At Cubet, we use this pattern for high-throughput services where polling latency (even 100ms) is unacceptable. The WAL gives you sub-second propagation, and Debezium handles all the messy offset tracking and exactly-once guarantees at the CDC layer.

The downside: CDC introduces infrastructure complexity (Kafka Connect, schema registry, connector config). For most teams, a simple poller is the right default — you can upgrade to CDC later if you need the throughput.

## When Should You Use This?

Use the outbox pattern whenever you have both of these:
- **A database write** that must be the source of truth
- **A downstream event** that other services depend on

Classic examples: order placed, user registered, payment captured, inventory reserved.

Skip it when you're doing fire-and-forget notifications where eventual inconsistency is acceptable (like analytics pings), or when you control both systems well enough to handle compensation logic directly.

## The Anti-Pattern to Avoid

The thing I see most often in codebases that *almost* implement this correctly: they write the event to the outbox in the same function, but *outside* the transaction.

```typescript
// WRONG — this is still a dual-write
const order = await db.transaction(async (trx) => {
  return trx('orders').insert(orderData).returning('*');
});

// This is outside the transaction — same problem as publishing directly
await db('outbox_events').insert({ ... });
```

The outbox insert must be **inside** `db.transaction(async (trx) => { ... })` and must use the transaction's `trx` handle. If it uses a separate connection, you lose the atomicity guarantee entirely.

## Wrapping Up

The dual-write problem is one of those distributed systems pitfalls that looks trivial until it bites you in production at 2am on a Friday. The transactional outbox pattern isn't glamorous — it's just a table and a poller — but it turns "hope both succeed" into an actual guarantee.

Your message broker can blip. Your relay can crash. Your Kafka partition can have a bad day. None of that matters, because your business data and your event are always consistent with each other. The relay will eventually catch up and deliver.

**Your action items:**
1. Find a service in your stack that writes to a DB and publishes an event in the same flow
2. Check if there's a transaction wrapping both — if not, that's your outbox candidate
3. Add the outbox table and a simple poller (50 lines of code, tops)
4. Validate idempotency on the consumer side

Start simple. You can always upgrade to CDC later. But fix the dual-write problem first — your future on-call self will thank you.
