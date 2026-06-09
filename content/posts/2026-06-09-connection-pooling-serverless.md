---
title: "🔗 Connection Pooling in Serverless: Why Your Lambda is Melting Your Database"
date: "2026-06-09"
excerpt: "Serverless functions are stateless by design — but your database is not. Every cold start spawning a fresh connection is a slow-motion DDoS on your own Postgres instance. Here is how to stop it."
tags:
  - databases
  - serverless
  - postgresql
  - aws-lambda
  - backend
featured: true
---

# 🔗 Connection Pooling in Serverless: Why Your Lambda is Melting Your Database

Serverless is supposed to make your life easier. Write a function, deploy it, pay only for what you use, sleep soundly at night. And for the most part that promise holds — right up until you point your Lambda function at a PostgreSQL database and watch your DBA's face turn the colour of a connection refused error.

The problem is deceptively simple: **serverless functions are stateless, but databases are not**.

## The Hidden Cost of "Scale to Zero"

A traditional Node.js API server starts once, creates a connection pool of, say, 20 connections, and reuses them for the lifetime of the process. Ten thousand requests later, it's still using those same 20 connections. The database is happy. The DBA is happy. Everyone goes home on time.

A Lambda function — or any serverless runtime — doesn't work that way. Every cold start is a brand-new process. Every warm instance is its own isolated execution environment. And if you naively open a database connection inside your handler, here's what actually happens:

```
Request spike: 500 concurrent Lambda invocations
Each invocation: opens 1 new DB connection
Result: 500 simultaneous connection attempts to Postgres

PostgreSQL default max_connections: 100
Outcome: 400 functions get "FATAL: sorry, too many clients already"
```

You haven't been attacked. You attacked yourself. Congratulations.

I've watched this exact scenario play out at Cubet on a client's e-commerce API during a flash sale. Traffic went from 20 req/s to 800 req/s in about 90 seconds. The Lambda concurrency scaled beautifully. The RDS instance buckled immediately. Every new Lambda invocation was racing to open a fresh connection, the database was rejecting everything over its limit, and the application was serving 500s to users who were actively trying to give the client money.

## Why Normal Connection Pools Don't Save You

Your first instinct might be: "Easy — I'll just initialise the pool outside the handler, in module scope."

```javascript
// The "clever" approach that doesn't actually help
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  max: 10,
});

export const handler = async (event) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM orders WHERE id = $1', [event.id]);
    return result.rows[0];
  } finally {
    client.release();
  }
};
```

This is better than creating a new connection on every invocation — module-level code is cached across warm invocations in the same execution environment. But it doesn't solve the core problem. You still have N Lambda instances, each with its own pool of up to 10 connections. If Lambda scales to 50 concurrent instances, you've got 500 potential connections again. You've just made the maths slightly less immediately catastrophic.

The actual solution lives *outside* your Lambda function entirely.

## The Right Architecture: A Connection Proxy

The answer is to put a connection pooler between your Lambda functions and your database. This pooler maintains a fixed, warm pool of real database connections and multiplexes thousands of short-lived application connections through them.

For PostgreSQL on AWS, **RDS Proxy** is the obvious choice. It's a managed proxy that sits in front of RDS or Aurora, maintains a pool of persistent connections to the database, and lets your Lambda functions connect to it instead. Your functions each open a "connection" to the proxy, but the proxy might be routing all of them through just 20 real connections to Postgres.

```javascript
// With RDS Proxy: your handler stays simple
import { Pool } from 'pg';

// Connect to RDS Proxy endpoint, not the DB directly
const pool = new Pool({
  host: process.env.RDS_PROXY_ENDPOINT,  // *.proxy-xxx.region.rds.amazonaws.com
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  max: 5,  // Keep this low — the proxy does the heavy lifting
});

export const handler = async (event) => {
  const { rows } = await pool.query(
    'SELECT id, status, total FROM orders WHERE customer_id = $1',
    [event.customerId]
  );
  return rows;
};
```

The critical difference: with RDS Proxy, all your Lambda instances are connecting to the proxy, and the proxy fans out to at most `max_connections` real DB connections. Your database sees a steady, manageable connection count regardless of Lambda scaling.

If you're on Supabase, they bundle pgBouncer and expose it on port 6543 — point your connection string there. PlanetScale handles this at the protocol level so you don't have to think about it at all. Neon serverless has its own HTTP-based driver that sidesteps TCP connection overhead entirely.

## What the Numbers Look Like

Here's a rough comparison of what changes when you add a proxy layer:

| Scenario | Connections to DB | Latency (p99) |
|---|---|---|
| Direct, no pool | 1 per invocation | ~80ms (connection overhead) |
| Module-level pool, no proxy | up to N×pool_size | ~5ms (warm) |
| RDS Proxy + module-level pool | Capped by proxy config | ~5ms (warm) |

The proxy doesn't reduce per-query latency much — that's already fast once you're connected. What it eliminates is connection exhaustion under load, and it dramatically reduces cold-start overhead because the proxy maintains persistent connections to the DB so new Lambda instances don't need to do a full TCP+TLS+Postgres handshake every time.

## A Few Things That Will Bite You

**IAM authentication with RDS Proxy** means your Lambda generates a short-lived token instead of using a static password. The token expires every 15 minutes. If you cache your pool in module scope (which you should), make sure your connection string regenerates the auth token on reconnect, not at startup. The AWS SDK's `Signer` utility handles this, but you have to wire it up yourself.

**VPC placement** is mandatory for RDS Proxy — it only works within a VPC. Your Lambdas need to be in the same VPC (or a peered one). This adds about 100ms to cold starts due to ENI provisioning. That's not the proxy's fault, but it's the tax you pay for running in a VPC, and it's worth knowing upfront.

**Connection timeouts differ from query timeouts**. Set both. A Lambda has a maximum execution time; if a query hangs longer than that, you'll get a Lambda timeout, but the query might keep running in Postgres. Add `statement_timeout` to your connection parameters to kill long-running queries at the DB level.

## The Mental Model That Fixes Everything

Think of your database's connection limit as a physical resource — like parking spaces. A traditional API server is one car that stays parked all day. A serverless architecture is a city of rideshare cars that all need to park simultaneously. Without a parking garage (your proxy), you fill every space and start blocking traffic.

The proxy is the parking garage: a finite number of actual spaces (real DB connections), but with a queue and valet management so hundreds of cars can move in and out without chaos.

Once you have that mental model, the solution space becomes obvious. You're not trying to make each Lambda smarter about connections. You're trying to move connection management out of the stateless tier entirely.

---

If you're running any Lambdas against a relational database and you haven't set up a proxy layer yet, that's your weekend project. Check your CloudWatch metrics first — if you see `DatabaseConnections` spiking in sync with your invocation count, you're already in the scenario described above. You just haven't had the traffic spike yet that makes it obvious.

Don't wait for the flash sale to find out.
