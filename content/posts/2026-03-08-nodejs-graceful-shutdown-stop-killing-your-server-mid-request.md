---
title: "🛑 Node.js Graceful Shutdown: Stop Murdering Requests Mid-Flight"
date: 2026-03-08
excerpt: "Your server restarts 50 times a day, and every restart kills in-flight requests. Here's how to shut down gracefully so users never notice."
tags: ["nodejs", "express", "backend", "devops", "performance"]
featured: true
---

# 🛑 Node.js Graceful Shutdown: Stop Murdering Requests Mid-Flight

Picture this: a user clicks "Pay Now." Your Express server is mid-database-transaction when suddenly — SIGTERM. Your deployment pipeline just killed the process. The transaction rolls back. The user gets charged but no order is created. They call support. You spend Friday afternoon debugging a race condition you introduced by not handling shutdowns properly.

Sound familiar? Yeah. Graceful shutdown is one of those things nobody talks about until production breaks at 3pm on a Friday.

## What Even Is a Graceful Shutdown?

When your Node.js process receives a signal to terminate (SIGTERM from Kubernetes, SIGINT from Ctrl+C, or the heat death of your VPS), you have two options:

1. **Instant death** — drop every active connection, kill all in-flight requests, leave chaos in your wake
2. **Graceful shutdown** — stop accepting new requests, let existing ones finish, clean up connections, *then* exit

Option 1 is what most Node.js apps do by default. It's the equivalent of a chef walking out mid-dish, leaving the stove on.

Option 2 is what professionals do.

## The Problem With Doing Nothing

By default, your Express app has zero shutdown logic:

```javascript
// Most Node.js apps in the wild (don't do this)
const app = express();
app.listen(3000);
// That's it. SIGTERM hits → instant death. Goodbye, users.
```

When Kubernetes rolls out a new deployment, it sends SIGTERM to your pod, waits 30 seconds (the `terminationGracePeriodSeconds`), then sends SIGKILL. If your app doesn't respond to SIGTERM gracefully, you get 30 seconds of active connections being silently terminated — no errors sent to clients, no database cleanup, no queue acknowledgments. Just... silence.

## Graceful Shutdown in 30 Lines

Here's the pattern every production Node.js app should implement:

```javascript
import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

// Your routes here
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/slow-endpoint', async (req, res) => {
  // Simulates a database query or payment processing
  await new Promise(resolve => setTimeout(resolve, 5000));
  res.json({ message: 'Done!' });
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed. Cleaning up...');

    try {
      // Close your database connections here
      await db.disconnect();

      // Drain your message queues here
      await messageQueue.close();

      console.log('Cleanup complete. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('Cleanup failed:', err);
      process.exit(1);
    }
  });

  // Force exit if cleanup takes too long
  setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 25_000); // 5 seconds before Kubernetes SIGKILL
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(3000, () => console.log('Server running on port 3000'));
```

The magic is `server.close()`. It tells Node to stop accepting new connections, then fires the callback once all existing connections are closed. Any requests that came in before the signal? They finish. New requests? Rejected.

## The Gotcha Nobody Warns You About

Here's where developers get burned: **keep-alive connections**.

HTTP/1.1 keep-alive connections stay open between requests. `server.close()` waits for *all* connections to close — but a keep-alive connection from a browser or load balancer might sit open for minutes waiting for the next request that will never come.

The fix is to tell clients to close their connections when shutdown starts:

```javascript
let isShuttingDown = false;

// Middleware to signal connection close during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
  }
  next();
});

function gracefulShutdown(signal) {
  isShuttingDown = true;
  console.log(`Received ${signal}. Draining connections...`);

  server.close(async () => {
    await cleanup();
    process.exit(0);
  });

  // Also explicitly destroy idle keep-alive connections
  // (use the 'server-destroy' package or track sockets manually)
  setTimeout(() => process.exit(1), 25_000);
}
```

Setting `Connection: close` on responses during shutdown tells HTTP clients to close the connection after receiving the response, rather than keeping it alive. This dramatically speeds up how quickly `server.close()` finishes.

## What to Clean Up (And What Order)

Shutdown order matters. Think of it like leaving a restaurant kitchen:

1. **Stop the HTTP server** — no new customers through the door
2. **Finish in-flight requests** — finish the meals already being cooked
3. **Close message queue consumers** — stop picking up new orders from the ticket printer
4. **Close database connections** — return the ingredients to the walk-in
5. **Flush logs/telemetry** — write up the end-of-shift report
6. **Exit** — go home

If you close the database before in-flight requests finish, those requests will error. If you exit before flushing telemetry, you lose your last few data points — often the most interesting ones right before a crash.

## Real-World Additions

For production apps, add these:

- **`@godaddy/terminus`** or **`lightship`** — libraries that handle graceful shutdown + Kubernetes health checks together
- **Track your cleanup time** — log how long shutdown takes. If it's consistently close to your timeout, something is holding connections open
- **Test it** — `kill -SIGTERM $(lsof -t -i:3000)` while a slow request is in flight. Does it complete? It should

## The Payoff

Graceful shutdown isn't glamorous. You won't get Hacker News points for it. But your users won't see mysterious errors during deployments, your on-call rotation will be quieter, and you'll stop explaining to your PM why payments fail every time you ship a hotfix.

It's 30 lines of code. Write it once, add it to your starter template, and never think about it again.

---

**What's your go-to graceful shutdown setup?** Do you roll it by hand or use a library like terminus? Drop a comment or find me on GitHub — I'm always curious how people handle the edge cases.
