---
title: "🚪 Node.js Graceful Shutdown: Stop Slamming the Door on Your Users"
date: 2026-04-17
excerpt: "Every time you SIGKILL your Node.js server, someone's request dies mid-flight. Learn how to shut down gracefully so your users never notice the lights going out."
tags: ["nodejs", "express", "backend", "devops", "production"]
featured: true
---

# 🚪 Node.js Graceful Shutdown: Stop Slamming the Door on Your Users

Picture this: you deploy a new version of your app at 2 PM on a Tuesday. Your rolling update kicks in, the old pod gets a termination signal, and — *slam* — a dozen users get a "connection reset" error mid-checkout. Their requests just died. No warning, no retry, no apology. Just a cold, brutal TCP RST packet to the face.

That's what happens when you don't implement graceful shutdown. And it's embarrassingly common.

Let's fix it.

## What Even Is Graceful Shutdown?

Graceful shutdown is the art of **finishing what you started before you leave**. It's the difference between a waiter who disappears mid-order and one who delivers your food, brings the check, and *then* clocks out.

When your process receives a termination signal (like `SIGTERM` from Kubernetes or Docker), you have a choice:
1. **Die immediately** — drop all in-flight requests, close all DB connections, chaos
2. **Die gracefully** — stop accepting new requests, finish the ones in progress, clean up, *then* exit

Option 2 is what separates production-ready apps from "it works on my machine" apps.

## The Basic Pattern

Here's the minimal graceful shutdown setup for an Express server:

```javascript
const express = require('express');
const app = express();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/slow', async (req, res) => {
  // Simulate a slow database query
  await new Promise(resolve => setTimeout(resolve, 3000));
  res.json({ data: 'finally done' });
});

const server = app.listen(3000, () => {
  console.log('Server running on port 3000');
});

// The graceful shutdown handler
async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed. Cleaning up...');

    // Close database connections, flush queues, etc.
    await closeDbConnections();
    await flushMessageQueue();

    console.log('Cleanup complete. Exiting.');
    process.exit(0);
  });

  // Force exit after 30 seconds — don't wait forever
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C locally
```

The key insight: `server.close()` stops the server from accepting *new* connections, but lets existing ones finish. That's your window to be polite.

## The Problem Nobody Tells You About

Here's where it gets tricky. `server.close()` won't close **keep-alive connections**. 

Modern HTTP clients use persistent connections, meaning the socket stays open between requests. If a client has an idle keep-alive connection open, `server.close()` will happily wait... forever. Your 30-second timeout will fire and you'll force-exit anyway, defeating the whole point.

The fix? Manually track and destroy idle connections:

```javascript
const connections = new Map();
let isShuttingDown = false;

server.on('connection', (socket) => {
  const id = Symbol();
  connections.set(id, socket);

  socket.on('close', () => connections.delete(id));
});

// When a request completes during shutdown, close its socket
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set('Connection', 'close');
  }
  next();
});

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  isShuttingDown = true;

  // Destroy all idle keep-alive connections immediately
  for (const socket of connections.values()) {
    // If socket isn't actively serving a request, close it
    if (socket.idle) socket.destroy();
  }

  server.close(async () => {
    await closeDbConnections();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 30_000);
}
```

Setting `Connection: close` on responses during shutdown tells clients "don't reuse this socket" — they'll reconnect to your new instance automatically.

## Real-World Additions

In production, you also want to handle:

**Database connection draining** — don't let a query get half-executed when you disconnect from Postgres mid-transaction.

**Message queue acknowledgment** — if you're using RabbitMQ or SQS, stop polling for new messages but finish processing the ones you've already pulled.

**Health check flipping** — make your `/health` endpoint return `503` the moment shutdown starts. Load balancers will stop routing traffic to you before you've even finished. This is the move:

```javascript
let healthy = true;

app.get('/health', (req, res) => {
  if (!healthy) return res.status(503).json({ status: 'shutting down' });
  res.json({ status: 'ok' });
});

async function shutdown(signal) {
  healthy = false; // Load balancer stops routing immediately
  
  // Give the load balancer a moment to notice (usually 5-10s)
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Now close the server
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30_000);
}
```

This is the "tell the bouncer before you close the bar" trick. Your load balancer health check interval is usually 5-10 seconds, so waiting that long after marking yourself unhealthy means no new requests will arrive by the time you close.

## Kubernetes Specifics

If you're running in Kubernetes, set `terminationGracePeriodSeconds` in your pod spec:

```yaml
spec:
  terminationGracePeriodSeconds: 60  # Default is 30
  containers:
    - name: my-app
      lifecycle:
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]  # Wait for LB to drain
```

The `preStop` hook gives Kubernetes a moment to remove you from the service endpoints before sending `SIGTERM`. Without it, you might still receive requests *after* the shutdown signal arrives — a race condition that trips up a lot of teams.

## The TL;DR Checklist

Before your next deployment, make sure your Node.js app:

- [ ] Listens for `SIGTERM` and `SIGINT`
- [ ] Calls `server.close()` to stop new connections
- [ ] Sets a hard timeout (30s) to force-exit if things stall
- [ ] Closes DB connections and flushes queues after `server.close()`
- [ ] Returns `503` from `/health` immediately on shutdown start
- [ ] Handles keep-alive connections (or uses a library like [`http-terminator`](https://github.com/nicolo-ribaudo/http-terminator))

---

Graceful shutdown is one of those things that feels unnecessary until a 3 AM deploy goes sideways and you're debugging why 200 users got error pages. Build it in now, future-you will be grateful.

Got a war story about a bad deploy that graceful shutdown would have prevented? Drop it in the comments — misery loves company. And if this helped, share it with that colleague who's still using `kill -9` in production. You know who they are.
