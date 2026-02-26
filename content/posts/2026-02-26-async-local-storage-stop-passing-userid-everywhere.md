---
title: "🧵 AsyncLocalStorage: Stop Passing userId Through 15 Function Signatures"
date: 2026-02-26
excerpt: "You know that feeling when userId shows up in a function parameter, then the caller, then the caller's caller, and suddenly it's req.user all the way down six layers? Node.js has had a fix for this since v16. Nobody told you."
tags: ["nodejs", "javascript", "backend", "express", "asynclocalstorage"]
featured: true
---

Here's a quick smell test for your Node.js codebase: search for `userId` as a function parameter. If it shows up in more than three files, you have a problem I spent way too long living with.

The pattern goes like this. A request comes in, you authenticate the user, and now you need `userId` in your service. Your service calls a repository. The repository calls a utility. The utility calls a logger. The logger needs... `userId`. So you pass it through every single function signature like the world's most annoying relay race.

```js
async function handleOrder(req, res) {
  await processOrder(req.body.orderId, req.user.id); // 👈 here it starts
}

async function processOrder(orderId, userId) {
  await chargeCustomer(orderId, userId); // 👈 and here
}

async function chargeCustomer(orderId, userId) {
  await sendReceipt(orderId, userId); // 👈 and here
}

async function sendReceipt(orderId, userId) {
  logger.info('Receipt sent', { userId }); // 👈 this is why we're doing all this
}
```

Four function signatures. One log line. Surely there's a better way.

There is. It's called `AsyncLocalStorage`, it's been in Node.js since v12 (stable in v16), requires zero packages, and most Node.js developers have never heard of it.

## 🤔 What Even Is AsyncLocalStorage?

`AsyncLocalStorage` is a Node.js built-in that stores data scoped to an asynchronous execution context. Think of it like thread-local storage — except JavaScript is single-threaded, so it tracks *async chains* instead of threads.

Every request starts its own async chain. `AsyncLocalStorage` gives each chain its own isolated slot. Code inside that chain can read from it. Code outside cannot. Different concurrent requests don't bleed into each other.

Coming from Laravel, this was immediately familiar. In Laravel, you call `auth()->user()` from anywhere — service, repository, Artisan command, doesn't matter. No prop drilling. No "which layer am I in?" confusion. `AsyncLocalStorage` is Node.js's answer to that.

## 🚀 Setting It Up

First, create a context module:

```js
// src/context.js
import { AsyncLocalStorage } from 'async_hooks';

const requestContext = new AsyncLocalStorage();

export function getContext() {
  return requestContext.getStore() ?? {};
}

export { requestContext };
```

Then add an Express middleware that wraps each request in its own context slot:

```js
// src/middleware/context.js
import { requestContext } from '../context.js';
import { randomUUID } from 'crypto';

export function contextMiddleware(req, res, next) {
  const store = {
    requestId: randomUUID(),
    userId: null,
    startTime: Date.now(),
  };

  requestContext.run(store, () => next());
}
```

Register it before your routes:

```js
app.use(contextMiddleware); // first
app.use(authMiddleware);    // then populate userId
app.use(router);
```

In your auth middleware, populate the context:

```js
export function authMiddleware(req, res, next) {
  const user = verifyToken(req.headers.authorization?.split(' ')[1]);
  const ctx = requestContext.getStore();
  if (ctx) ctx.userId = user.id;
  req.user = user;
  next();
}
```

## ⚡ Now Your Functions Are Actually Clean

```js
// src/services/receiptService.js
import { getContext } from '../context.js';
import { logger } from '../logger.js';

async function sendReceipt(orderId) {
  // No userId parameter. None needed.
  logger.info('Receipt sent', { orderId });
}
```

And a logger that uses it automatically:

```js
// src/logger.js
import { getContext } from './context.js';

export const logger = {
  info(message, data = {}) {
    const { requestId, userId } = getContext();
    console.log(JSON.stringify({
      level: 'info',
      message,
      requestId,
      userId,
      timestamp: new Date().toISOString(),
      ...data,
    }));
  },

  error(message, error, data = {}) {
    const { requestId, userId } = getContext();
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error.message,
      requestId,
      userId,
      timestamp: new Date().toISOString(),
      ...data,
    }));
  },
};
```

