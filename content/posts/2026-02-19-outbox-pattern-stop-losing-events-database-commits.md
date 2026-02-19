---
title: "The Outbox Pattern: Stop Losing Events When Your Database Commits 📬💥"
date: "2026-02-19"
excerpt: "We charged a customer, committed to our database, then our event bus hiccuped. Payment service knew. Inventory service? Blissfully unaware. Orders went into a black hole. The Outbox Pattern was the fix I wish I'd known on day one."
tags: ["architecture", "scalability", "system-design", "distributed-systems", "event-driven"]
featured: true
---

# The Outbox Pattern: Stop Losing Events When Your Database Commits 📬💥

**Confession time:** In Year 2 of our e-commerce platform, we had a bug so embarrassing I didn't tell my CTO about it for three days.

A payment would go through. Database committed. Money taken. But the event to notify our inventory service? It silently vanished. Customers received "Order Confirmed" emails. Inventory never decremented. We sold products we didn't have, charged real money, and shipped nothing for 48 hours before our warehouse manager called me personally.

The culprit? We published events **after** committing to the database. And networks, being networks, occasionally said "no thanks" to our event bus.

```
// The buggy pattern that haunted me for three days:
async function processPayment(orderId, amount) {
  await db.transaction(async (trx) => {
    await trx('payments').insert({ order_id: orderId, amount, status: 'paid' });
    await trx('orders').update({ status: 'confirmed' }).where({ id: orderId });
    // ✅ Database committed!
  });

  // 🔥 ONE IN A THOUSAND TIMES: this crashes or times out
  await eventBus.publish('payment.completed', { orderId, amount });
  // ❌ Event lost forever. Inventory never knows. Chaos ensues.
}
```

This is the **dual-write problem** - and it's sneakier than you think.

## The Dual-Write Problem: A Silent Killer 🤫

When you need to write to two systems atomically - say, your database AND an event bus - you're in trouble. You cannot commit to both simultaneously. One will always happen before the other. And if the second one fails...

```
The nightmare scenarios:

Scenario A (What I lived):
1. ✅ Write to database
2. ❌ Event bus publish fails
→ Database has the change, event bus doesn't
→ Downstream services never know what happened

Scenario B (Also terrible):
1. ✅ Publish event
2. ❌ Database write fails
→ Downstream services acted on data that doesn't exist
→ Inventory decremented for an order that never committed
```

**A scalability lesson that cost us:** We caught Scenario A in staging once. Fixed it with a retry wrapper. Deployed. Three months later, Scenario A still happened - but now in a slightly different code path we'd missed. Always missed. Networks lie in unpredictable ways.

The problem with retries alone: if your app crashes between the DB commit and the event publish, no retry ever runs.

```
Process timeline:

[DB commit] → [App crashes here] → [Restart, no memory of unpublished event]

The event is gone. Forever. No retry queue. No dead letter queue.
Just... silence.
```

## Enter the Outbox Pattern 📬

The Outbox Pattern is beautifully simple: **write the event to your database in the same transaction as your business data**. A separate process reads the outbox table and publishes events to the event bus.

```
┌──────────────────────────────────────────────────────┐
│                   Your Database                       │
│                                                      │
│  ┌─────────────┐        ┌──────────────────────┐    │
│  │   orders    │        │      outbox          │    │
│  │─────────────│        │──────────────────────│    │
│  │ id: 123     │  same  │ id: 1                │    │
│  │ status: paid│  txn   │ event: payment.done  │    │
│  │ amount: $49 │ ────── │ payload: {orderId:123│    │
│  └─────────────┘        │ status: pending      │    │
│                         └──────────────────────┘    │
└──────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┘
                    │ Outbox Processor (polls or listens)
                    ▼
         ┌──────────────────┐
         │   Event Bus      │
         │ (SQS/RabbitMQ/   │
         │  Kafka)          │
         └──────────────────┘
```

**The atomic guarantee:** If the database transaction commits, the outbox row exists. If the transaction rolls back, the outbox row doesn't exist. No split-brain. No lost events. No 48-hour inventory disasters.

## Implementation: Outbox in Node.js 🛠️

**Step 1: Create the outbox table**

