---
title: "🔌 Connection Pooling in Serverless: The Pool That Can't Actually Pool"
date: "2026-07-14"
excerpt: "You did everything right. You configured a nice, sensible connection pool. Then you deployed it to Lambda, where it got recreated 4,000 times a minute and pooled absolutely nothing."
tags:
  - databases
  - serverless
  - postgresql
  - backend
  - aws
featured: true
---

Here's a sentence that sounds completely reasonable until you think about it for five seconds: "just add a connection pool." That's the advice for basically every "too many database connections" problem in the history of backend engineering. Pools are the duct tape of database access — good duct tape, tested duct tape, duct tape that has saved careers.

Then you move your API to Lambda, or Cloud Functions, or Vercel's edge runtime, and somebody says the same thing — "just add a connection pool" — and the duct tape stops sticking. Not because pools are broken. Because serverless quietly removed the one assumption every connection pool is built on: that there's a *process* to pool inside of.

## What a Pool Actually Assumes

A connection pool is, at its core, a cache of expensive-to-create objects living in long-lived process memory. You open, say, 10 connections to Postgres when the app boots, and every request borrows one from the pool and gives it back when it's done. The expensive part — TCP handshake, TLS negotiation, Postgres forking a backend process, auth — happens once per connection, not once per request.

That whole model depends on "once per connection" actually meaning something. It only means something if the process sticks around long enough to reuse the connections it opened.

```js
// This is a perfectly good pool... in a long-running server.
const pool = new Pool({
  host: process.env.DB_HOST,
  max: 10,
  idleTimeoutMillis: 30000,
});

app.get("/users/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
  res.json(rows[0]);
});
```

On an EC2 box or in a Kubernetes pod, this code runs once at startup and the pool lives for the container's entire lifetime — hours, days, whatever. Ten connections get opened, and they get reused thousands of times. Beautiful.

Now put that exact code inside a Lambda handler.

## The Serverless Betrayal

Lambda doesn't run your process continuously. It spins up an execution environment, runs your handler, and — depending on traffic — either freezes that environment for potential reuse or throws it away entirely. Under real, bursty traffic, AWS doesn't scale you from 1 to 2 instances. It scales you from 1 to 200 in about ninety seconds if the traffic justifies it, because that's the entire pitch of serverless: infinite, near-instant horizontal scale.

Every one of those 200 concurrent execution environments runs your module top-level code — including `new Pool({ max: 10 })` — independently. You didn't provision one pool of 10 connections. You provisioned 200 pools of 10 connections each, because each Lambda instance thinks it's the only one in the universe.

```
200 concurrent Lambda instances × 10-connection pool = up to 2,000 Postgres connections
```

Your `db.t3.medium` RDS instance ships with a `max_connections` default around 170-ish depending on instance memory. You just asked for more than ten times that, from a "pool" that, per-instance, looks completely reasonable in code review. Nobody shipped a bug. The abstraction just doesn't mean what everyone assumed it meant.

And it gets worse at the tail: a frozen-then-thawed Lambda instance can come back with a pool full of connections that Postgres already closed for being idle, or that a load balancer silently dropped. Now you're not just over-provisioned, you're also intermittently handing your app dead sockets.

## What Actually Works

**1. Get a proxy in front of Postgres, and let it hold the real connections.**

This is the load-bearing fix. RDS Proxy, PgBouncer, or Supabase's built-in pooler sit between your fleet of ephemeral functions and the database, multiplexing thousands of short-lived client connections onto a small, stable pool of actual Postgres backends. Your Lambda still "opens a connection" per invocation, but it's opening a cheap connection to the proxy, not an expensive one to Postgres itself.

```js
// Point at the proxy endpoint, not the DB directly.
// PgBouncer in transaction-pooling mode does the real multiplexing.
const pool = new Pool({
  host: process.env.PGBOUNCER_HOST, // not process.env.DB_HOST
  max: 1,          // one connection per Lambda instance is plenty
  idleTimeoutMillis: 0,
  connectionTimeoutMillis: 5000,
});
```

Note `max: 1`. In a serverless handler, a pool bigger than 1 is usually pointless — a single invocation typically runs one query path at a time, and you'd rather have 200 lean instances than 200 instances each hoarding a private pool of 10.

**2. Or skip TCP pooling entirely and go HTTP.**

Neon, PlanetScale, and the Data API for Aurora Serverless all offer an HTTP-based driver. Each query is a stateless HTTPS request — no persistent socket to manage, freeze, or leak, because there's no connection lifecycle for your function to mismanage in the first place. It trades a little per-query latency for making the entire "pool per instance" problem structurally impossible.

```js
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT * FROM users WHERE id = ${userId}`;
```

**3. If you're stuck without a proxy, cap concurrency instead of connections.**

Setting Lambda's reserved concurrency to something like 20 puts a hard ceiling on how many execution environments can exist simultaneously, which puts a hard ceiling on `20 × max` connections. It's a blunt instrument — you're capping throughput to protect the database — but it's honest about the tradeoff, instead of finding out about it during an incident.

We hit a version of this at Cubet on a reporting endpoint that fanned out to Lambda during month-end batch jobs — nothing exotic, just enough concurrent invocations to tip RDS into `FATAL: remaining connection slots are reserved`. Fronting it with RDS Proxy took about an afternoon and the alerts never came back.

## The Actual Lesson

A connection pool isn't a database optimization. It's a *process-lifetime* optimization — it only pays off if there's a process around long enough to amortize the cost across many requests. Serverless platforms are explicitly designed to make process lifetime unpredictable and process *count* elastic, which is exactly the one variable pooling math can't tolerate being unbounded.

So the next time someone says "just add a pool" for a Lambda-backed API, ask the follow-up question that actually matters: pooling *where*? In-process pools scale with your function's concurrency, which is precisely the number you don't control. Push the pooling to something that has a stable process lifetime — a proxy, a managed pooler, or an HTTP-native driver — and let your functions stay exactly as disposable as they were always meant to be.

If you're running anything on Lambda or Cloud Functions against a traditional Postgres or MySQL instance right now, go check `max_connections` against your peak concurrency times your per-instance pool size. If that math scares you, you already know what today's ticket is.
