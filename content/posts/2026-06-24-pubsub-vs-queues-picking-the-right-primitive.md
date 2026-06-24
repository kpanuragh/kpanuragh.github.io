---
title: "📬 Pub/Sub vs Message Queues: Stop Choosing the Wrong Primitive"
date: "2026-06-24"
excerpt: "Pub/sub and message queues look similar on the surface — both move data between services asynchronously. But picking the wrong one will haunt you. Here's how to choose without regret."
tags:
  - backend
  - messaging
  - distributed-systems
  - queues
  - pubsub
  - architecture
featured: true
---

There's a moment every backend engineer hits where they say "we need async messaging" and someone in Slack immediately suggests Kafka, someone else says RabbitMQ, and a third person starts drawing fan-out diagrams on a whiteboard while a fourth quietly adds Redis pub/sub to the stack.

Two weeks later you have all four running in production and none of them are used correctly.

Let's fix that. Pub/sub and message queues are both async messaging primitives, but they solve *different problems*. Using one where you need the other is like using a walkie-talkie for a voicemail — it works until it really, really doesn't.

## The Core Difference in One Sentence

A **message queue** delivers each message to **exactly one consumer**. A **pub/sub system** delivers each message to **every subscriber**.

That's it. That's the whole distinction. Everything else — durability, ordering, retention — is configuration on top of this fundamental semantic difference.

## Message Queues: The Assembly Line

Think of a message queue as a task list. Work items go in, workers pull them out, each item gets done once. If you have five workers pulling from the same queue, each message goes to one of them — not all five.

This is what you want when you're **distributing load**:

```js
// Producer: add a resize job
await queue.add('resize-image', {
  imageId: 'abc123',
  targetWidth: 800,
});

// Consumer (could be running on 10 machines)
queue.process('resize-image', async (job) => {
  await resizeImage(job.data.imageId, job.data.targetWidth);
  // Only ONE worker processes this. The image won't be resized 10 times.
});
```

The queue guarantees that even if you spin up ten worker instances to handle load, the image gets resized exactly once. This is the whole point.

**Classic queue use cases:**
- Email/SMS sending (don't send the same receipt twice)
- Image processing, PDF generation, video transcoding
- Payment processing (one charge per order, please)
- Anything where "exactly-once processing" matters

At Cubet, we use BullMQ (backed by Redis) for most of these jobs. One queue, multiple worker processes, and we sleep soundly knowing no customer gets double-charged on a retry.

## Pub/Sub: The Broadcast Tower

Pub/sub is fundamentally different. When an event fires, **every subscriber gets a copy**. The publisher doesn't know (or care) who's listening.

```js
// Publisher: user just signed up
await pubsub.publish('user.created', {
  userId: 'u_789',
  email: 'alice@example.com',
  plan: 'pro',
});

// Subscriber 1: send welcome email
pubsub.subscribe('user.created', async (event) => {
  await sendWelcomeEmail(event.email);
});

// Subscriber 2: create Stripe customer
pubsub.subscribe('user.created', async (event) => {
  await stripe.customers.create({ email: event.email });
});

// Subscriber 3: initialize default settings
pubsub.subscribe('user.created', async (event) => {
  await db.userSettings.create({ userId: event.userId });
});
```

All three subscribers receive `user.created` independently. The publishing service (`auth-service`, say) doesn't import or call `email-service`, `billing-service`, or `settings-service` directly. They're decoupled at the event level.

This is the **fan-out pattern**, and it's why Kafka and SNS/SQS fan-out combinations exist. You publish once; N consumers react independently.

**Classic pub/sub use cases:**
- User lifecycle events (signup, deletion, plan change)
- Cache invalidation across multiple services
- Audit logging — every service can subscribe without the source service knowing
- Real-time notifications (WebSocket push, mobile push)
- Triggering multiple downstream workflows from one business event

## The Decision Framework

Here's the mental model I use:

| Question | Queue | Pub/Sub |
|---|---|---|
| "Should this work be done once?" | ✅ Yes | ❌ No — all subscribers act |
| "Do I need to distribute load?" | ✅ Naturally | 🔧 Requires consumer groups |
| "Do I need fan-out to N services?" | ❌ Awkward | ✅ Native |
| "Is this a task or an event?" | Task → Queue | Event → Pub/Sub |

The **task vs event** framing is the most useful. A task is imperative: *"Go do this thing."* An event is declarative: *"This thing happened."* Tasks have owners. Events have observers.

## Where People Go Wrong

**Mistake 1: Using pub/sub for tasks you need to track.**

Pub/sub systems (especially simple ones like Redis `PUBLISH/SUBSCRIBE`) are often fire-and-forget. If no subscriber is connected when the message fires, it's gone. Use a queue with persistence (BullMQ, SQS, RabbitMQ) when you need delivery guarantees.

**Mistake 2: Using a queue for fan-out.**

I've seen codebases that fan-out manually by publishing the same task to five different queues, one per consumer service. This works until you add a sixth service and forget to update the publisher. Pub/sub handles fan-out automatically — new subscribers just... subscribe.

```js
// ❌ Manual fan-out with queues — fragile
await emailQueue.add('send-welcome', { userId });
await billingQueue.add('create-customer', { userId });
await settingsQueue.add('init-settings', { userId });
// Six months later: someone adds analyticsQueue and forgets to update this file

// ✅ Pub/sub fan-out — new subscribers just subscribe
await eventBus.publish('user.created', { userId });
```

**Mistake 3: Ignoring consumer groups in Kafka.**

Kafka is pub/sub with consumer groups. Within a group, each message goes to one consumer (queue semantics). Across groups, every group gets the message (pub/sub semantics). This is why Kafka is powerful — it supports both patterns simultaneously. But if you forget to set a consumer group, every instance of your service processes every message, and suddenly your billing service is charging customers five times.

## The Hybrid Pattern

Real systems often need both. A common pattern:

1. Service A publishes `order.placed` to a pub/sub topic (SNS, Kafka topic, etc.)
2. Multiple services subscribe: inventory, fulfillment, analytics
3. Each subscriber pushes work into its own **queue** for reliable processing

```
order.placed (SNS topic)
  ├──> inventory-queue (SQS)  → inventory-service workers
  ├──> fulfillment-queue (SQS) → fulfillment-service workers
  └──> analytics-queue (SQS)  → analytics-service workers
```

This SNS→SQS fan-out is a canonical AWS pattern, and it's genuinely elegant. You get pub/sub decoupling at the top, and queue durability + load distribution at the bottom. The inventory service can be down for ten minutes and still process every `order.placed` event when it comes back up.

## Quick Reference

**Reach for a queue when:**
- You're distributing CPU-intensive work across worker instances
- Exactly-once processing matters
- You need retry logic, dead-letter queues, and job visibility
- The work has a clear owner

**Reach for pub/sub when:**
- Multiple independent services need to react to the same event
- The publisher shouldn't know about its consumers
- You're decoupling service boundaries
- You need audit trails or event sourcing

**Use both when:**
- You need fan-out *and* reliable per-subscriber processing (the SNS→SQS pattern)

---

The choice isn't about which tool is "better" — Kafka isn't overkill if you need its semantics, and Redis pub/sub isn't naive if fire-and-forget is fine. The choice is about honestly answering: *is this a task or an event, and does every consumer need it or just one?*

Answer that, and the primitive picks itself.

What messaging patterns are you running in production? I'm always curious how teams handle the fan-out vs distribution tradeoff — especially once Kafka enters the chat. Drop it in the comments.
