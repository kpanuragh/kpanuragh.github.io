---
title: "🏊 Connection Pool Exhaustion: The Outage Where Your Database Was Never the Problem"
date: "2026-07-07"
excerpt: "Postgres CPU at 12%, memory nowhere near the limit, and yet every request times out with FATAL: too many connections. The database isn't struggling — it's being suffocated by math nobody did before scaling the app tier."
tags:
  - databases
  - postgresql
  - backend
  - performance
  - devops
featured: true
---

Picture the pager going off at 2 a.m. Every request is timing out. You open the dashboard expecting a wall of red — CPU pegged, disk I/O maxed, replication lag through the roof. Instead you see... nothing. CPU at 12%. Memory fine. Disk fine. The database looks like it's on vacation. And yet every single request comes back with the same error:

```
FATAL: sorry, too many clients already
```

Congratulations, you've met connection pool exhaustion — the outage where your database was never actually the bottleneck. It was just being politely suffocated by a number nobody calculated.

## The Two Pools Nobody Reconciles

Here's the thing people miss: there isn't one connection pool in your system, there are (at least) two, and they rarely talk to each other.

1. **Your app-side pool** — `pg-pool`, Sequelize, Prisma, TypeORM, whatever — sitting inside each instance of your service, capping how many connections *that process* opens to Postgres.
2. **Postgres's own ceiling** — `max_connections` in `postgresql.conf`, usually defaulting to something modest like 100.

Nobody sits down and multiplies these together until the outage forces them to. The math is embarrassingly simple and embarrassingly easy to ignore:

```
total_connections = pool_size_per_instance × number_of_instances
```

Say your app pool is configured for 20 connections, and you're running 3 instances. That's 60 — comfortably under a `max_connections` of 100. Then the autoscaler notices traffic is up, scales you to 8 instances for a flash sale, and now you're asking for 160 connections against a hard ceiling of 100. Postgres doesn't gracefully degrade here — it just starts rejecting new connections outright, and every rejection looks identical to a total outage from the app's perspective.

## Watching It Happen in Real Time

Before you touch any config, confirm this is actually what's happening. Run this against Postgres while the incident is live:

```sql
SELECT
  application_name,
  client_addr,
  state,
  count(*)
FROM pg_stat_activity
GROUP BY 1, 2, 3
ORDER BY count(*) DESC;
```

If you see a huge pile of connections sitting in `idle` state, that's not traffic — that's app instances holding connections open "just in case" while starving everyone else. `idle in transaction` is worse: that's a connection holding locks while doing absolutely nothing, usually because a request handler forgot to commit or roll back before returning.

We hit almost exactly this at Cubet when a new microservice was added to talk to the same primary database. Nobody adjusted the shared pool budget — the new service just showed up with its own default pool size, and the existing services didn't get smaller to make room. `max_connections` didn't move. The arithmetic broke quietly until traffic picked up.

## The Fix Isn't "Raise max_connections"

The tempting fix is cranking `max_connections` up to 500 and calling it a day. Resist this — each Postgres connection is a full OS process with its own memory overhead (roughly 5–10MB baseline, more under load), so doubling connections doesn't scale for free, and past a certain point more connections actively *hurts* throughput due to context-switching overhead.

The real fix is putting a connection pooler *in front of* Postgres so your app's connection count and Postgres's connection count are decoupled entirely. PgBouncer is the standard here:

```ini
[databases]
myapp = host=127.0.0.1 port=5432 dbname=myapp

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
```

With `pool_mode = transaction`, PgBouncer can serve a thousand app-side clients using a tiny pool of real Postgres connections underneath, handing a backend connection out only for the duration of a single transaction. Your app can scale to 30 instances without Postgres ever seeing more than a couple dozen actual connections.

The catch — and it bites people constantly — is that transaction-mode pooling breaks anything that depends on session state persisting across queries: `SET` statements, prepared statements issued outside a single transaction, advisory locks, `LISTEN/NOTIFY`. If your ORM assumes a stable session, test it against PgBouncer in transaction mode *before* it's the thing that goes down at 2 a.m., not after.

## What to Actually Do This Week

Do the multiplication for your own system right now:

```js
// crude but effective sanity check
const poolSizePerInstance = 20;
const maxInstances = 12; // your autoscaler's ceiling, not your current count
const dbMaxConnections = 100;

const worstCase = poolSizePerInstance * maxInstances;
if (worstCase > dbMaxConnections * 0.8) {
  console.warn(`Pool math is broken: ${worstCase} possible vs ${dbMaxConnections} allowed`);
}
```

If that warning fires, you have three real options: shrink the per-instance pool, cap your autoscaler, or put PgBouncer (or your cloud provider's equivalent — RDS Proxy, Cloud SQL Connection Pooling) between your app and the database. Pick based on whichever gives you room without a rewrite.

Your database probably isn't slow. It's just been told to serve more clients than it was ever configured to hold, and it's telling you exactly that — you just have to read the error message instead of the CPU graph. Go run the multiplication on your own stack today; it takes two minutes and it's a lot cheaper than the outage.
