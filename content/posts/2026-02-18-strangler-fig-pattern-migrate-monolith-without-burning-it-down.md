---
title: "The Strangler Fig Pattern: Killing Your Monolith One Piece at a Time 🌿🪓"
date: "2026-02-18"
excerpt: "Your monolith is 6 years old, 400,000 lines of code, and the original developer left in 2021. Every deploy is a prayer. Everyone's afraid to touch it. The solution isn't a 'big rewrite' - I promise that will kill your company. It's the Strangler Fig Pattern: strangle the beast slowly, without anyone noticing the lights went out."
tags: ["architecture", "scalability", "system-design", "microservices", "migration"]
featured: true
---

# The Strangler Fig Pattern: Killing Your Monolith One Piece at a Time 🌿🪓

**Uncomfortable truth:** Every company's "big rewrite" story ends the same way. New system takes 18 months instead of 6. The old system kept getting features. Now you have two systems to maintain. The new one doesn't have half the edge cases. You ship it. Support tickets flood in. You spend 6 months bug-fixing things that "just worked" before.

**The second rewrite** is when someone quietly suggests "maybe we should just... go back to the monolith?"

I've seen this play out twice in my career. The third time I saw that gleam in a VP's eye - "let's just rewrite it" - I pulled up a diagram and said **"have you heard of the Strangler Fig?"**

## What Even Is a Strangler Fig? 🌴

A strangler fig is a real plant. It wraps itself around an existing tree, slowly grows, takes over all the light and nutrients, and eventually the original tree dies inside. The fig is standing, the old tree is gone, and nobody had a "big bang" moment where everything changed at once.

Martin Fowler named the architectural pattern after it. Genius.

```
The Old Tree (Your Monolith):
┌────────────────────────────┐
│   PHP Monolith (2018)      │
│   400,000 lines of code    │
│   "Don't touch OrderCtrl"  │
│   "The payments module     │
│    is cursed"              │
│   deploy every 6 weeks     │
└────────────────────────────┘

What You Want (Eventually):
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Order   │ │ Payment  │ │  User    │
│ Service  │ │ Service  │ │ Service  │
└──────────┘ └──────────┘ └──────────┘

The Strangler Fig Approach:
Month 1: Proxy everything through a facade
Month 3: Route /api/products to new service
Month 6: Route /api/users to new service
Month 12: The old tree is hollow. Tear it down.
```

No "big bang." No 18-month rewrite. No CTO prayer circle.

## The Core Idea: Route, Then Migrate 🚦

**When designing our e-commerce backend** for a gradual migration, the secret was a single architectural rule: **new code never calls old code directly. Old code doesn't know new code exists.**

Everything goes through a Facade (also called a Proxy or API Gateway).

```
BEFORE:
Client → Monolith (handles everything)

AFTER STEP 1 (Facade added):
Client → Facade → Monolith (still handles everything, but now there's a proxy)

AFTER STEP 6 (Partial migration):
Client → Facade → New Order Service  ← if /api/orders
                → New User Service   ← if /api/users
                → Monolith           ← everything else (still working!)

AFTER STEP N (Done):
Client → Facade → Microservices (monolith is gone)
```

The monolith doesn't know it's being replaced. It just gets fewer requests each month. Like slowly redirecting rivers.

## Step 1: The Facade — Don't Touch Anything Yet 🚪

**A scalability lesson that cost us:** The team that skipped the facade and tried to migrate while still deploying the monolith. They had to freeze features for 3 months. The business said no. Migration died.

Add the facade first. Before any migration. This is non-negotiable.

```javascript
// Simple facade in Node.js/Express
// This sits in front of EVERYTHING
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

// Feature flag store (Redis or environment)
const featureFlags = {
  useNewProductService: process.env.USE_NEW_PRODUCT_SERVICE === 'true',
  useNewUserService: process.env.USE_NEW_USER_SERVICE === 'true',
  useNewOrderService: false, // Not ready yet!
};

// Products - migrated!
app.use('/api/products', (req, res, next) => {
  if (featureFlags.useNewProductService) {
    return createProxyMiddleware({
      target: 'http://product-service:3001',
      changeOrigin: true,
    })(req, res, next);
  }
  // Fall back to monolith
  return createProxyMiddleware({
    target: 'http://monolith:8080',
    changeOrigin: true,
  })(req, res, next);
});

// Users - migrated!
app.use('/api/users', (req, res, next) => {
  if (featureFlags.useNewUserService) {
    return createProxyMiddleware({
      target: 'http://user-service:3002',
      changeOrigin: true,
    })(req, res, next);
  }
  return createProxyMiddleware({ target: 'http://monolith:8080', changeOrigin: true })(req, res, next);
});

// Everything else still goes to the monolith
app.use('/', createProxyMiddleware({
  target: 'http://monolith:8080',
  changeOrigin: true,
}));

app.listen(80, () => console.log('Facade running on :80'));
```

