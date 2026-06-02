---
title: "🐌 N+1 Queries: The Silent API Killer Hiding in Your ORM"
date: 2026-06-02
excerpt: "Your API feels fine until it doesn't. The N+1 query problem is the most common database performance bug in ORM-heavy backends — and it hides in plain sight until your database is on fire."
tags: ["databases", "performance", "orm", "postgresql", "backend", "node.js"]
featured: true
---

Let me paint you a familiar picture.

You build a `/users` endpoint. It works great locally. You add an ORM — Prisma, Sequelize, TypeORM, pick your poison — because life is short and hand-written SQL is long. The code is clean, readable, almost elegant.

Then it ships to production with 10,000 users in the database. Your endpoint starts taking 4 seconds. The database CPU spikes to 90%. Your on-call phone buzzes at 3 AM.

Welcome to the N+1 query problem. Population: every backend engineer who has ever touched an ORM.

## What Is N+1, Actually?

The name is deceptively simple. Instead of fetching related data in one query, your code fires **1 query** to get a list of N items, then **N more queries** to fetch related data for each item individually.

That's 1 + N database round-trips. When N = 1,000, you're sending 1,001 separate queries to your database for what should have been a single JOIN.

Here's the classic offender:

```typescript
// Looks innocent. Absolutely is not.
const users = await User.findAll();                          // Query 1: SELECT * FROM users

for (const user of users) {
  const orders = await Order.findAll({                      // Queries 2 … N+1
    where: { userId: user.id },
  });
  user.orders = orders;
}
```

If you have 500 users, you just fired 501 queries. The database is doing 500 separate index lookups, 500 separate network round-trips. Your connection pool is sweating through its shirt. Your p99 latency graph looks like the north face of Everest.

At Cubet, we inherited a legacy reporting service with exactly this pattern buried deep inside an export endpoint. Worked fine during QA — the test dataset had 50 records. In production with 8,000 records, it hit a 30-second gateway timeout on every request. The culprit: 8,001 queries per API call, hiding in an otherwise unremarkable for-loop.

## Why ORMs Make This So Easy to Miss

ORMs are lazy by design. When you write `user.orders`, the ORM executes a fresh query right there, on the spot. It doesn't warn you. It doesn't care that you're inside a loop iterating over 800 users. It just… does it.

This is called **lazy loading**, and it's the quiet predator of backend performance.

The ORM isn't broken — it's doing exactly what it was designed to do: abstract away SQL and give you objects. The problem is that abstraction hides cost. You stop thinking in queries and start thinking in objects, and suddenly 500 objects silently means 500 queries. The code reads like a simple loop. The database sees a DDoS.

## The Fix: Eager Loading and Batching

### Option 1: Eager Loading (Fetch It All Upfront)

Most ORMs support eager loading — fetching related records upfront using a JOIN or a batched `IN` query, rather than one lazy query per item.

```typescript
// Prisma: `include` fetches orders alongside users in one shot
const users = await prisma.user.findMany({
  include: { orders: true },
});
```

Under the hood Prisma issues something like:

```sql
SELECT users.id, users.name, orders.id, orders.total
FROM users
LEFT JOIN orders ON orders.user_id = users.id;
```

One query. One round-trip. The database is happy, your latency is happy, and future-you at 3 AM is *very* happy.

### Option 2: DataLoader (Batch + Cache per Request)

Sometimes eager loading at the query level isn't practical — like in GraphQL resolvers, where each field resolver runs independently and has no knowledge of its siblings. This is exactly what the **DataLoader pattern** was invented for.

```typescript
import DataLoader from 'dataloader';

const orderLoader = new DataLoader(async (userIds: readonly number[]) => {
  const orders = await prisma.order.findMany({
    where: { userId: { in: [...userIds] } },
  });
  // Map results back to the same order as the input keys
  return userIds.map(id => orders.filter(o => o.userId === id));
});

// Each resolver just calls .load() — batching happens automatically
const orders = await orderLoader.load(user.id);
```

DataLoader collects every `.load(id)` call that happens within a single event loop tick, then fires **one** batched query with `WHERE user_id IN (1, 2, 3, …)`. No matter how many resolvers run in parallel, you pay for exactly one round-trip per batch window. It's elegant, and it's the standard N+1 fix for any GraphQL stack.

## How to Spot N+1 Before It Bites You

You can't fix what you can't see.

**Turn on query logging in development.** Most ORMs can log every SQL statement they emit. If you enable this and watch the console while hitting an endpoint, N+1 problems show up immediately as a wall of identical queries scrolling by.

```typescript
// Prisma — log every query during dev
const prisma = new PrismaClient({ log: ['query'] });
```

**Count queries per request, not just total time.** A single endpoint firing 800 queries might finish in 600ms on a local Postgres instance (fast machine, no network latency). On a remote RDS instance with 2ms round-trip latency, that same endpoint takes 1.6 seconds minimum — purely from round-trip overhead, before any actual work is done.

**Use an APM tool.** Datadog, New Relic, and similar tools group database calls by parent request. The N+1 pattern shows up unmistakably as "800 calls to the same query shape, all under one trace."

## Common Misconceptions

**"I'll just add caching."** Caching a layer over N+1 doesn't fix the problem — it papers over it. On cache misses (cold starts, cache invalidation, new records), you're back to 800 queries. Fix the query count first, then cache the result if you need to.

**"The database can handle it."** Sure, for 100 rows it can. At 10,000 rows, each database connection is a limited resource. At 100,000 concurrent users, you'll exhaust your connection pool long before you'd exhaust a single well-written JOIN. Scale amplifies bad patterns ruthlessly.

**"This only happens with ORMs."** You can absolutely write N+1 in raw SQL too — any application-layer loop that fires a query per item has the same problem. It's an architectural pattern problem, not a tooling problem.

## A Quick Pre-Ship Checklist

Before you deploy any endpoint that returns a list:

- [ ] Am I accessing related data inside a loop?
- [ ] Is my ORM configured to eager-load where I need it?
- [ ] Am I watching query logs in dev and actually reading them?
- [ ] If GraphQL, do I have DataLoader wired up for every relational field?

Four greens and you're probably fine.

## The Takeaway

N+1 isn't an exotic edge case. It's the backend equivalent of leaving every light on in every room of a skyscraper — individually harmless, collectively catastrophic. Your ORM makes it trivially easy to write, and your local dev dataset with 50 rows makes it trivially easy to miss.

The fix is also not exotic. Eager loading and batching are well-understood, battle-tested patterns that most ORMs support out of the box. The hard part is building the habit: always think in queries, not just in objects. Every time you iterate over a list and access a related field, pause and ask — *is this firing a new database query?*

If you're not sure, turn on query logging and count. The numbers don't lie.

Your database will thank you. Your connection pool will thank you. And future-you — the one who doesn't get paged at 3 AM about a 30-second timeout — will *really* thank you.

---

*Got an N+1 war story? The more embarrassing, the better — drop it in the comments.*
