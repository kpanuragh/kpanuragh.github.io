---
title: "🎯 Tail-Based Sampling: Deciding What to Keep After the Trace Already Happened"
date: "2026-07-31"
excerpt: "Head-based sampling flips a coin before your request even starts. Tail-based sampling waits for the whole story, then decides who deserves a spot in your trace backend — and it changes everything about which bugs you actually see."
tags: ["observability", "distributed-tracing", "opentelemetry", "backend"]
featured: true
---

Here's a scenario that will feel uncomfortably familiar if you've ever run distributed tracing at scale: a customer files a ticket saying "checkout was slow for me around 2:14pm." You go to your tracing backend, search for their request, and... nothing. Sampled out. The one trace you actually needed — the slow, weird, broken one — got flipped away by a coin toss before your service even finished the first database call.

That's the fundamental flaw of **head-based sampling**: the decision to keep or drop a trace happens at the very start of the request, before anyone knows whether it's going to be interesting. You're essentially sampling blind.

**Tail-based sampling** flips this around. Instead of deciding upfront, you buffer the entire trace — every span, from every service the request touched — and only decide whether to keep it *after* it's finished. Now your sampling decision can actually use information: did it error? Was it slow? Did it touch a flagged customer account? Did retries happen?

## Head-based: fast, cheap, blind

The classic approach lives in a single line, usually right where the trace starts:

```javascript
// Head-based sampling — decided at request start, no context yet
function shouldSample(traceId, sampleRate = 0.01) {
  // Hash the trace ID so the decision is consistent across services
  const hash = parseInt(traceId.slice(0, 8), 16);
  return (hash % 10000) / 10000 < sampleRate;
}
```

It's cheap — one hash, one comparison, done in nanoseconds. It scales beautifully because every service makes the same decision independently (as long as they all propagate the same trace ID and use the same hash). The problem is purely informational: at the moment this function runs, you don't know if the request is about to blow up with a 500, hang for 8 seconds waiting on a lock, or sail through in 40ms. You're sampling on vibes.

At 1% sampling, if only 0.5% of your requests error, you'll capture roughly one in two hundred of your actual incidents. That's not observability, that's a lottery.

## Tail-based: informed, expensive, honest

Tail-based sampling needs a **collector** that sits between your services and your trace backend, buffers spans in memory keyed by trace ID, waits for the trace to look "complete" (a timeout, usually a few seconds), and only then applies a policy:

```yaml
# OpenTelemetry Collector — tail_sampling processor
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
      - name: keep-a-sliver-of-everything-else
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }
```

This is the difference between "throw away 99% of requests randomly" and "keep every error, every slow one, plus a healthy baseline sample of the boring traffic." Suddenly the customer's slow checkout trace isn't a needle in a haystack — it's guaranteed to survive because it crossed your latency threshold.

The catch, and it's a real one, is cost and complexity. Every span from every service has to reach the collector *before* a decision is made, which means:

- You need enough memory in your collector fleet to buffer traces in flight — a trace spanning ten microservices with a slow downstream call can sit around for the full `decision_wait` window.
- Trace context has to actually complete before the timeout, or you'll drop legitimately slow-but-valid traces because the collector gave up waiting.
- If your services are horizontally sharded across multiple collectors, you need consistent routing (usually by trace ID) so all the spans for one trace land on the same collector instance — otherwise nobody has the full picture to make a decision.

At Cubet Techno Labs, we run a hybrid: a cheap head-based floor (never below 2%, so we always have a statistical baseline for latency dashboards) feeding into a tail-based layer that unconditionally keeps anything with an error status or p99+ latency. That combination gets us both the long-term trend data and the actual incident traces, without buffering literally everything.

## The knob that actually matters: `decision_wait`

Most teams tune the sampling percentage and forget about `decision_wait`, but it's the setting that decides whether you catch the failure mode you actually care about. If your slowest legitimate request takes 12 seconds end-to-end and your `decision_wait` is 5 seconds, the collector makes its keep/drop call on an incomplete trace — meaning the slow branch that made the request interesting in the first place never even arrives before the decision fires.

```yaml
processors:
  tail_sampling:
    decision_wait: 15s   # must exceed your real p99.9 request duration
```

Set this too low and tail-based sampling quietly degrades back into head-based sampling with extra steps — you're paying the buffering cost without getting the informed decision you wanted.

## Where to start

You don't need to rip out head-based sampling to get value here. Start with a single tail-based policy — "always keep errors" — sitting behind your existing head sample rate, and watch how much easier your next "it was slow for me" ticket gets to reproduce. Once you trust the collector isn't falling over under the buffering load, layer in a latency threshold policy next.

The traces you drop are a bet that they weren't interesting. Tail-based sampling is just refusing to make that bet until you've actually seen the hand.
