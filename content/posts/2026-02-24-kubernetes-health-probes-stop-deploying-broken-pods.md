---
title: "Kubernetes Health Probes: Stop Letting Broken Pods Pretend They're Healthy 🩺🔥"
date: "2026-02-24"
excerpt: "Your Kubernetes pod is 'Running' but returning 503s to every user? After debugging countless production incidents, I learned that liveness, readiness, and startup probes are the difference between real health and a zombie pod that just looks alive."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Health Probes: Stop Letting Broken Pods Pretend They're Healthy 🩺🔥

**True story:** I once spent three hours debugging a production incident where our API was returning 500s to every user. Kubernetes dashboard showed all pods: `Running`. Zero crashes. Zero restarts. Everything looked *perfect*.

The culprit? Our Node.js app had a database connection pool that silently exhausted itself and froze. The pod was alive. The app was not. Kubernetes had no idea.

**Me at 2am:** "Why is everything broken?!"

**Kubernetes:** "All pods are Running! 🟢"

**Me:** 🤬

That incident introduced me to health probes — the feature that would've saved me those three hours (and my sleep schedule).

## The Three Probes You Need to Know 🔍

Kubernetes gives you three types of health checks. They're simple, powerful, and criminally underused:

| Probe | Question It Answers | Action on Failure |
|-------|--------------------|--------------------|
| **Liveness** | "Is this pod alive?" | Restart the container |
| **Readiness** | "Is this pod ready for traffic?" | Remove from load balancer |
| **Startup** | "Has this pod finished starting up?" | Give it more time before checking |

Think of it like a restaurant:
- **Startup probe** = "Are you even open yet?"
- **Readiness probe** = "Are you ready to seat customers?"
- **Liveness probe** = "Are you still in business?"

## The Problem: Kubernetes Thinks "Running" Means "Healthy"

Without probes, Kubernetes only knows your pod is healthy if the main process is still alive. That's it.

**What Kubernetes CAN'T detect without probes:**
```
❌ Your app started but is in an infinite initialization loop
❌ Your database pool exhausted and all queries are timing out
❌ Your app started but hasn't finished loading config files yet
❌ Your Node.js event loop is completely blocked
❌ Your app is "running" but returning 503 to every request
❌ Your app deadlocked 30 minutes after startup
```

The pod keeps running. Traffic keeps flowing in. Users keep screaming. You keep wondering why everything is on fire. 🔥

## Liveness Probe: Kill It If It's Broken

A liveness probe answers: **"Is my app fundamentally broken and needs a restart?"**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  template:
    spec:
      containers:
      - name: api
        image: my-api:latest
        ports:
        - containerPort: 3000

        livenessProbe:
          httpGet:
            path: /health/live      # A SIMPLE endpoint, not your full health check
            port: 3000
          initialDelaySeconds: 10   # Wait 10s after container starts
          periodSeconds: 15         # Check every 15 seconds
          failureThreshold: 3       # Restart after 3 consecutive failures
          timeoutSeconds: 5         # Fail if no response in 5s
```

**The `/health/live` endpoint should be dead simple:**

```javascript
// Don't check database, cache, or external services here!
// Just verify the process itself is alive and responsive
app.get('/health/live', (req, res) => {
  res.json({ status: 'alive', timestamp: Date.now() });
});
```

**Critical rule:** Your liveness endpoint must be **stupid simple**. If it checks the database and the database is down, Kubernetes will restart your pod in a loop forever — even though a restart won't fix the database! 🔄

I learned this the hard way when our liveness probe checked Redis, Redis had a blip, and Kubernetes helpfully restarted all 10 pods simultaneously. Instant outage. My pager went ballistic.

## Readiness Probe: "Don't Send Traffic Yet!"

A readiness probe answers: **"Is my app ready to handle real requests?"**

This is the probe that saved my 2am incident. If readiness fails, Kubernetes removes the pod from the load balancer. Users stop getting errors. The pod stays running and can recover.

```yaml
readinessProbe:
  httpGet:
    path: /health/ready     # Thorough check - DB, cache, dependencies
    port: 3000
  initialDelaySeconds: 5    # Start checking after 5s
  periodSeconds: 10         # Check every 10 seconds
  failureThreshold: 3       # Remove from rotation after 3 failures
  successThreshold: 2       # Needs 2 successes to get back in rotation
  timeoutSeconds: 3
```

**Your `/health/ready` endpoint can (and should) be thorough:**

```javascript
app.get('/health/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    timestamp: Date.now()
  };

  try {
    // Check database connection
    await db.raw('SELECT 1');
    checks.database = true;
  } catch (err) {
    // Database is down - we're NOT ready
  }

  try {
    // Check Redis
    await redis.ping();
    checks.redis = true;
  } catch (err) {
    // Cache is down - we're NOT ready
  }

  const isReady = checks.database && checks.redis;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    checks
  });
});
```

**The key insight:** Readiness failure = "take me out of rotation, I'll recover." Liveness failure = "I'm broken, restart me." They answer completely different questions!

## Startup Probe: For Slow-Starting Apps

Got a Java Spring app that takes 90 seconds to start? A Laravel app loading 50MB of config? Without a startup probe, your liveness probe will kill the container before it even finishes booting!

```yaml
startupProbe:
  httpGet:
    path: /health/live
    port: 3000
  failureThreshold: 30      # Allow up to 30 failures
  periodSeconds: 10         # Check every 10 seconds
  # = Up to 300 seconds (5 minutes) to start!

