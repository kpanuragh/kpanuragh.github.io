---
title: "🕵️ Distributed Tracing with OpenTelemetry: The Case of the Request That Went Missing"
date: "2026-09-04"
excerpt: "Your request touches six services and dies somewhere in the middle. Logs tell you nothing because nobody agreed on a request ID. Here's how OpenTelemetry turns that mystery into a single, followable story."
tags: ["opentelemetry", "observability", "distributed-tracing", "backend", "microservices"]
featured: true
---

Every backend engineer has lived this exact scene: a user says "checkout is slow," you `grep` the API gateway logs, find the request, watch it disappear into the auth service, and then... nothing. The auth service logs a thousand lines a minute and none of them mention *your* request. You've just discovered the central problem of microservices: the moment a request crosses a network boundary, it becomes anonymous.

Logs were built for a single process. Metrics were built for aggregates. Neither one answers "what happened to *this specific request*, across *all six services* it touched, in *what order*?" That's the job distributed tracing was invented for, and OpenTelemetry (OTel) is the thing that finally made it vendor-neutral instead of "whatever your APM vendor's SDK wants you to do."

## The two IDs that make tracing work

A trace is just a tree of **spans** — timed units of work — glued together by two pieces of context that get passed along with the request:

- **Trace ID**: one per end-to-end request. Every span in the whole journey shares it.
- **Span ID**: unique per unit of work, with a `parent span ID` pointing at whoever called it.

That's it. That's the whole trick. If every service agrees to read an incoming trace ID, keep using it, and pass it forward, you get a single tree that spans process boundaries, containers, and even cloud accounts. The propagation format most people use today is [W3C Trace Context](https://www.w3.org/TR/trace-context/) — a `traceparent` HTTP header that looks like:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

`00` is the version, then trace ID, then parent span ID, then flags. Any OTel-instrumented service that sees this header on an incoming request automatically becomes a child of that trace instead of starting a new one. No custom `X-Request-ID` header, no manually threading a correlation ID through every function signature — the SDK does it for you.

## Instrumenting a Node/Express service in about ten lines

Here's the part that surprises people: you often don't write spans by hand at all. OTel ships **auto-instrumentation** packages for the common libraries (`express`, `pg`, `mysql2`, `redis`, `http`, etc.), so a minimal setup looks like this:

```js
// tracing.js — required BEFORE anything else, e.g. `node -r ./tracing.js server.js`
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: 'http://otel-collector:4318/v1/traces' }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

That's it. Every incoming Express request, every outbound `fetch`/`axios` call, every Postgres query now gets a span automatically, with parent/child relationships wired up correctly. The load-bearing detail is the `-r ./tracing.js` — the SDK needs to patch modules before your app `require`s them, so it has to load first.

## Adding your own spans when auto-instrumentation isn't enough

Auto-instrumentation covers "a request came in / a query ran," but it has no idea that your `calculateShippingCost()` function is the thing eating 400ms. For that you add manual spans around the business logic you actually care about:

```js
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('checkout-service');

async function calculateShippingCost(cart) {
  return tracer.startActiveSpan('calculateShippingCost', async (span) => {
    span.setAttribute('cart.itemCount', cart.items.length);
    try {
      const cost = await pricingEngine.quote(cart);
      span.setAttribute('shipping.cost', cost);
      return cost;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: 2 }); // ERROR
      throw err;
    } finally {
      span.end();
    }
  });
}
```

This span nests itself correctly under whatever HTTP span triggered it, automatically, because it inherits the active context. Now when you open the trace in Jaeger, Grafana Tempo, or whatever backend your `OTLPTraceExporter` points at, you see a waterfall: `POST /checkout` → `auth.verify` → `calculateShippingCost` → `pricingEngine.quote` → `pg.query`, each with its own duration, so the 400ms slow request isn't a mystery anymore — it's a bar chart pointing directly at the culprit.

## The part nobody warns you about: sampling and cardinality

At Cubet, the first time we rolled OTel out on a service that did a few thousand requests per second, we traced *everything* and our collector fell over within a day — not from the app load, from ingesting and storing a full trace per request. The fix wasn't fewer spans, it was **sampling**: keep 100% of error traces and slow traces (tail-based sampling), but only a small percentage of routine successful ones. Most collectors (the OTel Collector itself, or vendor backends) support this out of the box — you don't need to hand-roll sampling logic in application code, just configure it at the collector.

The other trap is span attributes with unbounded cardinality — putting a raw user ID or full URL with query params as an attribute value feels harmless until your tracing backend's indexing bill quietly triples. Treat span attributes with the same discipline you'd apply to metric labels: bounded, meaningful values only.

## Why this beats "just add more log statements"

The instinct to solve this with more `console.log` and a shared request ID is understandable, but it means you're manually rebuilding a worse, unindexed version of what a tracer gives you for free: parent/child relationships, timing, and a UI that renders the whole thing as a waterfall instead of a wall of interleaved text. And because OTel is vendor-neutral, switching from Jaeger to Tempo to a commercial APM later is a config change to the exporter, not a rewrite of every service.

If your last three "why is checkout slow" investigations ended in a shrug, that's the tell. Pick one service, drop in auto-instrumentation, point it at a local Jaeger container (`docker run -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one`), and make one real request. The first time you see your own request rendered as an actual tree instead of a guessing game, you won't want to debug any other way.
