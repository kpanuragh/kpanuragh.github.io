---
title: "📬 The Outbox Pattern: Stop Losing Events When Your Message Broker Hiccups"
date: "2026-05-20"
excerpt: "You write to the database, then publish an event — and one of those silently fails. The Outbox pattern is the elegant fix that distributed systems engineers swear by."
tags:
  - backend
  - messaging
  - distributed-systems
  - databases
  - postgresql
  - architecture
featured: true
---

Picture this: a user places an order. Your API handler writes the order to PostgreSQL, then fires off an event to Kafka so the inventory service knows to decrement stock. Everything looks fine in the response. But Kafka was having a moment — a blip, a timeout, a "brief instability" your ops team will later describe as "minor." The order was saved. The event was never published. Now your inventory is out of sync, your warehouse ships a product you don't have, and you're explaining the situation to a very unhappy customer on a Monday morning.

This is the **dual-write problem**, and it's one of the sneakiest failure modes in distributed systems.

## The Dual-Write Trap

Whenever you need to write to a database *and* publish a message to an external system (Kafka, RabbitMQ, Redis Streams, SQS — pick your poison), you have two operations that each can fail independently. There's no magic "atomic transaction across two different systems" in most architectures.

Your options, ranked from bad to worse:

1. **Write DB first, then publish** — if the publish fails, your DB has data with no corresponding event.
2. **Publish first, then write DB** — if the write fails, you've published a ghost event for something that doesn't exist.
3. **Wrap it in a distributed transaction (2PC)** — technically correct, practically a nightmare; most message brokers don't even support it.

None of these options are great. But there's a pattern that sidesteps the whole mess elegantly: the **Outbox pattern**.

## Enter the Outbox

The core idea is beautifully simple: **treat event publishing as a database write**.

Instead of publishing directly to the broker, you insert the event into a special `outbox` table *in the same database transaction* as your business data write. A separate process (a "relay" or "dispatcher") then reads from that outbox table and publishes to the broker, marking rows as published after success.

Here's what that looks like in practice with Node.js and PostgreSQL:

```typescript
// Inside your order service — one atomic transaction
async function createOrder(orderData: OrderInput, client: PoolClient) {
  await client.query('BEGIN');

  try {
    const { rows } = await client.query(
      `INSERT INTO orders (user_id, total, status)
       VALUES ($1, $2, 'pending') RETURNING id`,
      [orderData.userId, orderData.total]
    );
    const orderId = rows[0].id;

    // Write the event to the outbox — same transaction, same atomicity guarantee
    await client.query(
      `INSERT INTO outbox_events (aggregate_id, event_type, payload, status)
       VALUES ($1, $2, $3, 'pending')`,
      [orderId, 'order.created', JSON.stringify({ orderId, ...orderData })]
    );

    await client.query('COMMIT');
    return orderId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}
```

The outbox table schema is straightforward:

```sql
CREATE TABLE outbox_events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT DEFAULT 'pending',  -- pending | published | failed
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events (status, created_at)
  WHERE status = 'pending';
```

Now the two writes — order + outbox event — are **atomic**. Either both succeed or both roll back. No partial states.

## The Relay: Polling vs. CDC

The relay process is what actually publishes events. There are two main approaches:

**Polling relay:** A cron job or background worker queries `outbox_events WHERE status = 'pending'`, publishes each one, then marks it `published`. Simple to implement, works everywhere, slight latency (seconds, not milliseconds).

**Change Data Capture (CDC):** Tools like [Debezium](https://debezium.io/) tail PostgreSQL's WAL (write-ahead log) and stream row changes directly to Kafka. Near-real-time, zero polling overhead, but more infrastructure complexity. This is what we use at Cubet on our higher-throughput services — once you're past a certain event volume, the polling approach starts to feel like checking your mailbox every 5 seconds.

For most teams starting out, a polling relay is the pragmatic choice. Here's a minimal version:

```typescript
async function processOutbox(kafkaProducer: Producer, db: Pool) {
  const { rows } = await db.query(
    `SELECT id, event_type, payload
     FROM outbox_events
     WHERE status = 'pending'
     ORDER BY created_at
     LIMIT 50
     FOR UPDATE SKIP LOCKED`  // critical: prevents concurrent workers from double-processing
  );

  for (const event of rows) {
    try {
      await kafkaProducer.send({
        topic: event.event_type,
        messages: [{ value: JSON.stringify(event.payload) }],
      });

      await db.query(
        `UPDATE outbox_events
         SET status = 'published', published_at = NOW()
         WHERE id = $1`,
        [event.id]
      );
    } catch (err) {
      console.error(`Failed to publish event ${event.id}:`, err);
      // Leave as 'pending' — it'll be retried on the next cycle
    }
  }
}
```

Notice `FOR UPDATE SKIP LOCKED` — that's the key to running multiple relay workers safely. Each worker locks the rows it's processing; other workers skip them rather than blocking or double-publishing.

## What You Get (and What You Don't)

**You get:**
- **At-least-once delivery** — events will eventually be published, even if your broker goes down for an hour.
- **No phantom events** — if the business transaction rolls back, the outbox row was never committed, so nothing gets published.
- **Debuggability** — the outbox table is a full audit trail. You can see exactly which events were published and when.

**You don't get:**
- **Exactly-once delivery** — the relay might publish a duplicate if it crashes after publishing but before marking the event as done. Consumers need to be idempotent (deduplicate by event ID). This is the companion pattern worth implementing alongside the outbox.
- **Zero latency** — there's always some lag between the business transaction and the event hitting the broker. For most async workflows, a few seconds is fine. If you need sub-100ms, CDC is your path.

## When to Reach for This Pattern

Use the Outbox pattern when:
- You write business data to a relational DB and need guaranteed event delivery to a broker.
- You've been burned by "the Kafka publish failed silently" incident more than once.
- Your downstream services are complaining about missing events they should have received.

Skip it when:
- Events don't need to be strongly correlated with a DB write (pure fire-and-forget telemetry is fine without it).
- You're already using an event-sourced architecture where the event log *is* the source of truth.

## The Takeaway

The Outbox pattern doesn't feel glamorous — it's just an extra table and a background worker. But it's one of those patterns that makes the difference between a distributed system that's eventually consistent versus one that's eventually *wrong*. Once you've debugged your third "why didn't the inventory service get notified?" ticket, you'll understand why engineers who've been around the block reach for this pattern almost reflexively.

Write the event to the database. Let the relay handle the rest. Sleep better.

---

*Have you shipped the Outbox pattern in production? Ran into fun edge cases with the relay? Drop a comment or find me on [Twitter/X](https://x.com/kpanuragh) — always up for a good distributed systems war story.*