**Day 1 of the migration:** Deploy the facade. Route 100% to monolith. Nothing changed. Celebrate. (Seriously - this is your safety net now.)

## Step 2: Pick the Easiest Module First 🍎

**As a Technical Lead, I've learned:** the first module you extract will take 3x longer than you think. Pick the least scary one. Not the payments module. Not the order processing. Something boring.

**Good first candidates:**
- Static content (product images, descriptions)
- Read-only APIs that don't write data
- Authentication/JWT validation
- Email/notification sending
- Search functionality (can run in parallel with monolith search)

**Why start boring?** Because you'll hit unexpected problems:
- Database foreign keys that cross module boundaries
- Shared sessions stored in the monolith
- Undocumented behavior in the old code
- "Oh, this also updates that table when we do this thing"

You want to discover these problems on your notifications module, not your payment processor.

## Step 3: The Dual-Write Phase 🔄

**The scariest part** of any migration is the data. New service, new database. Old service, old database. How do you migrate without downtime?

**The answer:** Dual-write. For a period, write to BOTH the old system and the new one.

```javascript
// During migration: write to both, read from new
async function createProduct(productData) {
  // Write to new service (source of truth going forward)
  const newProduct = await newProductService.create(productData);

  // ALSO write to monolith database (keeps old system in sync)
  // This is temporary - only while we cut over reads
  try {
    await monolithDB.query(
      'INSERT INTO products (id, name, price, ...) VALUES (?, ?, ?, ...)',
      [newProduct.id, productData.name, productData.price]
    );
  } catch (err) {
    // Don't fail the request - log and alert
    // New system is source of truth now
    logger.error('Dual-write to monolith failed', { err, productId: newProduct.id });
    await alertSlack(`⚠️ Dual-write failure: product ${newProduct.id}`);
  }

  return newProduct;
}
```

```
Migration Timeline for a Single Module:

Week 1: Add facade (route 100% to monolith)
Week 2: Build new service
Week 3: Enable dual-writes (write to both, read from monolith)
Week 4: Shadow mode (route 1% to new service, compare responses)
Week 5: Canary (route 10% to new service, monitor errors)
Week 6: Gradual rollout (25% → 50% → 75% → 100%)
Week 7: Disable dual-write to monolith
Week 8: Delete that module from the monolith
```

**When we migrated our product catalog**, we ran dual-writes for 3 weeks. We found 4 bugs in our new service by comparing responses. No customers were affected. Zero downtime.

## Step 4: Shadow Mode — Test Without Risk 👤

Before routing real traffic, run your new service in "shadow mode": the monolith handles the real request, but you also send a copy to the new service and compare responses.

```javascript
// Shadow mode middleware
async function shadowModeMiddleware(req, res, next) {
  if (!featureFlags.shadowProductService) return next();

  // Clone the request and send to new service in background
  // Don't await - don't slow down real requests
  setImmediate(async () => {
    try {
      const shadowResponse = await fetch(`http://product-service:3001${req.path}`, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      });

      const shadowData = await shadowResponse.json();
      const realData = res.locals.responseBody; // Captured from monolith response

      // Compare and log differences
      if (!deepEqual(shadowData, realData)) {
        logger.warn('Shadow mode divergence detected', {
          path: req.path,
          monolithResponse: realData,
          newServiceResponse: shadowData,
        });
        metrics.increment('shadow.divergence', { path: req.path });
      } else {
        metrics.increment('shadow.match', { path: req.path });
      }
    } catch (err) {
      logger.error('Shadow mode request failed', { err });
    }
  });

  next();
}
```

**Match rate goal: 99.9% before you route real traffic.** That 0.1% divergence? Those are the edge cases that would've bitten you in production.

## The Database Migration Problem 🗃️

**The hardest part nobody warns you about:** monolith databases are spaghetti. Every table has foreign keys to every other table. The `orders` table has a `user_id` FK to `users`. The `products` table has a `category_id` FK to `categories`. Everything is connected.

```
Monolith DB (The Nightmare):
┌─────────┐      ┌──────────┐      ┌──────────┐
│  users  │◄─────│  orders  │─────►│ products │
│         │      │          │      │          │
└─────────┘      └──────────┘      └──────────┘
    │                  │                 │
    ▼                  ▼                 ▼
┌─────────┐      ┌──────────┐      ┌──────────┐
│addresses│      │order_items│     │categories│
└─────────┘      └──────────┘      └──────────┘
```

**Strategy: Break the foreign keys, enforce consistency at the application layer.**

```sql
-- Old monolith: DB-level FK constraint
ALTER TABLE orders ADD CONSTRAINT fk_orders_users
  FOREIGN KEY (user_id) REFERENCES users(id);

