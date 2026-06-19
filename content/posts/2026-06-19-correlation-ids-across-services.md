---
title: "🧵 Correlation IDs: Stop Playing Hide-and-Seek With Bugs Across Services"
date: "2026-06-19"
excerpt: "When a request fails across five microservices, finding the root cause without a correlation ID is like solving a murder mystery where every detective has amnesia. Here's how to thread the needle."
tags:
  - backend
  - observability
  - distributed-systems
  - nodejs
  - microservices
  - debugging
featured: true
---

Picture this: a user hits "Checkout." The request touches your API gateway, an auth service, a pricing service, an inventory service, and finally the order service — which quietly dies with a 500. Your Slack is on fire. You open your logs and see thousands of lines from all five services, timestamps slightly misaligned, and absolutely zero way to tell which log lines belong to *this one user's failed request*.

Congratulations. You have just enrolled in the ancient ritual of `grep`-ing logs in production at 2 AM.

There is a better way, and it costs almost nothing to implement: **correlation IDs**.

---

## What Is a Correlation ID?

A correlation ID (also called a request ID or trace ID in lighter contexts) is a unique identifier generated at the *edge* of your system — usually by the first service to receive a request — and then **threaded through every downstream service call, log line, and event** for the lifetime of that request.

When something breaks, you search for that one ID and instantly see the complete story: every service that touched the request, in what order, how long each step took, and exactly where it fell over.

It is the difference between "something failed somewhere in the checkout flow" and "the inventory service timed out calling the warehouse API at 14:23:07.381."

---

## The Pattern in Three Parts

### 1. Generate at the Edge

The first service to receive an inbound request either reads a correlation ID from the incoming headers (if a trusted upstream set one) or generates a fresh one.

```typescript
// Express middleware — runs on every incoming request
import { v4 as uuidv4 } from 'uuid';

export function correlationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const correlationId =
    (req.headers['x-correlation-id'] as string) || uuidv4();

  // Attach to request so handlers can read it
  req.correlationId = correlationId;

  // Echo it back so callers can correlate their own logs
  res.setHeader('x-correlation-id', correlationId);

  next();
}
```

Register this before any route handler. Every request now has an identity.

### 2. Propagate Downstream

This is the part most teams skip, which is also why it doesn't work for them. Generating an ID at the edge is useless if service B doesn't tell service C about it.

```typescript
// Axios instance used for all inter-service HTTP calls
import axios from 'axios';
import { AsyncLocalStorage } from 'node:async_hooks';

export const correlationStore = new AsyncLocalStorage<string>();

export const internalClient = axios.create();

internalClient.interceptors.request.use((config) => {
  const correlationId = correlationStore.getStore();
  if (correlationId) {
    config.headers['x-correlation-id'] = correlationId;
  }
  return config;
});
```

Then in your middleware, seed the store so it flows through the entire async call tree:

```typescript
export function correlationMiddleware(req, res, next) {
  const correlationId =
    (req.headers['x-correlation-id'] as string) || uuidv4();

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  // Every async operation in this request's lifecycle inherits this value
  correlationStore.run(correlationId, next);
}
```

`AsyncLocalStorage` is the Node.js equivalent of a thread-local variable. It carries context through `async/await` chains, promises, and callbacks without you manually passing it everywhere. It is genuinely one of the nicer things in the Node.js standard library.

### 3. Include It in Every Log Line

A correlation ID is only as useful as your logs make it. Make sure your logger always pulls from the store:

```typescript
import winston from 'winston';
import { correlationStore } from './correlation';

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

export function log(level: 'info' | 'warn' | 'error', message: string, meta = {}) {
  logger.log(level, message, {
    correlationId: correlationStore.getStore() ?? 'none',
    ...meta,
  });
}
```

Now every log line — regardless of which service or which async depth emitted it — carries the same `correlationId`. Searching your log aggregator (Loki, Datadog, CloudWatch, whatever) for a single ID returns the complete picture.

---

## Message Queues Are Not Exempt

HTTP is the easy case. The pattern breaks down when requests fan out to background jobs or message queues. The fix: embed the correlation ID in the message payload itself.

```json
{
  "type": "order.created",
  "correlationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "payload": { "orderId": "ord_9823", "userId": "usr_1122" }
}
```

The consumer reads the ID from the envelope and seeds `AsyncLocalStorage` before processing. Same pattern, same result — your background worker logs tie back to the original HTTP request that triggered them.

At Cubet, we added this to a RabbitMQ-based notification pipeline after a particularly painful incident where a batch of emails silently failed and we had absolutely no way to tell which API call had triggered them. Adding the correlation ID to the message schema took an afternoon; the first time it saved us from a 3-hour debug session, we felt like geniuses.

---

## A Few Gotchas Worth Knowing

**Don't trust caller-supplied IDs blindly.** If an external client sends an `x-correlation-id`, validate it's a sane UUID before using it. A malicious or buggy client could inject something that pollutes your logs or breaks your search queries.

**Log the ID at request start and end.** Bracketing your logs with `request started` and `request completed (200, 47ms)` entries that include the correlation ID means you can immediately see if a request *started* but never *completed* — a great signal for timeout or crash scenarios.

**Correlation IDs ≠ distributed tracing.** If you need timing breakdowns, dependency graphs, and sampling, look at OpenTelemetry — trace IDs there serve a similar purpose but integrate with full-blown tracing backends (Jaeger, Tempo, Honeycomb). Correlation IDs are the lightweight version: one header, one field in your logs, immediate debugging leverage without standing up new infrastructure.

---

## The Payoff

The first time you have an incident and someone pastes a correlation ID into your log search and instantly sees the full 400ms journey of a failed request across six services — the exact line where it died, the exact service, the exact timestamp — you will wonder how you ever lived without this.

It is one of those changes that seems minor until the moment it saves you, at which point it feels like magic.

Add the middleware today. You will thank yourself on the next pager night.

---

*Shipping microservices without correlation IDs is brave. Debugging them without correlation IDs is suffering. Pick one.*
