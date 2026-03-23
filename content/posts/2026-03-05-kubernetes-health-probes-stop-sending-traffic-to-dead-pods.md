---
title: "Kubernetes Health Probes: Stop Sending Traffic to Dead Pods 🩺💀"
date: "2026-03-05"
excerpt: "Your Kubernetes pods are crashing silently and users are getting 502 errors. After running dozens of production clusters, I learned that misconfigured health probes are the silent killer - here's how to fix them!"
tags: ["\"devops\"", "\"kubernetes\"", "\"docker\"", "\"deployment\""]
featured: "true"
---

# Kubernetes Health Probes: Stop Sending Traffic to Dead Pods 🩺💀

**True story:** I once deployed a Node.js API to Kubernetes. Everything looked great in the dashboard - green pods everywhere, CPU normal, memory normal. Beautiful. Then support started getting tickets: "App returns 502 every few minutes, then comes back."

Investigation time. Turns out, my app had a memory leak. Every 10 minutes it would quietly run out of memory, stop responding, and STAY RUNNING as a zombie process. It was still "alive" by Kubernetes's standards - just not answering requests.

The fix? Four lines of YAML I should have written on day one. This is the story of Kubernetes health probes, why they matter, and how to stop embarrassing yourself in production.

## The Three Probes (Your Pod's Medical Team) 🏥

Kubernetes has three types of health probes, and they each do something different:

- **Liveness Probe** - "Is this pod alive or should I restart it?"
- **Readiness Probe** - "Is this pod ready to receive traffic?"
- **Startup Probe** - "Did this pod actually finish starting up?"

The most common mistake? **Using only liveness probes** (or none at all). The second most common? Misconfiguring them so Kubernetes restarts healthy pods every 5 minutes. Let's fix both.

## Liveness Probes: The Heartbeat Check 💓

The liveness probe answers one question: *should Kubernetes kill and restart this pod?*

Here's the zombie scenario I described earlier:

```yaml
# The app that silently dies but keeps "running"
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
          # NO health probe = Kubernetes never knows it's broken!
          # Result: Dead pods serving traffic forever 💀
```

Fix it:

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
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            # Wait 10s before first check (let app boot!)
            initialDelaySeconds: 10
            # Check every 15 seconds
            periodSeconds: 15
            # Must respond within 5 seconds
            timeoutSeconds: 5
            # After 3 failures, restart the pod
            failureThreshold: 3
```

**What the `/health` endpoint should return:**

```javascript
// Node.js Express example
app.get('/health', (req, res) => {
  // Check things that matter for "alive"
  // Keep it SIMPLE - just verify the process works
  res.status(200).json({ status: 'ok' });
});

// What NOT to check in liveness:
// ❌ Database connectivity (DB outage shouldn't restart your pod!)
// ❌ External API availability
// ❌ Heavy computations
// ✅ Process is responding
// ✅ No deadlock or infinite loop
```

**The lesson I learned the hard way:** Liveness probes should be *dumb*. If you check database connectivity here and your DB has a blip, Kubernetes will restart ALL your pods simultaneously. That's a self-inflicted outage. 🤦

## Readiness Probes: The "I'm Ready for Business" Signal 📢

This is the probe most developers skip, and it causes the most user-facing issues.

The readiness probe answers: *should Kubernetes send traffic to this pod right now?*

A pod can be **alive** but **not ready** - during startup, during a database migration, during cache warming. Without readiness probes, Kubernetes sends traffic to your pod the second it starts, even if your app is still connecting to databases or loading 2GB of ML models.

```yaml
containers:
  - name: api
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
      # Start checking immediately (we want to know ASAP)
      initialDelaySeconds: 5
      # Check frequently during startup
      periodSeconds: 5
      timeoutSeconds: 3
      # Remove from rotation after 2 consecutive failures
      failureThreshold: 2
      # Add back after 1 success
      successThreshold: 1
```

**Two separate health endpoints:**

```javascript
// /health/live - Is the process running? (simple!)
app.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

