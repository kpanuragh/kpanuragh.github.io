---
title: "🚪 Graceful Shutdown: Teaching Your Node.js App to Say Goodbye Properly"
date: 2026-04-25
excerpt: "Most Node.js apps get killed like a power cord yanked from the wall. Learn how to shut down gracefully so you stop dropping requests, corrupting data, and making your users sad."
tags: ["Node.js", "Express", "Backend", "Production", "DevOps"]
featured: true
---

# 🚪 Graceful Shutdown: Teaching Your Node.js App to Say Goodbye Properly

Picture this: your Kubernetes pod is being replaced during a rolling deploy. Your app gets a signal to stop. And then — bam — it dies instantly, mid-request, leaving 47 users staring at a spinner that will never resolve.

That's not a graceful shutdown. That's a murder.

Most Node.js apps handle shutdown the same way a toddler handles bedtime: they don't. They scream, flail, and eventually get killed by the operating system. Today we're going to fix that.

## What Is Graceful Shutdown, Actually?

A graceful shutdown is simple in concept: when your app gets a signal to stop, it should:

1. **Stop accepting new requests**
2. **Finish any in-flight requests**
3. **Close database connections and other resources**
4. **Then exit cleanly**

Think of it like closing a restaurant. You don't lock the door and throw out everyone mid-meal. You stop seating new customers, let the kitchen finish the current orders, then close up shop.

Without this, you risk:
- Dropped HTTP requests (angry users)
- Partial database writes (corrupted data)
- Unclosed connections (resource leaks)
- Failed health checks during deploys (cascading failures)

It's one of those things nobody thinks about until production is on fire.

## The Signal You Need to Handle

When Kubernetes, Docker, or your process manager wants your app to stop, it sends `SIGTERM`. This is the polite knock on the door. If you ignore it for too long (usually 30 seconds), you get `SIGKILL` — which is the axe through the door. You cannot catch `SIGKILL`.

Here's the bare minimum to handle this in Express:

```js
const express = require('express');
const app = express();

app.get('/health', (req, res) => res.send('ok'));
app.get('/slow', async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  res.send('finally done');
});

const server = app.listen(3000, () => {
  console.log('Server running on port 3000');
});

let isShuttingDown = false;

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Starting graceful shutdown...');
  isShuttingDown = true;

  server.close(() => {
    console.log('HTTP server closed. Exiting.');
    process.exit(0);
  });
});
```

`server.close()` stops the server from accepting *new* connections and calls the callback once all existing connections are done. That one line is the difference between "graceful" and "chaotic".

## Going Further: Real-World Shutdown with a Timeout

The basic version has a problem: what if a request hangs forever? Your app will also hang forever, waiting politely while Kubernetes taps its foot and eventually sends `SIGKILL` anyway.

You need a timeout. After a reasonable window (say, 10 seconds), give up and exit:

```js
const express = require('express');
const { Pool } = require('pg');

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/users', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM users LIMIT 10');
  res.json(rows);
});

const server = app.listen(3000);

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed.');

    // Close database pool
    await db.end();
    console.log('Database pool closed.');

    process.exit(0);
  });

  // Force exit after 10 seconds if not done
  setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10_000).unref(); // .unref() prevents this timer from keeping the process alive
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C in development
```

The `.unref()` call on the timeout is a small but important detail — it tells Node.js not to keep the process alive just because of this timer. Without it, if everything closes cleanly before 10 seconds, the timer would still hold the process open.

## The "Reject New Requests" Pattern

Here's a bonus pattern that's useful when you want to immediately signal to load balancers that this instance is going away, even before in-flight requests finish:

```js
let isShuttingDown = false;

// Middleware to reject new requests during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({ error: 'Server is shutting down' });
  }
  next();
});

process.on('SIGTERM', async () => {
  isShuttingDown = true; // Start rejecting new requests immediately

  server.close(async () => {
    await db.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
});
```

The `503 Service Unavailable` response with `Connection: close` tells the load balancer "stop sending me traffic" immediately. Combined with a short `terminationGracePeriodSeconds` in Kubernetes (default 30s), this means near-zero dropped requests during rolling deploys.

## What About Kubernetes Specifically?

When Kubernetes terminates a pod, it does two things simultaneously:
1. Removes the pod from the service endpoints (stops routing traffic to it)
2. Sends `SIGTERM` to the container

The problem: step 1 takes a few seconds to propagate. So your app gets `SIGTERM` and starts refusing traffic, but the load balancer might still send requests for another second or two.

The fix is embarrassingly simple: add a small sleep before you start the shutdown:

```js
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Waiting for load balancer to catch up...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second grace

  isShuttingDown = true;
  server.close(async () => {
    await db.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
});
```

Those 2 seconds let Kubernetes finish updating the endpoint list before your app starts rejecting traffic. It's a hack, but it's a well-known, battle-tested hack used by basically every major platform.

## The Quick Checklist

Before you call your backend "production-ready," make sure:

- [ ] You handle `SIGTERM` (and `SIGINT` for local dev)
- [ ] You call `server.close()` to stop accepting new connections
- [ ] You close database pools, Redis clients, and message queue consumers
- [ ] You have a forced exit timeout so you never hang indefinitely
- [ ] If using Kubernetes, you add a brief startup delay to let endpoint propagation catch up

## The Takeaway

Graceful shutdown is one of those features that feels optional until the moment it isn't. Your users don't care about your deploy pipeline — they care whether their request succeeded. Taking 20 minutes to implement proper shutdown handling will save you from a whole category of "why are requests dropping during deploys?" incidents.

Your app has been rude about goodbyes long enough. Teach it some manners.

---

*Dealing with flaky deploys or want to go deeper on production Node.js patterns? Drop a comment or reach out — there's always more to talk about.*
