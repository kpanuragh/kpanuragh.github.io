---
title: "🩺 Kubernetes Health Probes: Because Your App Lies About Being Healthy"
date: 2026-05-16
excerpt: "Your pod is running. Your app is 'fine'. Users are screaming. Sound familiar? Kubernetes liveness and readiness probes are the lie detectors your cluster desperately needs — here's how to use them before your on-call rotation becomes a horror movie."
tags: ["kubernetes", "devops", "docker", "cloud-native", "reliability"]
featured: true
---

Picture this: it's 2 AM, your phone is buzzing, and Kubernetes is proudly reporting that all your pods are `Running`. Meanwhile, your app is serving 500 errors like it's handing out Halloween candy. The pods are *technically* alive — like a zombie is technically alive — but they're definitely not doing what you need them to do.

Enter **Kubernetes health probes**: the lie detectors of the container world.

## The Problem with "Running" Meaning Nothing

Kubernetes knows when a container *starts*. It does not know — by default — whether your app inside that container has actually finished booting, connected to its database, loaded its config, or is stuck in an infinite loop trying to parse a malformed YAML file (we've all been there).

Without probes, Kubernetes will happily route traffic to a pod that's in the middle of startup, and it will leave a completely wedged pod running indefinitely because "the process is still there, looks fine to me!"

There are three probes to know:

- **Liveness probe** — Is the app alive? If not, restart it.
- **Readiness probe** — Is the app ready to receive traffic? If not, pull it from the load balancer.
- **Startup probe** — Is the app still booting? Give it time before the other probes kick in.

## The Classic Mistake: No Probes At All

Here's a minimal deployment with zero health checks:

```yaml
# ❌ Living dangerously
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
            - containerPort: 8080
```

This will work great in development. It will betray you in production on a Friday afternoon. Kubernetes will send traffic to pods that aren't ready, keep wedged pods alive forever, and your SLA will weep.

## Doing It Right: All Three Probes

Here's the same deployment, but now it has a soul:

```yaml
# ✅ Responsible adult configuration
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
            - containerPort: 8080

          startupProbe:
            httpGet:
              path: /healthz
              port: 8080
            failureThreshold: 30   # Allow up to 5 minutes to start
            periodSeconds: 10

          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 0  # Startup probe handles the delay
            periodSeconds: 15
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            periodSeconds: 5
            failureThreshold: 3
            successThreshold: 1
```

Notice there are **two separate endpoints**:

- `/healthz` — Liveness. Simple: "Is the process sane?" Return `200` if yes, `500` if the app is in a bad state it can't recover from.
- `/ready` — Readiness. Richer: "Can I handle a request right now?" This should check DB connections, cache availability, any upstream dependencies. Return `200` only when truly ready.

This distinction matters enormously. A pod might be alive (don't restart it) but temporarily not ready (don't send it traffic while it's reconnecting to the database after a blip). Conflating the two is one of the most common Kubernetes mistakes teams make.

## The Startup Probe: For Apps That Take Their Sweet Time

Spring Boot apps, JVM services, apps loading huge ML models — these need time. Without a startup probe, your liveness probe fires during boot, decides the app is dead, and starts a restart loop. Your app never actually finishes starting. Kubernetes helpfully restarts it over and over. You helpfully lose your mind.

The `startupProbe` suppresses liveness and readiness checks until it succeeds. Set `failureThreshold * periodSeconds` equal to your maximum acceptable startup time. 30 × 10s = 5 minutes of patience before giving up.

## Real Lessons from the Trenches

**Lesson 1: Don't check external dependencies in your liveness probe.** If your liveness probe calls the database and the database has a hiccup, Kubernetes will restart all your pods simultaneously. You've just turned a minor DB blip into a full application outage. Liveness should only check the app's own internal sanity.

**Lesson 2: Your readiness endpoint *should* check dependencies.** It's fine — good, even — for readiness to fail when a downstream service is down. This correctly signals to Kubernetes: "don't send traffic here, I can't handle it right now." The pod stays running (no unnecessary restart), it just gets pulled from rotation until things recover.

**Lesson 3: Tune your thresholds for rolling deploys.** If readiness fails too aggressively during deployments, you'll take down capacity while new pods are starting up. Bump `failureThreshold` on readiness to 3–5 to give pods a grace period.

**Lesson 4: Test your probes locally.** Before shipping, `curl` your health endpoints manually. You'd be shocked how often `/ready` returns 200 when the DB connection pool is exhausted — because the developer only checked "can I connect" not "do I have connections available."

## The Simple Health Endpoint You Need

Here's a minimal Node.js example that gets the separation right:

```javascript
// Liveness: is the process working?
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Readiness: can we handle traffic?
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await cache.ping();
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});
```

Simple, purposeful, and it will save your 2 AM call.

## The Call to Action

Go check your deployments right now. Seriously. Open your cluster, pick a random production deployment, and see if it has probes configured. If it doesn't — or if liveness and readiness are pointing at the same endpoint checking the same things — you have a ticking clock.

Adding health probes is one of those "five minutes of work, months of pain avoided" investments. It makes rolling updates safer, crash loops get detected instead of lingering, and your traffic never hits pods that aren't ready for it.

Your future self, asleep at 2 AM because the cluster is healing itself gracefully, will thank you.

---

*Have a war story about missing health probes? Found a clever way to implement them? Drop it in the comments — the community learns best from production disasters narrowly avoided.*
