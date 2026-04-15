---
title: "Kubernetes Probes: Stop Your Pods From Playing Dead 🧟‍♂️☸️"
date: "2026-04-15"
excerpt: "Your pod says it's Running. Your users say the app is down. Kubernetes probes are the lie detector your cluster desperately needs — here's how to wire them up correctly."
tags: ["devops", "kubernetes", "docker", "backend"]
featured: true
---

# Kubernetes Probes: Stop Your Pods From Playing Dead 🧟‍♂️☸️

Let me paint you a picture.

It's 2 AM. PagerDuty is screaming. Your on-call engineer opens Kubernetes Dashboard and sees... **all pods green**. Every single one. `Running`. Beautiful. Healthy. Lying through their teeth.

Meanwhile, customers are staring at a blank white screen.

Welcome to the zombie pod problem — and the reason Kubernetes probes exist.

## The Pod That Cried "Running" 🐺

Here's what Kubernetes does by default when your app starts: it checks if the container process is alive. That's it. If the process didn't crash, Kubernetes shrugs and says "looks healthy to me!" and starts routing traffic.

But your Node.js app? It started the process. Then it tried to connect to the database. The database was still warming up. Now your app is "running" in the sense that the process exists, but it's returning 500 errors on every request like a broken vending machine.

**Three probes solve this. Most teams only know about one.**

## The Three Probe Amigos 🤠

### 1. Liveness Probe — "Are You Actually Alive?"

The liveness probe answers: *should Kubernetes restart this pod?*

If your liveness probe fails, Kubernetes kills the pod and starts a new one. Think of it as the defibrillator — it's for when the app is truly stuck and needs a hard reset.

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 15   # Give app time to boot
  periodSeconds: 20         # Check every 20s
  failureThreshold: 3       # 3 failures = restart
  timeoutSeconds: 5         # Fail if no response in 5s
```

**What `/health/live` should return:**
```javascript
// Express.js — Keep this DIRT SIMPLE
app.get('/health/live', (req, res) => {
  // Just check: is the event loop responsive?
  // Can we allocate memory? Are we in a deadlock?
  res.status(200).json({ status: 'alive', timestamp: Date.now() });
});
```

**Critical rule:** Your liveness endpoint must NOT check external dependencies like databases or Redis. If your database goes down, you don't want Kubernetes restarting all your pods in a cascade — that makes the problem 10x worse. Liveness = can the app's own process think straight?

### 2. Readiness Probe — "Are You Ready for Traffic?"

The readiness probe answers: *should Kubernetes send traffic to this pod?*

A pod failing its readiness probe gets removed from the load balancer — but it's NOT restarted. It just sits in the corner, not receiving requests, until it passes again. Perfect for:
- Waiting for DB connections to establish on startup
- Backing off during a traffic spike
- Graceful shutdown (failing readiness before SIGTERM)

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5    # Check sooner than liveness
  periodSeconds: 10
  failureThreshold: 3
  successThreshold: 1       # 1 success = back in rotation
  timeoutSeconds: 3
```

**What `/health/ready` should check:**
```javascript
app.get('/health/ready', async (req, res) => {
  const checks = {
    database: false,
    cache: false,
  };

  try {
    // Cheap check — just ping, don't run a query
    await db.raw('SELECT 1');
    checks.database = true;
  } catch (err) {
    // Log but don't throw
  }

  try {
    await redisClient.ping();
    checks.cache = true;
  } catch (err) {
    // Cache down? Maybe still ready, depends on your app
  }

  const allHealthy = checks.database; // cache is optional for us
  res.status(allHealthy ? 200 : 503).json({ checks });
});
```

### 3. Startup Probe — "Are You Done Booting Yet?"

The startup probe is the newest addition and the most misunderstood. It answers: *has the app finished its initial startup?*

**The problem it solves:** Liveness probes run from the very first second. If your Java Spring Boot app takes 90 seconds to start (don't @ me, we've all been there), and your liveness probe fires every 10 seconds with a failure threshold of 3... your pod gets killed at 30 seconds before it ever had a chance.

The startup probe disables liveness and readiness probes until it succeeds. After it passes once, it steps aside and never runs again.

```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 3000
  failureThreshold: 30      # 30 * 10s = 5 min max startup time
  periodSeconds: 10
  # Can reuse liveness endpoint — it's the same question
```

## The Config That Actually Works in Production 🏭

Here's a full deployment spec I've run in production without a single zombie pod incident:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: my-api:latest
          ports:
            - containerPort: 3000

          # Startup: give it 5 min to boot, then hand off
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            failureThreshold: 30
            periodSeconds: 10

          # Liveness: is the process responsive?
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 0   # Startup probe covers this
            periodSeconds: 20
            failureThreshold: 3
            timeoutSeconds: 5

          # Readiness: ready for real traffic?
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 10
            failureThreshold: 3
            successThreshold: 1
            timeoutSeconds: 3

          # Always pair probes with resource limits
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

## The Mistakes That Will Haunt You 👻

**Mistake #1: Checking external services in liveness**

Your DB goes down → liveness fails → Kubernetes restarts all pods → pods try to reconnect → thundering herd → DB gets hammered → DB stays down longer. You just turned a DB blip into a full outage. 

**Mistake #2: Setting `initialDelaySeconds` too low**

Your app takes 30 seconds to warm up. You set `initialDelaySeconds: 5`. Kubernetes marks it unhealthy before it's had a chance to boot. Use the startup probe instead — it's the right tool.

**Mistake #3: The "works on my machine" timeout**

Your health endpoint calls the DB. In dev, it responds in 2ms. In prod under load, it takes 800ms. Your `timeoutSeconds: 1` fires before the check even finishes. Set timeouts 2-3x your observed p95 latency.

**Mistake #4: No probes at all**

The default. Your pods are immortal even when broken. Zero traffic shaping during rolling deploys. New pods receive traffic the instant the container starts, not when the app is ready. This is how 2 AM incidents are made.

## Real-World Lesson Learned 🔥

I once deployed a probe with this liveness check:

```javascript
// DON'T DO THIS
app.get('/health/live', async (req, res) => {
  const result = await db.query('SELECT COUNT(*) FROM events');
  res.json({ count: result.rows[0].count });
});
```

The events table had 80 million rows. Under load, this query took 4 seconds. The liveness probe timed out at 3 seconds. Kubernetes thought the app was dead. It restarted pods constantly. Every restart caused new DB connections. The DB connection pool exhausted. The entire cluster went into a restart loop at 6 PM on a Friday.

The fix was two lines — the `/health/live` endpoint became `res.json({ ok: true })`. Probe checks are not the place for business logic.

## Your Action Plan 🚀

1. **Add a `/health/live` endpoint today** — literally just returns `200 OK`. Ship it.
2. **Add a `/health/ready` endpoint** — checks your critical dependencies (DB ping, nothing heavy).
3. **Add a startup probe** if your app takes more than 15 seconds to boot.
4. **Set `failureThreshold` conservatively** — don't let one slow response nuke your pod.
5. **Test failure scenarios** — kill your DB, watch readiness fail but liveness hold. Verify pods leave rotation cleanly.

Kubernetes is trying to keep your app healthy. Probes are how you tell it what "healthy" actually means for your specific app. Without them, it's flying blind — and so are you.

Go fix your probes. Your 2 AM self will thank you.

---

**Running into weird probe behavior?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've debugged more zombie pods than I care to admit.

**Want to see more Kubernetes deep dives?** Follow me on [GitHub](https://github.com/kpanuragh) and drop a star if this saved your cluster.

*Now go give your pods a health check they can actually pass.* ☸️✨
