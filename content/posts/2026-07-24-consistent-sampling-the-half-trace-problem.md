---
title: "🧩 The Sampling Bug Nobody Notices: When Half Your Trace Goes Missing"
date: "2026-07-24"
excerpt: "You configured sampling on every service. Each one is working exactly as designed. And yet your traces keep showing up with chunks missing, like a comic book where someone tore out every third page. Here's why, and how consistent sampling fixes it."
tags: ["observability", "distributed-tracing", "opentelemetry", "backend", "microservices"]
featured: true
---

Here's a bug report that will make you feel insane: "The trace for order #48213 is missing the payment span." You go check the payment service logs — the request happened, it succeeded, everything's fine. You check the tracing backend. The parent span from the API gateway is there. The database span from the orders service is there. The payment span just... isn't. No error. No dropped span warning. It's simply gone, like it was never emitted.

It was never emitted. And the reason is the single most common mistake teams make when they roll out tracing across more than one service: **each service is sampling independently.**

## The setup that quietly breaks everything

Picture three services in a request path — gateway, orders, payments — and someone configured a 10% probabilistic sampler on each one, because that's what the getting-started guide showed:

```js
// This looks reasonable. It is not, once you have more than one service.
const { TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

const sampler = new TraceIdRatioBasedSampler(0.1); // 10%, decided locally, per service
```

Each service flips its own coin, for its own spans, using its own random number. The gateway keeps a trace 10% of the time. Independently, the orders service keeps *its* spans for that same trace 10% of the time. Independently, payments does the same. The odds that all three keep the same trace aren't 10% — they're 10% × 10% × 10% = 0.1%. Everything else is a Frankenstein trace: a gateway span with no children, or a payment span floating in space with no parent to explain how it got there.

I watched this exact thing happen while onboarding a new service into an existing tracing setup at Cubet Techno Labs. Every other service used the shared sampler config from our OTel Collector, but the new service had bootstrapped its own SDK with the framework default. Traces looked fine for services that had been there from the start, and quietly incomplete for anything touching the new one. Nobody had touched the sampling logic — the bug was that there *were two separate sampling decisions* for what should have been one.

## Fix: the sampling decision travels with the trace, not the service

The correct model is "decide once, honor everywhere." The service that starts the trace (usually the edge — your gateway or the first service to see the request) makes the sampling call, and every downstream service reads that decision off the incoming trace context instead of rolling its own dice:

```js
// Downstream services: don't sample independently — respect the parent's decision
const { ParentBasedSampler, TraceIdRatioBasedSampler } = require('@opentelemetry/sdk-trace-base');

const sampler = new ParentBasedSampler({
  // Used ONLY if there's no parent context (i.e. this service started the trace)
  root: new TraceIdRatioBasedSampler(0.1),
  // If a parent context exists and it was sampled, sample here too. If not, don't.
  remoteParentSampled: new AlwaysOnSampler(),
  remoteParentNotSampled: new AlwaysOffSampler(),
});
```

This is `ParentBasedSampler`, and it exists in every major OpenTelemetry SDK for exactly this reason. The trace context propagated over HTTP headers (`traceparent`, plus the `tracestate` sampling flag) already carries the sampled/not-sampled bit. Downstream services should be *followers*, not independent deciders. Set this everywhere, and the 0.1% collapses back into a clean 10% — every kept trace is a complete trace, because the decision was made exactly once, at the root, and honored all the way down.

## The part that trips people up next: fan-out and batch jobs

Parent-based sampling handles the simple request chain fine. It gets weird the moment you have async fan-out — a message dropped on a queue, picked up by a worker with no live HTTP parent to inherit context from. If the worker doesn't propagate trace context through the message headers, it has no parent to be "based on," and it falls back to its own root sampler. That's a second independent coin flip, and the same fragmentation creeps back in.

The fix isn't a sampler setting, it's discipline: propagate `traceparent` through your message envelope the same way you'd propagate it through an HTTP header.

```js
// Publishing to a queue — carry the trace context in the message, not just the payload
const { propagation, context, trace } = require('@opentelemetry/api');

function publishWithTraceContext(channel, queue, payload) {
  const carrier = {};
  propagation.inject(context.active(), carrier); // writes traceparent/tracestate into carrier
  channel.sendToQueue(queue, Buffer.from(JSON.stringify({ payload, carrier })));
}

// Consuming: extract it back out before starting the worker's span
function handleMessage({ payload, carrier }) {
  const parentContext = propagation.extract(context.active(), carrier);
  context.with(parentContext, () => {
    // any span created in here now has the right parent, and inherits the sampling decision
  });
}
```

Do this for every queue, every scheduled job that fans out from a live request, every webhook you forward internally. Anywhere trace context can silently die — a `JSON.stringify` that drops it, a library that swallows headers — is a place your traces will fragment again.

## The one-sentence version

Sampling isn't a per-service setting, it's a per-trace decision. If your services are each making that call on their own, you don't have 10% sampling — you have a random subset of random subsets, and the traces you actually need to debug an incident are the ones most likely to arrive missing their most important span.

If you're running distributed tracing across more than one service right now, go check: is every service using a parent-based (or otherwise context-respecting) sampler, or did a couple of them quietly default to rolling their own dice? It's a five-minute audit that saves you a very confusing bug report later.
