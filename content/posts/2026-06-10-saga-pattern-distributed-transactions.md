---
title: "🎭 Sagas: Distributed Transactions Without the 2PC Nightmare"
date: 2026-06-10
excerpt: "Distributed transactions are where microservices go to cry. The saga pattern gives you eventual consistency without locking every service in a two-phase commit death grip — here's how it actually works."
tags: ["backend", "distributed-systems", "messaging", "saga-pattern", "microservices", "async-patterns"]
featured: true
---

Picture this: a customer places an order on your e-commerce platform. Your order service writes to its database. Your inventory service needs to reserve stock. Your payment service needs to charge a card. Your notification service needs to fire an email.

In a monolith, you'd wrap all of that in a single database transaction. Done. Clean. If anything fails, everything rolls back.

But you've got microservices now. Each service has its own database. And distributed transactions are where microservices go to cry.

## The Two-Phase Commit Trap

The "obvious" solution is two-phase commit (2PC). The coordinator asks every service: "can you commit?" Everyone says yes. Then the coordinator says: "okay, commit." Everyone commits.

Sounds fine until the coordinator crashes between "everyone said yes" and "okay, commit." Now you have three services that promised to commit, stuck waiting forever, holding locks, and your system is a museum exhibit of blocked connections.

2PC couples the availability of your entire transaction to the availability of every participant simultaneously. In a distributed system, that's a bet you will lose. And when you lose it, debugging why service B is holding a lock at 3 AM is not a good time.

There's a better way.

## Enter the Saga

A saga is a sequence of local transactions, each with a corresponding **compensating transaction** that undoes its work if something goes wrong later.

Instead of "all or nothing across all services simultaneously," you get "each step succeeds or we explicitly undo the steps that already ran." It's eventual consistency with a safety net.

The order flow becomes:
1. Order service: create order → success
2. Inventory service: reserve items → success
3. Payment service: charge card → **fails**
4. Inventory service: **release reserved items** (compensating transaction)
5. Order service: **cancel order** (compensating transaction)

No global lock. No coordinator holding everyone hostage. Each service owns its own rollback logic.

## Two Flavours: Choreography vs Orchestration

This is where teams fight in Slack.

**Choreography** means services react to events. The order service publishes `order.created`. The inventory service listens and publishes `stock.reserved`. The payment service listens and charges. If payment fails, it publishes `payment.failed`. The inventory service listens for that and releases the reservation.

```typescript
// Inventory service — choreography style
messageQueue.subscribe('order.created', async (event) => {
  const { orderId, items } = event;

  try {
    await db.reserveStock(items);
    await messageQueue.publish('stock.reserved', { orderId });
  } catch (err) {
    await messageQueue.publish('stock.reservation.failed', { orderId, reason: err.message });
  }
});

messageQueue.subscribe('payment.failed', async (event) => {
  const { orderId } = event;
  // Compensating transaction
  await db.releaseReservation(orderId);
  await messageQueue.publish('stock.released', { orderId });
});
```

Choreography is elegant. No central orchestrator means no single point of failure. But tracing what the hell happened to order #4821 requires joining logs across five services and a prayer. The business logic is smeared across every participant.

**Orchestration** puts a central coordinator (the saga orchestrator) in charge. It explicitly calls each service in sequence and decides what to do when something fails.

```typescript
// Saga orchestrator — explicit control flow
async function processOrderSaga(orderId: string) {
  const compensations: Array<() => Promise<void>> = [];

  try {
    await inventoryService.reserveStock(orderId);
    compensations.push(() => inventoryService.releaseStock(orderId));

    await paymentService.chargeCard(orderId);
    compensations.push(() => paymentService.refundCharge(orderId));

    await notificationService.sendConfirmation(orderId);
    // No compensation needed — a spurious email is acceptable

    await orderService.markComplete(orderId);
  } catch (err) {
    // Run compensations in reverse order
    for (const compensate of compensations.reverse()) {
      await compensate().catch(e => {
        // Log and alert — manual intervention may be needed
        logger.error('Compensation failed', { orderId, error: e });
      });
    }
    await orderService.markFailed(orderId, err.message);
    throw err;
  }
}
```

Orchestration is easier to reason about and easier to trace. The downside: the orchestrator becomes a bit of a god object that knows about everyone. In practice, for business-critical flows with more than 3–4 steps, orchestration is almost always easier to maintain.

At Cubet, we defaulted to choreography for simple event fans (publish an event, let subscribers do their thing) and orchestration for any saga that involved money or stock — anything where you'd want to read the logic in one place during an incident.

## The Tricky Bits Nobody Tells You

**Compensating transactions are not the same as rollbacks.** A rollback pretends something never happened. A compensation is a new action that acknowledges something happened and undoes its effects. You can't "unsend" an email, but you can send a follow-up cancellation. Design compensations to be realistic, not magical.

**Idempotency is non-negotiable.** Your orchestrator might retry a step after a timeout. The inventory service might receive `reserveStock` twice. Every step — and every compensation — must be safe to call multiple times without side effects. Use idempotency keys.

```typescript
await inventoryService.reserveStock({
  orderId,          // idempotency key
  items,
  requestId: ulid() // for deduplication at the service level
});
```

**Compensations can also fail.** This is the nightmare scenario. Payment succeeded, then inventory compensation fails. Now you have a charged card and no reserved stock. You need an alerting path for "saga stuck in partially-compensated state" — this is where a dead-letter queue and an ops dashboard earn their keep. Some teams call these "pending compensation" records and have a background job that retries them.

**Saga state must be persisted.** If the orchestrator crashes mid-saga, it needs to know where it left off. Persist saga state — which steps completed, which compensations ran — to a database before and after each step. Don't keep it only in memory.

## Choreography or Orchestration: Quick Rule of Thumb

| | Choreography | Orchestration |
|---|---|---|
| Logic location | Distributed across services | Central orchestrator |
| Traceability | Harder (span multiple services) | Easier (one place) |
| Coupling | Loose | Tighter (orchestrator knows all) |
| Good for | Simple fan-out events | Multi-step business transactions |

If you find yourself building a choreography-based saga and you've drawn an event flow diagram that looks like a bowl of spaghetti, just switch to orchestration. No shame.

## The Payoff

Sagas won't give you the serializability guarantees of a single database transaction. Concurrent sagas can produce temporary inconsistencies — briefly overselling inventory before a reservation saga completes, for example. That's the trade-off for availability and independence.

But for most real-world workflows, "eventually consistent, with explicit compensation" is absolutely good enough. E-commerce platforms have been running on it for years. It's honest about what distributed systems actually guarantee, rather than hiding the complexity behind a protocol that breaks badly in production.

Build the compensations. Persist your saga state. Make every step idempotent. Test the failure paths as hard as the happy path.

The 3 AM incident where the orchestrator logs show exactly which step failed and which compensations ran — that's the dividend.

---

**What's your saga setup?** Choreography purist, orchestrator enjoyer, or a mix? Drop it in the comments — I'm genuinely curious how teams draw the line.