-- After extraction: No FK to other service's DB
-- The Order Service has its own users table (denormalized)
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,  -- FK gone! Verified at app level now
  user_email VARCHAR(255) NOT NULL,  -- Denormalize what you need
  user_name VARCHAR(255) NOT NULL,
  -- ...
);
```

Yes, you have some data duplication now. Yes, that's fine. You're buying autonomy with some storage.

## Common Mistakes I Made 🪤

**Mistake #1: Migrating too many modules at once**
```
❌ "Let's migrate products, users, AND orders this quarter!"
✅ "Let's migrate products this quarter. That's it."

You have a monolith still running. New services to maintain. Two databases to keep
in sync. You do not have bandwidth for three migrations simultaneously.
```

**Mistake #2: Forgetting about shared sessions**
```
Day 1 of migration: "Why are users getting logged out when they hit the new service?"
→ The monolith stored sessions in PHP $_SESSION (server-side, on the monolith box)
→ New service doesn't have those sessions
→ Everyone is "logged out" when their request hits the new service

Fix: Migrate to Redis-based sessions FIRST, shared between monolith and new services.
This is Week 0 work before any module migration.
```

**Mistake #3: Not having a rollback plan**
```javascript
// Always keep the feature flag
// Always keep the monolith route working

// If new service is having issues at 2 AM:
featureFlags.useNewProductService = false;
// All traffic instantly goes back to monolith
// Fix new service without customer impact
```

**Mistake #4: Celebrating the "last" piece too early**
```
A scalability lesson that cost us: We removed the last module from the monolith
and deleted the codebase. Three months later, we needed to audit a transaction
from 2 years ago. The audit trail was only in the old monolith's logs.
Which were gone.

Keep archives of the old system. Even if just the database dumps. You'll thank
yourself at audit time.
```

## When to Use Strangler Fig (and When Not To) ⚖️

| Scenario | Strangler Fig? |
|---|---|
| Monolith with real users that can't go down | ✅ Perfect |
| Greenfield app, no legacy | ❌ Just build it right |
| Monolith that's less than 2 years old | ❌ Probably don't migrate yet |
| Small team (< 5 engineers) | ⚠️ Be careful - microservices have operational overhead |
| Clear module boundaries in existing code | ✅ Much easier |
| Big Ball of Mud with no clear boundaries | ⚠️ Hard - map boundaries first |
| "Big bang" rewrite was rejected by management | ✅ This is your path |

## The Realistic Timeline 📅

For a mid-size monolith (~200k lines):

```
Month 0-1:  Add facade, migrate sessions to Redis, add observability
Month 2-3:  Extract first module (notifications or search)
Month 4-6:  Extract second module (products/catalog)
Month 7-9:  Extract third module (users/auth)
Month 10-15: Extract the scary ones (orders, payments)
Month 16-18: Monolith handles nothing. Start decommission.
Month 18-24: Monolith decommissioned. 🎉
```

Not 6 months. Not a year. 18-24 months for a real system. **And that's fine.** During those 18 months, your team shipped features, your users saw zero downtime, and you learned your new architecture before betting everything on it.

## TL;DR 💡

The Strangler Fig Pattern is how grown-ups migrate systems:

1. **Add a facade first** - never touch the monolith routing
2. **Pick the boring module** - save the scary ones for when you've learned
3. **Dual-write during transition** - old and new in sync
4. **Shadow mode before live traffic** - find bugs without customer impact
5. **Feature flags for instant rollback** - 2 AM bug? Toggle and sleep
6. **One module at a time** - it's a marathon, not a sprint

**As a Technical Lead, I've learned:** the best architecture migrations are the ones users never notice. The Strangler Fig is designed to be invisible. The monolith dies quietly. The microservices take over silently. Nobody files a support ticket.

That's the goal. Not a dramatic launch. Just... one day, you realize the old thing isn't there anymore.

And the fig is standing on its own.

---

**Migrated a monolith (or currently inside one, screaming)?** I'd love to compare scars on [LinkedIn](https://www.linkedin.com/in/anuraghkp)!

**Want the facade template and feature flag setup?** It's on my [GitHub](https://github.com/kpanuragh).

*Now go strangle something* 🌿

---

**P.S.** The plant metaphor is genuinely useful. Next time someone asks why you can't "just rewrite it," tell them you're doing a Strangler Fig. Watch their face. Then explain. It's a great conversation.

**P.P.S.** The only thing worse than a 400k-line monolith is a 400k-line monolith where every developer says "don't touch that file." The Strangler Fig lets you remove "that file" one line at a time. Peacefully. With dignity.