Call `logger.info()` from absolutely anywhere — services, repositories, utilities, database helpers — and every log line automatically carries the request ID and user ID. No configuration. No injection. Just import and call.

## 🔥 Why This Changes Your Debugging Game

When I was building Node.js APIs at Acodez, our biggest debugging headache wasn't finding the bug — it was correlating log lines to a specific request. We'd grep for a timestamp range and manually piece together which log lines belonged together. It was archaeology.

After adding `AsyncLocalStorage` with a `requestId` on every log line, debugging a production incident went from 40 minutes of log archaeology to 30 seconds of `grep requestId=<value>`. The entire story of one request, in order, in one command.

Coming from Laravel, this is what I had expected from the start. In Laravel, every log call automatically includes context because the framework manages request lifecycle. `AsyncLocalStorage` gives you the same thing — you just have to wire it up yourself. One time. Then it just works everywhere.

## 🚨 Common Mistakes

**`getStore()` returns `undefined` outside a context.** Any code that runs outside `als.run()` — startup scripts, cron jobs, test files — will get `undefined` from `getStore()`. Always default gracefully:

```js
const ctx = requestContext.getStore() ?? {};
const { userId = null, requestId = 'no-request' } = ctx;
```

**Storing non-serializable values.** The context store travels through async chains, not across worker threads or network boundaries. Keep it simple: IDs, flags, metadata. Not database connections, not entire user objects.

**Forgetting to call `run()` in middleware.** The most common mistake is passing `store` to `getStore()` instead of wrapping `next()` in `run()`. The store only exists inside the `run()` callback and everything it awaits.

```js
// ❌ Wrong — this does nothing useful
requestContext.getStore(store, () => next());

// ✅ Right
requestContext.run(store, () => next());
```

## 🌟 Other Things Worth Storing

Once you have the pattern in place, you'll find more things to put in the context:

- **Tenant ID** for multi-tenant apps — your database queries can auto-scope without any extra parameters
- **Feature flags** resolved at request start — no need to fetch them again mid-handler
- **Trace IDs** for distributed tracing — propagate them into every outgoing HTTP call
- **Request start time** — your logger can automatically compute elapsed time without any extra wiring

A pattern I use in Express for multi-tenant APIs: store the `tenantId` in context, then have a base repository class that reads `getContext().tenantId` automatically in every query. Every DB call is scoped to the right tenant with zero boilerplate in route handlers.

## 🆚 vs. Passing Context as Parameters

To be fair, explicit parameters aren't all bad. They make dependencies obvious and are easier to test. If you have two functions that both need `userId`, passing it explicitly communicates the dependency clearly.

But there's a difference between *business logic dependencies* and *operational metadata*. `userId` in a business calculation? Pass it explicitly. `userId` in a log line six layers deep? That's operational context — exactly what `AsyncLocalStorage` is designed for.

A rule I follow: request IDs, trace IDs, and user IDs for logging/auditing go in context. Business identifiers that affect the logic of a function go in parameters.

## 📋 TL;DR

- `AsyncLocalStorage` = per-request storage, no prop drilling, zero packages needed
- Wrap each request with `als.run(store, next)` in a middleware
- Read from anywhere in the async chain with `als.getStore()`
- Perfect for: request IDs, user IDs, tenant IDs, trace context, feature flags
- Handle `undefined` for code running outside a request context
- Think of it as Node.js's version of Laravel's `auth()->user()` — but you set it up

You've been threading `userId` through six function signatures. You didn't have to. You do now.

---

**Using `AsyncLocalStorage` in production?** I'm curious what you're storing in there — tenant IDs? Feature flags? Correlation IDs for distributed tracing? Drop it in the comments. And if you're still passing request context as function parameters through every layer of your app, I say this with love: please read this post one more time.
