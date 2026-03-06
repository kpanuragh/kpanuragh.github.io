---
title: "Kubernetes Health Checks: Stop Letting Dead Pods Eat Your Traffic 🩺🔪"
date: "2026-03-06"
excerpt: "Your Kubernetes pod is running but returning 500 errors to every user — and K8s has no idea. After running production clusters that randomly served disaster to 1 in 3 users, I learned that liveness, readiness, and startup probes are not optional extras. Here's everything you need to know."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Health Checks: Stop Letting Dead Pods Eat Your Traffic 🩺🔪

Let me paint you a picture of my worst Tuesday ever.

Our Kubernetes deployment had 3 replicas. One pod silently crashed its database connection pool and started returning `500 Internal Server Error` to every single request. Kubernetes? Totally chill. Pod status: `Running` ✅. Load balancer kept routing traffic to it.

One third of our users were hitting a broken pod for **47 minutes** before anyone noticed. In production. During peak hours.

The fix? **Three lines of YAML I hadn't bothered to add.** 😬

Let me save you from my Tuesday.

## The Three Probes You Need to Know 🔍

Kubernetes has three health check mechanisms, and they each solve a different problem:

| Probe | Question it answers | What happens on failure |
|-------|---------------------|------------------------|
| **Liveness** | "Is this pod alive?" | Pod gets killed and restarted |
| **Readiness** | "Is this pod ready to serve traffic?" | Pod removed from Service endpoints |
| **Startup** | "Has this pod finished starting up?" | Blocks liveness/readiness checks until it passes |

Most tutorials only mention liveness. That's like buying a car with only a speedometer — technically it's information, but you're missing a lot.

## Liveness Probes: Kill the Zombie Pods 🧟

A liveness probe answers: "Is my app stuck in a broken state it can't recover from?"

Without it, a pod with a deadlocked goroutine or a memory leak that hung the process keeps running forever — technically `Running`, practically dead.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: my-api
          image: my-api:latest
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10   # Wait 10s before first check
            periodSeconds: 15         # Check every 15s
            timeoutSeconds: 3         # Fail if no response in 3s
            failureThreshold: 3       # Restart after 3 consecutive failures
```

Your `/health/live` endpoint should be **dead simple** — just confirm the process is alive and not deadlocked:

```javascript
// Node.js Express example
app.get('/health/live', (req, res) => {
  // Just prove we can respond. That's it.
  res.status(200).json({ status: 'alive' });
});
```

**Real lesson learned the hard way:** Don't put database checks in your liveness probe. If your DB goes down and the liveness probe fails, Kubernetes restarts all your pods — which doesn't fix the database and now you're also dealing with a thundering herd of pods all restarting simultaneously. My team did this once. The on-call engineer still has trust issues. 😅

## Readiness Probes: Don't Route Traffic to Pods That Aren't Ready 🚦

This is the one that would have saved my Tuesday. A readiness probe answers: "Is this pod ready to handle real user traffic right now?"

When a readiness probe fails, Kubernetes removes the pod from the Service's endpoint list — users stop hitting it. When it passes again, traffic resumes. No restart, no drama.

```yaml
containers:
  - name: my-api
    image: my-api:latest
    livenessProbe:
      httpGet:
        path: /health/live
        port: 3000
      initialDelaySeconds: 10
      periodSeconds: 15
      failureThreshold: 3

    readinessProbe:
      httpGet:
        path: /health/ready
        port: 3000
      initialDelaySeconds: 5    # Check sooner than liveness
      periodSeconds: 10         # Check more frequently
      failureThreshold: 2       # Pull from rotation faster
      successThreshold: 1       # Back in rotation on first success
```

Your `/health/ready` endpoint should actually check dependencies:

```javascript
// Node.js Express example
app.get('/health/ready', async (req, res) => {
  try {
    // Check if we can actually serve requests
    await db.raw('SELECT 1');          // Database reachable?
    await redisClient.ping();          // Cache reachable?

    res.status(200).json({
      status: 'ready',
      db: 'ok',
      cache: 'ok'
    });
  } catch (err) {
    // Fail readiness — K8s stops routing here
    res.status(503).json({
      status: 'not ready',
      error: err.message
    });
  }
});
```

**The insight that changed how I think about this:** Readiness failures are temporary circuit breakers. Liveness failures mean "burn it down and restart." Use them accordingly.

## Startup Probes: For Apps That Take Forever to Boot ⏳

You ever run a Spring Boot app? A Laravel app loading 200 migrations? A Python service with heavy ML model initialization?

These apps can take 60–90 seconds to start. Without a startup probe, your liveness probe starts failing before the app even finishes booting — so Kubernetes kills the pod and tries again. Infinitely. It never actually starts.

```yaml
containers:
  - name: my-api
    image: my-api:latest
    startupProbe:
      httpGet:
        path: /health/live
        port: 3000
      failureThreshold: 30      # Allow up to 30 * 10s = 300s to start
      periodSeconds: 10
    livenessProbe:
      httpGet:
        path: /health/live
        port: 3000
      initialDelaySeconds: 0    # Startup probe handles the delay now
      periodSeconds: 15
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /health/ready
        port: 3000
      periodSeconds: 10
      failureThreshold: 2
