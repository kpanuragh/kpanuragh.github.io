---
title: "Kubernetes Health Probes: Stop Sending Traffic to Dead Pods 💀🔍"
date: "2026-04-11"
excerpt: "Your app crashes silently, Kubernetes keeps routing traffic to it anyway, and users see 502 errors for 5 minutes before anyone notices. Sound familiar? Liveness, Readiness, and Startup probes exist to prevent exactly this disaster - here's how to use them right."
tags: ["\"devops\"", "\"kubernetes\"", "\"docker\"", "\"deployment\""]
featured: true
---

# Kubernetes Health Probes: Stop Sending Traffic to Dead Pods 💀🔍

**True story from 3 AM on-call rotation:**

My Node.js API had a memory leak. The pod was running (Kubernetes thought everything was fine), but it was returning 500 errors on every request. The process hadn't crashed - it was just completely broken. Kubernetes? Blissfully routing traffic to my zombie pod for **8 minutes** until I woke up to 400 Slack alerts.

**Me:** "Why is Kubernetes sending traffic to a broken pod?!"

**Kubernetes:** "You never told me it was broken 🤷"

**Me:** 😡🤦‍♂️

That was the night I finally learned health probes properly. Let me save you the same pain.

## The Three Probes You Need to Know 🎯

Kubernetes has three health probe types, and they all do different things:

| Probe | Job | What Happens on Failure |
|-------|-----|------------------------|
| **Liveness** | "Is this pod alive?" | Pod gets killed & restarted |
| **Readiness** | "Is this pod ready for traffic?" | Pod removed from Service endpoints |
| **Startup** | "Has this pod finished starting?" | Delays liveness/readiness checks |

**The key insight:** These are completely independent. A pod can be alive but NOT ready. A pod can be ready but about to die. Each probe serves a different purpose!

## Liveness Probe: Kill the Zombie 🧟

The liveness probe answers one question: **"Is your app still functioning, or is it a zombie?"**

If it fails, Kubernetes kills the pod and starts a new one. This is your escape hatch from infinite hangs, deadlocks, and memory corruption.

**The classic mistake I see everywhere:**

```yaml
# deployment.yaml - THE WRONG WAY
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 3   # 3 seconds is NEVER enough
  periodSeconds: 5          # Checking every 5s is too aggressive
  failureThreshold: 1       # ONE failure = pod restart? RIP your app
```

**What happens with this config:**
1. Pod starts, app needs 15 seconds to warm up
2. Kubernetes checks at 3 seconds → 503 (still starting) → **RESTART**
3. Kubernetes checks at 3 seconds → 503 → **RESTART**
4. Repeat forever. Your app never starts. 🔄

**The right way:**

```yaml
# deployment.yaml - THE RIGHT WAY
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  template:
    spec:
      containers:
        - name: api
          image: my-api:1.0.0
          
          # Liveness: is the app stuck/crashed?
          livenessProbe:
            httpGet:
              path: /healthz/live    # Different endpoint from readiness!
              port: 3000
            initialDelaySeconds: 30   # Give it time to start
            periodSeconds: 10          # Check every 10s
            failureThreshold: 3        # 3 consecutive failures = restart
            timeoutSeconds: 5          # Wait up to 5s for response
            successThreshold: 1        # 1 success = healthy

          # Readiness: is the app ready to take traffic?
          readinessProbe:
            httpGet:
              path: /healthz/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
            timeoutSeconds: 3
            successThreshold: 2        # Need 2 successes to be "ready"
```

**What changed:**
- `initialDelaySeconds: 30` — give the app time to actually start
- `failureThreshold: 3` — 3 strikes before restart (transient errors happen!)
- `timeoutSeconds: 5` — your health endpoint should respond FAST
- Separate paths for liveness vs readiness (different logic!)

## Readiness Probe: The Traffic Gatekeeper 🚦

While liveness handles zombie detection, readiness handles a different question: **"Should this pod receive traffic right now?"**

