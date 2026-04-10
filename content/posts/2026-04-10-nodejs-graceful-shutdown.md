---
title: "Your Node.js App Is Dying Badly (Here's How to Fix It) 💀"
date: "2026-04-10"
excerpt: "Most Node.js apps shut down like a drunk person falling off a barstool — sudden, messy, and leaving a trail of dropped requests behind. Graceful shutdown is the cure."
tags: ["nodejs", "backend", "express", "devops", "production"]
featured: true
---

# Your Node.js App Is Dying Badly (Here's How to Fix It) 💀

Imagine you're in the middle of a really important phone call and someone just yanks the cord out of the wall. No "hold on," no "I'll call you back," just... silence. That's exactly what happens to your users every time your Node.js app restarts without graceful shutdown.

Kubernetes rolling updates, Docker container replacements, CI/CD deploys — they all kill your process. And if you haven't thought about *how* your app dies, your users are experiencing that yanked phone cord multiple times a day.

Let's fix that.

## Why Your App's Death Matters

When Node.js receives a `SIGTERM` signal (the polite "please stop" signal from the OS or orchestrator), the default behavior is to... immediately exit. Done. Gone. Any in-flight HTTP requests? Dropped. Active database transactions? Abandoned. Open file handles? Left dangling.

Here's what a "bad death" looks like in production:

```
[02:47:13] Deployment started
[02:47:14] Pod terminated
[02:47:14] 47 requests dropped (502 Bad Gateway)
[02:47:14] 3 database transactions rolled back unexpectedly
[02:47:14] 1 angry support ticket filed
```

That "1 angry support ticket" is always from the CEO's demo. Always.

## The Basic Pattern: Listen Before You Die

The fix starts with listening for termination signals and doing cleanup work before exiting:

```javascript
const express = require('express');
const app = express();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/slow-operation', async (req, res) => {
  // Simulate a slow DB query or external API call
  await new Promise(resolve => setTimeout(resolve, 3000));
  res.json({ data: 'here you go, sorry for the wait' });
});

const server = app.listen(3000, () => {
  console.log('Server is alive and kicking on port 3000');
});

// Track active connections
let activeConnections = 0;

server.on('connection', (socket) => {
  activeConnections++;
  socket.on('close', () => activeConnections--);
});

// The graceful shutdown function
async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Step 1: Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed. No new requests accepted.');

    // Step 2: Do your cleanup here
    try {
      await db.disconnect();       // Close DB connections
      await redisClient.quit();    // Close Redis connections
      await flushPendingLogs();    // Drain any log buffers
      console.log('Cleanup complete. Goodbye!');
      process.exit(0);
    } catch (error) {
      console.error('Error during cleanup:', error);
      process.exit(1);
    }
  });

  // Force exit if cleanup takes too long
  setTimeout(() => {
    console.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 30000); // 30 second timeout
}

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Kubernetes/Docker
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C locally
```

The key insight: `server.close()` stops the server from accepting *new* connections but lets existing ones finish. That's the magic. In-flight requests get to complete; new requests get routed to a different pod (because your load balancer is smart enough to stop sending traffic once it sees the pod is terminating).

## The Problem Nobody Talks About: Keep-Alive Connections

There's a sneaky gotcha that bites most developers. `server.close()` only stops new connections — but HTTP keep-alive means the *same* connection can handle multiple requests. So if a client has a persistent connection open (which most browsers and `fetch` clients do), `server.close()` won't close it, and your process will hang until the timeout.

The fix is to track connections and destroy them yourself:

```javascript
const connections = new Set();

server.on('connection', (socket) => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  // Tell clients "don't reuse this connection"
  // This causes keep-alive connections to close after the current request
  server.headersTimeout = 1;
  
  server.close(async () => {
    await cleanupResources();
    process.exit(0);
  });

  // After a grace period, forcibly destroy lingering connections
  setTimeout(() => {
    console.log(`Forcing ${connections.size} connections closed`);
    for (const socket of connections) {
      socket.destroy();
    }
  }, 10000); // Give 10 seconds for requests to finish naturally

  setTimeout(() => {
    console.error('Hard timeout reached. Exiting now.');
    process.exit(1);
  }, 30000);
}
```

This approach is elegant: we politely ask connections to close, wait a reasonable amount of time, then pull the plug on whatever's left. It's like a good bouncer — "Finish your drinks, folks, we're closing" — followed by the lights coming on if people don't move.

## Production Checklist: Death Done Right

Beyond the code, there are operational things you need to get right:

**1. Set `terminationGracePeriodSeconds` in Kubernetes**

Kubernetes defaults to 30 seconds before it sends SIGKILL. Make sure your app's cleanup timeout is *shorter* than this, or Kubernetes will murder your process mid-cleanup.

```yaml
spec:
  terminationGracePeriodSeconds: 60  # Kubernetes waits this long
  containers:
    - name: my-app
      # Your app's timeout should be ~50s max
```

**2. Handle `uncaughtException` and `unhandledRejection`**

```javascript
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  // Don't necessarily exit here — log and monitor
});
```

**3. Health check endpoints that reflect shutdown state**

```javascript
let isShuttingDown = false;

process.on('SIGTERM', () => {
  isShuttingDown = true;
  gracefulShutdown('SIGTERM');
});

app.get('/health', (req, res) => {
  if (isShuttingDown) {
    // Return 503 so the load balancer stops routing traffic here
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.json({ status: 'ok' });
});
```

This one is *chef's kiss*. The moment shutdown starts, your health check returns 503. Load balancers see this within seconds and stop sending new traffic. By the time the server actually closes, all traffic has already been drained elsewhere.

## The Payoff

Get graceful shutdown right and your deployments go from "fingers crossed, pray for no 502s" to a smooth, zero-downtime operation. Users don't notice. On-call engineers don't get paged. The CEO's demo works perfectly (well, until the next bug anyway).

Graceful shutdown is one of those things that takes maybe an afternoon to implement properly but pays dividends every single time you deploy — which, if you're doing CI/CD right, is multiple times a day.

Death, it turns out, is something worth planning for.

---

**Got your shutdown handling better than a Viking funeral? Hit me up on Twitter or drop a comment below — I'd love to hear what cleanup routines you're running before the curtain falls.**