```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(100) NOT NULL,  -- 'order', 'payment', etc.
  aggregate_id   VARCHAR(100) NOT NULL,
  event_type     VARCHAR(100) NOT NULL,  -- 'payment.completed'
  payload        JSONB        NOT NULL,
  status         VARCHAR(20)  DEFAULT 'pending',  -- pending, published, failed
  created_at     TIMESTAMP    DEFAULT NOW(),
  published_at   TIMESTAMP,
  retry_count    INT          DEFAULT 0
);

-- Index for the processor to efficiently find pending events
CREATE INDEX idx_outbox_status_created ON outbox_events(status, created_at)
  WHERE status = 'pending';
```

**Step 2: Write business data AND outbox event in one transaction**

```javascript
async function processPayment(orderId, userId, amount, paymentMethodId) {
  await db.transaction(async (trx) => {
    // Business logic - update order status
    await trx('orders')
      .where({ id: orderId })
      .update({ status: 'confirmed', confirmed_at: new Date() });

    // Record payment
    const [payment] = await trx('payments').insert({
      order_id:          orderId,
      user_id:           userId,
      amount,
      payment_method_id: paymentMethodId,
      status:            'paid',
      paid_at:           new Date()
    }).returning('*');

    // ✅ Outbox event - SAME transaction!
    await trx('outbox_events').insert({
      aggregate_type: 'payment',
      aggregate_id:   payment.id.toString(),
      event_type:     'payment.completed',
      payload: JSON.stringify({
        orderId,
        userId,
        paymentId: payment.id,
        amount,
        paidAt: new Date().toISOString()
      })
    });

    // ✅ Another event in the same transaction
    await trx('outbox_events').insert({
      aggregate_type: 'order',
      aggregate_id:   orderId.toString(),
      event_type:     'order.confirmed',
      payload: JSON.stringify({ orderId, userId, amount })
    });

    // If ANY of this fails, the whole transaction rolls back.
    // No partial state. No orphaned events. No lost events.
  });

  // Return immediately - events will be published asynchronously
  return { success: true, orderId };
}
```

**Step 3: The Outbox Processor**

```javascript
// outboxProcessor.js - runs as a separate process
class OutboxProcessor {
  constructor({ db, eventBus, batchSize = 50, pollIntervalMs = 1000 }) {
    this.db          = db;
    this.eventBus    = eventBus;
    this.batchSize   = batchSize;
    this.pollInterval = pollIntervalMs;
    this.running     = false;
  }

  async start() {
    this.running = true;
    console.log('Outbox processor started');

    while (this.running) {
      try {
        const processed = await this.processBatch();

        if (processed === 0) {
          // No events - wait before polling again
          await this.sleep(this.pollInterval);
        }
      } catch (err) {
        console.error('Outbox processor error:', err.message);
        await this.sleep(5000); // Back off on errors
      }
    }
  }

  async processBatch() {
    // Lock rows so multiple processors don't duplicate
    const events = await this.db.raw(`
      SELECT * FROM outbox_events
      WHERE status = 'pending'
        AND retry_count < 5
      ORDER BY created_at ASC
      LIMIT ?
      FOR UPDATE SKIP LOCKED
    `, [this.batchSize]);

    if (events.rows.length === 0) return 0;

    console.log(`Processing ${events.rows.length} outbox events...`);

    for (const event of events.rows) {
      await this.processEvent(event);
    }

    return events.rows.length;
  }

  async processEvent(event) {
    try {
      const payload = JSON.parse(event.payload);

      // Publish to event bus
      await this.eventBus.publish(event.event_type, {
        ...payload,
        _eventId:   event.id,         // for idempotency downstream
        _eventType: event.event_type,
        _publishedAt: new Date().toISOString()
      });

      // Mark as published
      await this.db('outbox_events')
        .where({ id: event.id })
        .update({
          status:       'published',
          published_at: new Date()
        });

      console.log(`Published: ${event.event_type} (${event.id})`);

    } catch (err) {
      console.error(`Failed to publish ${event.id}:`, err.message);

      // Increment retry count - will retry on next batch
      await this.db('outbox_events')
        .where({ id: event.id })
        .update({
          retry_count: this.db.raw('retry_count + 1'),
          status: event.retry_count >= 4 ? 'failed' : 'pending'
        });

      // Alert if max retries exceeded
      if (event.retry_count >= 4) {
        await alertOncall('Outbox event failed after 5 retries', event);
      }
    }
  }

  stop() {
    this.running = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start processor
const processor = new OutboxProcessor({ db, eventBus, batchSize: 100 });
processor.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Stopping outbox processor...');
  processor.stop();
});
```

