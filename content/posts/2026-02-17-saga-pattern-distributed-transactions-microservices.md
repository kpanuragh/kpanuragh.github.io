---
title: "The Saga Pattern: Because Distributed Transactions Are a Lie 🎭💥"
date: "2026-02-17"
excerpt: "You split your monolith into microservices. Everything was beautiful. Then a user's order went through, payment failed halfway, inventory was already decremented, and the shipping service already booked a courier. Welcome to distributed transaction hell. After 7 years of living in this nightmare, here's how the Saga Pattern saved my sanity!"
tags: ["architecture", "scalability", "system-design", "microservices", "distributed-systems"]
featured: true
---

# The Saga Pattern: Because Distributed Transactions Are a Lie 🎭💥

**Real confession:** When I first split our e-commerce monolith into microservices, I felt like a genius. Each service had its own database. Decoupled! Independent! Scalable! Beautiful!

Then a customer called. Their card was charged. Order was confirmed. But the warehouse never got the pick request. And inventory? Never decremented. We had sold a product we couldn't ship, charged the customer, and had no record of it in the warehouse system.

**Me at 11 PM:** "It'll be fine, I'll just wrap it in a transaction!"

**My senior engineer:** "Distributed transactions across separate databases. Go ahead. I'll wait."

**Me, Googling furiously:** "...okay, this is harder than I thought."

That's when I discovered the Saga Pattern - the only sane way to handle multi-step operations across microservices where each service has its own database. No global transactions. No fairy tales. Just sagas.

## The Problem: ACID in a Distributed World 🤔

In a monolith, transactions are easy:

```sql
BEGIN TRANSACTION;
  UPDATE inventory SET stock = stock - 1 WHERE product_id = 123;
  INSERT INTO orders (user_id, product_id, status) VALUES (456, 123, 'pending');
  INSERT INTO payments (order_id, amount, status) VALUES (999, 49.99, 'charged');
COMMIT; -- or ROLLBACK if anything fails
```

**Atomic. Consistent. Isolated. Durable.** If anything fails, everything rolls back. Database handles it. You sleep well.

In microservices:

```
Order Service DB    ←── MySQL
Inventory Service DB ←── PostgreSQL
Payment Service DB  ←── DynamoDB
Shipping Service DB ←── MongoDB
```

**There is no BEGIN TRANSACTION that spans all four databases.** It doesn't exist. And if someone tells you to use 2-Phase Commit (2PC)... I'm sorry for your latency numbers and your on-call schedule.

```
The 2PC Reality:
Step 1: Coordinator asks all services "can you commit?" (network call)
Step 2: All services respond "yes!" (network call)
Step 3: Coordinator says "commit!" (network call)
Step 4: All services confirm (network call)

What happens if coordinator crashes between step 2 and 3?
→ All services are LOCKED waiting forever
→ Your system is now frozen
→ Happy debugging at 3 AM! 🎉
```

**A scalability lesson that cost us:** We tried 2PC for a critical checkout flow. Average latency went from 200ms to 1.8 seconds because of the coordination overhead. And when our coordinator node had a network hiccup? Cascading timeouts across four services. We rolled it back in three hours.

## Enter the Saga Pattern 🎭

A saga breaks a distributed transaction into a **sequence of local transactions**, each in a single service. If any step fails, you run **compensating transactions** to undo the previous steps.

Think of it like a very organized heist movie:

```
The Heist Plan (Happy Path):
1. Crack safe → 2. Grab diamonds → 3. Start getaway car → 4. Cross border

The Abort Plan (When Things Go Wrong):
If getaway car fails → Put diamonds back → Seal safe → Walk away casually
```

No magic. No distributed locks. Just "if this fails, undo what we already did."

## Two Flavors: Choreography vs Orchestration 🎼

### Choreography Sagas (The Jazz Band)

Each service knows what to do and reacts to events. No conductor.

```
┌─────────────┐     order.created      ┌──────────────────┐
│ Order       │ ──────────────────────► │ Inventory        │
│ Service     │                         │ Service          │
└─────────────┘                         └──────────────────┘
                                                 │
                                    inventory.reserved
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │ Payment          │
                                        │ Service          │
                                        └──────────────────┘
                                                 │
                                      payment.processed
                                                 │
                                                 ▼
                                        ┌──────────────────┐
                                        │ Shipping         │
                                        │ Service          │
                                        └──────────────────┘
```

**Each service publishes events, others listen and react.**

