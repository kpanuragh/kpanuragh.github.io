---
title: "🧵 Correlation IDs: The One Header That Survives Your Microservices Split"
date: "2026-08-14"
excerpt: "You broke the monolith into twelve services and now a single failed checkout produces twelve unrelated log lines in twelve places. Correlation IDs are the boring, cheap fix — here's how to actually wire them through, not just talk about them."
tags: ["observability", "microservices", "logging", "backend", "distributed-systems"]
featured: true
---

Here's a debugging session I've lived through more times than I'd like to admit: a customer says checkout failed. You open the API gateway logs — nothing obviously wrong, 200 OK, request came in and went out. You open the payment service logs — a wall of entries, none of which say "this one, this is the one you want." You open the inventory service, the notification service, the fraud-check service. Somewhere in that pile is the actual failure, but finding it means grepping five log streams for a timestamp that's "close enough" and hoping you got lucky.

That entire miserable exercise exists because nothing tied those five log lines together in the first place. One request, one customer, one failure — scattered across five services with zero shared identity. Correlation IDs fix this, and the fix is almost insultingly simple: generate one ID per request, stamp it on everything, and never let a service drop it on the floor.

## The idea in one sentence

When a request enters your system, generate an ID. Pass that ID to every downstream call — HTTP headers, message queue metadata, gRPC context, whatever your transport is. Every log line any service writes while handling that request includes the ID. Now "find everything related to this failure" is a single query instead of an archaeology dig.

That's it. That's the whole concept. The hard part isn't understanding correlation IDs — every backend engineer nods along in the design doc. The hard part is discipline: making sure the ID actually survives every hop, including the ones nobody thought to test.

## Where it actually breaks

In practice, correlation IDs die in a few predictable places:

1. **The async boundary.** HTTP middleware happily propagates headers, then someone publishes a Kafka message or enqueues a background job and forgets the ID was ever a thing. The moment work leaves the request/response world, people stop thinking about it.
2. **The internal fire-and-forget call.** A service calls another service "just to log an audit event" and reaches for a bare `fetch()` instead of the shared HTTP client that injects headers automatically.
3. **The retry/queue consumer.** A message sits in a dead-letter queue for six hours, gets reprocessed, and by then nobody remembers — or stored — which request originally produced it.

At Cubet, we hit the second one almost immediately after splitting out a notifications service. Every other service used a shared internal HTTP client with correlation propagation baked in, except one endpoint that had been hand-rolled with plain `axios` before the pattern existed. It worked fine for months — until an incident where the notification never fired, and the trail just stopped dead at the service boundary because the header simply wasn't there. The fix took ten minutes. Finding that it was the cause took four hours, which is exactly the tax you pay for skipping this in the first place.

## A minimal Express implementation

You don't need a vendor or a tracing platform to get value here — a UUID and some middleware discipline will do:

```javascript
const { randomUUID } = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const correlationStorage = new AsyncLocalStorage();

function correlationMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || randomUUID();
  res.setHeader('x-correlation-id', correlationId);
  correlationStorage.run({ correlationId }, next);
}

function getCorrelationId() {
  return correlationStorage.getStore()?.correlationId;
}
```

The `AsyncLocalStorage` piece matters more than it looks — without it, you're stuck threading the ID through every function signature by hand, which nobody does consistently past the third file. With it, any logger call anywhere in the request's async chain can just ask for the current ID.

Then your logger and your outbound HTTP client both lean on the same context:

```javascript
function log(level, message, meta = {}) {
  console.log(JSON.stringify({
    level,
    message,
    correlationId: getCorrelationId(),
    ...meta,
    timestamp: new Date().toISOString(),
  }));
}

async function callDownstream(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'x-correlation-id': getCorrelationId(),
    },
  });
}
```

Now every service in the chain logs with the same ID, and every outbound call carries it forward automatically — no one has to remember to pass it manually, which is the entire reason it kept getting dropped before.

## Don't stop at HTTP

The same rule applies to anything asynchronous. If you publish to Kafka, RabbitMQ, or SQS, the correlation ID goes in the message headers or metadata, not just the body (bodies get transformed, filtered, or dropped by consumers that don't care about your debugging needs — headers survive more reliably). If you write to a dead-letter queue, carry the ID with the message so a reprocessed failure still points back to its origin. If you're already running distributed tracing with OpenTelemetry, you get a lot of this for free via trace IDs — but plenty of teams have solid Node or Django backends without a tracing platform yet, and a plain correlation ID costs you an afternoon, not a quarter-long rollout.

## The payoff

The value isn't visible until the day you need it, which is exactly why it's easy to skip. Then one Tuesday a customer reports a failed checkout, and instead of five separate log searches and a lot of squinting at timestamps, someone runs one query for one ID and has the full story — gateway, payment, inventory, notification — in order, in seconds. Cheap to build, easy to forget, and the single highest-leverage thing you can add to a service split before it grows past three services. If you've got more than two services talking to each other and no shared request ID yet, that's this week's ticket.
