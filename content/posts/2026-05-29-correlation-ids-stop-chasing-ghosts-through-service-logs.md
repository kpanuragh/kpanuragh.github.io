---
title: "🧵 Correlation IDs: Stop Chasing Ghosts Through Your Service Logs"
date: "2026-05-29"
excerpt: "A single user request touches 6 services and fails somewhere. Your logs are a blizzard of timestamps with no thread connecting them. Correlation IDs are the red string on your detective board — here's how to wire them across every service you own."
tags:
  - observability
  - backend
  - distributed-systems
  - logging
  - microservices
  - nodejs
featured: true
---

Picture this. It's 2 AM. A customer complains their checkout failed. You pull up Kibana, stare at 40,000 log lines from six different services, and try to mentally reconstruct what happened to *their* request. You're basically an archaeologist brushing sand off bones — except the bones are scattered across six zip codes and none of them are labelled.

This is life without correlation IDs.

## What Is a Correlation ID, Actually?

A correlation ID (also called a trace ID or request ID) is a unique identifier generated at the edge of your system — the moment a request walks in the door — and **threaded through every service that touches that request**. Every log line emitted during that request's journey carries the same ID. Pull the ID, get the full story.

It sounds embarrassingly simple. That's because it is. And yet I've joined production systems at Cubet where 3-year-old microservices had gorgeous structured logging but zero correlation — every service was narrating a different story about events they had no idea were related.

The detective board analogy is apt: correlation IDs are the red string. Without them, you have a wall of photographs with no connections drawn.

## Generating and Propagating the ID

The entry point — your API gateway, load balancer, or outermost Express service — is responsible for minting the ID if the request doesn't already carry one. If it does carry one (forwarded by another service or a client SDK), respect it.

```typescript
// middleware/correlationId.ts
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export const correlationStore = new AsyncLocalStorage<string>();

export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const id =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    randomUUID();

  res.setHeader('x-correlation-id', id);

  correlationStore.run(id, () => next());
}
```

`AsyncLocalStorage` is the secret weapon here. It gives you a per-request context that survives `await` boundaries without you having to manually pass the ID down through every function call. No prop-drilling for observability.

Your logger then pulls the ID automatically:

```typescript
// lib/logger.ts
import pino from 'pino';
import { correlationStore } from '../middleware/correlationId';

const base = pino({ level: 'info' });

export const logger = {
  info: (msg: string, data?: object) =>
    base.info({ correlationId: correlationStore.getStore(), ...data }, msg),
  error: (msg: string, data?: object) =>
    base.error({ correlationId: correlationStore.getStore(), ...data }, msg),
  warn: (msg: string, data?: object) =>
    base.warn({ correlationId: correlationStore.getStore(), ...data }, msg),
};
```

Every `logger.info(...)` call anywhere in the codebase — inside a database query, inside a queue handler, inside a third-party SDK callback — automatically includes the correlation ID. Zero discipline required from your teammates.

## Forwarding to Downstream Services

Generating and logging the ID locally is half the job. The other half is **forwarding it when your service calls another service**. If you forget this part, the thread snaps the moment you cross a service boundary.

```typescript
// lib/httpClient.ts
import axios from 'axios';
import { correlationStore } from '../middleware/correlationId';

export function createServiceClient(baseURL: string) {
  const client = axios.create({ baseURL });

  client.interceptors.request.use((config) => {
    const id = correlationStore.getStore();
    if (id) {
      config.headers['x-correlation-id'] = id;
    }
    return config;
  });

  return client;
}
```

One interceptor, registered once. Every outbound HTTP call from this client carries the ID. The downstream service picks it up via the same middleware we wrote earlier, threads it through its own logs, and forwards it again when *it* calls a third service.

Same principle applies to message queues. When you publish a job to BullMQ, Redis Streams, or RabbitMQ, serialize the correlation ID into the message payload. The consumer reads it out and re-hydrates it into `AsyncLocalStorage` before processing.

## What Your Logs Look Like After

Before correlation IDs, a log query for a failed checkout might return:

```
[order-service]   ERROR  Payment gateway timeout
[payment-service] INFO   Received charge request
[auth-service]    INFO   Token validated for user 8812
[order-service]   INFO   Order created: ord_abc123
```

Four lines, no idea if they're related. You're guessing based on timestamps, hoping the clocks across services are synchronized (they're not, by the way — NTP drift is real).

After:

```json
{ "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "service": "auth-service",    "msg": "Token validated for user 8812" }
{ "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "service": "order-service",   "msg": "Order created: ord_abc123" }
{ "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "service": "payment-service", "msg": "Received charge request" }
{ "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "service": "order-service",   "msg": "Payment gateway timeout" }
```

One query in Kibana: `correlationId: "f47ac10b-..."`. Full story, ordered by time, across every service. The 2 AM investigation that used to take an hour now takes two minutes.

## Return It to the Client

Always echo the correlation ID back in the response headers. When a customer reports a problem, they can include the ID from their browser's network tab. That single value lets you replay their entire journey through your logs without them describing what they clicked.

```typescript
// If something blows up in your error handler:
res.status(500).json({
  error: 'Something went wrong',
  requestId: res.getHeader('x-correlation-id'),
});
```

Now your support team can say "can you check your network tab for the `x-correlation-id` header?" and actually mean it. Before this, that question was theatre.

## The Bigger Picture

Correlation IDs are the foundation on which proper distributed tracing is built. Tools like Jaeger, Zipkin, and OpenTelemetry all operate on the same principle — a trace ID that crosses service boundaries — but they add span trees, timing data, and dependency graphs on top. If you're not ready to adopt a full tracing stack yet, correlation IDs give you 80% of the debugging value at 5% of the complexity.

At Cubet, we retrofit correlation IDs into legacy services before anything else when we're onboarding a system for observability improvements. It's the highest-ROI change you can make to a distributed system that has no observability story.

## TL;DR

- Generate a UUID at the edge; respect an incoming one if present.
- Use `AsyncLocalStorage` to thread it through your async call stack without prop-drilling.
- Attach it to every log line automatically via your logger wrapper.
- Forward it in every outbound HTTP call and message queue publish.
- Return it to the client in response headers.

Correlation IDs won't prevent failures. Nothing will. But they'll turn your 2 AM detective session from "needle in a haystack" into "grep and go home."

Your future on-call self will thank you.

---

*Running microservices and still doing your log archaeology by timestamp? Drop a comment — I'd love to hear what you're using for observability, or what's stopping you from adding correlation IDs today.*
