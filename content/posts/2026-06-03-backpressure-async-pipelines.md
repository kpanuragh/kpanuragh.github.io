---
title: "🚰 Backpressure in Async Pipelines: Stop Letting Fast Producers Drown Slow Consumers"
date: "2026-06-03"
excerpt: "When your message producer runs faster than your consumer can handle, you don't get a bottleneck — you get a catastrophe. Here's how backpressure keeps async pipelines from eating themselves alive."
tags:
  - backend
  - messaging
  - queues
  - distributed-systems
  - rabbitmq
  - kafka
  - async
featured: true
---

Imagine a fire hose connected to a garden watering can. The hose is your message producer. The watering can is your consumer. You open the hose. The watering can explodes.

That, in essence, is what happens when you build an async pipeline without backpressure.

Backpressure is the mechanism that lets the slow end of a pipeline *signal* the fast end to slow down. It sounds simple. It is absolutely not simple in practice. And when you ignore it, you get cascading OOM errors at 3 AM on a Sunday.

## Why This Actually Kills Services

Here's the usual trajectory. A producer (an HTTP endpoint, a cron job, an event stream) starts emitting messages. A consumer picks them up. Everything is fine during development because traffic is low and your local machine has 16 GB of RAM to buffer whatever mess you make.

Then you hit production. Traffic spikes. The producer generates 10,000 messages per second. Your consumer — which calls an external API, does a database write, and renders a PDF — handles maybe 200 per second. The queue grows. Memory climbs. The consumer tries to prefetch more messages to "keep up." Memory climbs faster. The process crashes. The queue grows even more because nothing is consuming. Your ops dashboard looks like a Christmas tree. Not the cheerful kind.

At Cubet, we hit a version of this on a document-processing pipeline. An upload endpoint pushed jobs to RabbitMQ. The worker pulled them as fast as it could and spawned a child process per job to do the heavy lifting. Under normal load, beautiful. Under the load of a customer who decided to upload 40,000 files at midnight — not beautiful.

The fix wasn't "buy more servers." The fix was backpressure.

## The Core Pattern: Bound Your In-Flight Work

The simplest form of backpressure is bounding how much work can be in flight at any given moment. Don't pull more messages than you can actually process concurrently.

In RabbitMQ, the tool for this is `prefetch`:

```javascript
const amqp = require('amqplib');

async function startConsumer() {
  const conn = await amqp.connect('amqp://localhost');
  const channel = await conn.createChannel();

  // Only pull 5 messages at a time — no more until we ack them
  await channel.prefetch(5);

  await channel.assertQueue('document-jobs', { durable: true });

  channel.consume('document-jobs', async (msg) => {
    if (!msg) return;

    try {
      await processDocument(msg.content);
      channel.ack(msg);
    } catch (err) {
      // Nack without requeue on permanent failure
      channel.nack(msg, false, false);
    }
  });
}
```

That one line — `channel.prefetch(5)` — is the backpressure lever. RabbitMQ will not deliver message number six until at least one of the five in-flight messages has been acknowledged. The queue buffers the rest on the broker side, which is exactly where you want buffering to happen: somewhere with disk-backed persistence, not in your application heap.

The number you pick matters. Too low and your consumer is idle while it waits for acks. Too high and you're back to the fire-hose problem. A rough starting formula: `prefetch = max_concurrent_tasks × average_processing_ms / target_latency_ms`. Tune it with metrics, not intuition.

## Kafka: Consumer Lag Is Your Backpressure Canary

Kafka works differently. Messages sit in partitions indefinitely (until retention expires), so you can't "overwhelm" the broker the same way. But you absolutely can overwhelm your consumer — and the signal that you're doing so is **consumer lag**: the gap between the latest offset written by the producer and the offset your consumer group has processed.

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({ brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'doc-processor' });

await consumer.connect();
await consumer.subscribe({ topic: 'document-jobs' });

await consumer.run({
  // This is your backpressure knob
  partitionsConsumedConcurrently: 3,

  eachMessage: async ({ topic, partition, message }) => {
    // This await is load-bearing — it blocks the next message
    // until this one finishes. Intentional.
    await processDocument(message.value);
  },
});
```

By default, `kafkajs` awaits `eachMessage` before pulling the next batch. That's backpressure by design — your processing speed governs your consumption speed. If you fire-and-forget inside `eachMessage`, you've thrown it away.

Watch `consumer_lag` in your Kafka metrics. If it's growing monotonically under normal load, your consumer is too slow and you need either more partitions, more consumer instances, or a faster `processDocument`. If it spikes and recovers, you have burst tolerance — which is the whole point of the queue.

## The Async Semaphore: DIY Backpressure for Everything Else

Not everything has a built-in prefetch knob. Sometimes you're processing a stream of events from a webhook, a database cursor, or a custom queue abstraction. In those cases, reach for a semaphore — a concurrency limiter that blocks when the cap is reached.

```javascript
class Semaphore {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      if (this.count < this.max) {
        this.count++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.count--;
    const next = this.queue.shift();
    if (next) {
      this.count++;
      next();
    }
  }
}

const sem = new Semaphore(10); // max 10 concurrent operations

async function processWithBackpressure(items) {
  await Promise.all(
    items.map(async (item) => {
      await sem.acquire();
      try {
        await processItem(item);
      } finally {
        sem.release();
      }
    })
  );
}
```

This pattern works everywhere: processing database rows in batches, fan-out HTTP calls, parallel file I/O. The semaphore ensures that no matter how many items you throw at it, only `max` are running at once. The rest wait. That waiting *is* the backpressure.

Libraries like `p-limit` give you this in two lines if you'd rather not write your own.

## What "No Backpressure" Looks Like in Production

A few symptoms that should make you ask "do we have backpressure?":

- **Memory climbs steadily under load and never comes back** — you're buffering in-flight work in the heap.
- **Consumer restarts but the queue never drains** — each restart triggers a burst of prefetch that crashes the consumer again. A death spiral.
- **Processing latency is fine but queue depth is growing** — your consumer is fast enough individually, but you're simply not running enough of them.
- **External API calls start failing with 429** — your consumer is hammering a rate-limited endpoint because nothing is throttling it.

All of these trace back to the same root cause: the producer and consumer are not communicating about capacity.

## The Takeaway

Backpressure isn't a feature you add when things break. It's a property you design in from the beginning. The good news is that the tools are right there — `prefetch` in AMQP, `partitionsConsumedConcurrently` in Kafka, semaphores and concurrency limiters everywhere else.

The heuristic I use at Cubet: every async pipeline should have a knob somewhere that limits how much work is in flight, and that knob should be set to a value derived from measurement, not from "let's see what happens."

Find your knob. Set it. Monitor it. Sleep better.

---

*What's the worst backpressure failure you've seen in production? Share it — misery loves company.*
