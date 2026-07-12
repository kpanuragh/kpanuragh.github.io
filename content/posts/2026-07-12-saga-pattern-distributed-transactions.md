---
title: "🧵 The Saga Pattern: Distributed Transactions Without the Two-Phase Commit Hangover"
date: "2026-07-12"
excerpt: "Your monolith had ROLLBACK. Your microservices don't. The saga pattern is how you fake a distributed transaction using nothing but events, compensating actions, and the quiet acceptance that everything is eventually consistent."
tags: ["architecture", "microservices", "distributed-systems", "backend", "databases"]
featured: true
---

Here's a sentence that should terrify anyone who's split a monolith into services: "just roll it back." In a single database, that's one keyword. Across five services, each with its own database, "roll it back" means someone has to *remember* what happened, in what order, and undo it by hand — because there is no undo button for "I already called the payment gateway."

This is the moment every team rediscovers the same problem: two-phase commit doesn't scale to microservices, and pretending you don't need transactions at all just means you find out about the missing ones in production, at 2 a.m., via a very confused customer.

The saga pattern is the industry's answer. It's not magic. It's closer to "write your rollback logic by hand, and be honest about it up front" — which sounds worse than it is, and is genuinely one of the more elegant ideas in distributed systems once it clicks.

## The core idea: no global lock, just a chain of local transactions

A saga breaks one logical transaction into a sequence of local transactions, each owned by a single service. Every step either succeeds and triggers the next step, or fails and triggers a **compensating transaction** that undoes everything done so far — in reverse order.

Order checkout, the classic example:

1. Order service: create order (pending)
2. Payment service: charge card
3. Inventory service: reserve stock
4. Shipping service: schedule delivery

If step 3 fails because the warehouse is out of stock, you don't roll back a distributed transaction — there isn't one. You run compensations: refund the payment, then mark the order as failed. Nobody held a lock across four services while waiting for a warehouse API to respond. That's the whole point.

## Choreography vs. orchestration: pick your poison

There are two ways to wire this up, and the tradeoff is the same one you make everywhere in distributed systems: implicit and decoupled, or explicit and controllable.

**Choreography** — services react to each other's events with no central conductor:

```javascript
// payment-service listens for OrderCreated
eventBus.on('OrderCreated', async (order) => {
  try {
    await chargeCard(order.paymentInfo);
    eventBus.emit('PaymentCompleted', { orderId: order.id });
  } catch (err) {
    eventBus.emit('PaymentFailed', { orderId: order.id, reason: err.message });
  }
});

// inventory-service listens for PaymentCompleted, order-service listens for PaymentFailed
```

This is lovely until you have eight services all listening to each other's events, and debugging a failed order means grep-ing five codebases to reconstruct the sequence of what happened. Great for two or three steps. A nightmare past five.

**Orchestration** — a dedicated saga orchestrator owns the sequence explicitly:

```javascript
class OrderSagaOrchestrator {
  async run(order) {
    const completed = [];
    try {
      await paymentService.charge(order);      completed.push('payment');
      await inventoryService.reserve(order);    completed.push('inventory');
      await shippingService.schedule(order);    completed.push('shipping');
    } catch (err) {
      await this.compensate(completed, order);
      throw err;
    }
  }

  async compensate(completed, order) {
    if (completed.includes('inventory')) await inventoryService.release(order);
    if (completed.includes('payment'))   await paymentService.refund(order);
  }
}
```

The orchestrator is a single place to read the whole business process, log every state transition, and reason about failure. The tradeoff is that it becomes a thing you now maintain and, if you're not careful, a thing every service quietly depends on. Most teams that go with choreography at three services end up rewriting as orchestration at eight — plan for that instead of being surprised by it.

## The part nobody warns you about: compensations aren't rollbacks

This is where teams get hurt. A SQL `ROLLBACK` erases a transaction like it never happened. A compensating transaction cannot do that, because the world has already observed the intermediate state — an email went out, a warehouse worker already pulled the item off the shelf, a webhook already fired to a third party.

Compensations have to be **semantic undos**, not database undos. "Refund the payment" is not "delete the charge" — the charge happened, the customer's bank saw it, you're issuing a new transaction that reverses the effect. Compensations must also be idempotent, because in a system this failure-prone, you *will* run the same compensation twice when a retry races with a timeout.

At Cubet, we hit this exact issue on an order pipeline: a shipping compensation assumed "cancel the label" was symmetric with "create the label" — but the carrier's API had already dispatched a pickup request that couldn't be un-sent, only flagged. The fix wasn't code, it was admitting the compensation could only ever be "best effort" and building a manual-review queue for the cases it couldn't fully undo. That queue, not clever code, is what actually saved us.

## When you shouldn't bother

If your services share a database — or could, honestly, without violating any real boundary — use a real transaction. Sagas exist to solve a problem created by service boundaries; they are not a pattern to reach for by default. Introducing one to "future-proof" a two-table update across services you invented last sprint is pure ceremony.

The saga pattern earns its complexity when the alternative is worse: distributed locks that tie up resources across a network, or a monolith transaction spanning services that genuinely need independent deploys and scaling. If you're not there yet, you don't need it yet.

## Try this

Take one multi-step write in your system that currently spans two services with no compensation logic — an order, a signup flow, a provisioning step — and write down, on paper, what the compensating action for each step actually is. If you can't answer that question for even one step, you've found the failure mode your system already has, saga pattern or not. That gap is worth closing before you write a line of orchestrator code.
