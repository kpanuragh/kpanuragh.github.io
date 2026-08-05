---
title: "📬 At-Least-Once vs Exactly-Once Delivery: Pick Your Lie"
date: "2026-08-05"
excerpt: "Exactly-once delivery is the Bigfoot of distributed systems: everyone's heard of it, nobody's actually seen it in the wild. Here's what your message queue is really promising you, and how to stop getting burned by the gap."
tags: ["messaging", "queues", "distributed-systems", "kafka", "backend"]
featured: true
---

Somewhere in your onboarding docs, or maybe just in your head, there's a sentence that goes something like: "our message queue guarantees exactly-once delivery." I want you to find that sentence and mentally set it on fire, because it's not true, it was never true, and believing it is how you end up double-charging a customer at 2 AM.

Here's the uncomfortable truth: **exactly-once delivery, in the literal sense of "this message crosses the network and lands exactly one time," is impossible.** Not "hard." Not "requires a premium tier." Impossible, in the same way you can't losslessly compress random noise. The moment you have two independent machines talking over an unreliable network, one of them can send a message, the other can receive it and crash before acking, and now the sender has no way to know whether to resend. It either resends (risking a duplicate) or doesn't (risking a loss). That's the whole menu. There is no third option where the network reaches into the crashed process's memory and tells the truth.

So what are Kafka, RabbitMQ, and SQS actually selling you when they say "exactly-once"? Let's break down what's really on offer.

## The three real options

**At-most-once**: fire and forget. The producer sends, doesn't wait for confirmation, moves on. If the message gets lost, nobody notices. This is what you get from `fire-and-forget` publish calls or UDP-style messaging. Fast, cheap, and appropriate for things like metrics pings where losing 0.01% of data is a shrug, not an incident.

**At-least-once**: the producer resends until it gets an ack, and the consumer only marks a message "done" after processing succeeds. This guarantees the message *will* arrive — possibly more than once. A network blip between "consumer finished processing" and "consumer acked" means the broker thinks it never happened and redelivers. This is the default for RabbitMQ, SQS, and Kafka in their normal configurations, and it's what you should assume you're building against unless you've gone out of your way to configure otherwise.

**Exactly-once (the marketing version)**: what Kafka's transactional producer/consumer setup, or SQS FIFO's dedup window, actually give you is *effectively-once* — at-least-once delivery at the transport layer, combined with deduplication so that processing a duplicate has no additional effect. The message might physically arrive twice. Your system just makes sure the second arrival is a no-op. That distinction — "arrives once" vs "affects state once" — is the whole ballgame, and it's the part vendors' marketing copy quietly skips.

## Where at-least-once bites you

Picture a standard consumer loop, RabbitMQ-style:

```js
channel.consume(queue, async (msg) => {
  const order = JSON.parse(msg.content.toString());
  await chargeCard(order);       // side effect #1
  await sendConfirmationEmail(order); // side effect #2
  channel.ack(msg);              // <-- crash here?
});
```

If the process dies after `chargeCard` succeeds but before `channel.ack` fires, RabbitMQ never got the ack. It assumes the message wasn't handled and redelivers it. Your consumer wakes back up, charges the card *again*, and sends a *second* confirmation email. Nothing here is a bug in RabbitMQ — it did exactly what at-least-once promises. The bug is assuming "the message was delivered" means "the message was delivered once."

Kafka has the same shape of problem, just with offsets instead of acks. If you commit the consumer offset *before* processing, a crash mid-processing means the message is silently skipped on restart — that's accidentally at-most-once. If you commit the offset *after* processing (the usual advice), a crash between processing and committing means the message gets reprocessed on restart. There is no ordering of "do the work" and "record that you did the work" that closes this gap, because those two things can never be a single atomic operation across a process crash — unless you make them atomic on purpose.

## Making duplicates harmless instead of impossible

Since you can't stop duplicates from happening, the move is to make them idempotent — processing the same message twice produces the same end state as processing it once. A few patterns that actually hold up in production:

**Dedup table keyed by message ID.** Every message carries a unique ID (Kafka gives you `(topic, partition, offset)` for free; for RabbitMQ or SQS you generate one at publish time). Before doing the real work, check if that ID has already been processed, inside the same transaction as the work itself:

```js
async function handleMessage(msg) {
  const messageId = msg.properties.messageId;

  await db.transaction(async (tx) => {
    const seen = await tx.processedMessages.findOne({ id: messageId });
    if (seen) return; // already handled, no-op

    await chargeCard(tx, msg.order);
    await tx.processedMessages.insert({ id: messageId, processedAt: new Date() });
  });

  channel.ack(msg);
}
```

The key detail: the "have I seen this?" check and the actual side effect live in the *same database transaction*. If you check in one transaction and write the effect in another, you've just relocated the race condition instead of closing it — a redelivered message can still slip through the gap between the two.

**Make the operation naturally idempotent.** Sometimes you don't need a dedup table at all — you need an operation where doing it twice is identical to doing it once. `UPDATE accounts SET balance = 500` is idempotent; `UPDATE accounts SET balance = balance - 50` is not. Where you can, prefer "set to a known state" over "apply a delta." Upserts, `INSERT ... ON CONFLICT DO NOTHING`, and absolute state transitions are your friends here.

**Use the platform's built-in dedup when it exists.** Kafka's idempotent producer (`enable.idempotence=true`) stops *duplicate sends from the producer side* using sequence numbers per partition — it solves "my retry created two copies on the topic," not "my consumer processed the same offset twice." SQS FIFO queues dedup within a 5-minute window using a content hash or an explicit `MessageDeduplicationId`. These are useful, but they're narrower than "exactly-once end to end," and it's worth reading the fine print on exactly what layer each one covers before you lean on it.

## The rule of thumb

Treat every message as if it *will* be delivered more than once, because eventually it will be — a consumer restart during a rolling deploy, a network partition, a broker failover, any of the completely normal things that happen in production on a Tuesday. The question isn't "how do I get exactly-once delivery," it's "what does my handler do the second time it sees this message, and is that safe?"

At Cubet, we had an inventory-decrement consumer that assumed single delivery for almost a year before a broker failover during a deploy caused a burst of redeliveries — and stock counts went negative on a dozen SKUs before anyone noticed the pattern in the logs. The fix wasn't a fancier queue. It was a fifteen-line dedup table and an idempotent update. Sometimes reliability isn't about the infrastructure being smarter — it's about the consumer no longer trusting the infrastructure to be smart on its behalf.

Go check your consumers. If a message arriving twice would double-charge, double-email, or double-decrement something, you don't have exactly-once delivery — you have at-least-once with a false sense of security. Fix the handler, not your hopes.
