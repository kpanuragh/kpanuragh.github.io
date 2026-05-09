---
title: "🛑 Node.js Graceful Shutdown: Stop Killing Your Server Mid-Request"
date: 2026-05-09
excerpt: "Your server is like a surgeon mid-operation — you wouldn't yank the power cord. Learn how to implement graceful shutdown so Node.js finishes what it started before going offline."
tags: ["nodejs", "express", "backend", "devops", "reliability"]
featured: true
---

Picture this: your app is deployed, traffic is flowing, everything is beautiful. Then you push a new release. Your deployment tool sends `SIGTERM`, Node.js immediately exits, and 47 in-flight requests — including someone's payment processing — just *vanish into the void*.

That's not a deploy. That's a heist.

## What Even Is Graceful Shutdown?

A graceful shutdown means your server:

1. **Stops accepting new connections** the moment it gets a shutdown signal
2. **Finishes all in-flight requests** already being processed
3. **Closes database connections, queues, and file handles** cleanly
4. **Then, and only then**, exits

Without it, your app is the equivalent of a waiter who just throws your food on the floor and walks out because their shift ended.

## The Problem With Naive Shutdown

Here's how most Node.js servers start:

```js
const express = require('express');
const app = express();

app.get('/checkout', async (req, res) => {
  await chargeCard(req.body.cardToken); // takes ~2 seconds
  await sendConfirmationEmail(req.body.email);
  res.json({ success: true });
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

When Kubernetes sends `SIGTERM` during a rolling deploy, Node gets the signal and — if you do nothing — exits immediately. That `/checkout` handler mid-execution? Gone. The user gets a network error. You get a support ticket at 2 AM.

## The Fix: Handle Your Signals Like a Pro

The key is intercepting the shutdown signal, draining traffic, then exiting cleanly:

```js
const express = require('express');
const http = require('http');

const app = express();

app.get('/checkout', async (req, res) => {
  await chargeCard(req.body.cardToken);
  await sendConfirmationEmail(req.body.email);
  res.json({ success: true });
});

// Create an explicit HTTP server (instead of letting express.listen() do it)
const server = http.createServer(app);

let isShuttingDown = false;

// Reject new requests once shutdown begins
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    return res.status(503).json({ error: 'Server is shutting down' });
  }
  next();
});

function shutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  isShuttingDown = true;

  // Stop accepting new connections; wait for existing ones to finish
  server.close(async () => {
    console.log('All connections closed. Cleaning up...');

    try {
      await db.disconnect();       // close your DB pool
      await redisClient.quit();    // close Redis
      await messageQueue.close();  // drain your job queue
      console.log('Cleanup complete. Exiting.');
      process.exit(0);
    } catch (err) {
      console.error('Cleanup failed:', err);
      process.exit(1);
    }
  });

  // Force-kill if shutdown takes too long (failsafe)
  setTimeout(() => {
    console.error('Graceful shutdown timed out. Force exiting.');
    process.exit(1);
  }, 30_000); // 30 seconds max
}

process.on('SIGTERM', () => shutdown('SIGTERM')); // Kubernetes, Docker
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C in terminal

server.listen(3000, () => console.log('Server ready'));
```

The `server.close()` call is the magic trick here. It tells Node: "Stop the door from letting new people in, but let the people already inside finish their meal before you kick them out."

## The Timeout Failsafe: Because Things Go Wrong

Notice the `setTimeout` at the end? That's your nuclear option.

Imagine one of your requests is caught in an infinite retry loop hitting a dead third-party API. Without the timeout, your graceful shutdown would gracefully wait... forever. Your Kubernetes pod would never restart, deployments would hang, and your on-call engineer would be very unhappy.

30 seconds is a reasonable ceiling. Adjust based on your slowest legitimate operation — if your longest database query takes 10 seconds max, set it to 15 seconds.

## Kubernetes-Specific Gotcha

If you're running in Kubernetes, there's a subtle race condition you need to know about.

When a pod receives `SIGTERM`, the pod's IP is *simultaneously* being removed from the service's endpoint list — but that removal isn't instant. For a few seconds, the load balancer might still route traffic to your dying pod.

The fix is a small pre-shutdown sleep:

```js
function shutdown(signal) {
  console.log(`Received ${signal}. Waiting for load balancer sync...`);
  isShuttingDown = true;

  // Give the LB time to stop routing to us before we close connections
  setTimeout(() => {
    server.close(async () => {
      await cleanupResources();
      process.exit(0);
    });
  }, 5000); // 5-second "drain window" before closing
}
```

Those 5 seconds let the ingress controller catch up and stop sending new traffic your way before you close the door. Without it, you'll still see occasional 502s during rolling deploys even with graceful shutdown implemented.

## Quick Sanity Check: How to Test This

Don't just ship it and hope. Test it:

```bash
# In terminal 1: start your server
node server.js

# In terminal 2: fire a slow request
curl http://localhost:3000/checkout &

# Immediately send SIGTERM (simulating a deploy)
kill -SIGTERM $(lsof -ti:3000)
```

Watch the logs. You should see:
- Shutdown signal received
- The in-flight `/checkout` request *completing*
- Database connections closing
- Process exiting with code 0

If the request gets cut off, something's wrong with your shutdown logic.

## The Takeaway

Graceful shutdown is one of those things that feels optional until you have your first incident where a payment gets lost or a database transaction gets corrupted mid-write. Then it becomes mandatory.

The pattern is always the same:
- **Catch the signal** (`SIGTERM`, `SIGINT`)
- **Stop new traffic** (middleware guard + `server.close()`)
- **Drain in-flight work** (wait for `server.close()` callback)
- **Clean up resources** (DB, Redis, queues)
- **Set a hard timeout** (don't wait forever)

Your users won't notice when it works. But they'll *definitely* notice when it doesn't.

---

**Got a war story about a deployment that went sideways?** Drop it in the comments — I guarantee you're not alone. And if you're running Express in production without graceful shutdown, this is your sign to add it before your next deploy. Future-you will send a thank-you card.
