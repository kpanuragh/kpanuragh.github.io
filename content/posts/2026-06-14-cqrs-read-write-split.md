---
title: "CQRS: When Your Read and Write Models Need a Divorce \U0001F500"
date: 2026-06-14
excerpt: "CQRS separates the commands that mutate state from the queries that read it — giving you independent scaling, specialized models, and saner codebases. Here's when it's worth the complexity and when it's overkill."
tags: [backend, architecture, cqrs, distributed-systems, databases]
featured: true
---

Here's a scenario that will feel very familiar: you have a `User` model. It handles login, profile updates, permission checks, and it's the thing you query to build that analytics dashboard showing "last 30 days of activity per user." One model, one table, one prayer that it keeps holding together.

Then the product team wants a new reporting view. You add a JOIN. Then another. Then an aggregate. Soon your single `SELECT` is doing the equivalent of assembling IKEA furniture with oven mitts — technically possible, architecturally painful.

This is exactly the problem CQRS (Command Query Responsibility Segregation) was invented to solve.

## The Core Idea

CQRS is embarrassingly simple in concept: **commands mutate state, queries return data, and they should never share the same model**.

That's it. The rest is implementation details.

Commands say things like "create an order", "update a user profile", "cancel a subscription". They don't return data — they succeed or fail. Queries say things like "give me the last 10 orders for this user", "show me the dashboard summary". They don't change anything.

By splitting these two concerns, you unlock a superpower: you can optimize each side independently.

Your write side can be normalized, constrained, validated, event-sourced — optimized for correctness. Your read side can be denormalized, cached, materialized into whatever shape the UI needs — optimized for speed.

## Why This Matters in Practice

At Cubet, we hit a wall with a SaaS product that had a pretty standard CRUD backend. The write path was clean: validations, business logic, database writes. But the read path was a horror show — deeply nested includes, computed fields recalculated on every request, N+1 queries lurking in the ORM, the works.

The instinct was to "just add indexes" or "just cache more aggressively". But the real issue was architectural: we were forcing the same model to serve two wildly different masters.

Once we separated the read model — building a dedicated projection layer that pre-computed exactly what the UI needed — query times dropped from 800ms to under 50ms. No magic. Just stopping the fight between two different access patterns.

## What This Looks Like in Code

Here's a minimal CQRS setup in Node.js:

```typescript
// command-handler.ts — write side
interface CreateOrderCommand {
  userId: string;
  items: { productId: string; quantity: number }[];
}

async function handleCreateOrder(cmd: CreateOrderCommand): Promise<void> {
  const user = await userRepo.findById(cmd.userId);
  if (!user.isActive()) throw new Error('User account is suspended');

  const order = Order.create(cmd.userId, cmd.items);
  await orderRepo.save(order);

  // Emit an event so the read side can update its projection
  await eventBus.publish('OrderCreated', order.toSnapshot());
}
```

```typescript
// query-handler.ts — read side
interface OrderSummary {
  orderId: string;
  customerName: string;
  totalAmount: number;
  itemCount: number;
  status: string;
  createdAt: Date;
}

async function getOrdersForDashboard(userId: string): Promise<OrderSummary[]> {
  // Query a pre-built read model — no joins, no computation at query time
  return db.query(`
    SELECT order_id, customer_name, total_amount, item_count, status, created_at
    FROM order_summaries
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `, [userId]);
}
```

Notice what's absent from the query handler: no business logic, no validation, no ORM gymnastics. It just reads from a table purpose-built for this exact shape. The `order_summaries` table gets updated when the `OrderCreated` event fires — asynchronously, efficiently, without touching the write path.

## The Read Model Is Just a Cache You Control

Here's the mental model that makes CQRS click: **the read model is a denormalized, pre-computed projection of your write model**.

You're not duplicating data arbitrarily — you're materializing it into the exact shape consumers need. Think of it as a standing query that updates itself whenever the underlying data changes.

This is why CQRS pairs naturally with event sourcing, but doesn't require it. You can have a perfectly traditional write-to-database setup and still maintain a separate read model that gets refreshed via database triggers, change data capture (CDC), or post-write hooks. The pattern is the separation, not the mechanism.

The eventual consistency gap is real — there's a window between a write completing and the read model catching up. For most use cases this is milliseconds. For financial ledgers or anything that absolutely cannot read stale state, plan accordingly (or read directly from the write model for those specific queries — CQRS doesn't have to be all-or-nothing).

## When CQRS Is the Right Call

CQRS earns its complexity when:

- **Your read and write access patterns are radically different.** Fine-grained writes but heavily aggregated reads that span multiple tables — that's divergent access patterns fighting each other in a unified model.
- **You need to scale reads and writes independently.** Spin up read replicas serving different projections, keep the write side lean and transactional.
- **You're building collaborative or event-driven features.** When multiple users can mutate the same resource, separating commands from queries makes conflict resolution and audit trails dramatically simpler.
- **Reporting is eating your transactional database alive.** Read models give analytics queries somewhere to live that isn't the same box handling your checkout flow.

## When It's Overkill

CQRS is not for your weekend project, your startup's MVP, or any system where the "read model" and "write model" are genuinely the same five columns.

The maintenance overhead is real: you now own two models, an event or sync pipeline, and the mental overhead of explaining eventual consistency to your team. If you can't articulate *why* that tradeoff is worth it, it probably isn't — yet.

A sensible rule of thumb: start with a clean, well-indexed relational schema. Reach for CQRS when you notice your queries are fundamentally at war with your write-optimized schema, or when your database is being pulled in two irreconcilable directions by different workloads.

## The Takeaway

CQRS isn't a silver bullet — it's a scalpel. It solves a specific, real problem: the impedance mismatch between how you write data and how you need to read it back.

If you're contorting your ORM to generate readable queries, if read endpoints are slow because they're computing things that haven't changed in hours, if you find yourself wishing the "get dashboard" endpoint had nothing to do with your domain model — that's CQRS calling your name.

The divorce between reads and writes sounds dramatic. In practice, it's just separation of concerns wearing a fancy acronym.

---

Pick the slowest read endpoint in your current system and sketch what a purpose-built read model for it would look like. One table, exactly the columns the UI needs, updated asynchronously. You might be surprised how much complexity evaporates when you stop forcing the same schema to serve two masters.
