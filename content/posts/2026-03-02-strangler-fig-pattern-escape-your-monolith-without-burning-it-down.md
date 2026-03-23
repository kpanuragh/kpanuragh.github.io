---
title: "The Strangler Fig Pattern: Escape Your Monolith Without Burning It Down 🌿🏚️"
date: "2026-03-02"
excerpt: "Our 'temporary' Laravel monolith turned 4 years old and nobody could add a feature without breaking three others. Then I discovered the Strangler Fig Pattern — the only sane way to modernize a legacy system without a 6-month big bang rewrite that ends careers."
tags: ["\\\"architecture\\\"", "\\\"scalability\\\"", "\\\"system-design\\\"", "\\\"microservices\\\"", "\\\"refactoring\\\""]
featured: "true"
---

# The Strangler Fig Pattern: Escape Your Monolith Without Burning It Down 🌿🏚️

**Hot take:** "Let's just rewrite it from scratch" is the most dangerous sentence in software engineering.

I've seen it kill projects. I've seen it kill teams. I said it myself once, got approved, spent 8 months on the rewrite, and shipped something *worse* than what we had.

Our "new" system was missing features nobody documented. Edge cases the old code handled without anyone knowing. Business logic buried so deep we didn't discover it until angry customers called on launch day. 😱

**My CTO's face when I explained why we needed to roll back the entire "rewrite":** Not great. Not great at all.

That incident introduced me to the **Strangler Fig Pattern** — the architectural approach that lets you modernize a legacy system incrementally, without gambling your entire product on a Big Bang rewrite. Seven years later, it's my default answer when someone says "this codebase is a disaster."

## What Even IS a Strangler Fig? 🌿

A strangler fig is a real plant. It grows around a host tree, slowly replacing it from the outside in. By the time the host tree dies and rots away, the strangler fig has become its own fully self-supporting structure.

**Martin Fowler named this pattern** after watching one of these trees in Australia and thinking "that's exactly how we should be modernizing legacy systems."

Instead of:
```
❌ Month 1-8:  Stop everything, rewrite the whole system
❌ Month 9:    Deploy the new system
❌ Month 9.5:  Discover 400 undocumented features in the old code
❌ Month 9.6:  Panic
```

You do this:
```
✅ Month 1:   Identify ONE piece of the monolith to extract
✅ Month 2:   Build new service alongside the monolith
✅ Month 3:   Redirect traffic for that ONE piece to the new service
✅ Month 4:   Monolith still handles everything else (it's fine!)
✅ Month 5:   Extract ANOTHER piece. Repeat forever.
✅ Year 2:    Old monolith handles 10% of what it used to
✅ Year 3:    Monolith is gone. You barely noticed.
```

The old system keeps running throughout. Users never notice. Your team stays sane.

## The Architecture in Practice 🏗️

The pattern has three moving parts:

```
┌────────────────────────────────────────────────┐
│                  FACADE / PROXY                 │
│      (API Gateway, Nginx, or Load Balancer)     │
│                                                 │
│   /checkout/*  ──────────────────► New Service  │
│   /products/*  ──────────────────► New Service  │
│   /everything-else/* ──────────► Old Monolith   │
└────────────────────────────────────────────────┘
         │                             │
         ▼                             ▼
┌────────────────┐           ┌──────────────────┐
│   NEW SERVICES │           │  OLD MONOLITH    │
│   (extracted)  │           │  (still running) │
│                │           │                  │
│  Checkout API  │           │  Auth, Orders,   │
│  Products API  │           │  Users, Admin... │
└────────────────┘           └──────────────────┘
```

**The facade is the secret sauce.** Clients talk to ONE endpoint. They have no idea that behind the scenes, you're routing requests to two completely different codebases.

The monolith gets strangled. Slowly. Safely.

## When Designing Our E-Commerce Backend... 💸

We had a 4-year-old Laravel monolith. 200,000 lines of code. One brave developer who understood the checkout flow (she had left the company). Zero test coverage on the critical path.

Every sprint we'd touch the orders module and accidentally break the product catalog. Touch the user auth and somehow the inventory would start miscounting. It was like a game of Jenga where every piece was load-bearing.

**The breaking point:** Our Black Friday sale. We needed to add promotional codes to checkout. Simple, right? Eight developers. Three weeks. Four production incidents. One emergency rollback at 11 PM on a Friday.

I went home, ate an entire pizza in silence, and started reading about the Strangler Fig Pattern at midnight.

**What we extracted first:** The product catalog. Read-heavy. No write dependencies on other modules. Self-contained. Perfect candidate.

Here's the nginx config that started the whole migration:

```nginx
# The facade: clients still hit one host
server {
    listen 443;
    server_name api.ourstore.com;

    # NEW: Product catalog now goes to the microservice
    location /v1/products {
        proxy_pass http://products-service:3000;
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    # NEW: Product search also migrated
    location /v1/search {
        proxy_pass http://products-service:3000;
    }

    # EVERYTHING ELSE: Still goes to the Laravel monolith (for now!)
    location / {
        proxy_pass http://laravel-monolith:80;
    }
}
```