# Liveness only kicks in AFTER startup probe succeeds
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  periodSeconds: 15
  failureThreshold: 3
```

**Think of startup probe as:** "Give this container a chance to get its act together before I start judging it."

Without it, this is what happens to slow-starting apps:

```
T+0s:   Container starts
T+10s:  Liveness probe: FAIL (app not up yet)
T+25s:  Liveness probe: FAIL
T+40s:  Liveness probe: FAIL (3 failures = RESTART!)
T+40s:  Container restarted...
T+50s:  Liveness probe: FAIL
         🔁 Infinite restart loop!
```

With startup probe:
```
T+0s:   Container starts
T+10s:  Startup probe: fail (ok, still starting)
T+60s:  Startup probe: fail (still ok!)
T+90s:  Startup probe: SUCCESS ✅
T+90s:  Liveness probe now takes over
T+105s: Liveness probe: success ✅
T+120s: Liveness probe: success ✅
         App is healthy and serving traffic!
```

## Real Production Configuration (Battle-Tested)

Here's the complete setup I use for Node.js APIs in production, refined after multiple incidents:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend-api
  template:
    metadata:
      labels:
        app: backend-api
    spec:
      containers:
      - name: api
        image: backend-api:latest
        ports:
        - containerPort: 3000

        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"

        # 1. Startup probe: generous time to boot
        startupProbe:
          httpGet:
            path: /health/live
            port: 3000
          failureThreshold: 12    # 12 * 10s = 2 minutes to start
          periodSeconds: 10

        # 2. Liveness probe: basic "are you alive" check
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 0  # Startup probe handles the delay
          periodSeconds: 20
          failureThreshold: 3
          timeoutSeconds: 5

        # 3. Readiness probe: full dependency check
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 0
          periodSeconds: 10
          failureThreshold: 3
          successThreshold: 1
          timeoutSeconds: 5
```

**Why this works in production:**
- Startup probe gives the app 2 minutes to boot (no infinite restart loops)
- Liveness is lightweight (won't accidentally trigger mass restarts)
- Readiness is thorough (catches real dependency failures)
- Resources are set so OOMKills don't mask probe failures

## The Mistakes I Made (So You Don't Have To) 🪤

**Mistake #1: Using the same endpoint for liveness and readiness**

```yaml
# WRONG: Both probes checking /health with DB check
livenessProbe:
  httpGet:
    path: /health    # ← Checks database!
readinessProbe:
  httpGet:
    path: /health    # ← Also checks database!
```

Database has a 5-second blip → Readiness fails (good!) → Liveness also fails → Pod restarts → Database blip hits all 3 pods → All pods restart simultaneously → **Complete outage**.

Separate your liveness (dumb) from readiness (smart)!

**Mistake #2: Setting `initialDelaySeconds` too short**

```yaml
livenessProbe:
  initialDelaySeconds: 5   # ← Node takes 15s to start
  # Pod restarts before it even finishes booting!
```

Use startup probes instead of guessing `initialDelaySeconds`.

**Mistake #3: Setting `failureThreshold: 1` on liveness**

```yaml
livenessProbe:
  failureThreshold: 1   # ← One slow response = restart!
```

One GC pause, one slow DNS lookup, one CPU spike — and Kubernetes restarts your perfectly healthy pod. Use at least 3.

## Does It Actually Work? Testing Probes Locally

```bash
# Test your readiness endpoint directly
curl -s http://localhost:3000/health/ready | jq .

# Watch Kubernetes probe events in real-time
kubectl describe pod <pod-name> | grep -A 20 "Events:"

# See liveness/readiness status
kubectl get pods -w

# Force a liveness failure (to test it works)
kubectl exec -it <pod-name> -- kill -STOP 1
# Watch Kubernetes detect it and restart the pod!

# Check probe configuration on a running pod
kubectl get pod <pod-name> -o yaml | grep -A 15 "livenessProbe"
```

## The Bottom Line 🎯

Health probes are not optional. They're the difference between:
- **Kubernetes:** "I have no idea your app is broken"
- **Kubernetes:** "Pod failing readiness checks, removed from load balancer. Users unaffected."

Three minutes to add, hours of incidents saved.

Your users don't care that the process is running. They care that the app actually works. Now Kubernetes can tell the difference too.

**The quick setup:**
1. `/health/live` → returns 200 if the process can respond (dead simple)
2. `/health/ready` → returns 200 only if all dependencies are healthy
3. Configure all three probe types in your Deployment YAML
4. Test them before going to production

After countless 2am incidents, I can tell you: the 15 minutes it takes to set up probes properly pays back the first time a dependency silently fails in production and your users never notice. 🚀

---

**Had a probe-related production incident?** I'd love to hear your war story — find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp)!

**Want to see real Kubernetes configs?** Check my [GitHub](https://github.com/kpanuragh) for production-tested manifests.

*Now go add those probes before your next deployment!* 🩺✅
