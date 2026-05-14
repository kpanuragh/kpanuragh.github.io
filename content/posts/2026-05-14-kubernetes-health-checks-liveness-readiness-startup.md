---
title: "🩺 Kubernetes Health Checks: Why Your Pod Is Lying to You"
date: 2026-05-14
excerpt: "Liveness, readiness, and startup probes are the unsung heroes of Kubernetes reliability — and also the source of some truly spectacular 3 AM incidents. Here's how to stop your cluster from killing healthy pods and serving traffic to broken ones."
tags: ["kubernetes", "devops", "docker", "reliability", "cloud-native"]
featured: true
---

# 🩺 Kubernetes Health Checks: Why Your Pod Is Lying to You

Picture this: your deployment is running. Green checkmarks everywhere. Your monitoring dashboard looks like a Christmas tree of success. And yet, users are getting 502 errors because half your pods are happily serving requests while secretly broken inside.

Welcome to the world of Kubernetes health checks — or more specifically, the world of *not having them configured correctly*.

Kubernetes gives you three probes to tell it how your app is doing: **liveness**, **readiness**, and **startup**. Most developers either skip them entirely, copy-paste a config from Stack Overflow without understanding it, or configure them so aggressively that Kubernetes spends its evenings murdering perfectly healthy pods. All three outcomes are bad.

Let's fix that.

---

## The Three Probes, Explained Like You're New Here

**Liveness probe** — "Is this pod alive or should I shoot it and start a fresh one?"
If this fails enough times, Kubernetes restarts your container. Use it for deadlocks and unrecoverable states.

**Readiness probe** — "Is this pod ready to receive traffic?"
If this fails, the pod stays running but gets removed from the Service's load balancer. It won't get killed, just quietly benched. Use it for warm-up time, dependency availability, or temporary overload.

**Startup probe** — "Is this pod still booting up? Give it some grace before the others kick in."
Disables liveness and readiness checks until it passes. Essential for slow-starting apps that would otherwise get killed in a restart loop before they even finish loading.

The classic mistake? Using *only* a liveness probe and making it check something meaningful. Your pod fails the liveness check during a slow database query, Kubernetes restarts it, it fails again during startup, you get a crash loop, and now your on-call engineer is having a very bad Tuesday.

---

## A Configuration That Actually Works

Here's a realistic probe setup for a Node.js API server:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: api
          image: my-api:latest
          ports:
            - containerPort: 3000
          startupProbe:
            httpGet:
              path: /healthz/startup
              port: 3000
            failureThreshold: 30
            periodSeconds: 5
            # 30 * 5s = 150s to start before liveness kicks in

          livenessProbe:
            httpGet:
              path: /healthz/live
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 10
            failureThreshold: 3
            timeoutSeconds: 5

          readinessProbe:
            httpGet:
              path: /healthz/ready
              port: 3000
            periodSeconds: 5
            failureThreshold: 3
            successThreshold: 1
            timeoutSeconds: 3
```

The key insight: each probe endpoint does *different things*.

---

## Three Endpoints, Three Jobs

Your health endpoints should not all return `{ status: "ok" }`. Here's what they should actually check:

```javascript
// /healthz/startup — just "am I done booting?"
app.get('/healthz/startup', (req, res) => {
  if (appIsFullyInitialized) {
    res.status(200).json({ status: 'started' });
  } else {
    res.status(503).json({ status: 'starting' });
  }
});

// /healthz/live — "am I stuck or deadlocked?"
// Keep this CHEAP. No DB calls. Just "is the process responsive?"
app.get('/healthz/live', (req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

// /healthz/ready — "can I handle real traffic right now?"
// Check dependencies here
app.get('/healthz/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');  // quick connectivity check
    await redis.ping();
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', reason: err.message });
  }
});
```

Notice that `/healthz/live` doesn't touch the database. This is intentional and critical. If your database is down, you don't want Kubernetes restarting all your pods — that makes things *worse*. You want the pods to stay up but stop receiving traffic, which is exactly what a failing readiness probe does.

---

## Real-World Lessons Learned the Hard Way

**Lesson 1: The liveness probe that caused a cascade.**
A team had a liveness probe that called an external payment API. The payment API had a brief outage. Kubernetes interpreted this as all pods being dead, restarted them all simultaneously, and the app went fully down instead of partially degraded. Liveness probes should never check external dependencies.

**Lesson 2: The readiness probe that was too eager.**
`successThreshold: 1` on a readiness probe means one successful check gets the pod added back to rotation. But if your app is flapping (intermittently failing), traffic gets routed to it during that one good check. Consider `successThreshold: 2` for high-traffic services.

**Lesson 3: The startup probe nobody set.**
A Java Spring Boot app took 45 seconds to start. No startup probe. Liveness probe fired at 30 seconds, killed the not-yet-started container, tried again, killed it again. Classic OOMKilled-adjacent death spiral. The fix was a startup probe with `failureThreshold: 15` and `periodSeconds: 5` — giving it 75 seconds to get its act together.

**Lesson 4: Timeout values matter.**
Default timeout is 1 second. If your health endpoint occasionally takes 1.1 seconds due to a GC pause or a slightly slow DB, your probe fails. Set `timeoutSeconds` to something sane — 3–5 seconds for most apps — so you're not reacting to normal jitter.

---

## The Mental Model to Carry Around

Think of the three probes as three different questions your cluster manager asks:

- **Startup**: "Are you dressed yet? Take your time, no rush." (one-time check)
- **Liveness**: "Are you conscious? Just a pulse check." (ongoing, cheap)
- **Readiness**: "Are you actually ready to help customers right now?" (ongoing, can be more thorough)

Once you internalize that readiness and liveness serve different failure modes, the configs start making intuitive sense.

---

## Your Next Step

Open your Kubernetes manifests right now. If you don't have all three probes defined, or if your liveness probe is calling your database, you have a time bomb waiting for the next infrastructure hiccup.

Add a `startupProbe` for anything that takes more than 10 seconds to boot. Make your `livenessProbe` call a dead-simple endpoint. Put your dependency checks in `readinessProbe`. 

It's 30 minutes of work that will prevent hours of 3 AM incidents. Your future on-call self will owe you a coffee.

---

*Got a health check horror story? Or a clever probe setup that saved your deployment? The comment section is open — let's commiserate.*
