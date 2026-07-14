---
title: "🩺 Probes That Lie: Why Your \"Healthy\" Pod Is Anything But"
date: "2026-07-14"
excerpt: "Your liveness probe says 200 OK. Your users say the checkout page is hanging. Both are telling the truth — because most health check endpoints check nothing that actually matters. Here's how to write probes that catch real failure instead of rubber-stamping it."
tags:
  - kubernetes
  - devops
  - platform-engineering
  - reliability
featured: true
---

Every Kubernetes tutorial teaches you the same three lines:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
```

And every `/health` endpoint, in every codebase I have ever opened, does this:

```js
app.get('/health', (req, res) => res.status(200).send('OK'));
```

That's not a health check. That's a pulse check on a corpse that can still say "fine." The process is running, so it answers `200`. It doesn't matter that the database pool is exhausted, the disk is full, or every downstream call has been timing out for four minutes straight. The event loop is alive, therefore the endpoint is "healthy." Kubernetes believes it. Your load balancer believes it. Your users do not, because they're the ones staring at a spinner.

This is the single most common lie in Kubernetes operations, and it's almost never malicious — it's just nobody thought past "return 200" when they scaffolded the endpoint eight months ago, and it's never been touched since.

## The three probes, and what they're actually for

Kubernetes gives you three distinct probes, and mixing up their jobs is how you get outages, not how you prevent them.

- **Liveness** — "is this process wedged?" A failure here gets the container **killed and restarted**. Use it only for unrecoverable deadlocks.
- **Readiness** — "should traffic be routed here right now?" A failure here just **pulls the pod out of the Service endpoints** — no restart, no drama. This is where "is my database connection healthy" belongs.
- **Startup** — "has this slow-booting app finished initializing?" Gives you a longer grace period before liveness/readiness even start counting, so you don't kill a JVM that's still warming up caches.

The lie usually happens because someone points all three at the same `/health` handler that just checks "process is up." Liveness then becomes a no-op (it never fails, so it never protects you), and readiness becomes a no-op too (it never fails, so bad pods keep receiving traffic).

## The failure mode that actually pages people

At Cubet, we had a payments-adjacent service where liveness and readiness both hit the same trivial `/health`. During a downstream provider outage, our HTTP client pool filled up with connections stuck waiting on a timeout. The app was completely unable to serve real requests — every checkout call hung for 30 seconds and failed. But the event loop was free enough to answer `/health` instantly, because that handler didn't touch the connection pool at all.

Readiness said "yes, send traffic here." Kubernetes obeyed. The Service kept routing a third of checkout traffic into a pod that was functionally dead, right alongside the two pods that were still working, which meant users had a coin-flip chance of a broken checkout instead of a clean failover to healthy replicas. Nobody got paged by Kubernetes — because as far as Kubernetes was concerned, nothing was wrong.

## The opposite failure: probes that are too aggressive

The fix for a lying probe is not "make it check everything and fail hard." Overcorrect and you get the other classic outage: a readiness probe that pings the database on every single check, and during a brief connection pool blip, *every* pod fails readiness simultaneously. The Service has zero endpoints. Traffic that would have succeeded on a slightly slow pod instead gets nothing to route to at all. You've turned "database is a little slow" into "entire service is down."

The pattern that avoids both extremes:

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  periodSeconds: 5
  failureThreshold: 3        # 15s of real trouble before you're pulled
  timeoutSeconds: 2

livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 10
  failureThreshold: 5        # 50s — liveness should be slow to trigger
  timeoutSeconds: 2
```

And the handlers behind them need to check different things, on purpose:

```js
// /ready — reflects "can I currently serve real traffic"
app.get('/ready', async (req, res) => {
  const dbOk = pool.totalCount > 0 && pool.idleCount < pool.totalCount;
  const cacheOk = redisClient.isReady;
  if (dbOk && cacheOk) return res.status(200).send('ready');
  return res.status(503).send('not ready'); // pull from Service, don't restart
});

// /healthz — reflects "is the process itself wedged"
app.get('/healthz', (req, res) => {
  // no dependency calls here — only "is this event loop responsive at all"
  res.status(200).send('alive');
});
```

`/ready` is allowed to fail whenever a dependency is degraded — that's the whole point, it just routes around the pod. `/healthz` should almost never fail from a dependency issue; it exists purely to catch deadlocks and memory-death-spirals where the process needs a hard restart. A downstream Postgres outage should never cause a restart storm across your fleet — it should just quietly drain traffic from readiness until Postgres recovers.

## The checklist I actually use now

1. **Never point liveness at anything with a network call.** A slow dependency should never restart a healthy process — that's readiness's job, and restarting doesn't fix an external outage anyway.
2. **Make readiness reflect real capacity to serve**, not just "process exists." Check the things that would actually make a request fail: connection pools, critical cache clients, circuit breaker state.
3. **Set `failureThreshold` with intent.** Readiness should react in seconds (you want fast failover). Liveness should tolerate a minute or more of noise before killing anything — restarts are expensive and rarely fix a real problem.
4. **Load test your readiness probe's failure path**, not just its happy path. Kill the database on purpose in staging and watch whether your Service endpoints drain gracefully or whether you just built a synchronized-failure machine.
5. **Alert on probe flapping**, not just probe failure. A pod bouncing in and out of readiness every 30 seconds is a story your dashboards should tell you, because it means something is marginal, not broken — and marginal problems are the ones that turn into 2 AM pages if ignored.

## Go check your `/health` endpoint right now

Seriously — open the file. If it's a one-liner that returns `200` unconditionally, you don't have a health check, you have a decoy. It'll pass every demo and fail you during the one incident where it actually mattered. Split it into a real `/ready` and a real `/healthz`, wire your probes to the right one, and go break your database in staging to watch what actually happens. That fifteen minutes is cheaper than the outage where Kubernetes swears everything is fine while your users beg to differ.