```

**How it works:** The startup probe runs first. Liveness and readiness probes are paused until it succeeds. Once it passes, normal operation begins. The startup probe only runs during the startup window — it never runs again after the pod is considered "started."

`failureThreshold: 30` + `periodSeconds: 10` = 300 seconds (5 minutes) to start. That's enough for even the chonkiest enterprise Spring Boot monolith. 🐘

## The Production-Ready Full Config 🏭

Here's what a real deployment looks like with all three probes properly configured:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
  namespace: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: my-api
          image: my-api:2.4.1
          ports:
            - containerPort: 3000

          # --- STARTUP: Give slow apps time to boot ---
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            failureThreshold: 20    # 20 * 10s = 200s max startup time
            periodSeconds: 10

          # --- LIVENESS: Kill the zombie if truly broken ---
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            periodSeconds: 20
            timeoutSeconds: 3
            failureThreshold: 3

          # --- READINESS: Pull from rotation if can't serve ---
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 2
            successThreshold: 1

          # Resource limits (required for proper scheduling!)
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

This config means:
- Pods have up to 200 seconds to start
- Dead pods get restarted within ~60 seconds
- Pods with failing dependencies stop receiving traffic within ~20 seconds
- Rolling deployments don't route to new pods until they pass readiness

## Common Mistakes That Will Ruin Your Night 🌙

**Mistake 1: No `initialDelaySeconds` (or too short)**

If your app takes 8 seconds to start and your liveness probe fires after 5 seconds, you get a crash loop. Always give apps breathing room.

**Mistake 2: Making liveness check external dependencies**

```yaml
# BAD - If Postgres goes down, ALL pods restart. Loop of doom.
livenessProbe:
  httpGet:
    path: /health/live  # This checks DB connection!

# GOOD - Liveness just proves the process is responsive
livenessProbe:
  httpGet:
    path: /health/live  # Only checks: "can I respond to HTTP?"

# GOOD - Readiness checks dependencies
readinessProbe:
  httpGet:
    path: /health/ready  # Checks DB, cache, etc.
```

**Mistake 3: Using TCP probe when you need HTTP semantics**

```yaml
# This only checks the port is open — doesn't check your app responds sanely
livenessProbe:
  tcpSocket:
    port: 3000

# Better: use HTTP and check for a 2xx status
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
```

**Mistake 4: Ignoring probe failures in your logs**

When a probe fails, Kubernetes logs it. Set up alerts for repeated probe failures. By the time you have a crash loop, it's already a production incident.

```bash
# See probe failure events
kubectl describe pod <pod-name> | grep -A5 "Events"

# Watch pod health in real time
kubectl get pods -w
```

## Real-World Lessons Earned the Expensive Way 💸

After 3+ years running Kubernetes in production:

1. **Start with readiness probes first.** They prevent bad pods from taking traffic without the nuclear option of a restart. Liveness comes second.

2. **Probe timeouts matter.** If your DB query under load takes 8 seconds and your probe timeout is 3 seconds, your healthy pod will get pulled from rotation during traffic spikes. Tune with real traffic data.

3. **Test probe failures deliberately.** Kill your DB connection, block a port, exhaust a thread pool — verify Kubernetes does what you expect before production surprises you.

4. **Separate health check endpoints from business logic middleware.** If your auth middleware panics, your `/health` endpoints should still respond. Mount them before your auth layer.

5. **Monitor `kubectl get events`** in production. Probe failures show up there before they cascade into incidents.

## Your Action Plan 🚀

If you have a Kubernetes deployment right now with no health checks:

1. Add a `/health/live` endpoint that just returns `200 OK`
2. Add a `/health/ready` endpoint that checks critical dependencies
3. Add `readinessProbe` first — this protects users immediately
4. Add `livenessProbe` — this prevents zombie pods
5. If your app takes >15s to start, add `startupProbe`
6. Deploy, watch the events, tune `failureThreshold` based on reality

The whole thing takes about 30 minutes. The alternative is another Tuesday like mine.

---

**Running Kubernetes in production?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk infrastructure war stories.

**Want to see real production manifests?** Check out [GitHub](https://github.com/kpanuragh) for battle-tested Kubernetes configs.

*Your pods are not healthy just because they're Running. Go add those probes.* 🩺