Readiness failures don't restart the pod — they just quietly remove it from the load balancer. Perfect for:
- Pods still warming up their cache
- Pods temporarily overwhelmed
- Pods waiting for a database connection
- Rolling deployments (new pod isn't ready? Old pod keeps getting traffic!)

**The Node.js health endpoint I actually use in production:**

```javascript
// healthz.js - Two separate health endpoints

// Liveness: just "is the process responsive?"
app.get('/healthz/live', (req, res) => {
  // Keep this SIMPLE. If you can respond, you're alive.
  // Don't check DB here - a DB outage shouldn't restart every pod!
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

// Readiness: "are you actually ready to handle real traffic?"
app.get('/healthz/ready', async (req, res) => {
  const checks = {
    database: false,
    cache: false,
    externalApi: false,
  };

  try {
    // Check DB connection
    await db.query('SELECT 1');
    checks.database = true;

    // Check Redis
    await redis.ping();
    checks.cache = true;

    // Check if we're warmed up (e.g., cache populated)
    checks.externalApi = appState.isWarmedUp;

    const allHealthy = Object.values(checks).every(Boolean);

    if (allHealthy) {
      return res.status(200).json({ status: 'ready', checks });
    }

    // Not ready yet - remove from load balancer, but DON'T restart
    return res.status(503).json({ status: 'not ready', checks });

  } catch (err) {
    return res.status(503).json({ status: 'not ready', error: err.message });
  }
});
```

**The most important lesson here:** Your liveness probe should be dead simple. If your liveness probe checks the database and the database goes down, Kubernetes will restart ALL your pods in a loop. That's called a **thundering herd** and it's how a DB outage becomes a complete service meltdown. 💥

Keep liveness simple. Put the dependency checks in readiness.

## Startup Probe: For the Slow Starters 🐢

Some apps are slow to start (Spring Boot, I'm looking at you 👀). You could set `initialDelaySeconds: 120` on the liveness probe... but then a truly crashed pod won't be restarted for 2 minutes.

Enter the startup probe — it runs INSTEAD of liveness/readiness until it succeeds, then hands off:

```yaml
# For slow-starting apps (JVM, large Python services, etc.)
startupProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  # Allow up to 5 minutes to start (30 attempts × 10s each)
  failureThreshold: 30
  periodSeconds: 10

# These only activate AFTER startupProbe succeeds
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  periodSeconds: 5
  failureThreshold: 3
```

**How it works:**
1. Pod starts → startup probe kicks in (up to 5 min to succeed)
2. Startup probe succeeds → liveness + readiness probes activate
3. No more "restarting before it even started" madness!

**Before I discovered startup probes**, I'd set `initialDelaySeconds: 180` for slow Spring Boot apps. Now deployments that hit a slow start just wait patiently instead of thrashing. My ops team's blood pressure dropped noticeably. ❤️

## The Real-World Rolling Deployment Win 🚀

Here's where readiness probes shine brightest. Without them, rolling deployments are a gamble:

```yaml
# Without readiness probes:
# - Kubernetes starts new pod
# - Kubernetes sees pod running
# - Kubernetes routes traffic immediately
# - Pod is still warming up → 502 errors!
# - Users are unhappy 😤

# With readiness probes:
# - Kubernetes starts new pod
# - Kubernetes routes traffic to OLD pods while new pod warms up
# - New pod's readiness probe passes
# - Only NOW does Kubernetes shift traffic to new pod
# - Zero user-visible errors! ✅

strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1         # Spin up 1 new pod before killing old
    maxUnavailable: 0   # Never have zero ready pods
```

Combined with readiness probes, `maxUnavailable: 0` means there's ALWAYS a ready pod serving traffic. This is how you do true zero-downtime deployments.

**The deployment that changed my career:** After a painful 5-minute outage during a routine deploy (no probes, `maxUnavailable: 1`), I added readiness probes and `maxUnavailable: 0`. The next 200 deployments? Zero downtime. Not once. 🎯

## Quick Wins Checklist ✅

Before you close this tab:

```bash
# Check if your existing deployments have probes configured:
kubectl get deployments -n your-namespace -o json | \
  jq '.items[] | {name: .metadata.name, 
    liveness: .spec.template.spec.containers[0].livenessProbe,
    readiness: .spec.template.spec.containers[0].readinessProbe}'

# Watch probe failures in real-time:
kubectl describe pod <pod-name> | grep -A 10 "Events:"

# Check which pods are currently ready vs not ready:
kubectl get pods -n your-namespace -o wide
```

**If you see `null` for either probe — that deployment is living dangerously.** 🎲

## Lessons Learned the Hard Way 📚

After running Kubernetes in production for years:

1. **Never check external dependencies in liveness probes** — DB down → all pods restart → worse outage
2. **Set `failureThreshold` to at least 3** — one slow response shouldn't kill a pod
3. **Use startup probes for anything that takes > 30 seconds to start**
4. **Your `/healthz/live` endpoint should respond in under 100ms** — it's called every 10 seconds
5. **Test probe failures locally** with `kubectl exec` before deploying to prod

The configuration takes 20 minutes to add. The downtime it prevents is measured in hours.

## Your Action Plan 🎯

**This afternoon:**
1. List all deployments with missing probes (use the `kubectl` command above)
2. Add a `/healthz/live` endpoint to your apps (simple, no dependencies)
3. Add a `/healthz/ready` endpoint (check actual dependencies)
4. Deploy with proper probe config + `maxUnavailable: 0`

**This week:**
1. Add startup probes to any slow-starting services
2. Set up alerting on `kubectl get events` for `Liveness probe failed`
3. Test your probes actually work by killing the DB and watching readiness fail (without a pod restart!)

**This month:**
1. Document your probe strategy in a runbook
2. Add probe health checks to your CI/CD pipeline validation
3. Never get paged at 3 AM for zombie pod traffic again 🎉

---

**Still routing traffic to zombie pods?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've been there and have the on-call scars to prove it.

**More Kubernetes configs and battle-tested patterns on [GitHub](https://github.com/kpanuragh).**

*Now go add those probes before your next deploy!* 🚀

---

**P.S.** The 8-minute zombie pod incident? Turned out to be a memory leak in a third-party library. The probe I added took 10 minutes to configure. Worth it 1000x over. ⚡
