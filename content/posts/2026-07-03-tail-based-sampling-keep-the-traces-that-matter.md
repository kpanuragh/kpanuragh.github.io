---
title: "🎣 Tail-Based Sampling: How to Stop Throwing Away the One Trace You Actually Needed"
date: "2026-07-03"
excerpt: "Head-based sampling decides whether to keep a trace before it even knows if anything went wrong. Tail-based sampling waits for the plot twist. Here's why that difference matters and how to actually run it."
tags: ["observability", "distributed-tracing", "opentelemetry", "backend", "nodejs"]
featured: true
---

Picture a bouncer at a club who decides whether you're getting in **before you've even walked up**. That's head-based sampling. It flips a coin — 1% chance, 10% chance, whatever you configured — the moment a request starts, and it commits. It has no idea yet that this particular request is about to time out talking to the payment service, retry three times, and eventually 500 your favorite customer's checkout. Doesn't matter. Coin already flipped. Trace already discarded.

Tail-based sampling is the bouncer who watches the whole night unfold before deciding who gets written into the story. It waits until the request is *done* — every span collected, every error tagged, every latency measured — and only then decides whether this trace was interesting enough to keep.

If you've ever grepped through Jaeger or Tempo looking for the one slow request a customer complained about, and found... nothing, because it got sampled out at 1% before anyone knew it would matter, you already understand the problem tail-based sampling exists to solve.

## Why head-based sampling quietly betrays you

Head sampling is cheap and simple, which is exactly why every tracing tutorial leads with it:

```js
// OpenTelemetry Node.js SDK — classic head-based sampling
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

const provider = new NodeTracerProvider({
  sampler: new TraceIdRatioBasedSampler(0.05), // keep 5%, decided at request start
});
```

That 5% is a flat, blind sample. Statistically it's *fine* for understanding your overall latency distribution. It is *useless* for catching the rare stuff — the one-in-a-thousand deadlock, the customer whose account somehow triggers a retry storm, the request that's slow only when it hits a specific shard. Rare-but-critical events are, by definition, rare. A flat percentage sample will almost never catch them, which means the traces you need most are the ones most likely to be missing when you go looking.

I ran into this at Cubet Techno Labs while chasing an intermittent latency spike that only showed up for about 0.3% of requests to a downstream inventory service. Our head sampler was set to 2%. Do the math — we were sampling that failure mode roughly one time in fifteen thousand requests. We had dashboards showing the p99 creeping up and *zero* traces explaining why. It felt like watching a check-engine light with no ability to pop the hood.

## What tail-based sampling actually buys you

A tail sampler sits behind your services, buffers all the spans for a trace until it's complete, and then applies rules like:

- Keep it if it has an error
- Keep it if latency exceeds some threshold
- Keep it if it touches a specific service or route you're currently worried about
- Otherwise, sample it at some low background rate for statistical coverage

The OpenTelemetry Collector ships a `tail_sampling` processor that does exactly this:

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: keep-errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: keep-slow
        type: latency
        latency: { threshold_ms: 800 }
      - name: background-sample
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }
```

That `decision_wait: 10s` line is the whole trick — the collector holds every span for up to 10 seconds, waits to see how the trace resolves, and *then* decides. Errors and slow requests get kept regardless of the dice roll. Everything else gets the boring flat sample for trend-line purposes. You end up with a small dataset that's disproportionately full of the traces you'd actually want to open at 2am.

## The catch nobody puts in the marketing slide

Tail sampling isn't free, and pretending otherwise is how teams end up with a collector fleet that falls over under its own cleverness. Buffering every span for every in-flight trace means:

1. **Memory pressure.** The collector needs to hold complete trace data for the entire `decision_wait` window, for every trace, before it can throw anything away. High-traffic services need a collector tier sized for this, not an afterthought sidecar.
2. **All spans for one trace must land on the same collector instance.** If your trace's spans get load-balanced across different collector replicas, no single one has the full picture to make a keep/drop decision. You need consistent routing — typically hashing on trace ID — before spans hit the tail sampling processor.
3. **Decision latency is a real cost.** A 10-second wait means your "did this error?" signal lags by 10 seconds. Fine for debugging, less fine if you're piping sampled traces into something latency-sensitive.

The practical answer most teams land on is a hybrid: a small head-based sample for baseline volume/cost control, layered under a tail-based policy tier that guarantees you never lose an error or an outlier. You're not choosing one philosophy — you're building a funnel.

## Try this before your next incident

If you're running OpenTelemetry today with a flat percentage sampler, the smallest useful change you can make this week is adding an error-and-latency tail policy in front of your existing collector — even without touching your instrumentation code. You'll be shocked how much of your "we have no idea why that failed" backlog turns into "oh, here's the trace" once you stop discarding the interesting requests before you know they're interesting.

Go check your collector config. If the word "sampler" only appears once and it's a flat percentage, that's your next PR.