## The Laravel Version (Because Laravel Deserves Love Too) 🐘

```php
// In your service - one transaction, two concerns
class PaymentService
{
    public function processPayment(int $orderId, float $amount): void
    {
        DB::transaction(function () use ($orderId, $amount) {
            // Business logic
            Order::where('id', $orderId)->update(['status' => 'confirmed']);

            $payment = Payment::create([
                'order_id' => $orderId,
                'amount'   => $amount,
                'status'   => 'paid',
            ]);

            // Outbox event - same transaction!
            OutboxEvent::create([
                'aggregate_type' => 'payment',
                'aggregate_id'   => $payment->id,
                'event_type'     => 'payment.completed',
                'payload'        => json_encode([
                    'orderId'   => $orderId,
                    'paymentId' => $payment->id,
                    'amount'    => $amount,
                ]),
                'status' => 'pending',
            ]);
        });
    }
}

// Artisan command - runs as a scheduled task or queue worker
class ProcessOutboxCommand extends Command
{
    protected $signature = 'outbox:process {--batch=50}';

    public function handle(): void
    {
        $batch = (int) $this->option('batch');

        OutboxEvent::where('status', 'pending')
            ->where('retry_count', '<', 5)
            ->orderBy('created_at')
            ->limit($batch)
            ->lockForUpdate()
            ->get()
            ->each(function (OutboxEvent $event) {
                try {
                    event(new DynamicEvent($event->event_type, json_decode($event->payload, true)));

                    $event->update([
                        'status'       => 'published',
                        'published_at' => now(),
                    ]);
                } catch (\Exception $e) {
                    $event->increment('retry_count');

                    if ($event->retry_count >= 5) {
                        $event->update(['status' => 'failed']);
                        // Alert ops team
                    }
                }
            });
    }
}
```

## The Trade-offs Nobody Tells You About ⚖️

| | Direct Publish | Outbox Pattern |
|---|---|---|
| Consistency | Eventual (can lose events) | Guaranteed (atomic with DB) |
| Latency | Milliseconds | Seconds (poll interval) |
| Complexity | Simple | Medium |
| Infrastructure | Just event bus | DB + event bus + processor |
| Failure recovery | Manual | Automatic retry |
| Duplicate risk | Low | Present (need idempotent consumers) |

**The latency caveat:** Your events won't publish instantly. If your processor polls every second, there's up to a 1-second delay before downstream services react. For most e-commerce flows, that's fine. For real-time stock tickers? Not so much.

**When designing our e-commerce backend**, we accepted 1-2 second event propagation delay. Inventory updates 2 seconds after payment? Completely invisible to customers. Order confirmation email 2 seconds late? Nobody noticed.

## Two Flavors of Outbox Processing 🍦

### 1. Polling (Simple, Works Everywhere)

```javascript
// Every N milliseconds, query for pending events
setInterval(async () => {
  await processBatch();
}, 1000);

// ✅ Simple to implement
// ✅ Works with any database
// ⚠️ Extra database load from polling
// ⚠️ Not truly real-time
```

### 2. CDC (Change Data Capture) - The Pro Move

```
PostgreSQL WAL (Write-Ahead Log)
         │
         │ Debezium / AWS DMS
         ▼
    Kafka Topic
         │
         ▼
  Event Bus / SQS / SNS
```

```javascript
// Debezium watches your outbox table in Postgres WAL
// No polling - events stream out in near-real-time
// ✅ Near-real-time (sub-100ms)
// ✅ Zero additional DB load for reading
// ✅ No polling queries
// ⚠️ More infrastructure (Kafka + Debezium)
// ⚠️ Complex setup
```

**When designing our serverless e-commerce backend on AWS**, we started with polling. Simple, reliable, good enough for 10,000 orders/day. At 100,000 orders/day, we switched to DynamoDB Streams - the AWS equivalent of CDC. Polling table at that scale was adding 15% extra RDS load.

## Common Mistakes (I Made Every One) 🪤

**Mistake #1: Forgetting idempotency in consumers**

```javascript
// Your outbox processor might publish duplicates on retry!
// Your consumers MUST handle this:

eventBus.on('payment.completed', async (event) => {
  // ❌ BAD: No idempotency check
  await decrementInventory(event.orderId);

  // ✅ GOOD: Check if already processed
  const alreadyProcessed = await db('processed_events')
    .where({ event_id: event._eventId })
    .first();

  if (alreadyProcessed) {
    console.log(`Skipping duplicate event: ${event._eventId}`);
    return;
  }

  await db.transaction(async (trx) => {
    await trx('processed_events').insert({ event_id: event._eventId });
    await decrementInventory(event.orderId, trx);
  });
});
```

