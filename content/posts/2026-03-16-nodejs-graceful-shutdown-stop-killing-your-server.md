---
title: "🛑 Node.js Graceful Shutdown: Stop Killing Your Server Like It Owes You Money"
date: "2026-03-16"
excerpt: "Ctrl+C your Node.js server and you might be dropping database connections, cutting off active requests, and losing in-flight jobs. Here's how to shut down like a professional instead of a villain."
tags: ["\\\"nodejs\\\"", "\\\"express\\\"", "\\\"backend\\\"", "\\\"devops\\\"", "\\\"performance\\\""]
featured: "true"
---

# 🛑 Node.js Graceful Shutdown: Stop Killing Your Server Like It Owes You Money

Picture this: your Node.js server is in the middle of processing 47 active requests — payments going through, emails being sent, database transactions mid-flight — and you deploy a new version. Your process manager sends `SIGTERM`, Node.js dies instantly, and suddenly 47 users are staring at a spinner that will never stop.

You just committed the server equivalent of flipping the power switch on someone's computer while they're saving a file.

**Graceful shutdown** is the art of stopping your server *politely* — finishing what it started, closing connections cleanly, and only then ceasing to exist. It's not glamorous, but neither is explaining to your users why their payment went through twice.

---

## What Actually Happens When Your Server Dies

When a Node.js process receives `SIGTERM` (the default signal from Docker, Kubernetes, PM2, and most process managers), the default behavior is immediate termination. No cleanup, no warnings, no goodbye.

This causes:
- **In-flight HTTP requests** get reset connections (users see errors)
- **Database connections** leak until the pool times out
- **Background jobs** get abandoned mid-execution
- **File handles** don't get flushed properly

Kubernetes doesn't care about your feelings. It sends `SIGTERM`, waits 30 seconds (the `terminationGracePeriodSeconds`), then sends `SIGKILL`. You have a 30-second window. Use it.

---

## The Bare Minimum: Catch the Signal

Let's start with the simplest possible graceful shutdown for an Express app:

```javascript
const express = require('express');
const app = express();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const server = app.listen(3000, () => {
  console.log('Server running on port 3000');
});

// The magic happens here
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing HTTP server gracefully...');

  server.close(() => {
    console.log('HTTP server closed. Exiting.');
    process.exit(0);
  });
});

// Also handle Ctrl+C in development
process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(() => process.exit(0));
});
```

`server.close()` stops accepting *new* connections but lets existing ones finish. That's the key distinction. You're not slamming the door — you're just not letting anyone new in while you wrap things up.

But here's the thing: `server.close()` only waits for active request handlers to complete. It won't help with database connections, message queue consumers, or anything else you've got running. You need to handle those manually.

---

## The Real Deal: Coordinating Multiple Cleanup Tasks

Production apps have more moving parts. Here's a pattern that coordinates shutdown across everything:

```javascript
const express = require('express');
const { Pool } = require('pg');

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Track active requests manually
let activeRequests = 0;
let isShuttingDown = false;

app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
    return res.status(503).json({ error: 'Server is shutting down' });
  }
  activeRequests++;
  res.on('finish', () => activeRequests--);
  next();
});

app.get('/users', async (req, res) => {
  const result = await db.query('SELECT * FROM users LIMIT 10');
  res.json(result.rows);
});

const server = app.listen(3000);

async function shutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown...`);
  isShuttingDown = true;

  // Stop accepting new connections
  server.close();

  // Wait for active requests to drain (max 10 seconds)
  const drainTimeout = setTimeout(() => {
    console.warn('Drain timeout reached. Force exiting.');
    process.exit(1);
  }, 10_000);

  const waitForDrain = () => new Promise((resolve) => {
    const interval = setInterval(() => {
      if (activeRequests === 0) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  await waitForDrain();
  clearTimeout(drainTimeout);

  // Close database pool
  await db.end();
  console.log('Database pool closed.');

  console.log('Graceful shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

Notice a few things here:

1. **503 for new requests during shutdown** — when Kubernetes is terminating your pod, it's also removing it from the load balancer. But there's a race condition: requests can still arrive briefly after `SIGTERM`. Returning 503 tells clients to retry on another pod.

2. **The drain loop** — we poll every 100ms until active requests hit zero. Simple, predictable, doesn't require a third-party library.

3. **A hard timeout** — always have a fallback. If a request hangs forever, you can't wait forever. Set a sensible ceiling and force exit if needed.

---

## The Sneaky Problem: Keep-Alive Connections

Here's something that bites almost everyone: HTTP keep-alive connections. Modern clients (and load balancers) reuse TCP connections across multiple requests. When you call `server.close()`, it stops accepting new connections, but **existing keep-alive connections stay open**, keeping the server alive indefinitely.

Fix it by setting a `Connection: close` header on responses during shutdown:

```javascript
// Add to your shutdown function, before server.close()
server.closeIdleConnections(); // Node 18.2+

// For older Node versions, track and destroy connections manually
const connections = new Set();
server.on('connection', (socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});

// In your shutdown function:
connections.forEach((socket) => socket.destroy());
```

`closeIdleConnections()` was added in Node 18.2 and is the clean modern solution. If you're on an older version, the manual tracking approach works just fine.

---

## Practical Insights to Take With You

**Test your shutdown.** Seriously. Run `kill -SIGTERM $(lsof -t -i:3000)` while requests are in flight and see what happens. Most teams discover their graceful shutdown doesn't work the first time they actually test it.

**Set Kubernetes `terminationGracePeriodSeconds` appropriately.** The default is 30 seconds. If your longest request can take 60 seconds (file uploads, heavy processing), bump that number or you'll get `SIGKILL` before you're done.

**Log everything during shutdown.** When a deployment goes sideways at 2am, those shutdown logs are the difference between a 5-minute debug session and a 2-hour nightmare.

**Use a library if this gets complex.** [terminus](https://github.com/godaddy/terminus) (by GoDaddy) and [lightship](https://github.com/gajus/lightship) handle all of this plus health checks and readiness probes. Don't reinvent the wheel if you're managing 20 cleanup tasks.

---

## The Bottom Line

Graceful shutdown isn't optional in production — it's basic hygiene. Your users shouldn't experience errors just because you deployed a fix. Your database shouldn't accumulate zombie connections because your server panicked on the way out.

The good news: it's not complicated. Catch `SIGTERM`, stop accepting new connections, finish what you started, clean up your resources, and exit with dignity. Your future self at 3am will thank you.

Now go add `process.on('SIGTERM', ...)` to every Node.js app you own. I'll wait.

---

*Have a shutdown horror story or a pattern that's saved you in production? Drop it in the comments — war stories welcome.*
