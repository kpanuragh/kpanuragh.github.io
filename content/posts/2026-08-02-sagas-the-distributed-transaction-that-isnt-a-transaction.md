---
title: "🧵 Sagas: The Distributed Transaction That Isn't a Transaction"
date: "2026-08-02"
excerpt: "You can't BEGIN/COMMIT across five microservices. The saga pattern is how you fake it anyway — with compensations instead of rollbacks and a lot of humility about what \"consistent\" actually means."
tags: ["architecture", "microservices", "distributed-systems", "node.js", "backend"]
featured: true
---

Here's a sentence that should terrify anyone who's shipped a checkout flow across microservices: there is no `ROLLBACK` for "the payment succeeded but the warehouse service is down."

In a monolith, this problem doesn't exist. You wrap `charge_card()`, `reserve_inventory()`, and `create_shipment()` in one database transaction, and if step three throws, the database quietly undoes steps one and two like they never happened. ACID gives you amnesia on demand.

Split those three steps into three services with three databases, and that safety net is gone. You can't take a distributed lock across Stripe's API, your inventory service's Postgres, and a shipping provider's REST endpoint and expect anyone to thank you for the latency. Two-phase commit exists on paper, but I've never seen it survive contact with a real production system with third-party dependencies — it wants every participant to vote and hold locks, and "the payments provider is temporarily unreachable" is not a vote, it's a hostage situation.

So instead of a transaction, you write a **saga**: a sequence of local transactions where each step publishes an event, and every step that can fail has a matching **compensating action** that undoes it — not by rewinding time, but by doing the opposite thing.

## What a saga actually looks like

Take the checkout example. As a saga, it's a chain of steps, each with a forward action and a compensation:

```js
const checkoutSaga = [
  {
    name: "reserveInventory",
    action: (ctx) => inventoryService.reserve(ctx.orderId, ctx.items),
    compensate: (ctx) => inventoryService.release(ctx.orderId, ctx.items),
  },
  {
    name: "chargePayment",
    action: (ctx) => paymentService.charge(ctx.orderId, ctx.amount),
    compensate: (ctx) => paymentService.refund(ctx.orderId, ctx.amount),
  },
  {
    name: "createShipment",
    action: (ctx) => shippingService.schedule(ctx.orderId, ctx.address),
    compensate: (ctx) => shippingService.cancel(ctx.orderId),
  },
];

async function runSaga(steps, ctx) {
  const completed = [];
  try {
    for (const step of steps) {
      await step.action(ctx);
      completed.push(step);
    }
  } catch (err) {
    for (const step of completed.reverse()) {
      await step.compensate(ctx).catch((compErr) => {
        // A failed compensation needs a human, not another retry loop
        alerting.page(`Compensation failed for ${step.name}`, compErr);
      });
    }
    throw err;
  }
}
```

If `createShipment` fails, the saga doesn't panic — it refunds the payment and releases the inventory, in reverse order. Nobody's card stays charged for a shipment that's never coming. That's the whole trick: you never get true atomicity, you get an aggressive, well-rehearsed apology.

## Orchestration vs. choreography

The version above is **orchestrated** — one piece of code, the saga runner, knows the whole sequence and calls each service directly. That's easy to reason about and easy to debug at 2am, because there's one place to look. Its downside is that the orchestrator becomes a soft coupling point: it has to know about every participant, which starts to smell like the monolith you were trying to get away from.

The alternative is **choreography**: each service listens for events and reacts on its own, with no central conductor.

```js
// inventory-service listens for order.created
eventBus.on("order.created", async (order) => {
  await reserveInventory(order);
  eventBus.emit("inventory.reserved", order);
});

// payment-service listens for inventory.reserved
eventBus.on("inventory.reserved", async (order) => {
  try {
    await chargeCard(order);
    eventBus.emit("payment.charged", order);
  } catch {
    eventBus.emit("inventory.release.requested", order);
  }
});
```

Choreography is more decoupled, which sounds great until you're six services deep trying to answer "wait, why did this order get cancelled?" by grepping through logs across five repos for a chain of events that happened in the wrong order because of a network blip. I've found choreography works well for two or three steps with a stable topology, and orchestration wins the moment the business logic ("skip shipping for digital goods," "retry payment once before compensating") gets branchy. On my team at Cubet, we ended up moving a choreographed refund flow back to an explicit orchestrator after the third incident where nobody could reconstruct the order of events from Kibana alone — the debuggability won out over the purity.

## The part everyone glosses over: compensations aren't rollbacks

A rollback undoes something that was never really visible to anyone else. A compensation undoes something the outside world may have already reacted to. If a customer got a "your order shipped!" email before the compensation for `createShipment` fires, refunding them silently is going to generate a very confused support ticket. Compensating actions need to be:

- **Idempotent** — the saga runner *will* retry a step after a crash, and you don't want to refund someone twice.
- **Semantically honest** — "cancel shipment" might mean "intercept the package" if it already left the warehouse, not just "delete a database row."
- **Always possible** — don't design a step whose compensation is "well, we can't actually undo this." If a step can't be compensated, it either needs to be last in the saga, or it needs a human-in-the-loop fallback instead of an automated one.

That last point is the real design work. Picking which steps go first (the easily-undoable ones) and which go last (the hard-to-undo ones, like "send the confirmation email" or "call the external, non-refundable API") matters more than the orchestration mechanics.

## When you don't need this at all

If your steps live in one service with one database, you don't need a saga — you need a transaction, and reaching for sagas anyway is how teams end up with distributed-systems complexity to solve a problem a `BEGIN/COMMIT` already solved. Sagas earn their keep specifically at the boundary between services that can't share a database, which is also a good gut-check for whether those services should've been split in the first place.

If you're building your first saga, don't start with choreography and five services. Start with an orchestrator, three steps, and compensations you've actually tested by killing the process mid-saga and watching it recover. Everything else is an optimization you can add once you've seen it fail once for real.