**Mistake #2: Giant payloads in the outbox**

```javascript
// ❌ BAD: Storing entire product catalog in the event
await trx('outbox_events').insert({
  payload: JSON.stringify({
    order: fullOrderObject,          // 50KB
    customer: fullCustomerProfile,   // 20KB
    products: allProductDetails,     // 500KB!
  })
});

// ✅ GOOD: Store IDs, let consumers fetch what they need
await trx('outbox_events').insert({
  payload: JSON.stringify({
    orderId,
    customerId,
    productIds: items.map(i => i.productId)
  })
});
```

**Mistake #3: No monitoring on the outbox**

```javascript
// Alert if events are stuck!
setInterval(async () => {
  const stuckCount = await db('outbox_events')
    .where('status', 'pending')
    .where('created_at', '<', new Date(Date.now() - 60_000)) // older than 1 min
    .count('id as count')
    .first();

  if (parseInt(stuckCount.count) > 100) {
    await alertOncall(`${stuckCount.count} outbox events stuck!`);
  }

  const failedCount = await db('outbox_events')
    .where('status', 'failed')
    .count('id as count')
    .first();

  if (parseInt(failedCount.count) > 0) {
    await alertOncall(`${failedCount.count} outbox events permanently failed!`);
  }
}, 30_000);
```

**A scalability lesson that cost us:** We once had our outbox processor crash silently (the process died but our health check didn't notice). Events backed up for 6 hours before a customer called. Now our processor reports a heartbeat every 30 seconds, and an alert fires if we miss 3 consecutive heartbeats.

## When Should You Use the Outbox Pattern? 🌳

**Use the Outbox Pattern when:**
- ✅ You publish events after database writes
- ✅ Downstream services must eventually receive every event
- ✅ Losing events would cause data inconsistency
- ✅ You're doing anything payment-related (ALWAYS)
- ✅ Cross-service workflows where missing a trigger breaks things

**Skip the Outbox Pattern when:**
- ❌ Events are truly fire-and-forget (analytics pings, optional notifications)
- ❌ Eventual consistency is the design (you already accept missing events)
- ❌ You're using event sourcing (the event store IS your outbox)
- ❌ Your team isn't ready for the operational complexity

**As a Technical Lead, I've learned:** If a business analyst would consider a missing event a "bug," use the Outbox Pattern. If they'd shrug and say "we'll get it next time," maybe you don't need it.

## The Bottom Line 💡

The dual-write problem is one of those silent landmines that doesn't blow up in development or staging - it blows up in production, at 2 AM, when a customer's payment went through but their order is in limbo.

The Outbox Pattern is the right solution: write your event to the database in the same transaction as your business data, then publish it asynchronously. You get:

1. **Atomicity** - event and data commit together or not at all
2. **Reliability** - automatic retry until published
3. **Observability** - every event is in your database, queryable, auditable
4. **Resilience** - processor restarts, events survive

**My non-negotiable rules:**
1. **Any payment event? Outbox. No exceptions.**
2. **Make consumers idempotent** - the processor WILL retry
3. **Monitor the outbox table** - stuck events are silent failures
4. **Keep payloads small** - IDs are better than full documents
5. **Set max retry limits** - infinite retry is infinite noise

**When designing our e-commerce backend**, this single pattern eliminated an entire class of production incidents. The 48-hour inventory disaster never happened again.

Simple? Somewhat. Worth it? Absolutely.

---

**Dealt with event loss in production?** I want to hear your war story on [LinkedIn](https://www.linkedin.com/in/anuraghkp)!

**Want a working Outbox implementation?** Check out my [GitHub](https://github.com/kpanuragh) - real patterns from our production backend.

*Now go atomize your dual-writes before they atomize you.* 📬

---

**P.S.** The Saga Pattern and Outbox Pattern are friends, not competitors. Saga orchestrates multi-service workflows. Outbox reliably publishes the events those sagas depend on. Use both.

**P.P.S.** Yes, I really did hide that inventory bug from my CTO for three days. He eventually read the post-mortem. Reader, he was not pleased. Write your post-mortems promptly. And use the Outbox Pattern. 😅
