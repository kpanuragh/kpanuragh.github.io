---
title: "🕵️ Debugging Async Stack Traces: The Detective Story With No Witnesses"
date: "2026-08-21"
excerpt: "The error happened at 3:47pm. The stack trace says it happened at 'node:internal/process/task_queues:95'. Somewhere between those two facts is your actual bug, and async/await ate the evidence."
tags:
  - observability
  - nodejs
  - debugging
  - async
  - backend
featured: true
---

# 🕵️ Debugging Async Stack Traces: The Detective Story With No Witnesses

You get paged. Production is throwing. You open the error, feeling confident, because you've done this a thousand times. You're a professional. And then you see this:

```
TypeError: Cannot read properties of undefined (reading 'id')
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
```

That's it. That's the whole trace. Two lines, and one of them is a Node.js internal that has never once, in the history of computing, been the actual cause of a bug.

Somewhere, three `await`s and two `Promise.all`s ago, something returned `undefined` when it should have returned a user object. But the stack trace — the one tool whose entire job is to tell you "you were here, then here, then here, then it broke" — shrugs and points at the event loop's own plumbing. It's like calling a detective to a crime scene and the detective says "well, gravity was involved" and leaves.

## Why async eats your breadcrumbs

A synchronous stack trace is a phone book of function calls, each one still "on the stack" because it's literally waiting for the one below it to return. When you throw, JavaScript can walk straight up that chain and hand you every frame.

`await` breaks that chain on purpose. The whole point of async/await is that the calling function *doesn't* sit there waiting — it returns control to the event loop, and gets resumed later via a microtask callback. By the time your `Promise` rejects, the original call stack that led up to that `await` is long gone. It was garbage collected. What you're looking at instead is the stack of *whoever happened to be running the microtask queue* when the rejection surfaced — which is usually Node's internals, not your code.

This isn't a bug in V8. It's the tradeoff you signed up for: non-blocking concurrency in exchange for stack traces that only tell you the destination, not the journey.

```js
async function getUser(id) {
  const res = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  return res.rows[0]; // undefined if no match — no error thrown here
}

async function getOrderSummary(orderId) {
  const order = await getOrder(orderId);
  const user = await getUser(order.userId);
  return `${user.id} ordered ${order.total}`; // boom, three calls deep
}
```

`user` is `undefined`, the `.id` access throws, and the trace you get points at task queue internals instead of `getOrderSummary`. Nothing in that trace tells you it was `getUser` specifically, or which `orderId` triggered it.

## The fix nobody remembers exists: async stack traces

Since Node 12, V8 has supported **zero-cost async stack traces** — the engine keeps a lightweight record of the promise chain so it can reconstruct the "logical" call stack, not just the physical one, when an error is created. It's been on by default since Node 12.x for most cases, but it only works if the `Error` is actually constructed inside the `async` function, not resurrected somewhere else. This is the single biggest reason people still see garbage traces in 2026 despite the feature existing for years — they're catching and rethrowing incorrectly, or their error originates from a callback-based library that never awaited anything V8 could track.

The other half of the fix is just discipline: **throw with context, at the source, before it bubbles.**

```js
async function getUser(id) {
  const res = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  const user = res.rows[0];
  if (!user) {
    throw new Error(`getUser: no user found for id=${id}`);
  }
  return user;
}
```

Six lines, and the next on-call engineer gets the actual `id` in the error message instead of playing archaeologist with a database at 2am. This is boring advice. It's also the single highest-leverage thing you can do for async debuggability, and almost nobody does it consistently because "it'll never be undefined" is what everyone thinks right up until it is.

## When throwing-early isn't enough: bring in `AsyncLocalStorage`

Adding context at every throw site helps, but it doesn't solve the "which request was this, and what led up to it" problem across a real service with dozens of concurrent requests interleaving on the same event loop. That's what `AsyncLocalStorage` is for — it's Node's built-in way to carry a context object through an entire async chain without threading it through every function signature.

At Cubet, we wire a request ID into `AsyncLocalStorage` at the edge of every incoming request, and every log line — including ones from deep inside a queue consumer three services away from the HTTP handler — carries that ID automatically:

```js
const { AsyncLocalStorage } = require('node:async_hooks');
const als = new AsyncLocalStorage();

app.use((req, res, next) => {
  als.run({ requestId: req.headers['x-request-id'] ?? crypto.randomUUID() }, next);
});

function log(msg) {
  const ctx = als.getStore();
  console.log(`[${ctx?.requestId ?? 'no-context'}] ${msg}`);
}
```

Now when `getUser` throws somewhere deep in a promise chain, the log line right before it still has the request ID attached — even though nothing explicitly passed it down through three layers of `await`. Combined with the throw-early habit above, you get a trace that says *what* broke and logs around it that say *whose request it was*, which is the difference between a 10-minute fix and a 2-hour one.

## `--async-stack-traces` and source maps: the last mile

If you're running compiled or bundled code (TypeScript, esbuild, webpack), the stack trace you get in production points at minified line numbers in a bundle, which is its own layer of "technically true, practically useless." Make sure your build emits source maps and that your process reads them — `node --enable-source-maps` (built in since Node 12.12) rewrites stack traces back to your original `.ts` files automatically, no extra dependency needed:

```json
{
  "scripts": {
    "start": "node --enable-source-maps dist/server.js"
  }
}
```

It's a one-line flag that turns `at Object.<anonymous> (dist/bundle.js:1:284019)` back into `at getOrderSummary (src/orders/summary.ts:14:22)`. If you've ever squinted at a minified stack trace trying to reverse-engineer which source file line 284019 could possibly correspond to, this flag is the fix, and it costs you nothing at runtime worth worrying about.

## Wrapping up

Async stack traces feel broken because they're telling the truth about how the event loop actually works, not the lie synchronous code let you believe. The fix isn't a magic flag (though `--enable-source-maps` gets you most of the way for bundlers) — it's throwing with context at the point of failure, tagging requests with `AsyncLocalStorage` so logs stay correlated across the whole async chain, and not catch-and-rethrowing errors in ways that erase what V8 already tracked for you.

Next time a trace hands you `processTicksAndRejections` and nothing else, don't curse the language. Go find the nearest `await` that doesn't check its own result, and put a real error message in its mouth. Future 3am-you will send a thank-you note.
