---
title: "✈️ Node.js Graceful Shutdown: Stop Killing Requests Mid-Flight"
date: 2026-02-28
excerpt: "Every time you SIGKILL your Node.js server, you're mid-conversation at a restaurant when the lights go out. Here's how to let your server finish what it started before dying with dignity."
tags: ["nodejs", "express", "backend", "javascript", "devops"]
featured: true
---

Picture this: a user clicks "Place Order." Your Express server receives the request, begins charging the card, writes to the database, and then — right in the middle of all that — your deployment pipeline restarts the process. The charge went through. The database write didn't. The user's order is money gone and food un-ordered. They're going to file a chargeback and leave a one-star review.

This is what happens when you deploy without graceful shutdown.

Most Node.js tutorials end with `app.listen(3000)` and call it a day. They don't tell you what happens when your server needs to stop — during deployments, scaling events, crashes, or a `Ctrl+C` in production (don't do this). The default behavior is brutal: Node.js gets a signal, the process dies, and every in-flight request gets dropped like a hot plate.

Let's fix that.

## 🤔 What "Graceful" Actually Means

Graceful shutdown is the restaurant equivalent of a waiter who, when told the kitchen is closing, finishes serving every table that already ordered before turning off the lights. New customers are turned away at the door, but nobody's meal gets yanked mid-bite.

In server terms, this means:

1. Stop accepting new connections the moment a shutdown signal arrives
2. Let all in-flight requests finish naturally
3. Close database connections, message queue consumers, and other resources cleanly
4. Exit the process only when everything is done

The difference between a server that does this and one that doesn't is the difference between zero-downtime deployments and "we're going to put the site in maintenance mode for five minutes."

## 📡 The Signals You Need to Handle

Your operating system talks to Node.js processes through signals. The two you care about:

- **SIGTERM** — the polite signal. Kubernetes, Docker, systemd, and PM2 all send this when they want your process to stop. You have a window to clean up before they lose patience.
- **SIGINT** — what happens when someone presses `Ctrl+C`. Useful for local dev.

There's also **SIGKILL**, which you cannot catch. It's the OS saying "I'm done being polite" and immediately terminating your process. Kubernetes sends SIGTERM first, waits (default 30 seconds), then fires SIGKILL. That 30-second window is your entire graceful shutdown budget.

Here's what handling these looks like at its simplest:

```js
// server.js
import express from 'express';
import { createServer } from 'http';

const app = express();
const server = createServer(app);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/slow', async (req, res) => {
  // Simulate a slow operation — DB query, payment processing, etc.
  await new Promise(resolve => setTimeout(resolve, 5000));
  res.json({ message: 'done' });
});

server.listen(3000, () => console.log('Listening on :3000'));

// Handle shutdown signals
async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed. No new connections accepted.');
    // Clean up resources here
    process.exit(0);
  });

  // Force exit if cleanup takes too long
  setTimeout(() => {
    console.error('Shutdown timeout hit. Forcing exit.');
    process.exit(1);
  }, 25_000); // 5 seconds less than Kubernetes' 30s grace period
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

`server.close()` does the right thing: it stops the server from accepting new connections, then fires its callback once all existing connections have drained. The timeout is critical — if something goes wrong during cleanup (a hung database connection, a deadlocked promise), you still want the process to exit so your orchestrator can restart it.

## 🗄️ Closing What You Opened

Stopping the HTTP server is only half the job. Your app has probably opened other things that need cleaning up: database connection pools, Redis clients, message queue consumers. Closing these in the wrong order creates a different class of problem.

The right order is:

1. Stop accepting HTTP requests first
2. Then close dependencies (DB, Redis, queues)

If you close your database connection before in-flight requests finish, those requests will throw and return 500s — which is only slightly better than the original problem.

```js
import express from 'express';
import { createServer } from 'http';
import mysql from 'mysql2/promise';
import { createClient } from 'redis';

const app = express();
const server = createServer(app);

const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

// ... your routes ...

