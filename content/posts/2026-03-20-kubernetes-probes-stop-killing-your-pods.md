---
title: "🔫 Kubernetes Probes: Stop Accidentally Killing Your Own Pods"
date: "2026-03-20"
excerpt: "Liveness and readiness probes are Kubernetes superpowers — until you misconfigure them and watch your app restart itself into oblivion. Here's how to get them right."
tags: ["\\\"kubernetes\\\"", "\\\"devops\\\"", "\\\"docker\\\"", "\\\"k8s\\\"", "\\\"reliability\\\""]
featured: "true"
---

# 🔫 Kubernetes Probes: Stop Accidentally Killing Your Own Pods

There's a special kind of pain reserved for the engineer who confidently deploys to production, watches all pods go green, grabs a coffee — and returns to find their app in a `CrashLoopBackOff` death spiral of its own making.

Welcome to the world of misconfigured Kubernetes probes. We've all been there. Some of us have the Slack incident channel receipts to prove it.

## What Are Liveness and Readiness Probes, Anyway?

Kubernetes has no idea if your app is actually *working*. It only knows if the container process is running. A process can be running and completely brain-dead — stuck in a deadlock, out of file descriptors, or waiting on a database connection that died 20 minutes ago.

That's where probes come in:

- **Liveness probe**: "Is this pod still alive? If not, kill it and restart." Think of it as a defibrillator.
- **Readiness probe**: "Is this pod ready to receive traffic? If not, pull it from the load balancer rotation." Think of it as a bouncer checking if the venue is ready to open.

They sound simple. They are *not* simple to tune correctly.

## The Classic Rookie Mistake

Here's a config I see constantly in the wild:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 1
```

See the problem? `failureThreshold: 1` means one failed health check = pod restart. Your health endpoint hiccuped for 200ms during a GC pause? **Restart.** Your database was slow to respond? **Restart.** A load spike caused a brief timeout? **Restart.**

Kubernetes is now enthusiastically restarting your app *because of load*, which generates *more load*, which causes *more restarts*. Congratulations, you've invented a chaos monkey that lives inside your deployment.

## A Sane Probe Configuration

Here's a battle-tested setup that won't torch your app under pressure:

```yaml
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
  successThreshold: 1

readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
  successThreshold: 2
```

Key differences from the rookie config:

- `initialDelaySeconds: 30` — give your app time to actually boot. Java apps especially. They need a moment (and a prayer).
- `failureThreshold: 3` — three strikes before action is taken. Transient blips won't cause a meltdown.
- `successThreshold: 2` on readiness — a pod must pass *twice* before getting traffic. No more half-warmed-up pods eating requests.

## The Two-Endpoint Rule

Here's a lesson learned from production: **your liveness and readiness endpoints should check different things.**

```javascript
// Liveness: Is the app fundamentally broken?
app.get('/healthz/live', (req, res) => {
  // Only check things that indicate the process is truly unrecoverable
  // DO NOT check database connectivity here
  res.json({ status: 'alive' });
});

// Readiness: Is the app ready to serve traffic?
app.get('/healthz/ready', async (req, res) => {
  try {
    await db.ping(); // Check DB connectivity
    await cache.ping(); // Check cache
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', reason: err.message });
  }
});
```

The liveness probe should be brain-dead simple — if it can't respond, the app is genuinely hung. The readiness probe can be thorough, checking dependencies, connection pools, and whatever else determines "ready to serve."

**The critical mistake**: putting database checks in your liveness probe. Your database goes down for maintenance? Kubernetes helpfully restarts all your pods. Your database is still down. Kubernetes restarts them again. Faster. You now have a thundering herd beating against an unavailable database the moment it comes back online. Fun!

## Startup Probes: The Unsung Hero

If your app has a long initialization phase (data preloading, schema migrations, warming up ML models), you need a third probe type that most tutorials skip:

```yaml
startupProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

This gives your app up to 5 minutes (30 × 10s) to start before liveness kicks in. Without this, you'd need to set `initialDelaySeconds` to something absurdly large, which means a genuinely crashed pod takes forever to get restarted.

Startup probe passes once, then Kubernetes hands the baton to liveness and readiness. Clean separation of concerns.

## Real-World Lessons From the Trenches

**Lesson 1: Test your probes in staging under load.** A health endpoint that responds in 2ms at idle might time out when the CPU is pegged at 90%. Set your `timeoutSeconds` with headroom.

**Lesson 2: Log when your probes fail.** If `/healthz/ready` returns 503, emit a structured log line with *why*. "Not ready" is useless at 3am during an incident. "Not ready: DB connection pool exhausted (0/10 available)" is actionable.

**Lesson 3: Don't hide probe endpoints behind authentication.** Nothing like a `401 Unauthorized` killing all your pods because the probe can't pass an auth header.

**Lesson 4: Monitor probe failures as a metric.** If pods are being restarted by liveness probes more than once a week, something is wrong upstream. The restarts might be masking an underlying bug that deserves investigation, not a band-aid.

## The Bottom Line

Kubernetes probes are your app's immune system. A misconfigured immune system doesn't protect you — it attacks you. Take 30 minutes to think carefully about:

- What genuinely indicates an unrecoverable state (liveness)
- What indicates readiness to serve traffic (readiness)
- How long your app actually takes to start (startup)

Get these right and Kubernetes becomes the reliable platform it promises to be. Get them wrong and you'll be explaining to your on-call rotation why the app is restarting itself every time traffic spikes.

---

**Check your probe configs today.** Open your deployment YAMLs right now. If you see `failureThreshold: 1` or no `timeoutSeconds`, that's a production incident waiting to happen. Fix it before it finds you first.

Have a probe war story? I'd love to hear it — the more catastrophic, the better.
