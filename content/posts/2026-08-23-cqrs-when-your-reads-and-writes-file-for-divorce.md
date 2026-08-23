---
title: "💔 CQRS: When Your Reads and Writes File for Divorce"
date: "2026-08-23"
excerpt: "One model to handle both reads and writes sounded efficient right up until your dashboard query joined six tables and your checkout endpoint got stuck waiting behind it. CQRS is the breakup that fixes that — with the paperwork to prove it."
tags: ["backend", "architecture", "databases", "system-design", "cqrs"]
featured: true
---

Every backend starts the same way. One model, one table, one set of functions that both read and write it. `getUser`, `updateUser`, `createUser` — all polite neighbors sharing the same `User` class. It's clean. It's simple. It's the "we're just friends" phase of software architecture.

Then the product grows up. Now `getUser` isn't just fetching a row — it's joining orders, computing lifetime value, checking loyalty tier, and formatting three different date fields for the dashboard. Meanwhile `updateUser` just wants to change an email address and get out with minimal fuss. They're not the same kind of operation anymore. They never really were — you just didn't notice until one of them started dragging the other one down.

That's the entire pitch behind **CQRS: Command Query Responsibility Segregation**. Stop pretending reads and writes want the same model. Split them up. Let each optimize for what it's actually doing.

## The one-model trap

Here's the shape almost every app converges on without ever deciding to:

```javascript
class OrderService {
  async createOrder(customerId, items) {
    // write path: validation, business rules, one row inserted
    const order = await db.orders.insert({ customerId, items, status: 'pending' });
    return order;
  }

  async getOrderDashboard(customerId) {
    // read path: five joins, aggregation, formatting for the UI
    return db.query(`
      SELECT o.*, c.name, c.tier,
             SUM(oi.price) as total,
             COUNT(oi.id) as item_count
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.customer_id = $1
      GROUP BY o.id, c.name, c.tier
      ORDER BY o.created_at DESC
    `, [customerId]);
  }
}
```

Both methods live on the same service, hit the same tables, and get scaled together even though nothing about their traffic pattern is the same. The dashboard query runs constantly and mostly wants speed. The write mostly wants correctness and doesn't care about your reporting joins at all. When product asks for "one more column on the dashboard," you're now editing the exact code path that also handles money moving. That should make you nervous.

## Splitting the model, not just the code

CQRS says: build a separate model for commands (writes) and a separate model for queries (reads). They don't have to share a schema, a database, or even a language runtime.

```javascript
// commands/createOrder.js — optimized for correctness
async function createOrder(customerId, items) {
  const order = await db.orders.insert({ customerId, items, status: 'pending' });
  await eventBus.publish('order.created', { orderId: order.id, customerId, items });
  return order.id;
}

// queries/orderDashboard.js — optimized for read speed
async function getOrderDashboard(customerId) {
  return readDb.query(
    `SELECT * FROM order_dashboard_view WHERE customer_id = $1`,
    [customerId]
  );
}
```

`order_dashboard_view` isn't a live join anymore — it's a denormalized table, kept up to date by a subscriber that listens for `order.created` and friends, then writes a flat, dashboard-shaped row. The command side stays boring and transactional. The query side stays fast and doesn't know or care what a "business rule" is.

This is the part that trips people up: the read model is now **eventually consistent**, not instantly consistent. Place an order, and the dashboard might lag by a few hundred milliseconds until the event lands and the view updates. If you've read about the [outbox pattern](/blog/the-outbox-pattern-two-writes-one-lie), this is exactly the kind of write-then-notify flow it's built for — CQRS is what you're notifying *for*.

## You don't need event sourcing to get value from this

The internet loves to bolt CQRS to event sourcing and act like they're a package deal. They're not. You can absolutely run CQRS with two boring Postgres tables — one written by the command side, one refreshed by a materialized view or a cheap subscriber — and get most of the benefit without touching an event store. Start there. Earn your way into event sourcing later if you actually need point-in-time replay, not because a blog post told you it's "proper" CQRS.

On a project at Cubet, we had exactly this: a write path that needed strict validation and a reporting screen that kept getting slower as the joins grew. We didn't reach for event sourcing — we just split the query into its own read-optimized table updated by a background job on a five-second cadence. Nobody noticed the lag. Everybody noticed the dashboard stopped timing out.

## When the divorce isn't worth it

CQRS adds a moving part: something has to keep the read model in sync, and that something can fail, lag, or drift. If your app is a CRUD form with a list view, congratulations, you do not need this — the one-model version was correct, not a mistake. The pattern earns its keep when read and write traffic genuinely diverge: high write volume with rare reads, or the classic "one query joins everything" dashboard problem. Reach for it when you feel the pain, not because the pattern has a cool acronym.

## Try it small

Pick one endpoint in your app where the read query has gotten uncomfortably complex — the one with four joins and a `GROUP BY` that makes you wince. Don't rewrite your whole service. Just pull that one query into its own read model, backed by a table your write path updates (or a subscriber does, if you've already got an event bus). Measure the query time before and after. That's the whole experiment, and it's usually enough to tell you whether the rest of the app deserves the same treatment.