async function shutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown.`);
  let exitCode = 0;

  // Step 1: Stop the HTTP server — no new requests
  await new Promise((resolve) => server.close(resolve));
  console.log('HTTP server closed.');

  // Step 2: Close dependencies in order
  try {
    await db.end();
    console.log('Database pool closed.');
  } catch (err) {
    console.error('Error closing DB pool:', err);
    exitCode = 1;
  }

  try {
    await redis.quit();
    console.log('Redis connection closed.');
  } catch (err) {
    console.error('Error closing Redis:', err);
    exitCode = 1;
  }

  console.log('Shutdown complete.');
  process.exit(exitCode);
}

// Timeout safety net
const SHUTDOWN_TIMEOUT = 25_000;
async function timedShutdown(signal) {
  const timer = setTimeout(() => {
    console.error(`Shutdown exceeded ${SHUTDOWN_TIMEOUT}ms. Forcing exit.`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);

  timer.unref(); // Don't let this timer keep the process alive

  await shutdown(signal);
}

process.on('SIGTERM', () => timedShutdown('SIGTERM'));
process.on('SIGINT',  () => timedShutdown('SIGINT'));

server.listen(3000, () => console.log('Listening on :3000'));
```

`timer.unref()` is a detail worth noting: it tells Node.js "this timer shouldn't prevent the process from exiting naturally." Without it, if everything shuts down in 2 seconds but your timeout is 25 seconds, your process would just sit there for 23 more seconds doing nothing. `unref()` fixes that.

## ☸️ Kubernetes Loves This

If you run on Kubernetes (or any container orchestrator), graceful shutdown isn't a nice-to-have — it's a correctness requirement. When Kubernetes decides to terminate a pod (rolling update, node drain, HPA scale-down), it:

1. Removes the pod from the Service endpoints so load balancers stop sending traffic
2. Sends SIGTERM to your container
3. Waits up to `terminationGracePeriodSeconds` (default 30s)
4. Sends SIGKILL if the process is still running

There's a subtle race here: steps 1 and 2 happen concurrently. A request can arrive right after SIGTERM but before the load balancer has updated. This is why you should add a small delay before stopping the HTTP server on Kubernetes:

```js
async function shutdown(signal) {
  console.log(`${signal} received.`);

  // Give load balancers 5 seconds to catch up and stop sending traffic
  if (process.env.KUBERNETES_SERVICE_HOST) {
    console.log('Kubernetes environment detected. Sleeping 5s for LB drain...');
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }

  await new Promise((resolve) => server.close(resolve));
  // ... rest of cleanup
}
```

Pair this with a proper `terminationGracePeriodSeconds` in your deployment manifest that's larger than your `SHUTDOWN_TIMEOUT`, and you'll have genuinely zero-downtime rolling updates.

## 🚨 The Mistakes That'll Bite You

**Not handling `unhandledRejection`.** An unhandled promise rejection in recent Node.js versions emits a warning but won't crash the process by default in some configs. During shutdown especially, you want to know about these:

```js
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection during shutdown:', reason);
});
```

**Calling `process.exit()` directly in routes.** Some developers do this when they hit an unrecoverable error. Don't. Throw an error, let your error handler decide, and keep process exit centralized in your shutdown handler.

**Ignoring long-lived connections.** WebSocket connections and Server-Sent Event streams don't close when `server.close()` is called — they're still "in use." You need to track these explicitly and close them during shutdown, otherwise your server will wait indefinitely.

## 📋 TL;DR

- Handle `SIGTERM` and `SIGINT` explicitly — never rely on the default "just die" behavior
- Call `server.close()` first to stop new requests, then close DB/Redis/queues
- Always add a timeout that forces exit — broken cleanup shouldn't stall deployments forever
- On Kubernetes, add a short sleep before `server.close()` to handle the load balancer race condition
- Use `timer.unref()` so your timeout doesn't artificially keep the process alive

Graceful shutdown takes maybe two hours to implement properly. The alternative is spending that time debugging why a deployment left half your database writes in an inconsistent state and why one very unhappy user is disputing a charge.

---

**Already handling graceful shutdown in your Node.js apps?** I'm curious how you handle long-lived connections like WebSockets — that's the next level of this problem and it gets interesting fast. Drop a comment below, or if you've got a pattern that's saved you in production, share it. And if you're currently just `Ctrl+C`-ing your staging server and hoping for the best — no judgment, but maybe fix that before the next deploy.
