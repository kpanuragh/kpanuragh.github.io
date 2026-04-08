---
title: "Kubernetes Health Probes: Stop Letting Dead Pods Serve Traffic 🩺⚠️"
date: "2026-04-08"
excerpt: "Your Kubernetes pod crashed but it's still getting requests? After watching production apps silently die while Kubernetes kept routing traffic to them, I finally understood liveness and readiness probes - and you need them too."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Health Probes: Stop Letting Dead Pods Serve Traffic 🩺⚠️

**Confession time.** I once spent 45 minutes debugging why users were getting random 502 errors — half their requests worked, half didn't. Load balancer? Fine. Database? Healthy. Code? Deployed 20 minutes ago without issues.

The culprit? One of three pods had silently crashed internally but was still alive enough that Kubernetes happily kept sending it traffic. Users were basically playing Russian roulette with every page load.

That's the day I finally understood health probes. And the day I became *deeply religious* about configuring them.

## What Are Health Probes and Why Should You Care? 🤔

Kubernetes doesn't know your app. It knows processes. By default, if your container is running (the process didn't exit), K8s assumes everything is fine. But "the process is running" and "the app is actually healthy" are **very different things**.

Imagine a Node.js app that's running but has:
- A deadlocked event loop
- A corrupted in-memory cache
- Lost its database connection pool
- A memory leak that's about to OOM-kill it

To Kubernetes: all good! Container is up! ✅  
To your users: 500 errors everywhere! 🔥

Health probes are how you teach Kubernetes what "healthy" actually means for your specific app.

There are three types:
- **Liveness probe** — "Is this pod alive? Should I restart it?"
- **Readiness probe** — "Is this pod ready to receive traffic?"
- **Startup probe** — "Has this pod finished starting up?" (the underrated one)

## The Real-World Pain That Makes This Click 💀

**The Scenario: Memory Leak in Production**

```
[10:15] Deploy v2.3.1 to production
[10:17] All pods running, green ✅
[10:45] Support tickets start coming in
[10:51] P1 incident opened
[10:58] Me: "but the pods look fine???"
[11:12] Someone checks memory: pods using 3.8GB of 4GB limit
[11:13] App is still "running" but functionally dead
[11:14] Manual kubectl rollout restart deployment/api
[11:15] Traffic restored
[11:16] Post-mortem: "we had no liveness probe"
```

30 minutes of degraded production because Kubernetes didn't know the app was functionally dead. A liveness probe would have caught this at **10:22** and auto-restarted the pods.

## Liveness Probes: The "Are You Still There?" Check 🔄

A liveness probe tells Kubernetes: "If this check fails, restart the container."

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: api
        image: myapp:latest
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 15   # Wait 15s before first check
          periodSeconds: 10         # Check every 10 seconds
          failureThreshold: 3       # Restart after 3 consecutive failures
          timeoutSeconds: 5         # Fail if no response in 5s
```

And on your app side — keep the liveness endpoint **simple and fast**:

```javascript
// Express.js - /health/live
// This should ONLY check if your process is alive
// DO NOT check database or external services here!
app.get('/health/live', (req, res) => {
  // Check if your app is fundamentally operational
  const memUsage = process.memoryUsage();
  const heapPercent = memUsage.heapUsed / memUsage.heapTotal;

  if (heapPercent > 0.95) {
    // About to OOM - let Kubernetes restart us gracefully
    return res.status(503).json({ status: 'dying', heap: heapPercent });
  }

  res.status(200).json({ status: 'alive' });
});
```

**Critical rule I learned the hard way:** Never check external dependencies (DB, Redis, external APIs) in your liveness probe. If the database goes down, you don't want Kubernetes restarting all your pods in a cascading loop — that just makes everything worse. Liveness = "is THIS pod broken?"

## Readiness Probes: The "Are You Ready for Customers?" Check 🚦

A readiness probe tells Kubernetes: "If this check fails, stop sending traffic to this pod (but don't restart it)."

This is subtle but crucial. A pod can be alive but not ready — for example:
- Still warming up caches
- Database connection not yet established
- Waiting for a config reload

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5    # Check sooner than liveness
  periodSeconds: 5          # More frequent checks
  failureThreshold: 2       # Pull from rotation faster
  successThreshold: 1       # One success = ready again
  timeoutSeconds: 3
```

Your readiness endpoint CAN check dependencies — because if the DB is down, you genuinely aren't ready to serve traffic:

```javascript
// Express.js - /health/ready
app.get('/health/ready', async (req, res) => {
  const checks = {
    database: false,
    cache: false,
  };

  try {
    // Quick DB ping - use a timeout!
    await Promise.race([
      db.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 2000)
      ),
    ]);
    checks.database = true;
  } catch (e) {
    // DB unreachable - we're not ready
  }

  try {
    await redisClient.ping();
    checks.cache = true;
  } catch (e) {
    // Redis unreachable - we're not ready
  }

  const ready = Object.values(checks).every(Boolean);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready', checks });
});
```

**This saved us during a database failover event.** When our primary DB failed over to the replica (taking ~8 seconds), the readiness probe pulled all pods from the load balancer rotation. Zero traffic was served during the switchover. Users saw no errors — just a brief slowdown as requests queued. Without the readiness probe: 8 seconds of 500 errors to every user.

