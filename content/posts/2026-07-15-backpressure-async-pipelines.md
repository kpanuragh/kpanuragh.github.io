---
title: "🚰 Backpressure: What Happens When Your Pipeline Drinks From a Firehose"
date: "2026-07-15"
excerpt: "Your producer is fast. Your consumer is slow. Nobody told the producer to slow down, so now you have 40GB of unprocessed messages and a very confused on-call engineer. Let's talk about backpressure."
tags:
  - nodejs
  - messaging
  - distributed-systems
  - backend
  - performance
featured: true
---

Here's a scenario that has personally ruined at least one of my evenings: a producer service happily pushing 5,000 events a second into a queue, and a consumer on the other end that can process maybe 800 a second on a good day. Nothing crashes immediately. Nothing throws an error. The queue just... grows. Quietly. For hours. Until memory usage on the broker looks like a hockey stick and someone finally asks "hey, why is Redis using 40GB?"

That's backpressure — or rather, the *absence* of it. It's one of those concepts that sounds academic until it takes down a service at 2 AM, at which point it becomes extremely practical, extremely fast.

## The Bathtub Analogy Nobody Asked For

Imagine a bathtub with the faucet running faster than the drain can drain. You have three options: let it overflow onto the floor (data loss), get a bigger drain (scale the consumer), or turn down the faucet (slow the producer). Backpressure is the mechanism that tells the faucet to turn down. Without it, every async pipeline defaults to "let it overflow onto the floor," which is a bad default for a bathroom and a catastrophic one for a payments queue.

The trap is that async code *feels* safe from this. You fire off a promise, it resolves eventually, everything looks fine in your local dev environment where you're pushing ten events by hand. The problem only shows up under real load, which is exactly when you don't want to be discovering it.

## Where It Actually Bites You

**Unbounded queues.** A lot of "queueing systems" are really just arrays with delusions of grandeur. If you're pushing work into an in-memory array and popping it off with a `setInterval`, there's no ceiling — the array grows until the process runs out of memory and gets OOM-killed, usually mid-request, usually taking other work down with it.

```js
// This "queue" has no concept of backpressure.
const queue = [];

function enqueue(job) {
  queue.push(job); // always succeeds, no matter how full "full" is
}

async function worker() {
  while (true) {
    const job = queue.shift();
    if (job) await process(job); // slow work, one at a time
    await sleep(10);
  }
}
```

If `process()` takes 200ms and `enqueue` gets called 5,000 times a second, this array grows by roughly 4,975 jobs every second, forever, until it doesn't.

**Fan-out without limits.** `Promise.all(items.map(fetchThing))` on a list of 50,000 items isn't concurrency — it's a self-inflicted denial-of-service attack against whatever's on the other end (and against your own event loop, which now has 50,000 pending I/O operations to track).

**Streams that ignore `write()`'s return value.** Node's streams actually *have* backpressure built in — `stream.write()` returns `false` when the internal buffer is full, and that's your signal to stop writing until `'drain'` fires. Almost nobody checks it.

```js
function pump(readable, writable) {
  readable.on('data', (chunk) => {
    const ok = writable.write(chunk);
    if (!ok) {
      readable.pause(); // stop reading until the writable catches up
      writable.once('drain', () => readable.resume());
    }
  });
}
```

That's the entire pattern, and it's the same pattern under every fancier backpressure system you'll ever use: signal when you're full, pause the source, resume when there's room. `pipeline()` from `stream/promises` does this for you automatically, which is why it's the right default over hand-rolled `.on('data')` plumbing — but it's worth knowing what it's doing under the hood, because the same idea shows up in queue consumers, HTTP clients, and database drivers that don't hand it to you for free.

## Backpressure at the Queue Level

Streams solve it in-process, but most real pipelines cross a network boundary — producer, broker, consumer, three separate processes that don't share memory or a `'drain'` event. The fix there isn't a callback, it's a contract: the consumer controls its own pull rate instead of the producer controlling the push rate.

This is exactly why RabbitMQ's `prefetch` and Kafka consumer `max.poll.records` exist — they cap how much unacknowledged work a consumer can be handed at once, so a slow consumer naturally throttles the whole pipeline instead of getting buried.

```js
// RabbitMQ: never hand this consumer more than 10 unacked messages.
// It has to ack (finish) one before it gets another.
channel.prefetch(10);

channel.consume(queueName, async (msg) => {
  await processMessage(msg);
  channel.ack(msg);
});
```

Without `prefetch`, RabbitMQ will happily dump every message in the queue onto a single slow consumer, which then tries to hold all of them in memory while working through them one at a time. `prefetch(10)` turns "here's everything, good luck" into "here's 10, come back when you've finished some" — which is backpressure, just expressed as a broker setting instead of a `false` return value.

On a team I led at Cubet Techno Labs, we had an ingestion pipeline where a downstream enrichment service (calling a third-party API with a hard rate limit) sat behind a RabbitMQ queue fed by a much faster upstream service. Before anyone set `prefetch`, the queue depth graph looked like a staircase to the moon during traffic spikes, and the enrichment service would eventually fall over trying to hold thousands of in-flight messages. Setting `prefetch` to roughly match the enrichment service's real throughput turned that staircase into a flat line. The messages didn't disappear — they just stayed in the queue, which is what queues are for, instead of getting yanked into a process that couldn't handle them.

## The Options, Ranked by How Much They'll Hurt You

1. **Bounded queues with rejection.** Cap the queue size and reject or return a `503` when full. Ugly, honest, and it fails loudly instead of silently, which is usually what you want in production.
2. **Pull-based consumption.** Consumer asks for work when it's ready (prefetch, cursor-based polling, `for await` over an async iterator). This is the pattern that scales cleanly because the rate is set by capacity, not by hope.
3. **Load shedding.** When you're overwhelmed, drop the least important work on purpose. A queue depth metric with a circuit breaker in front of it beats a queue depth metric with a Slack alert nobody's awake to see.
4. **Just buy more consumer capacity.** Sometimes valid! But it's treating the symptom — if your bottleneck is a rate-limited third-party API, more consumers just means more processes waiting on the same rate limit.

## The Actual Lesson

Backpressure isn't a library you install, it's a question you have to ask at every boundary in your pipeline: *what happens when this side is faster than that side?* If you don't have an answer, the answer defaults to "unbounded memory growth," and unbounded memory growth always finds you at the worst possible time.

Go look at one async pipeline you own right now — a queue consumer, a stream pump, a fan-out `Promise.all` — and ask what stops the fast side from outrunning the slow side. If the honest answer is "nothing," you've found tonight's homework.
