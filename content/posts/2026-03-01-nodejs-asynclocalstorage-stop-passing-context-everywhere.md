---
title: "🧵 Node.js AsyncLocalStorage: Stop Passing Request IDs Through 12 Function Calls"
date: 2026-03-01
excerpt: "You've seen the pattern: requestId threads through every function signature like a bad cold that just won't quit. AsyncLocalStorage fixes this elegantly — here's how."
tags: ["nodejs", "express", "backend", "async", "observability"]
featured: true
---

# 🧵 Node.js AsyncLocalStorage: Stop Passing Request IDs Through 12 Function Calls

Picture this: you're debugging a production incident at 2am. Your logs are a blizzard of messages from dozens of concurrent requests, all blurred together. You desperately want to filter by request ID — but half your log lines don't even have one, because Steve from the payments team forgot to thread it through `processPayment()` → `validateCard()` → `chargeStripe()` → `sendReceipt()`.

Sound familiar? There's a built-in Node.js API that fixes this, and most developers have never heard of it: **AsyncLocalStorage**.

## The "Prop Drilling" Problem, But for Your Backend

In React, prop drilling is when you pass a value through seven components just to reach the one that actually needs it. Backend devs do the same thing with context — request IDs, user info, correlation IDs — threading them through every function signature like a thread through a very, very long needle.

```javascript
// The before picture: misery incarnate
async function handleRequest(req, res) {
  const requestId = req.headers['x-request-id'];
  const user = await getUser(req.userId, requestId); // 👈 passing it here
  const order = await createOrder(user, requestId);  // 👈 and here
  await sendConfirmation(order, requestId);           // 👈 and here too
  res.json({ success: true });
}

async function getUser(userId, requestId) {
  logger.info('Fetching user', { requestId }); // finally using it
  return db.query('SELECT * FROM users WHERE id = ?', [userId]);
}
```

Every function in your call stack needs to know about `requestId`, even if it doesn't care. It's like making every employee wear a visitor badge in a building they already work in — technically it makes sense, but it's exhausting.

## Enter AsyncLocalStorage

`AsyncLocalStorage` is Node.js's answer to thread-local storage (for those of you with Java scars). It lets you store values that automatically flow through async operations — promises, callbacks, `setTimeout`, you name it — without manually passing them around.

Here's the same example, but actually enjoyable to look at:

```javascript
import { AsyncLocalStorage } from 'async_hooks';

// Create a store — think of it as a magical backpack
// that follows your request everywhere it goes
const requestContext = new AsyncLocalStorage();

// Express middleware to start the context
function contextMiddleware(req, res, next) {
  const store = {
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    userId: req.user?.id,
    startTime: Date.now(),
  };

  // Everything called inside this callback shares the store
  requestContext.run(store, () => {
    next();
  });
}

// A tiny helper so you don't repeat yourself
function getContext() {
  return requestContext.getStore();
}

// Your logger now automatically has the request ID
function logger(level, message, extra = {}) {
  const ctx = getContext();
  console.log(JSON.stringify({
    level,
    message,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    ...extra,
  }));
}

// Now look at how clean your functions are:
async function handleRequest(req, res) {
  const user = await getUser(req.userId);   // no requestId arg!
  const order = await createOrder(user);     // still no requestId arg!
  await sendConfirmation(order);             // beautiful.
  res.json({ success: true });
}

async function getUser(userId) {
  logger('info', 'Fetching user'); // requestId is automatic
  return db.query('SELECT * FROM users WHERE id = ?', [userId]);
}
```

The `requestContext.run(store, callback)` call creates a new "zone" where the store is available. Every async operation kicked off inside that zone — every `await`, every `.then()`, every callback — automatically has access to the same store via `getContext()`.

It's like giving your request its own little universe where the context just *exists*, no matter how deep you go.

## A Real-World Pattern: The Context Module

In practice, you'll want to centralize this into a clean module your whole app can import:

```javascript
// lib/context.js
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

const storage = new AsyncLocalStorage();

export function runWithContext(initialData, fn) {
  return storage.run(initialData, fn);
}

export function getRequestId() {
  return storage.getStore()?.requestId ?? 'no-context';
}

export function getCurrentUser() {
  return storage.getStore()?.user ?? null;
}

export function setContextValue(key, value) {
  const store = storage.getStore();
  if (store) store[key] = value;
}

// middleware/context.middleware.js
import { runWithContext } from '../lib/context.js';

export function contextMiddleware(req, res, next) {
  runWithContext(
    {
      requestId: req.headers['x-request-id'] || randomUUID(),
      user: req.user || null,
      path: req.path,
      method: req.method,
    },
    () => next()
  );
}
```

Register the middleware early in your Express app (before your routes), and every subsequent function call — services, repositories, utilities — can pull context without needing it passed as an argument.

The result? Your log queries become `requestId:abc-123`, and you can trace a single request through 40 log lines across 8 different functions instantly. Your 2am debugging session drops from 2 hours to 10 minutes.

## What About Performance?

Fair question. `AsyncLocalStorage` does add a small overhead because Node.js has to track async contexts. In practice, for most web APIs (I/O-bound, handling hundreds to low thousands of req/sec), it's negligible — we're talking sub-millisecond per request.

If you're writing a high-throughput, CPU-saturated service, benchmark it for your use case. But for the vast majority of Express apps? You'll never notice the difference, and the observability gains are *enormous*.

## The Takeaway

`AsyncLocalStorage` is one of those Node.js features that makes you wonder how you ever lived without it once you try it. No more threading request IDs through 12 function signatures. No more "who forgot to pass the context" debugging sessions. Just clean, readable code where context flows naturally through your async operations.

It's also the foundation of how frameworks like Next.js server actions, OpenTelemetry tracing, and some database ORM transaction helpers actually work under the hood — so understanding it levels you up fast.

---

**Give it a shot in your next Express project.** Add the context middleware, wire up your logger to pull `requestId` automatically, and watch your log correlation go from "chaotic mess" to "actually useful". Your future 2am self will thank you.

Got questions or a clever use case for `AsyncLocalStorage`? Drop a comment below or find me on GitHub — I'd love to see what you build with it.
