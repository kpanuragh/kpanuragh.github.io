---
title: "📮 Pub/Sub vs Queues: Picking the Right Primitive (Before Your Architecture Picks It For You)"
date: "2026-08-12"
excerpt: "Everyone reaches for \"a message broker\" like it's one thing. It isn't. Queues and pub/sub solve different problems, and picking the wrong one doesn't fail loudly — it just quietly rots your architecture for the next two years."
tags: ["messaging", "queues", "pubsub", "distributed-systems", "backend"]
featured: true
---

Somebody on your team is going to say "let's just throw it on a queue" or "let's just publish an event," and they're going to say it like the two are interchangeable. They are not. A queue and a pub/sub topic are built to answer completely different questions, and confusing them is one of those mistakes that doesn't crash anything — it just slowly accumulates into an architecture where nobody can tell who's supposed to process what, or why the same job ran three times last Tuesday.

Let's actually pin down the difference, because "message broker" as a category name papers over it nicely.

## The one-sentence version

A **queue** answers: "I have a pile of work items, and I need exactly one worker to handle each one." A **pub/sub topic** answers: "Something happened, and I have no idea — nor should I care — who wants to know about it."

That's the whole split. Everything else is a consequence of that one distinction.

## Queues: work distribution

Think of a queue like a ticket dispenser at a deli counter. Each ticket (message) gets handed to exactly one customer (consumer). Once it's taken, it's gone from the line. If you add more counter staff, tickets get processed faster, but each ticket is still only ever served once.

```js
// SQS-style: one message, one consumer, competing for work
const { Messages } = await sqs.receiveMessage({
  QueueUrl: RESIZE_QUEUE,
  MaxNumberOfMessages: 1,
}).promise();

for (const msg of Messages ?? []) {
  await resizeImage(JSON.parse(msg.Body));
  await sqs.deleteMessage({
    QueueUrl: RESIZE_QUEUE,
    ReceiptHandle: msg.ReceiptHandle,
  }).promise();
}
```

Spin up five of these workers and you get load balancing for free — five processes competing for the same pool of image-resize jobs, each job claimed once. That's the whole value proposition of a queue: it turns "a list of tasks" into "a list of tasks that get done exactly once, by whichever worker got there first." Scaling consumers scales throughput. There is exactly one logical "recipient role" for any given message, even if that role has many interchangeable workers behind it.

## Pub/sub: fan-out

Now picture a radio broadcast instead of a deli line. The station doesn't know who's listening, doesn't care, and definitely doesn't stop broadcasting because one particular car drove into a tunnel. Every subscriber gets its own copy of everything.

```js
// Publisher has zero idea who's listening, or how many
await sns.publish({
  TopicArn: ORDER_PLACED_TOPIC,
  Message: JSON.stringify({ orderId, userId, total }),
}).promise();

// Three completely independent subscribers, each with its own queue
// billing-service:    charge the card
// analytics-service:  increment a counter
// email-service:      send a confirmation
```

Add a fourth team that wants to react to `order.placed` — say, a fraud-detection service — and they subscribe. The publisher's code doesn't change. Nobody asks permission. That's the entire point: pub/sub decouples the producer from the *set* of consumers, which can grow, shrink, or change independently of the thing emitting the event. Compare that to a queue, where adding a second "recipient role" (not a second worker — a second *kind* of consumer) means either the producer now has to know about two queues, or you've quietly turned your queue into a pub/sub system by hand.

## Where people mix them up

The failure mode I've actually seen bite a team, back early in my career at Acodez, was the opposite direction: someone modeled a pub/sub-shaped problem as a single queue because "we already have SQS set up." One order-placed event needed to trigger billing, inventory, and email. So all three got crammed into one consumer function pulling off one queue:

```js
// Anti-pattern: one queue trying to be three subscribers
async function handleOrderMessage(msg) {
  await chargeCard(msg.order);
  await decrementInventory(msg.order);
  await sendConfirmationEmail(msg.order);
}
```

This looks fine until inventory needs to move slower than billing, or email starts throwing rate-limit errors and now the whole message retries — including the *already-successful* card charge, because there's no per-step acknowledgment, only one big ack at the end. The three concerns have wildly different retry semantics, failure tolerances, and scaling needs, but they're glued into one unit of work because the underlying primitive was "one queue" instead of "one topic, three subscriptions." The fix wasn't a smarter retry loop — it was SNS fanning out to three separate SQS queues, one per concern, each with its own dead-letter queue and backoff policy.

The reverse mistake shows up too: teams build pub/sub when they actually wanted work distribution. If you publish a "resize this image" event to a topic with five subscribers, you now have five duplicate resize jobs, because pub/sub's whole contract is "every subscriber gets a copy." That's correct behavior for a topic and completely wrong for a job queue — the fix there is not a smarter subscriber filter, it's picking the other primitive.

## The practical decision rule

Ask one question: **when this message fires, should it be handled once, or should everyone who cares be told?**

- "A password reset was requested, send exactly one email" → queue.
- "A user upgraded their plan" → topic. Billing needs to know, analytics needs to know, the onboarding-email service needs to know, and none of them should have to coordinate with each other to avoid double-processing.
- "Resize this uploaded image" → queue, with N workers for throughput.
- "An image was uploaded" → topic, if resizing, virus-scanning, and thumbnail-generation are all independent reactions to the same fact.

A useful tell: if you ever catch yourself writing `if (messageType === 'X') { doThing() } else if (messageType === 'Y') { doOtherThing() }` inside a single consumer, that's usually a sign you've got a pub/sub problem wearing a queue's clothes. Split it into a topic with separate subscriptions per concern, and let each one scale, retry, and fail independently. Most real systems end up using both — SNS-to-SQS fan-out, or Kafka topics with multiple consumer groups (where a "consumer group" behaves like a queue's competing-consumers model, and multiple groups on the same topic behave like pub/sub) — because most real systems have both shapes of problem hiding in them at once.

Next time someone says "let's just put it on a queue," ask them who's supposed to receive it — one worker, or everyone who's interested. The answer decides your primitive, and getting it backwards is the kind of mistake that doesn't show up in code review, only in the incident channel eight months later.