```javascript
// Order Service
async function createOrder(userId, productId, quantity) {
  // Local transaction in Order Service DB
  const order = await db.transaction(async (trx) => {
    const order = await trx('orders').insert({
      user_id: userId,
      product_id: productId,
      quantity,
      status: 'pending'
    }).returning('*');

    return order[0];
  });

  // Publish event - let other services react
  await eventBus.publish('order.created', {
    orderId: order.id,
    userId,
    productId,
    quantity
  });

  return order;
}

// Inventory Service listens
eventBus.on('order.created', async (event) => {
  try {
    const reserved = await reserveInventory(event.productId, event.quantity);

    if (reserved) {
      // Success - trigger next step
      await eventBus.publish('inventory.reserved', {
        orderId: event.orderId,
        productId: event.productId
      });
    } else {
      // Compensation: tell order service to cancel
      await eventBus.publish('inventory.reservation.failed', {
        orderId: event.orderId,
        reason: 'Out of stock'
      });
    }
  } catch (err) {
    await eventBus.publish('inventory.reservation.failed', {
      orderId: event.orderId,
      reason: err.message
    });
  }
});

// Order Service listens to failure
eventBus.on('inventory.reservation.failed', async (event) => {
  // Compensating transaction: cancel the order
  await db('orders')
    .where({ id: event.orderId })
    .update({ status: 'cancelled', cancelled_reason: event.reason });

  // Notify customer
  await eventBus.publish('order.cancelled', {
    orderId: event.orderId,
    reason: event.reason
  });
});
```

**Why I love choreography:**
- ✅ No single point of failure
- ✅ Services are truly independent
- ✅ Easy to add new services without touching existing ones
- ✅ Scales naturally

**The catch:**
- ⚠️ Hard to track "where is my order right now?"
- ⚠️ Business logic is scattered across services
- ⚠️ Debugging a failed saga is like finding a ghost

### Orchestration Sagas (The Orchestra Conductor)

A central orchestrator tells each service what to do and what to undo.

```
                    ┌─────────────────┐
                    │    Saga         │
                    │  Orchestrator   │
                    └─────────────────┘
                     /    |    |    \
                    /     |    |     \
                   ▼      ▼    ▼      ▼
              Order  Inventory Payment Shipping
             Service  Service  Service  Service
```

```javascript
// Saga Orchestrator
class CheckoutSaga {
  constructor({ orderService, inventoryService, paymentService, shippingService }) {
    this.orderService = orderService;
    this.inventoryService = inventoryService;
    this.paymentService = paymentService;
    this.shippingService = shippingService;
  }

  async execute(userId, productId, quantity, paymentMethod) {
    const sagaState = {
      orderId: null,
      inventoryReserved: false,
      paymentCharged: false,
      shippingBooked: false,
      status: 'started'
    };

    try {
      // Step 1: Create Order
      console.log('Saga: Creating order...');
      const order = await this.orderService.create(userId, productId, quantity);
      sagaState.orderId = order.id;

      // Step 2: Reserve Inventory
      console.log('Saga: Reserving inventory...');
      await this.inventoryService.reserve(productId, quantity, order.id);
      sagaState.inventoryReserved = true;

      // Step 3: Charge Payment
      console.log('Saga: Charging payment...');
      await this.paymentService.charge(userId, order.total, paymentMethod, order.id);
      sagaState.paymentCharged = true;

      // Step 4: Book Shipping
      console.log('Saga: Booking shipping...');
      await this.shippingService.book(order.id, userId);
      sagaState.shippingBooked = true;

      // All steps succeeded!
      await this.orderService.confirm(order.id);
      sagaState.status = 'completed';

      console.log(`Saga completed successfully! Order: ${order.id}`);
      return { success: true, orderId: order.id };

    } catch (error) {
      console.error(`Saga failed at step: ${error.message}`);
      console.log('Starting compensation...');

      // Run compensating transactions in REVERSE ORDER
      await this.compensate(sagaState, error.message);

      return { success: false, error: error.message };
    }
  }

  async compensate(sagaState, reason) {
    // Undo in reverse order - skip steps that didn't run

    if (sagaState.shippingBooked) {
      try {
        console.log('Compensating: Cancelling shipping...');
        await this.shippingService.cancel(sagaState.orderId);
      } catch (err) {
        // Log but continue - must undo everything possible
        console.error('Failed to cancel shipping:', err.message);
        // Alert on-call engineer for manual intervention
        await alertOncall('Saga compensation failed: shipping cancel', sagaState);
      }
    }

    if (sagaState.paymentCharged) {
      try {
        console.log('Compensating: Refunding payment...');
        await this.paymentService.refund(sagaState.orderId);
      } catch (err) {
        console.error('Failed to refund payment:', err.message);
        await alertOncall('Saga compensation failed: payment refund', sagaState);
      }
    }

    if (sagaState.inventoryReserved) {
      try {
        console.log('Compensating: Releasing inventory...');
        await this.inventoryService.release(sagaState.orderId);
      } catch (err) {
        console.error('Failed to release inventory:', err.message);
        await alertOncall('Saga compensation failed: inventory release', sagaState);
      }
    }

    if (sagaState.orderId) {
      try {
        console.log('Compensating: Cancelling order...');
        await this.orderService.cancel(sagaState.orderId, reason);
      } catch (err) {
        console.error('Failed to cancel order:', err.message);
        await alertOncall('Saga compensation failed: order cancel', sagaState);
      }
    }

    console.log('Compensation complete.');
  }
}

// Usage
const checkout = new CheckoutSaga({
  orderService,
  inventoryService,
  paymentService,
  shippingService
});

app.post('/checkout', async (req, res) => {
  const result = await checkout.execute(
    req.user.id,
    req.body.productId,
    req.body.quantity,
    req.body.paymentMethod
  );

  if (result.success) {
    res.json({ orderId: result.orderId, message: 'Order placed!' });
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

**Why I love orchestration:**
- ✅ Single place to understand the full business flow
- ✅ Easy to add saga state tracking
- ✅ Easier to debug ("step 3 failed")
- ✅ Clear compensation logic

**The catch:**
- ⚠️ Orchestrator can become a bottleneck
- ⚠️ Creates coupling to orchestrator
- ⚠️ Single point of failure if orchestrator crashes mid-saga

## Making Sagas Durable: The State Machine Approach 🏗️

**The worst thing that can happen:** orchestrator crashes between step 2 and step 3. Payment charged. Shipping not booked. Orchestrator restarts. Has no idea what happened.

**Solution: Persist saga state to a database.**

```javascript
// Saga state stored in DB - survives crashes!
class DurableCheckoutSaga {
  async execute(sagaId, userId, productId, quantity) {
    // Load or create saga state
    let state = await db('sagas').where({ id: sagaId }).first();

    if (!state) {
      state = await db('sagas').insert({
        id: sagaId,
        type: 'checkout',
        status: 'started',
        context: JSON.stringify({ userId, productId, quantity }),
        current_step: 0,
        completed_steps: JSON.stringify([])
      }).returning('*')[0];
    }

    // Resume from where we left off!
    return await this.resumeSaga(state);
  }