## Startup Probes: The Slow Starter's Best Friend 🐢

Here's the underrated one. Slow-starting apps (Java Spring Boot, I'm looking at you 👀) have a classic problem: they need 60+ seconds to start, but the liveness probe starts checking at 15 seconds and kills the pod before it's even finished booting.

The old workaround was setting `initialDelaySeconds: 120` — but then if a live pod actually dies, you wait 2 minutes before restarting it.

Startup probes solve this cleanly:

```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 8080
  failureThreshold: 30    # 30 failures allowed
  periodSeconds: 10       # checked every 10 seconds
  # = up to 300 seconds (5 minutes) to start up
  # Once startup probe succeeds, liveness/readiness take over

livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  periodSeconds: 10
  failureThreshold: 3     # Only 30 seconds tolerance now

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  periodSeconds: 5
  failureThreshold: 2
```

**Translation:** "Give this pod up to 5 minutes to start. Once it's started, liveness takes over and restarts it if it dies within 30 seconds." 

## The Probe Types (HTTP, TCP, Exec) 🛠️

HTTP probes are the most common, but you have options:

```yaml
# Option 1: HTTP GET (best for web apps)
livenessProbe:
  httpGet:
    path: /health
    port: 3000
    httpHeaders:
    - name: Custom-Header
      value: liveness-check

# Option 2: TCP socket (good for non-HTTP services)
livenessProbe:
  tcpSocket:
    port: 5432  # Just checks if the port accepts connections
  periodSeconds: 10

# Option 3: Exec (run a command inside the container)
livenessProbe:
  exec:
    command:
    - /bin/sh
    - -c
    - "redis-cli ping | grep PONG"
  periodSeconds: 10
```

**When I use each:**
- HTTP: APIs, web services — most of what I build
- TCP: Databases, message queues where HTTP isn't available
- Exec: When I need logic that can't be expressed as an HTTP endpoint, or for third-party containers I can't modify

## The Config That Bit Me (Lessons Learned) 🪤

**Mistake #1: `initialDelaySeconds` too short**

```yaml
# Pod takes 30s to start, probe starts at 5s → CRASH LOOP
livenessProbe:
  initialDelaySeconds: 5  # Too soon!
```

Your pod enters a crash loop before it even finishes starting. I've seen junior devs spend hours debugging what they think is a code issue — it's just the probe firing too early.

**Mistake #2: `failureThreshold: 1`**

```yaml
livenessProbe:
  failureThreshold: 1  # One slow response = restart!
```

One slow GC pause, one brief network hiccup = pod restart. Cascading restarts under load. Not fun. Use at least 3.

**Mistake #3: Expensive liveness checks**

```javascript
// BAD: Full database query on every liveness check
app.get('/health/live', async (req, res) => {
  const result = await db.query('SELECT COUNT(*) FROM users'); // 😱
  res.json({ users: result.rows[0].count });
});
```

If your liveness check takes 500ms and runs every 10 seconds, that's 5% of your DB capacity used on health checks. Keep liveness checks under 50ms. Always.

## The Full Production-Ready Config 🏭

Here's what a complete, battle-tested deployment looks like:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  strategy:
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Never take pods offline before new ones are ready
  template:
    spec:
      containers:
      - name: api
        image: myapp:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        startupProbe:
          httpGet:
            path: /health/live
            port: 3000
          failureThreshold: 18    # 18 × 10s = 3 minutes to start
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 0  # Startup probe handles the delay
          periodSeconds: 10
          failureThreshold: 3
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 0
          periodSeconds: 5
          failureThreshold: 2
          successThreshold: 1
          timeoutSeconds: 3
```

Combined with `maxUnavailable: 0`, this guarantees zero-downtime rolling deployments — new pods must pass readiness before old ones get terminated.

## The Bottom Line 💡

Health probes are not optional. They're the difference between Kubernetes being a smart orchestrator and an expensive process manager.

- **Liveness probe** = "restart me if I'm broken" (keep it cheap, no external deps)
- **Readiness probe** = "pull me from rotation if I can't serve traffic" (check your deps)
- **Startup probe** = "give me time to boot before judging me" (especially for JVM apps)

After adding proper health probes across our stack, on-call incidents from "pod serving errors but looks healthy" dropped to **zero**. Kubernetes started catching and auto-healing what used to be manual 3 AM interventions.

Your cluster is smart enough to self-heal — but only if you teach it what "healthy" means for your app.

## Your Action Plan 🚀

1. **Audit your deployments today:** `kubectl get deployments -o yaml | grep -A5 livenessProbe` — no output means you have no probes!
2. **Add a `/health/live` endpoint** to every service (keep it fast, no DB checks)
3. **Add a `/health/ready` endpoint** that checks your actual dependencies
4. **Start with liveness + readiness**, add startup probes for slow-starting services
5. **Test your probes:** `kubectl exec -it <pod> -- curl localhost:3000/health/live`

Your future on-call self will thank you. Profusely. At 3 AM. When Kubernetes auto-restarts the broken pod before your phone even rings. 🎉

---

**Dealt with cascading pod failures or mysterious traffic issues?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I want to hear your war stories!

**More Kubernetes deep-dives on [GitHub](https://github.com/kpanuragh)** — real configs from real production clusters.

*Now go probe your pods.* 🩺🚀
