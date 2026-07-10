---
title: "🕵️ Debugging Async Stack Traces: The Case of the Vanishing Call Site"
date: "2026-07-10"
excerpt: "The error says \"Cannot read properties of undefined\" and points you at line 47 of a Promise chain that has nothing to do with the actual bug. Here's why async stack traces lie, and what actually gets you back to the crime scene."
tags:
  - nodejs
  - observability
  - debugging
  - javascript
  - backend
featured: true
---

You've been there. Production throws an error, you open the stack trace expecting a nice breadcrumb trail back to the culprit, and instead you get this:

```
TypeError: Cannot read properties of undefined (reading 'id')
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
```

That's it. That's the whole trace. `processTicksAndRejections` is basically Node shrugging at you and saying "somewhere, at some point, in some microtask, something went wrong." It's the software equivalent of a witness statement that just says "a crime occurred."

The frustrating part isn't that the error happened — it's that the stack trace, the one tool whose entire job is to tell you where you were when things went wrong, has amnesia. And once you understand *why* it forgets, debugging async code stops feeling like reading tea leaves.

## Why the trace goes blank

A synchronous stack trace works because the call stack is, literally, a stack. Function A calls B calls C, and when C throws, the stack still has A, B, and C sitting on it. Node just walks it and prints the frames.

Async code doesn't have that luxury. The moment you hit an `await`, a `.then()`, a `setTimeout`, or an event emitter callback, the current stack **unwinds completely**. The engine returns control to the event loop, does other work, and only much later — on a totally fresh stack — resumes your continuation. By the time your `.then()` callback runs, the frames that scheduled it are long gone. There's nothing left to walk.

```js
async function getUser(id) {
  const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return row.rows[0]; // throws if the query returned nothing
}

async function handler(req, res) {
  const user = await getUser(req.params.id);
  res.json({ name: user.id }); // <- boom, but where does the trace point?
}
```

If `getUser` resolves with `undefined` and you access `.id` on it inside `handler`, modern V8 (with `async`/`await`, not raw `.then()` chains) will usually still show you `handler` and `getUser` in the trace, because `await` preserves *logical* continuation across a promise. That's the one genuinely good news story here. The trouble starts the moment you mix in raw callbacks, `setImmediate`, `EventEmitter`, or a `.then()` chain that got detached from its `async` origin — that's where the trace reverts to "somewhere in a microtask" territory.

## The fixes that actually work

**1. Turn on long stack traces where the runtime supports it.**

Node has had `--async-stack-traces`-style behavior improve release over release, but you can force richer traces at the `Error` level using `Error.stackTraceLimit` and, more usefully, `Error.captureStackTrace` combined with wrapping. Libraries like `error-cause` support (built into modern Node via `{ cause }`) let you chain the *original* context onto a new error instead of losing it:

```js
async function getUser(id) {
  try {
    const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!row.rows[0]) {
      throw new Error(`No user found for id=${id}`, {
        cause: new Error('empty result set'),
      });
    }
    return row.rows[0];
  } catch (err) {
    throw new Error(`getUser(${id}) failed`, { cause: err });
  }
}
```

Now when this bubbles up, `err.cause` gives you the *actual* failure instead of a generic destructuring crash three layers removed from the real problem. It costs three lines and saves you an hour of `console.log` archaeology.

**2. Use `AsyncLocalStorage` to carry context across the async boundary, not just the stack.**

The stack trace tells you *where* code executed. It doesn't tell you *which request* it executed for. In a server handling concurrent requests, that's often the more important question — "which user's payload caused this?" is more actionable than "which line of async_hooks internals did this bottom out in?" `AsyncLocalStorage` rides along with the async context regardless of how many event-loop turns pass:

```js
const { AsyncLocalStorage } = require('node:async_hooks');
const requestContext = new AsyncLocalStorage();

app.use((req, res, next) => {
  requestContext.run({ requestId: req.headers['x-request-id'] }, next);
});

// deep inside some unrelated async callback, three modules away:
function logError(err) {
  const ctx = requestContext.getStore();
  logger.error({ requestId: ctx?.requestId, err: err.stack });
}
```

I leaned on this hard on my team at Cubet Techno Labs after a bug took most of a day to chase because three separate services were logging errors with zero correlation between them. Once `AsyncLocalStorage` was wired through the request pipeline, the same class of bug went from "an afternoon of grepping logs by timestamp" to "one query for a request ID."

**3. When all else fails, `--stack-trace-limit` and source maps.**

If you're running compiled TypeScript, make sure source maps are actually enabled in production builds — an async trace pointing at `dist/handler.js:184` in minified, non-source-mapped code is worse than no trace at all. And bump `Error.stackTraceLimit` above the default 10 when you're chasing something buried under a deep promise chain; the default silently truncates frames you might actually need.

## The real lesson

Async stack traces aren't broken — they're accurately describing a world where "where you came from" stopped being a well-defined question the moment you scheduled a callback. The fix isn't fighting the event loop; it's stopping the code from relying on the stack to carry information it was never designed to carry. `Error.cause` for causality, `AsyncLocalStorage` for context, and honest source maps for the rest.

Next time a trace bottoms out at `processTicksAndRejections`, don't groan — that's your cue to check whether you're actually attaching causes and propagating context, or just hoping the stack will do it for you. It won't. It never did.
