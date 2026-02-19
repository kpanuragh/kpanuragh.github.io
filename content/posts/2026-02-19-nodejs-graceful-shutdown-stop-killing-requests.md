---
title: "Node.js Graceful Shutdown: Stop Murdering Your Users' Requests 🛑"
date: "2026-02-19"
excerpt: "Your deployment restarts Node.js. 200 users mid-checkout get a connection reset. Their carts vanish. You are the villain. Here's how to not be the villain."
tags: ["nodejs", "javascript", "backend", "express", "devops"]
featured: true
---

# Node.js Graceful Shutdown: Stop Murdering Your Users' Requests 🛑

**Confession:** The first time I deployed a Node.js app at Acodez, I restarted it with `kill -9` like an absolute barbarian.

Requests that were mid-flight? Gone. Database transactions that were mid-commit? Corrupted. Users filling out forms? Met with a cold `ECONNRESET` like they'd tried to talk to a brick wall.

I thought this was fine. I thought "it's just a restart, it's fast."

Then I looked at the error logs.

It was not fine.

## What Actually Happens When You Restart Node.js Badly ☠️

Here's what most developers think happens during a restart:

> "Server stops. Server starts. Everything is fine."

Here's what actually happens:

1. Deployment triggers `kill -9` (or just kills the process)
2. Node.js dies instantly — no ceremony, no warnings
3. Every active HTTP connection is **immediately dropped**
4. Your database connections close without cleanup
5. Any in-flight database transactions get rolled back (if you're lucky) or left hanging (if you're not)
6. Users get `ERR_CONNECTION_RESET` in their browser
7. That user who was checking out? Their payment request was mid-processing. Are they charged? Are they not? Nobody knows. The server is gone.

**Coming from Laravel**, this was a rude awakening. PHP is stateless per request — when you deploy a Laravel app, each new request after the deploy just picks up the new code. There's no "in-flight request" problem because PHP-FPM handles one request per worker process. Restart PHP-FPM, the existing requests finish, workers gracefully reload.

Node.js is different. It's one long-running process handling thousands of concurrent connections. Kill it wrong, and you murder all of them simultaneously.

## The Right Way: Graceful Shutdown 🤝

A graceful shutdown means:

1. **Stop accepting new requests** — close the server to new connections
2. **Let existing requests finish** — give them a timeout to complete
3. **Close database connections** — clean up connection pools properly
4. **Exit cleanly** — process exits with code 0, not a crash

Think of it like closing a restaurant. You don't walk up to diners mid-meal and yank the food off their tables. You lock the front door (stop new customers), let everyone finish eating (existing requests), then clean up (close connections), then go home (exit).

## Listening for Shutdown Signals 📡

Operating systems send signals to processes when they want them to stop. The two you care about:

- **`SIGTERM`** — polite "please stop soon" (sent by Kubernetes, Docker, PM2, systemd)
- **`SIGINT`** — Ctrl+C in your terminal

```javascript
const express = require('express');
const app = express();

// Your routes here...

const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});

// Handle shutdown signals
function shutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);

    server.close(() => {
        // server.close() stops accepting NEW connections
        // and calls this callback when ALL existing ones finish
        console.log('All connections closed. Exiting.');
        process.exit(0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

That `server.close()` is the key. It tells Node.js: "stop accepting new connections, but let the ones you have finish." The callback fires when the last connection closes.

This alone is 80% of what you need.

## The Timeout Problem ⏰

There's a gotcha. `server.close()` waits forever if any connection is still open.

Got a user who opened a WebSocket and walked away from their laptop? Your shutdown is waiting on them. Forever. Your Kubernetes pod timeout fires after 30 seconds and kills the process anyway — but now you've got a 30-second deploy delay on every release.

Add a hard timeout:

```javascript
function shutdown(signal) {
    console.log(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
        console.log('HTTP server closed.');
        closeDatabase(); // covered below
        process.exit(0);
    });

    // If still alive after 30s, force quit
    setTimeout(() => {
        console.error('Could not close all connections in time. Forcing exit.');
        process.exit(1);
    }, 30_000).unref(); // .unref() so the timer doesn't keep the process alive itself
}
```

The `.unref()` on the timeout is important. Without it, the timer itself keeps the Node.js event loop running even if everything else has closed. A tiny detail that caused me real confusion when I first implemented this — the process wouldn't exit after everything was done.

## Closing Database Connections 🗄️

Your HTTP server is closed, but your database connection pool is still open. Depending on your database library:

```javascript
// If using pg (node-postgres)
const { Pool } = require('pg');
const pool = new Pool();

async function closeDatabase() {
    await pool.end();
    console.log('Database pool closed.');
}

// If using Sequelize
const { sequelize } = require('./models');

async function closeDatabase() {
    await sequelize.close();
    console.log('Sequelize connection closed.');
}

// If using Mongoose (MongoDB)
const mongoose = require('mongoose');

