---
title: "Kubernetes Health Probes: Stop Routing Traffic to Dead Pods 🩺💀"
date: "2026-04-18"
excerpt: "Spent a whole Sunday debugging why 30% of user requests returned 502 errors — turns out our pods were 'Running' but completely brain-dead. Kubernetes health probes would have caught it in seconds. Here's everything I wish I'd known."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Health Probes: Stop Routing Traffic to Dead Pods 🩺💀

Let me paint you a picture.

It's Sunday afternoon. Your app is deployed. `kubectl get pods` looks pristine — every pod shows `Running`. You're sipping coffee, feeling like an infrastructure deity. Then Slack explodes.

> "Why are 30% of requests returning 502?"
> "The app is completely down for some users!"
> "Did you deploy something??"

You frantically check. Pods: `Running`. Deployments: `Available`. Load balancer: green. Everything looks fine. Except... it isn't. 😅

**The culprit?** Kubernetes was cheerfully routing traffic to pods that were alive in name only — their processes had deadlocked, their database connections had vanished, and they were silently swallowing every request into the void.

The fix was two dozen lines of YAML I should have written on day one. Welcome to **Kubernetes health probes** — the feature that makes Kubernetes actually smart about your app's health, not just whether the container PID is alive.

---

## What Even ARE Health Probes? 🤔

Kubernetes runs three types of probes:

| Probe | Question it answers | Failure action |
|-------|-------------------|----------------|
| **Liveness** | "Is this pod still functioning?" | Restart the container |
| **Readiness** | "Is this pod ready to serve traffic?" | Remove from Service endpoints |
| **Startup** | "Has the app finished starting up?" | Block liveness/readiness checks until it does |

Without probes, Kubernetes only knows if the container *process is running*. With probes, it knows if your app is actually *doing its job*. Big difference.

---

## The Horror Story in Detail 💀

Here's what was happening in our incident. We had a Node.js API that connected to PostgreSQL. Under heavy load, the connection pool would exhaust and the app would enter a zombie state — process alive, but every request timing out waiting for a DB connection.

```
Process status: RUNNING ✅
Container: RUNNING ✅
Kubernetes: "All good, routing traffic!" ✅
Actual app: 💀💀💀 DEAD 💀💀💀
```

Without a liveness probe, Kubernetes had zero idea. It kept routing traffic to the three zombie pods for **47 minutes** before an on-call engineer manually deleted them.

**47 minutes.** Of 502s. On a Sunday.

---

## Liveness Probes: "Are You Actually Alive?" ❤️

A liveness probe tells Kubernetes to *restart* a container if it fails. Use it for detecting deadlocks, infinite loops, or anything where the app is stuck but the process hasn't died.

### HTTP Liveness Probe (Most Common)

```yaml
# deployment.yaml
spec:
  containers:
    - name: api
      image: myapp:latest
      livenessProbe:
        httpGet:
          path: /health/live
          port: 3000
        initialDelaySeconds: 10   # Wait 10s before first check
        periodSeconds: 15         # Check every 15s
        failureThreshold: 3       # Restart after 3 consecutive failures
        timeoutSeconds: 5         # Fail if no response in 5s
```

And in your Node.js app, the `/health/live` endpoint should be **dead simple** — just confirm the process is responsive:

```javascript
// routes/health.js
app.get('/health/live', (req, res) => {
  // Don't check DB here — that's for readiness!
  // Just confirm the event loop is alive.
  res.status(200).json({ status: 'alive', timestamp: Date.now() });
});
```

**The golden rule:** Your liveness endpoint should NEVER check external dependencies (DB, Redis, external APIs). If your DB goes down, you don't want Kubernetes restarting all your pods — you want them to stop receiving *new* traffic while they wait for the DB to recover. That's readiness probe territory.

---

## Readiness Probes: "Are You Ready for Traffic?" 🚦

A readiness probe tells Kubernetes to *remove the pod from the Service load balancer* if it fails — without restarting it. Use it for:

- Waiting for DB connections to establish on startup
- Temporarily pulling a pod from rotation during heavy processing
- Graceful degradation when a dependency is down

```yaml
spec:
  containers:
    - name: api
      image: myapp:latest
      readinessProbe:
        httpGet:
          path: /health/ready
          port: 3000
        initialDelaySeconds: 5    # Check sooner than liveness
        periodSeconds: 10
        failureThreshold: 2       # Faster to pull from rotation
        successThreshold: 1       # One success to re-add
        timeoutSeconds: 3
```

Your readiness endpoint CAN (and should) check dependencies:

```javascript
app.get('/health/ready', async (req, res) => {
  const checks = {};

  // Check DB connectivity
  try {
    await db.raw('SELECT 1');
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'unavailable';
  }

  // Check Redis if you use it
  try {
    await redis.ping();
    checks.cache = 'ok';
  } catch (err) {
    checks.cache = 'unavailable';
  }

  const healthy = Object.values(checks).every(v => v === 'ok');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ready' : 'not ready',
    checks,
  });
});
```

