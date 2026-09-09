---
title: "🧵 The Saga Pattern: When ROLLBACK Isn't a Button You Get to Press"
date: "2026-09-09"
excerpt: "Distributed transactions don't get a ROLLBACK keyword. They get a saga: a chain of local transactions and compensations that undo damage after the fact, one apology at a time."
tags: ["backend", "microservices", "distributed-systems", "messaging", "architecture"]
featured: true
---

Every backend engineer has a moment where they try to wrap a multi-service operation in a transaction, out of pure muscle memory, and then remember there's no database connection spanning five microservices. There's no `BEGIN`. There's no `ROLLBACK`. There's just five services that each did their own thing, and now one of them failed, and everyone else is standing around holding a completed task with nowhere to return it.

That's the moment you discover the Saga pattern — not because it's elegant, but because it's the only honest answer to a question monoliths never had to ask: what do you do when "undo" isn't a real operation?

## The problem, in one order

Say you're building the checkout flow for an e-commerce platform — order service, payment service, inventory service, shipping service, each with its own database. A single "place order" action touches all four. In a monolith with one database, this is a single transaction: reserve stock, charge the card, create the shipment record, commit. If anything fails, `ROLLBACK` erases the whole attempt like it never happened.

Split those into services and that guarantee evaporates. You can't hold a transaction open across four network calls and three different databases — you'd be locking rows for the duration of a payment gateway round-trip, which is a great way to turn a 200ms checkout into a 30-second one, and an even better way to deadlock your whole platform during a traffic spike.

So instead of one big transaction, a saga breaks the operation into a sequence of small local transactions, each committed independently:

1. Order service creates the order (status: `pending`)
2. Inventory service reserves the stock
3. Payment service charges the card
4. Shipping service schedules a shipment

Each step commits for real. There's no keeping anything open and hoping. And that's exactly the problem — step 3 can fail *after* step 2 already committed. The stock is reserved in a database that has no idea payment just declined. Nobody's coming to clean that up unless you write the code that does.

## Compensation: the "undo" you have to build yourself

The saga's answer is compensating transactions — for every step that changes state, you write the operation that reverses it:

- Reserve stock → release stock
- Charge card → refund card
- Schedule shipment → cancel shipment

When a step fails, the saga runs the compensations for everything that already succeeded, in reverse order. It's not a true rollback — the reservation *did* happen, briefly, and now it's being un-happened after the fact. That distinction matters more than it sounds like it should. A compensation isn't guaranteed to erase every side effect (a "reservation confirmed" email may have already gone out), which is why sagas push you toward designing operations to be forgiving in the first place — reservations that expire, holds instead of hard debits, anything that gives you a cheap undo.

Here's what that looks like as an explicit, ordered list of steps with paired compensations — the shape most saga implementations converge on, orchestrated or not:

```javascript
const placeOrderSaga = [
  {
    name: 'reserveStock',
    action: (ctx) => inventoryService.reserve(ctx.orderId, ctx.items),
    compensate: (ctx) => inventoryService.release(ctx.orderId, ctx.items),
  },
  {
    name: 'chargePayment',
    action: (ctx) => paymentService.charge(ctx.orderId, ctx.amount),
    compensate: (ctx) => paymentService.refund(ctx.orderId, ctx.amount),
  },
  {
    name: 'scheduleShipment',
    action: (ctx) => shippingService.schedule(ctx.orderId, ctx.address),
    compensate: (ctx) => shippingService.cancel(ctx.orderId),
  },
];

async function runSaga(steps, ctx) {
  const completed = [];
  for (const step of steps) {
    try {
      await step.action(ctx);
      completed.push(step);
    } catch (err) {
      for (const done of completed.reverse()) {
        await done.compensate(ctx).catch((compErr) =>
          // A failed compensation is its own incident — log loudly, alert, don't swallow it
          alerting.critical(`Compensation failed: ${done.name}`, compErr)
        );
      }
      throw err;
    }
  }
}
```

That `compensate().catch()` is the part everyone glosses over in the diagrams. Forward progress can fail gracefully — you retry, you compensate, you move on. But if the *undo* fails, you don't have a fallback undo for your undo. That's when a saga stops being an elegant pattern and becomes a page to whoever's on call, with a manual reconciliation task attached.

## Orchestration vs. choreography

There are two ways to wire this up, and picking wrong is how you end up with a distributed system nobody can reason about.

**Orchestration** — a central coordinator (the code above is basically one) calls each service in order and decides what to do on failure. It's easy to follow, easy to test, and it's obvious where the saga's logic lives. The tradeoff is that the orchestrator becomes a service every other service depends on, and it needs to know about all of them.

**Choreography** — no coordinator. Each service reacts to events published by the previous one, typically over a message broker: `OrderCreated` triggers inventory, which publishes `StockReserved`, which triggers payment, and so on. Failures publish their own events — `PaymentFailed` — that upstream services subscribe to in order to run their own compensation. It scales better and keeps services decoupled, but the saga's logic is now smeared across every service's event handlers, and debugging "why didn't shipment get scheduled" means tracing a chain of pub/sub events instead of reading one function top to bottom.

On my team at Cubet Techno Labs, we lean toward orchestration for anything with more than three or four steps, purely because the alternative — reconstructing a saga's control flow from six services' worth of event handlers during an incident — is not something you want to do at 2 AM. Choreography earns its keep when the steps genuinely don't need to know about each other and you want services addable without touching a central coordinator.

## The step you can skip: idempotency

Sagas retry. Networks are unreliable, services time out, messages get redelivered. If `chargePayment` gets called twice because the orchestrator crashed and resumed mid-saga, you'd better not charge the card twice. Every action and every compensation in a saga needs to be idempotent — keyed by something like the order ID, so a duplicate call is a no-op rather than a double charge. This is not optional polish; it's the difference between a saga that survives a service restart and one that quietly duplicates side effects the first time your orchestrator gets rescheduled mid-flight.

## When not to bother

Sagas exist to solve a problem that only shows up once you've split state across service boundaries. If your data lives in one database, use a real transaction — it's simpler, it's actually atomic, and nobody has to write a `refund()` function. Reach for a saga when the write genuinely spans services you can't put in one transaction, not as a default architecture pattern because it sounds distributed-systems-y in a design doc.

If you're building a multi-step workflow across services right now, go find the step in it that's hardest to undo — the email that already sent, the webhook that already fired to a third party — and design the compensation for that one first. The rest of the saga is comparatively easy; that step is where the real design work is.