**Clients see nothing different.** Same domain. Same API structure. But behind the scenes, `GET /v1/products` now hits our shiny new Node.js service.

**A scalability lesson that cost us:** We didn't migrate the data first. Our new products service was calling BACK to the monolith's database. We had extracted the service but not the data. The new service was as slow as the old one because it was still hitting the same bottlenecked MySQL instance. Extract the **service AND its data** or you're just adding a network hop. 🎯

## The Data Migration That Actually Works 📦

Here's the part everyone skips and then regrets.

**The naive approach:**

```
Step 1: Build new service
Step 2: Stop monolith, migrate all data to new DB
Step 3: Start new service
Step 4: Hope nothing is on fire
```

This is a maintenance window. Your users are waiting. This is basically a mini big bang. Don't do it.

**The strangler approach:**

```
Phase 1: DUAL WRITES
         Both monolith AND new service write to BOTH databases
         New service reads from its own DB
         Monolith reads from its own DB
         → Zero downtime. Both systems stay in sync.

Phase 2: VERIFY
         Run comparison queries for 48-72 hours
         Both DBs should have identical data
         Fix any discrepancies

Phase 3: CUTOVER
         New service reads from its own DB (already doing this ✅)
         Monolith STOPS writing to new service's DB
         Monolith reads from its own DB (still)
         Old DB becomes the backup

Phase 4: CLEANUP
         Remove dual-write logic
         Archive old DB data
         Celebrate 🎉
```

```javascript
// Dual-write pattern during migration phase
class ProductRepository {
    async updateProduct(id, data) {
        // Write to OLD database (monolith's MySQL)
        await this.legacyDB.query(
            'UPDATE products SET ? WHERE id = ?',
            [data, id]
        );

        // Write to NEW database (microservice's PostgreSQL)
        // If this fails, we log it but DON'T fail the request
        // Old DB is source of truth during migration!
        try {
            await this.newDB.products.update({ where: { id }, data });
        } catch (error) {
            logger.error('Dual-write to new DB failed', { id, error: error.message });
            // Alert, but don't crash! Fix the sync gap later.
        }

        return { success: true };
    }
}
```

**The dual-write safety net:** If the new service's DB falls behind or has issues, the monolith's data is intact and unaffected. You can always fall back.

## Feature Flags: The Strangler Fig's Best Friend 🚦

When designiing our e-commerce backend, we never cut traffic over 100% on day one. That's how you get paged at 3 AM.

```javascript
// Feature flag controls which system serves traffic
class CheckoutRouter {
    async handleCheckout(request) {
        const useNewCheckout = await featureFlags.isEnabled(
            'new-checkout-service',
            {
                userId: request.userId,
                rolloutPercentage: 5  // Start with 5% of users
            }
        );

        if (useNewCheckout) {
            return await this.newCheckoutService.process(request);
        } else {
            return await this.monolithCheckout.process(request);
        }
    }
}
```

**Our actual migration timeline for checkout:**

```
Week 1:  5%  of traffic → new service (internal users + beta testers)
Week 2:  10% of traffic → monitor error rates, latency, conversion
Week 3:  25% of traffic → first real stress test
Week 4:  50% → if metrics look good, keep going
Week 5:  100% → 🎉 migration complete, monolith route removed
```

**A scalability lesson that cost us:** We skipped the gradual rollout once. Went straight to 100% for the user profile service. One character encoding bug we hadn't tested affected every user trying to log in with a non-ASCII name. That's 12% of our users. Support tickets for two hours until rollback. Gradual rollouts aren't optional — they're how you sleep at night. 😴

## The Anti-Patterns That Will Break You 🪤

### Anti-Pattern #1: Strangling Everything at Once

```
❌ BAD: "Let's extract checkout, auth, products, AND inventory this quarter!"
✅ GOOD: "Let's extract products this month, nothing else."
```

The more services you're migrating simultaneously, the higher the chance of data sync issues, circular dependencies, and confused developers. **One service at a time. Always.**

### Anti-Pattern #2: Forgetting About Shared State

Our monolith had a shared Redis cache. Products, users, sessions — all in one Redis instance with shared key namespaces.

```
❌ Problem: New products service reads stale cache written by monolith
           Monolith reads cache written by new service with different schema
           Cache poisoning, incorrect data, sadness
```

**Solution:** Give each service its own cache namespace or its own Redis instance. The extra infrastructure cost is worth it.

### Anti-Pattern #3: Circular Dependencies

```
❌ You have:
   Products Service calls Inventory Service
   Inventory Service calls Products Service
   You now have a distributed monolith.
   Congratulations, that's worse than what you started with.
```

If two services constantly call each other, they shouldn't be two services. **Merge them, or redesign the boundary.**