async function closeDatabase() {
    await mongoose.connection.close();
    console.log('Mongoose connection closed.');
}
```

Wire it into your shutdown function. The order matters: close the HTTP server first, then the database. Not the other way around — you don't want requests still coming in after your database is gone.

## The Full Picture 🖼️

Here's a production-ready shutdown handler:

```javascript
async function shutdown(signal) {
    console.log(`[Shutdown] Received ${signal}`);

    // 1. Stop accepting new HTTP connections
    server.close(async () => {
        try {
            // 2. Close database connections
            await closeDatabase();

            // 3. Any other cleanup (close Redis, Kafka consumers, etc.)
            await closeRedis();

            console.log('[Shutdown] Cleanup complete. Exiting cleanly.');
            process.exit(0);
        } catch (err) {
            console.error('[Shutdown] Error during cleanup:', err);
            process.exit(1);
        }
    });

    // Hard timeout - don't wait forever
    setTimeout(() => {
        console.error('[Shutdown] Timeout exceeded. Forcing exit.');
        process.exit(1);
    }, 30_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

Looks verbose. Worth every line. This is what separates a "it works on my machine" deployment from a production-grade service.

## What About PM2? 🚀

If you're using PM2 (and you probably should be), it handles `SIGINT` and `SIGTERM` automatically. You still need to implement the shutdown handler — PM2 sends `SIGINT` to your process and waits for it to exit.

Configure the wait time in your `ecosystem.config.js`:

```javascript
module.exports = {
    apps: [{
        name: 'my-api',
        script: 'app.js',
        kill_timeout: 5000,  // Wait 5 seconds before force-killing
    }]
};
```

PM2 will send `SIGINT`, wait 5 seconds, then `SIGKILL` if the process is still alive. Your graceful shutdown has 5 seconds to finish. Tune this to match your slowest request's typical duration.

## Kubernetes Does It Too 📦

In Kubernetes, when a pod is deleted or scaled down:

1. Pod gets `SIGTERM`
2. Kubernetes waits `terminationGracePeriodSeconds` (default: 30s)
3. If still alive after that, sends `SIGKILL` (unkillable force kill)

Your graceful shutdown handler makes step 1 → exit clean and fast. Without it, every pod termination burns 30 seconds of your users' connections getting reset.

Set your timeout shorter than `terminationGracePeriodSeconds`:

```yaml
spec:
  terminationGracePeriodSeconds: 45   # Kubernetes waits 45s
```

```javascript
// Your code times out after 30s — exits before Kubernetes force-kills
setTimeout(() => process.exit(1), 30_000).unref();
```

## The Laravel Comparison That Makes Node.js Developers Feel Better 😌

PHP/Laravel developers: you don't think about this because you don't have to. PHP-FPM handles process lifecycle. Each request spawns a worker (or reuses a pool), handles the request, and the worker is either idle or returned to the pool. There's no "in-flight request from 3 minutes ago" problem.

**But here's the flip side:** Node.js's long-running process model is also why it can handle 10,000 concurrent connections on the same process that PHP-FPM would need 10,000 workers for. The tradeoff is: you get massive concurrency, but you're responsible for your own lifecycle management.

Responsible concurrency. Appreciate it.

## Common Mistakes to Avoid 🚫

**Mistake #1: Using `kill -9` in production scripts.** `SIGKILL` cannot be caught. No graceful shutdown possible. Ever. Use `kill -15` (SIGTERM) or `kill -2` (SIGINT) instead.

**Mistake #2: Not handling `SIGTERM` at all.** PM2, Kubernetes, Docker — they all use SIGTERM. Ignore it and they'll wait their timeout period, then SIGKILL you anyway. Wasteful and user-hostile.

**Mistake #3: Closing the database before the HTTP server.** Requests still in flight will fail with database errors in the last moments before shutdown. HTTP server first, database second. Always.

**Mistake #4: Forgetting `.unref()` on the timeout.** Without it, your process never exits after cleanup because the timer is keeping the event loop alive. Seen this cause 30-second startup delays because the old process wasn't actually exiting.

## TL;DR 🎯

1. `process.on('SIGTERM', shutdown)` and `process.on('SIGINT', shutdown)` — always, in every Node.js app
2. `server.close(callback)` — stops new connections, waits for existing ones to finish
3. Close database pools in the callback — after HTTP, not before
4. Add a hard timeout with `.unref()` — don't wait forever
5. `kill -9` in production = villain behavior. Use `kill -15` (SIGTERM)
6. Match your timeout to PM2/Kubernetes `terminationGracePeriodSeconds` — stay shorter than the orchestrator's limit

When I deployed the graceful shutdown handler at Acodez, deploy times got faster (no more random 30-second hangs), error logs during deploys went to zero, and I stopped getting Slack messages that said "did you just deploy? The site errored for me."

Yes. I had just deployed. But now I could say: "No requests were harmed in the making of this deployment." 🎉

---

**Deploying Node.js to production?** Add this shutdown handler before you push. Future-you (and your users) will thank you.

**Found a weird shutdown edge case?** I'm collecting war stories on [LinkedIn](https://www.linkedin.com/in/anuraghkp). There's always a new way Node.js will surprise you during process exit.

*P.S. — If you're still using `kill -9` in your deploy scripts: it's okay. I was you once. Change it to `kill -15`. Do it now. I'll wait.*
