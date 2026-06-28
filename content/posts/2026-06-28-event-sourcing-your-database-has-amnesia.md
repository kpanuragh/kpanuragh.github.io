---
title: "🌊 Event Sourcing: Your Database Has Amnesia (Here's the Fix)"
date: "2026-06-28"
excerpt: "Most databases only store the current state — the last write wins and history vanishes. Event Sourcing flips this on its head: store what happened, derive what is. Here's how to apply it without drowning in ceremony."
tags: ["backend", "architecture", "event-sourcing", "databases", "distributed-systems"]
featured: true
---

Here's a scenario that should feel uncomfortably familiar: a customer emails support saying their order was charged twice. You open the `orders` table. The row says `status: completed`, `amount: 49.99`. It's been that way for three days. You look at the payment logs — nothing. The charge logs — gone after 48 hours. The audit trail your team "definitely planned to add" — somewhere on a Jira board in the backlog.

The bug existed. The evidence didn't survive. Your database has amnesia.

This is the exact problem Event Sourcing was built to solve.

## What's Actually Going On

In a traditional CRUD system, state is *overwritten*. You `UPDATE orders SET status = 'completed'`. The previous state — `status: pending`, `status: processing` — ceases to exist in the database. You've been running a system that actively destroys information.

Event Sourcing inverts this. Instead of storing the *current state*, you store the *sequence of events* that led to it. State becomes a *derived projection* of the event log — not the source of truth itself.

```
Event log:
  OrderPlaced    { orderId: "abc", amount: 49.99, at: T+0 }
  PaymentInitiated { orderId: "abc", at: T+1 }
  PaymentCharged { orderId: "abc", chargeId: "ch_1", at: T+2 }
  PaymentCharged { orderId: "abc", chargeId: "ch_2", at: T+3 }  ← double charge visible
  OrderCompleted { orderId: "abc", at: T+4 }

Current state (derived):
  { status: "completed", amount: 49.99 }
```

The bug is right there in the log, immortalized. You can replay the events, spot the duplicate `PaymentCharged`, and trace it to a network retry that fired twice. No Sherlock Holmes required.

## The Core Idea in Code

At its heart, Event Sourcing is about two things: **appending events** and **replaying them** to rebuild state.

```typescript
// The event store: an append-only log
interface DomainEvent {
  type: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

async function appendEvent(db: Pool, event: DomainEvent): Promise<void> {
  await db.query(
    `INSERT INTO events (type, aggregate_id, payload, occurred_at)
     VALUES ($1, $2, $3, $4)`,
    [event.type, event.aggregateId, JSON.stringify(event.payload), event.occurredAt]
  );
}

// Rebuild an order's current state from its event history
async function rehydrateOrder(db: Pool, orderId: string): Promise<Order> {
  const rows = await db.query(
    `SELECT type, payload FROM events
     WHERE aggregate_id = $1
     ORDER BY occurred_at ASC`,
    [orderId]
  );

  return rows.rows.reduce((state, row) => applyEvent(state, row.type, row.payload), initialOrderState());
}

function applyEvent(state: Order, type: string, payload: any): Order {
  switch (type) {
    case 'OrderPlaced':
      return { ...state, status: 'placed', amount: payload.amount };
    case 'PaymentCharged':
      return { ...state, charges: [...state.charges, payload.chargeId] };
    case 'OrderCompleted':
      return { ...state, status: 'completed' };
    default:
      return state;
  }
}
```

The `events` table is sacred — rows are **never updated, never deleted**. It's a ledger, not a whiteboard.

## Projections: The Read Side

Replaying events from the beginning every time you need to check an order's status would be slow as your log grows. This is where **projections** (or read models) come in.

A projection is a materialized view built by consuming your event stream. You run a background process that tails the event log and updates a fast, denormalized read table:

```typescript
// A projection worker: keeps `order_summaries` up to date
async function runProjection(db: Pool) {
  let lastProcessedId = await getCheckpoint(db, 'order_summary_projection');

  while (true) {
    const events = await db.query(
      `SELECT id, type, aggregate_id, payload FROM events
       WHERE id > $1 ORDER BY id ASC LIMIT 100`,
      [lastProcessedId]
    );

    for (const event of events.rows) {
      await applyToProjection(db, event);
      lastProcessedId = event.id;
    }

    await saveCheckpoint(db, 'order_summary_projection', lastProcessedId);
    if (events.rows.length < 100) await sleep(500); // caught up, slow poll
  }
}
```

Now your API reads from `order_summaries` (fast, indexed, pre-computed) while the source of truth remains the event log. This is also why Event Sourcing and CQRS are often mentioned together — they're natural partners. The write side emits events, the read side projects them.

## The Part No One Tells You

Event Sourcing is genuinely powerful, but it carries real costs that conference talks tend to skip:

**Schema evolution is painful.** Events are immutable. If `OrderPlaced` used to have `amount` but you renamed it to `totalAmount`, old events don't change. You need an *upcasting* layer that transforms old event shapes on the way out. Plan for this from day one or you'll have a migration mess six months in.

**Eventual consistency is the default.** Your projection worker runs asynchronously. A user places an order and immediately asks to view it — the projection might not have processed the event yet. You'll need to either accept that (most UIs can), use a short read-after-write trick, or query the event log directly for fresh data.

**Snapshots become necessary.** For long-lived aggregates with thousands of events (a shopping cart that's been open for weeks, a bank account over years), replaying from scratch is slow. Add periodic snapshots — a full state checkpoint — so rehydration only replays events since the last snapshot.

At Cubet, we introduced Event Sourcing for a financial reconciliation service where auditability was non-negotiable. The compliance team could replay *any* transaction from any point in time. It added complexity, but for that domain, it was the right trade. For a simple blog CMS? Total overkill.

## When to Actually Use It

Event Sourcing earns its keep when:

- **Audit trails are a first-class requirement** — finance, healthcare, legal, compliance.
- **You need temporal queries** — "what did this record look like on March 3rd at 14:22?"
- **Debugging history matters more than CRUD convenience** — complex workflows where "how did we get here?" is a frequent question.
- **You're building event-driven integrations** — your event log becomes a natural source for feeding other services without bolting on change-data-capture.

It's the wrong tool when:
- You have simple CRUD with no audit needs.
- Your team is small and the added operational complexity outweighs the benefits.
- You need strong consistency and can't tolerate projection lag.

## The Takeaway

Your database doesn't have to have amnesia. Event Sourcing is the architectural equivalent of replacing a whiteboard with a journal — you can still read the current state, but you never lose what led you there.

Start small: pick one domain with genuine audit requirements, append events to a single table, build one projection. You don't need Kafka, you don't need Event Store, you don't need a PhD in DDD. A Postgres table with `INSERT` rights and a background worker will take you surprisingly far.

Store what happened. Derive what is. Debug like you actually know what your system did.

---

*Working through a similar audit or event-sourcing migration? I'd love to hear what pain points you hit — drop a note or open a discussion.*