### Anti-Pattern #4: No Observability During Migration

```javascript
// You NEED this during strangler fig migration:
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        metrics.histogram('request.duration', Date.now() - start, {
            service: 'products-v2',         // Which service?
            route: req.path,
            status: res.statusCode,
            migrated: true                  // Is this the new or old path?
        });
    });
    next();
});
```

**As a Technical Lead, I've learned:** You can't compare "before and after" if you're not measuring both simultaneously. Instrument EVERYTHING before you start cutting traffic over. Then you can say with confidence "the new service is 40ms faster" instead of "I think it's probably fine?"

## When to Use It vs. When to NOT 🤔

**Use the Strangler Fig when:**
- ✅ You have a working monolith that needs modernization (not rewriting from scratch)
- ✅ Business features keep shipping (you can't stop the world for 8 months)
- ✅ The monolith has separable domains (products vs users vs payments)
- ✅ Your team is nervous about big bangs (they should be — experience earned the hard way)

**Don't use it when:**
- ❌ The monolith is so coupled that extracting anything requires touching everything else
- ❌ The monolith is being retired entirely (just migrate, don't gradually strangle)
- ❌ Your team has no operational experience running distributed systems (learn to walk before you run)
- ❌ You just want to use a cool new framework (not a good enough reason to invest 6 months of migration work)

**The honest talk:** Strangler Fig works best when the value of the new architecture justifies the migration cost. If your monolith is working fine and scaling okay, **don't strangle it**. "Because microservices are cool" is not a business case.

## The Migration Playbook 📋

Here's what I actually do for every extraction:

```
1. IDENTIFY the right module to extract next
   - Self-contained (few dependencies)
   - High-value (performance bottleneck or team bottleneck)
   - Well-understood (at least one dev knows this code cold)

2. BUILD the new service in parallel
   - New repo, new deployment, new database
   - Dual-write from day one
   - Feature flag set to 0% (nobody uses it yet)

3. VERIFY for 48+ hours
   - Data consistency checks
   - Load test the new service alone
   - Chaos test: what happens if the new service is down?

4. GRADUATE traffic gradually
   - 5% → 10% → 25% → 50% → 100%
   - Watch error rates at every step
   - Have a rollback plan (just flip the feature flag)

5. CLEAN UP after full cutover
   - Remove old code from monolith
   - Stop dual-writes
   - Update documentation
   - Team retro: what did we learn?
```

## The Real Payoff 🏆

When designing our e-commerce backend using the strangler fig approach, here's what we actually achieved:

```
Before (monolith, everything together):
  - Deploy: 45 minutes, entire service restarts
  - Scaling: Must scale the ENTIRE app for ANY traffic spike
  - Team velocity: 3 features/week (afraid to touch anything)
  - Incident blast radius: One bug can take down everything

After (gradual strangler fig, 18 months):
  - Deploy: 3 minutes, only the changed service restarts
  - Scaling: Scale only the products service during a product launch
  - Team velocity: 8 features/week (teams work independently)
  - Incident blast radius: Auth bug? Only auth is down. Products still serve.
```

We didn't need a 6-month rewrite freeze. We didn't need a "migration sprint." We just... kept shipping features AND migrating. Bit by bit. Plant by plant. The fig grew. The tree rotted. Nobody noticed until it was over.

## TL;DR: Strangler Fig Survival Guide 🎯

1. **Never do a big bang rewrite** — 8 months of darkness with no guarantee of success
2. **Route via a facade/proxy first** — nginx, API Gateway, or a load balancer
3. **Extract data with dual-writes** — old DB stays source of truth during migration
4. **Use feature flags** — start at 5% traffic, work up to 100% over weeks
5. **Extract one service at a time** — parallel migrations = parallel disasters
6. **Instrument both old and new systems** — you can't improve what you can't measure
7. **Design clear service boundaries** — circular dependencies = distributed monolith hell

The strangler fig pattern isn't exciting. There's no "launch day." There's no Big Announcement. There's just a quieter production environment, a happier team, and a monolith that gets slightly lighter every sprint.

That's the architecture win that doesn't make headlines but absolutely makes careers. 🌿

---

**Modernizing a legacy system?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've strangled three monoliths now and I'm happy to compare battle scars!

**Want to see the facade patterns I use?** Check out my [GitHub](https://github.com/kpanuragh) for real-world nginx configs and feature flag patterns from production migrations.

*Now go identify that first module to extract. Start small. Start today.* ⚡

---

**P.S.** The 8-month rewrite that I mentioned at the beginning? The monolith it was meant to replace is still running. The "rewrite" was quietly shelved after the rollback. The old codebase is now 7 years old. Some legacy systems simply cannot die. They must be strangled. 🌿

**P.P.S.** If someone on your team is proposing a 6-month complete rewrite, send them this post. If they send it back with "but our case is different" — that's what everyone says. It's never different. Use the strangler fig. 🙏
