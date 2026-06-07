---
title: "🌿 The Strangler Fig Pattern: Migrate Legacy Systems Without Burning Everything Down"
date: "2026-06-07"
excerpt: "Legacy systems don't die — they just accumulate scar tissue. The Strangler Fig pattern lets you replace them piece by piece, without the big-bang rewrite that always ends in tears."
tags:
  - backend
  - architecture
  - legacy
  - migration
  - distributed-systems
featured: true
---

Let me tell you about the worst kind of project meeting. You're sitting in a room, someone pulls up a diagram of the "legacy system", and then there's a long, reverent silence — the kind usually reserved for war memorials. It's a PHP monolith from 2009. It has no tests. It handles payments. It has a table called `misc_data`. Nobody knows what's in it. Nobody has the courage to look.

And then someone says the words: "I think we just need to rewrite it."

Reader, do not do the rewrite.

## The Big Bang Rewrite: A Cautionary Tale

The all-at-once rewrite has destroyed more engineering teams than burnout and bad coffee combined. You spend 12 months building the "new" system in parallel. Then you flip the switch. Then the new system doesn't handle the seventeen edge cases that lived undocumented inside the old system's scar tissue. Then your CTO asks questions. Then people update their LinkedIn.

The problem isn't ambition. The problem is treating a running, revenue-generating system like a whiteboard exercise.

Enter the **Strangler Fig pattern**.

## What Even Is a Strangler Fig?

The name comes from a tropical plant that wraps itself around a host tree. Over decades, the fig grows and expands, drawing nutrients, extending roots — until one day the original tree is completely gone and the fig is standing on its own. The host is replaced gradually, not ripped out.

Martin Fowler named this pattern after that botanical slow-burn. The idea: build new functionality *around* the legacy system, intercept traffic incrementally, and let the old system shrink naturally as the new one grows. No big bang. No 12-month parallel track. Just steady, patient replacement.

## The Three-Step Playbook

**Step 1: Install a facade (the proxy layer)**

You put something in front of the legacy system that can route traffic. This is your future control plane. At first, it passes everything through unchanged — the legacy system doesn't even know the facade exists.

```typescript
// Express proxy facade — starts as a simple pass-through
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();

// New service handles /api/products — live in production
app.use('/api/products', require('./new-services/products'));

// Everything else still hits the legacy monolith
app.use('/', createProxyMiddleware({
  target: 'http://legacy-app:8080',
  changeOrigin: true,
}));

app.listen(3000);
```

That's it. You've just created the seam. The legacy system is still doing all the work. But you now have the power to redirect traffic one endpoint at a time.

**Step 2: Extract and redirect, one slice at a time**

Pick the smallest, most self-contained piece of functionality. Ideally something with clear inputs and outputs, a bounded data model, and low blast radius if it goes wrong. Build a new service for it, test it thoroughly, then flip the proxy.

At Cubet, we did this recently with an aging inventory service buried inside a multi-tenant monolith. The first slice we extracted was the read side of product listings — pure GET requests, no write path, easy to rollback. We ran the new service and the old one in parallel for two weeks, comparing responses. When confidence was high, we moved the proxy. Nobody noticed. Which is exactly the goal.

**Step 3: Migrate data gradually**

This is where most teams underestimate the complexity. The legacy system has its own data store, usually in a shape that only made sense to the 2011 developer who designed it. You have two options:

- **Dual-write**: new writes go to both databases; reads prefer the new one.
- **Shared database (temporary)**: the new service talks to the legacy DB until you've migrated the schema.

The dual-write approach is safer but requires reconciliation. Here's a simplified pattern:

```typescript
async function createOrder(payload: OrderPayload) {
  // Write to new DB first (source of truth going forward)
  const newOrder = await newOrdersRepo.insert(payload);

  // Shadow-write to legacy DB to keep it in sync during migration
  try {
    await legacyDb.query(
      `INSERT INTO orders (id, customer_id, total, created_at) VALUES (?, ?, ?, ?)`,
      [newOrder.id, payload.customerId, payload.total, newOrder.createdAt]
    );
  } catch (err) {
    // Non-fatal — log and alert, but don't fail the request
    logger.error('Legacy shadow write failed', { orderId: newOrder.id, err });
    metrics.increment('legacy_shadow_write_failure');
  }

  return newOrder;
}
```

You keep this going until the legacy system is no longer a source of truth for orders. Then you stop the shadow writes. Then, eventually, you drop that `misc_data` table and feel nothing but peace.

## Common Mistakes to Avoid

**Don't try to strangle everything at once.** The pattern works because it's boring and incremental. The moment you start planning to "migrate five services this sprint," you've invented a small big-bang rewrite.

**Don't skip the comparison phase.** Before you cut over any endpoint, run the new and old implementations in parallel and diff the responses. Shadow traffic testing (send requests to both, only serve one) is your best friend here.

**Don't let the facade become a dumping ground.** It's tempting to add business logic to the proxy layer because "it's already there." Resist. The facade is infrastructure, not application code. Keep it thin.

**Watch for hidden coupling.** The thing about monoliths is that everything depends on everything, often through shared global state, shared sessions, or shared database transactions. Untangle these dependencies explicitly — don't assume extraction is clean just because the HTTP surface looks clean.

## When the Fig Finally Stands Alone

The end state is satisfying in a quiet way. The legacy system handles less and less traffic. Your monitoring graphs show it going idle. One day, a team member asks "do we still need to deploy the old app?" and the answer is finally, definitively, no.

There's no champagne-popping moment. No dramatic cutover. The old tree just slowly disappears beneath the roots of the new one. And that's exactly how it should be.

## Where to Start

If you're staring down a legacy system today, here's the practical first step: **identify your three lowest-risk read endpoints.** Build a facade. Redirect those three. Nothing else. Just prove the pattern works in your environment.

You're not migrating the system. You're just planting the fig.

---

Have you used the Strangler Fig pattern on a real migration? I'd love to hear what surprised you — drop a comment or reach out on [Twitter/X](https://x.com/kpanuragh). The edge cases are always more interesting than the playbook.