  async resumeSaga(state) {
    const steps = ['createOrder', 'reserveInventory', 'chargePayment', 'bookShipping'];
    const context = JSON.parse(state.context);
    const completedSteps = JSON.parse(state.completed_steps);

    for (let i = state.current_step; i < steps.length; i++) {
      const stepName = steps[i];

      if (completedSteps.includes(stepName)) {
        console.log(`Skipping already completed step: ${stepName}`);
        continue;
      }

      try {
        console.log(`Executing step: ${stepName}`);
        const result = await this[stepName](context);

        // Persist step completion BEFORE moving to next
        context[`${stepName}Result`] = result;
        completedSteps.push(stepName);

        await db('sagas')
          .where({ id: state.id })
          .update({
            current_step: i + 1,
            completed_steps: JSON.stringify(completedSteps),
            context: JSON.stringify(context),
            updated_at: new Date()
          });

      } catch (error) {
        console.error(`Step ${stepName} failed:`, error.message);

        await db('sagas')
          .where({ id: state.id })
          .update({ status: 'compensating', failed_step: stepName });

        await this.compensate(state.id, completedSteps, context);
        return { success: false, error: error.message };
      }
    }

    await db('sagas').where({ id: state.id }).update({ status: 'completed' });
    return { success: true, orderId: context.createOrderResult.orderId };
  }
}
```

**This is exactly how AWS Step Functions works** - it persists state at each step transition, so if the orchestrator crashes, it just resumes from the last checkpoint. I switched from my hand-rolled solution to Step Functions for our most critical checkout saga.

## Idempotency: Because Networks Are Liars 🤥

**The silent killer:** A service receives a request, processes it, but the response gets lost on the network. The orchestrator retries. Now you've charged the customer TWICE.

```javascript
// Every service operation MUST be idempotent
async function chargePayment(orderId, amount, paymentMethod) {
  // Check if we already processed this
  const existing = await db('payments').where({ order_id: orderId }).first();

  if (existing) {
    console.log(`Payment for order ${orderId} already processed - returning existing result`);
    return existing; // Idempotent!
  }

  // First time - process for real
  const charge = await stripe.charges.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    source: paymentMethod,
    idempotency_key: `order-${orderId}` // Stripe-level idempotency too!
  });

  const payment = await db('payments').insert({
    order_id: orderId,
    stripe_charge_id: charge.id,
    amount,
    status: 'charged'
  }).returning('*');

  return payment[0];
}
```

**When designing our e-commerce backend**, I made every saga step idempotent from day one. When our event bus delivered duplicate events (it happens!), we processed them twice but charged customers zero times extra.

## Real Trade-offs: When NOT to Use Sagas 🎯

Sagas aren't free:

| | Traditional Transaction | Saga Pattern |
|---|---|---|
| Consistency | Strong (ACID) | Eventual |
| Complexity | Low | High |
| Performance | Medium (locking) | High |
| Debugging | Easy | Hard |
| Data integrity | Guaranteed | Best-effort + compensation |

**Use Sagas when:**
- ✅ You have multiple microservices with separate databases
- ✅ Operations span services that can't share a DB transaction
- ✅ You need high availability over strong consistency
- ✅ You can tolerate brief inconsistency windows

**Stick with ACID transactions when:**
- ❌ All data is in one database
- ❌ You're still on a monolith (please, don't over-engineer this)
- ❌ Your domain demands strong consistency (financial ledgers, healthcare records)
- ❌ Your team size doesn't justify the complexity

**As a Technical Lead, I've learned:** Most teams that reach for Sagas should still be on a monolith. Don't split your services until you have to. And when you do, Sagas will be there waiting for you.

## Common Saga Mistakes (I Made All of These) 🪤

**Mistake #1: No idempotency**
```
Retry message delivery → charge customer twice → angry customer, angry Stripe, angry boss
```

**Mistake #2: Forgetting compensation for ALL steps**
```
Order created → Inventory reserved → Payment fails
Compensation runs... cancels order... forgets to release inventory!
Now inventory is reserved forever → warehouse confusion → ops ticket
```

**Mistake #3: Compensation that can also fail**
```javascript
// ❌ BAD: Compensation fails silently
async function compensate() {
  await inventoryService.release(orderId); // This throws
  // Everything else silently skipped
}

