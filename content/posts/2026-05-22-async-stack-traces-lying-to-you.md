---
title: "🕵️ Your Async Stack Traces Are Lying to You"
date: "2026-05-22"
excerpt: "Async functions obliterate your stack traces at the boundary, leaving you with 'processTicksAndRejections' and a prayer. Here's how to get real observability back."
tags: ["nodejs", "observability", "debugging", "async", "backend"]
featured: true
---

# 🕵️ Your Async Stack Traces Are Lying to You

You're staring at your production logs at 2 AM. Something blew up. You find the error:

```
Error: Cannot read properties of undefined (reading 'id')
    at buildResponse (/app/src/handlers/user.js:42:18)
    at async processTicksAndRejections (node:internal/process/task_queues:95:5)
```

`processTicksAndRejections`. Great. Super helpful. Thanks, Node.

That truncated stack trace tells you *what* broke (line 42 in `user.js`) but nothing about *why* or *how you got there*. Which HTTP route triggered it? Which database query? Which user's request? You have no idea. It's like being handed a crime scene photo with no address and being told to solve the case.

This is the async stack trace problem, and it bites every backend developer eventually.

## Why Async Kills Your Stack Traces

In synchronous code, the call stack is a complete story. Each frame links to the caller above it, all the way up to `main`. You can read it like a novel.

In async code, that chain breaks. When you `await` a Promise, the current call stack is suspended and *discarded*. When the Promise resolves later, execution resumes — but Node rebuilt the stack from the current microtask context, not from where you originally came from. Your entire request history evaporates.

```javascript
async function getUser(id) {
  const row = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  return processUser(row); // 💥 crashes here
}

async function handleRequest(req, res) {
  const user = await getUser(req.params.id);
  res.json(user);
}
```

When `processUser` throws, Node reconstructs a stack starting from the current microtask — not from your route handler. The frames above the first `await` are simply gone. You get `processUser` → void. The router, middleware, and the original request context have all been swallowed by the event loop.

## Node's Built-in Help: Async Stack Traces (and Their Limits)

Modern V8 (Node 12+) ships with async stack trace capture enabled by default. For simple linear chains, it actually works:

```javascript
async function a() { await b(); }
async function b() { await c(); }
async function c() { throw new Error('deep!'); }

a().catch(err => console.error(err.stack));
// Node 18+ gives you: c → b → a 🎉
```

Progress! But try wrapping any of those in `Promise.all`, routing through an event emitter, or passing through a message queue like Redis — the chain snaps again. V8's async trace capture only works for *linear* chains where each frame directly `await`s the next.

In a real backend — with middleware stacks, parallel database calls, and job queues — you lose the trace constantly.

## The Real Fix: AsyncLocalStorage + Correlation IDs

The production-grade solution is to stop *reconstructing* stack traces after the fact and instead *propagate context forward* as your code executes. That's what `AsyncLocalStorage` was built for.

`AsyncLocalStorage` (built into Node's `async_hooks` module) lets you store a value at the start of an async operation and retrieve it from *anywhere* down the call chain — across `await` boundaries, `Promise.all`, event emitters, all of it.

```javascript
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const requestContext = new AsyncLocalStorage();

// Middleware — runs once per request, wraps the whole thing
app.use((req, res, next) => {
  const correlationId =
    req.headers['x-correlation-id'] ?? crypto.randomUUID();

  requestContext.run({ correlationId, path: req.path, startTime: Date.now() }, () => {
    res.setHeader('x-correlation-id', correlationId);
    next();
  });
});

// A logger — no req parameter needed, no matter how deep you are
export function log(level, message, meta = {}) {
  const ctx = requestContext.getStore() ?? {};
  console.log(JSON.stringify({
    level,
    message,
    correlationId: ctx.correlationId,
    path: ctx.path,
    timestamp: new Date().toISOString(),
    ...meta,
  }));
}
```

Now every log line in your system — whether from your route handler, a database utility five files deep, or an async job spawned by a queue worker — carries the same `correlationId`. Your 2 AM debugging session becomes: grep logs for the correlation ID, see every event from that request in chronological order.

We wired this into a distributed job-processing service at Cubet. Before: errors floating in a sea of unlabeled log lines, impossible to reconstruct what triggered what. After: every failure comes with the full request lineage. The on-call rotation went from "I have no idea what happened" to "I found it in 4 minutes."

The `correlationId` should also flow outbound — add it as a header on every downstream HTTP call you make. That way a single user request produces one ID traceable across your entire microservices graph.

## Layer Two: OpenTelemetry Spans

Correlation IDs answer *which request* failed. Spans answer *where time was actually spent* and *what the causal chain was*.

OpenTelemetry (OTel) is the observability standard for distributed systems. You instrument your code with named, timed spans, and a trace viewer (Jaeger, Honeycomb, Grafana Tempo) stitches them into a visual timeline of exactly what happened.

```javascript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('user-service');

async function getUser(id) {
  return tracer.startActiveSpan('db.getUser', async (span) => {
    span.setAttribute('user.id', id);
    try {
      const row = await db.query('SELECT * FROM users WHERE id = ?', [id]);
      return processUser(row);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

The killer feature: OTel trace context propagates automatically across `await` *and* across service boundaries via HTTP headers. You get an end-to-end trace from the frontend HTTP request all the way through your microservices — without manually threading anything.

## Quick Wins You Can Do Right Now

If full OTel instrumentation isn't on the table yet, these help immediately:

**Throw `Error` objects, not strings.** `throw 'something went wrong'` produces zero stack trace. `throw new Error('something went wrong')` gives you one. This is the lowest-effort fix with the highest observability payoff.

**Label your parallel branches.** When a `Promise.all` fails, you lose which branch threw. Tag the error:

```javascript
const [users, orders] = await Promise.all([
  fetchUsers().catch(e => { e.source = 'fetchUsers'; throw e; }),
  fetchOrders().catch(e => { e.source = 'fetchOrders'; throw e; }),
]);
```

**Enable source maps in production.** If you're running TypeScript or any bundler, your stack traces point to compiled line numbers. Add `--enable-source-maps` to your Node start command and make sure `.js.map` files ship with your deployment. Suddenly `dist/index.js:1:38472` becomes `src/handlers/user.ts:42:5`.

## The Bottom Line

Async stack traces are bad by default because that's the fundamental tradeoff JavaScript's event loop makes — context doesn't survive async boundaries for free. You have to earn it back:

- **`AsyncLocalStorage`** buys you correlation context that survives your entire request lifecycle
- **OpenTelemetry spans** buy you causal chains you can visualize across services
- **Error objects + source maps** are table stakes that cost you nothing

The goal isn't a perfect reconstructed stack trace. It's making sure that when something breaks at 2 AM, you have enough context to understand exactly what happened — without needing to reproduce it in a debugger, fire up a REPL, or add 40 `console.log` statements and redeploy.

Your future self, three on-call incidents from now, will thank you.

---

*What's your go-to async debugging setup? AsyncLocalStorage, OTel, something else entirely? I'm always curious how different teams tackle the context propagation problem.*