// /health/ready - Can I handle requests?
app.get('/health/ready', async (req, res) => {
  try {
    // Check real dependencies
    await db.raw('SELECT 1');          // Database connected?
    await redis.ping();                // Cache connected?

    if (!appInitialized) {
      return res.status(503).json({ status: 'initializing' });
    }

    res.json({ status: 'ready' });
  } catch (error) {
    // Return 503 to tell Kubernetes: "don't send me traffic!"
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});
```

**Real-world impact:** With readiness probes, rolling deployments become seamless. Kubernetes waits for each new pod to become ready before shifting traffic away from old pods. No more 502 errors during deploys.

## Startup Probes: The Slow-Starter's Best Friend 🐌

Some applications are just slow to start. Java Spring Boot apps, apps that run database migrations on startup, services that preload huge datasets. If your liveness probe starts checking before the app finishes booting, Kubernetes kills it and restarts it - over and over, never letting it actually start.

Enter the startup probe:

```yaml
containers:
  - name: java-api
    image: my-spring-boot-app:latest
    startupProbe:
      httpGet:
        path: /actuator/health
        port: 8080
      # Allow up to 5 minutes to start (30 * 10s = 300s)
      failureThreshold: 30
      periodSeconds: 10
    livenessProbe:
      httpGet:
        path: /actuator/health
        port: 8080
      # These only kick in AFTER startup probe succeeds
      periodSeconds: 15
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /actuator/health/readiness
        port: 8080
      periodSeconds: 5
      failureThreshold: 2
```

**How it works:** While the startup probe is running, liveness and readiness probes are disabled. Only after the startup probe passes does Kubernetes hand over to the regular probes. Your slow-starting app gets the time it needs, and fast apps still fail quickly if something's wrong.

## The Probe Beyond HTTP: TCP and Exec 🔌

Not everything speaks HTTP. Databases, message brokers, gRPC services - use TCP or exec probes:

```yaml
# TCP probe - just checks if the port is open
livenessProbe:
  tcpSocket:
    port: 5432   # PostgreSQL port
  initialDelaySeconds: 15
  periodSeconds: 20

# Exec probe - runs a command inside the container
livenessProbe:
  exec:
    command:
      - /bin/sh
      - -c
      - "redis-cli ping | grep PONG"
  initialDelaySeconds: 5
  periodSeconds: 10
```

**Pro tip for databases in Kubernetes:** Use exec probes with the native client. For MySQL: `mysqladmin ping`. For Redis: `redis-cli ping`. These are way more reliable than hoping a port is open.

## Real-World Lessons from Production Failures 🔥

**Lesson 1: Don't set `initialDelaySeconds` to 0**

I did this on a Laravel app that runs migrations on boot. Kubernetes started checking health at second 0, saw a failing response (migrations running), and killed the pod. The pod restarted and ran migrations again. Infinite migration loop. The database was not happy.

Fix: Give your app time to breathe. If unsure, use a startup probe instead of guessing a delay.

**Lesson 2: Don't make timeouts too tight**

`timeoutSeconds: 1` sounds great for performance. In reality, under high load, your health endpoint might take 1.5 seconds to respond. Kubernetes marks it as failed. After 3 "failures," it restarts a perfectly healthy pod mid-request. Users get dropped connections.

Fix: Set `timeoutSeconds` to at least 3-5 seconds for HTTP probes.

**Lesson 3: Readiness probes during rolling deployments**

Without readiness probes, Kubernetes kills old pods as soon as new ones START, not when they're READY. You've essentially done a brief outage on every deploy.

Fix: Always have readiness probes. They're the difference between zero-downtime and "whoops, sorry, we deployed."

## Quick Probe Checklist ✅

Before you deploy anything to Kubernetes, ask yourself:

- [ ] Do I have a **liveness** probe? (restarts broken pods)
- [ ] Do I have a **readiness** probe? (keeps traffic away during startup)
- [ ] Does my app start slowly? Add a **startup** probe
- [ ] Is my liveness probe checking external dependencies? **Remove them**
- [ ] Is `initialDelaySeconds` long enough for my app to boot?
- [ ] Are my `/health` endpoints fast and lightweight?
- [ ] Have I tested what happens when the probe fails?

## Your Action Plan 🚀

**Today:** Add a `/health` endpoint to every service you run in Kubernetes. Make it return `200 OK` and nothing else.

**This week:** Split it into `/health/live` and `/health/ready`. Add readiness probes to all your deployments. Watch how much smoother your rolling updates become.

**Next month:** Add startup probes to any service that takes more than 30 seconds to boot. Review your `failureThreshold` and `timeoutSeconds` settings in production under real load.

Health probes are not optional in production Kubernetes. They're the difference between "the app crashed at 3am and users suffered for 20 minutes until someone noticed" and "Kubernetes detected the crash, restarted the pod, and 99% of users never knew."

Four lines of YAML. Set them now.

---

**Running Kubernetes in production?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I love talking about the operational lessons nobody puts in the docs.

**Want to see a full production deployment manifest?** Check out my [GitHub](https://github.com/kpanuragh) for real Kubernetes configs from real projects.

*Now go probe your pods before they probe your patience!* 🩺