// ✅ GOOD: Log failures, alert humans, keep going
async function compensate() {
  const failures = [];

  try {
    await inventoryService.release(orderId);
  } catch (err) {
    failures.push({ step: 'inventory.release', error: err.message });
    // DON'T throw - continue compensating other steps
  }

  try {
    await paymentService.refund(orderId);
  } catch (err) {
    failures.push({ step: 'payment.refund', error: err.message });
  }

  if (failures.length > 0) {
    // Alert humans for manual intervention
    await alertOncall('Compensation failed - manual action required', failures);
  }
}
```

**Mistake #4: Not tracking saga state**

If you can't answer "why is order 12345 stuck in 'processing' for 3 days?" - your saga has no observability. Always store state:

```javascript
// Track every state transition
await db('saga_events').insert({
  saga_id: sagaId,
  event_type: 'step_completed',
  step_name: 'charge_payment',
  occurred_at: new Date(),
  metadata: JSON.stringify({ chargeId: charge.id, amount })
});
```

## The Bottom Line 💡

Distributed transactions are a lie. The moment you have four services with four databases, you can't have ACID guarantees - and that's okay.

The Saga Pattern gives you something better than a transaction: **an explicit, auditable, compensatable workflow** where every step is intentional and every failure has a defined recovery path.

**My battle-tested rules:**
1. **Start with orchestration** - it's easier to reason about
2. **Persist every state transition** - crashes will happen
3. **Make every step idempotent** - networks will lie
4. **Plan compensations for ALL steps** - failures will cascade
5. **Log everything** - you'll need to debug at 2 AM
6. **Use Step Functions** if you're on AWS - don't write your own durable orchestrator

**When designing our e-commerce backend**, moving from a monolith to microservices meant living with eventual consistency. Sagas gave us a framework to reason about failures explicitly instead of hoping transactions would save us.

The truth? A well-designed Saga is more resilient than a traditional transaction - because it's designed with failure in mind from the start.

Now go build some sagas. And make them idempotent. Please.

---

**Built a saga system that worked beautifully (or catastrophically)?** Let's compare war stories on [LinkedIn](https://www.linkedin.com/in/anuraghkp)!

**Want to see real saga implementations?** Check out my [GitHub](https://github.com/kpanuragh) for production-tested patterns.

*Now go forth and compensate responsibly!* 🎭

---

**P.S.** The first rule of distributed systems: assume everything will fail. The second rule: assume it will fail twice, in different ways, at the same time.

**P.P.S.** I once had a compensation transaction fail silently while refunding $10,000 in orders during a bad deploy. The finance team found it three days later. Always alert on compensation failures. ALWAYS. 😅