When the DB goes down: readiness fails → pod removed from load balancer → users hit only healthy pods → no 502s. Beautiful. 🎯

---

## Startup Probes: The Slow-Starting App's Best Friend 🐢

Some apps take forever to start — JVM warm-up, database migrations, loading ML models. Without a startup probe, your liveness probe fires during startup and restarts the pod in an infinite loop of shame.

```yaml
spec:
  containers:
    - name: java-api
      image: my-spring-boot-app:latest
      startupProbe:
        httpGet:
          path: /actuator/health
          port: 8080
        failureThreshold: 30      # Allow up to 30 * 10s = 5 minutes to start
        periodSeconds: 10
      livenessProbe:
        httpGet:
          path: /actuator/health/liveness
          port: 8080
        periodSeconds: 15
        failureThreshold: 3
      readinessProbe:
        httpGet:
          path: /actuator/health/readiness
          port: 8080
        periodSeconds: 10
        failureThreshold: 2
```

**How it works:** While the startup probe is active, liveness and readiness probes are paused. Once startup succeeds, the other probes take over. Slow app? No problem. Still stuck after 5 minutes? Something's very wrong — restart it. 

---

## Real-World Lessons Learned (The Painful Way) 📖

**Lesson 1: Don't make your liveness probe check the DB.**

We did this. Our DB had a 2-minute maintenance window. Kubernetes restarted ALL 8 pods simultaneously. Cold boot with no warm cache. Latency spiked to 10 seconds. Users thought we were down. We were down. 🙃

**Lesson 2: Set `initialDelaySeconds` based on real measurements.**

Too short: pod gets killed before it finishes starting up → restart loop → `CrashLoopBackOff` → midnight pages. Too long: broken pods serve traffic for too long before detection. Profile your actual startup time and add a 50% buffer.

**Lesson 3: Use `successThreshold > 1` for readiness if you have a flaky dependency.**

If Redis glitches for one second, you don't want pods yanked from rotation and readded every 10 seconds (thundering herd alert!). Setting `successThreshold: 2` means it needs two consecutive successes to come back — much smoother.

**Lesson 4: Probe endpoints need to be fast.**

We had a readiness probe that ran 5 database queries. Under load, those queries would slow down, the probe would time out, pods would leave rotation, traffic concentrated on fewer pods, they slowed down more, and the whole thing snowballed. One lightweight `SELECT 1` is enough.

---

## The Complete Production Template 🏭

Here's the battle-tested probe configuration I use for Node.js APIs today:

```yaml
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
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            failureThreshold: 12  # 12 * 5s = 60s max startup time
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 0    # Startup probe handles the wait
            periodSeconds: 15
            failureThreshold: 3
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 10
            failureThreshold: 2
            successThreshold: 2
            timeoutSeconds: 3
```

Three probes, zero zombie pods. That's the deal. ✅

---

## Quick Wins Checklist 🚀

**Right now:**
- [ ] Check `kubectl get pods` — do any show `Running` but behave oddly? You have no probes.
- [ ] Add a `/health/live` endpoint that returns 200 if the process is responsive
- [ ] Add `/health/ready` that checks your critical dependencies
- [ ] Wire up all three probes to your deployments

**This week:**
- [ ] Measure actual startup time for each service and set `initialDelaySeconds` accordingly
- [ ] Test probe failure by intentionally killing the DB and watching readiness fail gracefully
- [ ] Add probe metrics to your Grafana dashboard (Kubernetes exposes them via the metrics API)

**The test that matters most:** Manually `kubectl exec` into a pod and kill your DB connection. Within `failureThreshold * periodSeconds` seconds, that pod should disappear from `kubectl get endpoints`. If it does — your probes work. If it doesn't — back to the YAML! 🔧

---

## Wrapping Up 🎁

Health probes are the difference between Kubernetes being a "container restarter" and an actual self-healing platform. Without them, you're flying blind — trusting that a running process equals a working app. With them, Kubernetes becomes genuinely intelligent about your service's health.

The 47-minute Sunday incident? After adding probes, the next DB connection exhaustion event was handled automatically in under 45 seconds. No pages. No 502s. Just Kubernetes quietly rotating traffic around the struggling pod until it recovered.

That's the dream. Go write your health endpoints. 🩺

---

**Still debugging mysterious 502s?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've seen too many variations of this exact incident to count.

**Want to see probe configurations from real projects?** My [GitHub](https://github.com/kpanuragh) has production Kubernetes manifests with full health probe setups.

*Now go forth and let no zombie pod eat your traffic again!* 🧟‍♂️🚫
