---
title: "🎭 Kubernetes Probes That Lie: Why Your Pod Looks Healthy Right Before It Dies"
date: "2026-06-09"
excerpt: "Your liveness probe returns 200. Your pod restarts anyway. Sound familiar? Here's why most health checks are security theater — and how to write probes that actually mean something."
tags:
  - kubernetes
  - devops
  - reliability
  - platform-engineering
  - containers
featured: true
---

Let me tell you about the most embarrassing on-call incident of my career. Three in the morning, production is degraded, and every single Kubernetes pod is showing green in the dashboard. All probes passing. All health checks happy. Users getting 503s.

The pods were *lying*.

## What Kubernetes Probes Actually Do

Before we dig into why they lie, a quick refresher. Kubernetes has three probe types:

- **Liveness**: Is this container still alive? If not, kill it and restart.
- **Readiness**: Is this container ready to receive traffic? If not, pull it from the load balancer.
- **Startup**: Has the container finished initializing? (Prevents liveness from killing a slow-starting app.)

Simple concept. Beautiful in theory. A complete disaster in practice if you're not careful about what you're actually checking.

## The Lies Probes Tell

### Lie #1: The Shallow HTTP Check

Here's the most common offender. You add a `/health` endpoint that returns `{"status": "ok"}` with a 200, and you point your liveness probe at it. Done, right?

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

Your `/health` handler looks like this:

```go
func healthHandler(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(http.StatusOK)
    json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
```

This endpoint will return 200 even when:
- Your database connection pool is exhausted
- Your Redis connection died 20 minutes ago
- Your message queue consumer stopped processing
- Your app is stuck in a tight loop burning CPU but not serving requests

The HTTP listener is alive. The *application* is broken. Kubernetes can't tell the difference because you didn't tell it to check anything meaningful.

### Lie #2: Liveness Doing Readiness's Job

This one kills me. Teams configure their liveness probe to check whether the app can handle traffic. When the app gets overloaded and starts taking 5 seconds to respond, the liveness probe times out, Kubernetes kills the pod, and suddenly you have a restart loop *during peak traffic*. The cure is worse than the disease.

Liveness should only answer one question: **Is this process fundamentally broken and needs to be replaced?** Think "JVM in OOM loop", "goroutine deadlock", "process hung forever". Not "I'm busy right now".

Readiness answers a different question: **Should this pod receive traffic at this moment?** Use it to gate traffic during startup, during dependency outages, during graceful drains.

### Lie #3: The Missing Startup Probe

You have a Spring Boot app. It takes 45 seconds to start up. So you set `initialDelaySeconds: 60` on your liveness probe to give it breathing room.

Now you deploy. The new pod starts, takes 45 seconds, everything's fine. But six months later someone bumps the JVM heap, startup now takes 75 seconds, and Kubernetes starts killing your pod before it finishes booting. You spend an hour debugging why your deployment won't roll out.

The fix is a startup probe:

```yaml
startupProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  failureThreshold: 30
  periodSeconds: 5
```

`failureThreshold: 30` × `periodSeconds: 5` = 150 seconds of startup budget. Kubernetes tries every 5 seconds, allows 30 failures before giving up. Once the startup probe succeeds, the liveness probe takes over — and it uses its own (tight) `failureThreshold`, so it'll still kill a hung process quickly during normal operation.

## Probes That Actually Work

At Cubet, we learned this the hard way on a Node.js microservice that was silently dropping database writes. The `/health` endpoint returned 200 fine. The Postgres pool had been broken for 40 minutes. We had to build this lesson into our standard probe template.

Here's the pattern we now use for any service that has a database dependency:

```yaml
livenessProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
  timeoutSeconds: 3

readinessProbe:
  httpGet:
    path: /healthz/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 3
  timeoutSeconds: 3

startupProbe:
  httpGet:
    path: /healthz/live
    port: 8080
  failureThreshold: 20
  periodSeconds: 5
```

And the critical part — the two endpoints do different things:

**`/healthz/live`**: Checks only whether the process itself is fundamentally functional. For a web server, this might mean "can I allocate memory", "are my goroutines not deadlocked", or just a plain 200 from a handler that does no I/O at all. It should respond in under 100ms, always.

**`/healthz/ready`**: Checks everything the app needs to serve real traffic. Database ping (with a 500ms timeout, not a full query). Cache connectivity. Any downstream services that are hard dependencies. If any of these fail, return 503. Kubernetes pulls the pod from the load balancer, your other pods absorb the traffic, and the broken pod gets a chance to recover without you getting paged.

The separation is the whole game. Liveness killing a pod is a big deal — it causes a restart, a brief disruption, potential lost in-flight requests. You only want that when the process is *genuinely* unrecoverable. Readiness is cheap — the pod keeps running, just stops getting traffic. Use it liberally.

## The Timeout Trap

One more gotcha: `timeoutSeconds` defaults to 1 second. Your database ping, on a busy cluster, might occasionally take 1.2 seconds. Your probe starts flapping. Kubernetes starts bouncing pods. Three of your five replicas are in restart loops while the other two are drowning.

Set `timeoutSeconds: 3` on your readiness probe. It won't cause thrashing; a single slow ping won't yank the pod. But if the database is actually down, three consecutive failures (at `failureThreshold: 3`) will correctly mark the pod unready.

## The Cheat Sheet

- **Liveness = Is the process dead?** Should never check external dependencies.
- **Readiness = Can the process serve traffic right now?** Should check dependencies, but with sane timeouts.
- **Startup = Has the process finished booting?** Use it for any app with non-trivial startup time (>10s).
- Keep `/healthz/live` response time under 100ms, no I/O.
- Give `/healthz/ready` a `timeoutSeconds` of at least 2-3, and test it under load.
- Tune `failureThreshold` conservatively for liveness — you don't want a single slow second to restart your pod.

The next time your dashboard shows all-green while users are screaming, check what your probes are actually probing. Dollars to donuts, they're measuring "the HTTP listener exists", not "the application works".

Healthy probes are a contract. Write them like you mean it.

---

*What's the most creative way a probe has lied to you in production? Drop it in the comments — I guarantee nothing will surprise me anymore.*
