---
title: "📮 Pub/Sub vs Queues: Picking the Right Primitive"
date: "2026-09-02"
excerpt: "One message, many readers, or one message, one reader — sounds like a trivial choice until you build the wrong one and spend a sprint bolting the other behavior on top."
tags: ["messaging", "distributed-systems", "architecture", "backend"]
featured: true
---

Every "how do we connect these services" conversation eventually hits the same fork in the road: do we need a **queue** or do we need **pub/sub**? The two get talked about interchangeably in planning meetings — "let's just throw it on a topic" — and then six months later someone's debugging why three consumers processed the same order refund, or why a critical event silently vanished because nobody was listening when it fired.

The confusion is understandable. Both are "async messaging." Both decouple producer from consumer. Both show up in the same tools (Kafka, RabbitMQ, SNS/SQS, Redis Streams). But they solve genuinely different problems, and picking the wrong one doesn't fail loudly — it fails quietly, three months into production, when the traffic pattern finally exposes the mismatch.

## The one-sentence distinction that actually matters

A **queue** delivers each message to exactly one consumer. A **topic** (pub/sub) delivers each message to every subscriber. That's it. Everything else — retries, ordering, fan-out, replay — is a consequence of that one fact.

Think of a queue like a deli counter: you take a number, and when it's called, *you* get served — nobody else gets your sandwich. Pub/sub is more like a radio broadcast: the station doesn't know or care who's tuned in, and it definitely doesn't resend the traffic report because your car was in a tunnel.

## When you actually want a queue

Queues are for **work distribution** — you have a pile of tasks and a pool of workers, and each task should be done exactly once (or as close to it as your idempotency handling allows).

```js
// Order processing: exactly one worker should charge the card
const { Queue, Worker } = require('bullmq');

const orderQueue = new Queue('charge-orders');

// Producer
await orderQueue.add('charge', { orderId: 'ord_9f21', amountCents: 4200 });

// Consumer — if you scale to 5 workers, each order still gets
// picked up by exactly one of them
new Worker('charge-orders', async job => {
  await chargeCard(job.data.orderId, job.data.amountCents);
}, { concurrency: 5 });
```

Add a second worker process here and you're not duplicating work, you're parallelizing it — that's the whole point. If a worker crashes mid-job, the message goes back on the queue (or to a dead-letter queue after N retries) and someone else picks it up. This is the right shape for payment processing, image resizing, sending a single confirmation email, anything where "processed twice" is a bug, not a feature.

## When you actually want pub/sub

Pub/sub is for **fan-out** — one event happened, and an unknown (or growing) number of independent systems each need to react to it in their own way.

```js
// user.signed_up fires once, three unrelated services react
// each with its own subscription, its own pace, its own logic
await sns.publish({
  TopicArn: 'arn:aws:sns:us-east-1:...:user-signed-up',
  Message: JSON.stringify({ userId: 'u_882', plan: 'pro' }),
});

// Subscriber A: analytics service logs the signup
// Subscriber B: email service queues a welcome sequence
// Subscriber C: billing service provisions a Stripe customer
// None of them know the others exist. None of them "steal" the event.
```

Add a fourth subscriber six months from now — say, a fraud-scoring service — and you change *nothing* about the publisher. That's the actual value proposition: new consumers plug in without the producer ever finding out. Try to do that with a plain queue and you either duplicate the publish call at the source (now the producer knows about every consumer, coupling defeats the purpose) or you build your own fan-out layer — which is just reinventing pub/sub badly.

## The trap: mixing them up

The failure mode I've seen most often on my team at Cubet wasn't picking the wrong tool outright — it was starting with one and outgrowing it silently. A team builds `order.placed` as a single SQS queue because there's exactly one consumer (inventory) at launch. Eight months later, shipping, loyalty-points, and fraud-detection all need the same event, and now there's a queue with four competing consumers all racing for the same messages, none of them getting a reliable full copy. The "fix" under deadline pressure is usually the worst one: each new team just adds a second `sendMessage` call at the publish site, hardcoding fan-out into application code that was never meant to know its downstream audience.

The other direction bites just as hard: using a topic for something that needed queue semantics. Broadcast a `refund.requested` event to every subscriber, and if your billing consumer and your legacy billing-v2 consumer are *both* still subscribed after a half-finished migration, you've just double-refunded a customer. Pub/sub gives you no "only one of you handle this" guarantee — that has to be enforced by design (single active consumer, or idempotency keys downstream), not assumed.

## The practical litmus test

Ask one question: **if I add a second consumer tomorrow, do I want it to share the workload, or get its own full copy?**

- Share the workload → queue.
- Full copy, independently → pub/sub (often a topic that fans out to per-consumer queues underneath — SNS→SQS, or Kafka consumer groups, give you both at once).

That last pattern — topic fanning out to a queue per subscriber — is usually the pragmatic answer once you have more than one consumer that also needs retry/backoff/at-least-once guarantees. SNS→SQS is the textbook version: SNS handles the "everyone gets a copy" fan-out, and each subscriber's own SQS queue handles the "exactly-once processing with retries" part. Kafka does something similar natively — a topic broadcasts to every consumer group, but within a group, partitions are divided so each message is processed once per group.

## Don't guess, model the traffic

Before wiring anything up, sketch the actual question you're answering: is this event a **task** (something must be done, once) or a **fact** (something happened, and interested parties may vary over time)? Tasks want queues. Facts want topics. If you're not sure yet because you only have one consumer, default to publishing as a fact on a topic with a single subscription — it costs almost nothing today and saves you a painful mid-flight migration when consumer number two shows up asking for its own copy of the truth.
