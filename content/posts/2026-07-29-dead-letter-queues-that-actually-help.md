---
title: "💀 Dead Letter Queues: The Graveyard Nobody Visits (Until It's Too Late)"
date: "2026-07-29"
excerpt: "Most teams wire up a dead letter queue, feel very responsible, and then never look at it again. Here's how to build one that actually gets messages back to life instead of just being a fancier trash can."
tags: ["messaging", "queues", "rabbitmq", "node.js", "distributed-systems"]
featured: true
---

Every team I've worked with has, at some point, added a dead letter queue (DLQ) to their messaging setup. It usually goes like this: someone reads a blog post (hi), adds `x-dead-letter-exchange` to a RabbitMQ config or an SQS redrive policy, ships it, and feels very good about themselves. Six months later, that DLQ has 40,000 messages in it, nobody knows what half of them are, and the on-call engineer is too scared to touch it because "what if it's important."

That's not a dead letter queue. That's a digital hoarder's garage.

A DLQ that actually helps isn't just a place where failed messages go to be ignored — it's a diagnostic tool and a recovery mechanism. Let's talk about how to build one you'd actually want to open.

## The problem with "just retry it"

The naive version of message processing looks like this:

```js
channel.consume(queue, async (msg) => {
  try {
    await processOrder(JSON.parse(msg.content.toString()));
    channel.ack(msg);
  } catch (err) {
    // requeue and hope for the best
    channel.nack(msg, false, true);
  }
});
```

This works great right up until you get a **poison message** — one that fails deterministically, every single time, no matter how many times you retry it. Maybe it has a malformed payload, maybe it references a customer ID that got deleted, maybe some upstream service changed a field name. Doesn't matter why. What matters is that `nack(msg, false, true)` just put it right back at the front of the queue, and now your consumer is stuck in a tight loop reprocessing the same doomed message thousands of times a second, burning CPU and — worse — head-of-line blocking every other message behind it.

I watched this happen at Cubet with an order-processing queue: one order had a null `currency` field from a partner integration that changed its schema without telling anyone. That single message brought throughput on the whole queue to a crawl for twenty minutes before someone noticed the consumer lag graph doing something weird.

## Step one: retries need a ceiling and a memory

The fix isn't "never retry," it's "retry with intent, then let go." Each message needs to carry its own retry count so the consumer can make a decision instead of looping blindly.

```js
const MAX_RETRIES = 5;

channel.consume(queue, async (msg) => {
  const headers = msg.properties.headers || {};
  const retryCount = headers['x-retry-count'] || 0;

  try {
    await processOrder(JSON.parse(msg.content.toString()));
    channel.ack(msg);
  } catch (err) {
    if (retryCount >= MAX_RETRIES) {
      // republish to the DLQ with the failure reason attached
      channel.publish('orders.dlx', 'orders.dead', msg.content, {
        headers: {
          ...headers,
          'x-retry-count': retryCount,
          'x-death-reason': err.message,
          'x-failed-at': new Date().toISOString(),
        },
      });
      channel.ack(msg); // remove from the live queue
    } else {
      channel.publish('orders.retry', 'orders.retry', msg.content, {
        headers: { ...headers, 'x-retry-count': retryCount + 1 },
        expiration: String(2 ** retryCount * 1000), // exponential backoff via TTL
      });
      channel.ack(msg);
    }
  }
});
```

That backoff trick — publishing to a "retry" queue with a per-message TTL, which then dead-letters *back* into the real queue once it expires — is the classic RabbitMQ delay pattern. SQS makes this easier with native `visibilityTimeout` tuning and a `maxReceiveCount` redrive policy, but the principle is identical: bounded retries, exponential spacing, and a hard exit into the DLQ once you've exhausted your patience.

## Step two: the DLQ needs metadata, not just the corpse

The number one reason DLQs become write-only graveyards is that the messages in them are context-free. You get the raw payload and nothing else — no idea why it died, when, or how many times it was tried. Attaching `x-death-reason`, `x-failed-at`, and the retry count (as in the example above) turns "unknown blob" into "actionable incident."

If you're on AWS, SNS/SQS DLQs get this almost for free via the built-in `ApproximateReceiveCount` attribute and CloudWatch alarms — use them. If you're rolling your own, stealing the error message and stack trace into headers costs you nothing and saves someone a very bad Tuesday.

## Step three: someone (or something) actually watches it

A DLQ with zero alerting is just a slower way of losing data silently. The bare minimum: a CloudWatch alarm or Prometheus alert on `dlq_depth > 0` for more than N minutes, wired into whatever pages your team. The next level up is a small scheduled job that samples the DLQ and buckets messages by `x-death-reason`, so instead of "there are 200 messages in the DLQ" you get "180 of those are the same null-currency bug, and 20 are something new."

## Step four: replay has to be a real, tested path

This is the part everyone skips. A DLQ without a replay tool is a one-way door — messages go in, and going back out means someone hand-writing a script under pressure during an incident. Build the redrive tool *before* you need it:

```js
async function replayDeadLetters(limit = 50) {
  const msgs = await drainQueue('orders.dlq', limit);
  for (const msg of msgs) {
    await channel.publish('orders', 'orders.process', msg.content, {
      headers: { 'x-retry-count': 0, 'x-replayed-from-dlq': true },
    });
  }
}
```

Note the reset retry count and the `x-replayed-from-dlq` flag — you want to know later which messages succeeded only after human intervention, because that's a signal your root-cause fix might not have actually worked.

## The real lesson

A dead letter queue is only as good as the tooling around it. Bounded retries stop the bleeding, metadata tells you what happened, alerting makes sure a human finds out, and a replay path turns "data we lost" into "data we recovered." Skip any one of those four and you've just built a very expensive way to postpone the inevitable cleanup.

Go check your DLQ depth right now. I'll wait. If it's not zero and nobody's looked at it this week, you already know what your next ticket is.
