---
title: "🔑 Idempotency Keys: Make Your API Safe to Retry (Or Pay Twice)"
date: "2026-06-29"
excerpt: "Network failures happen. Clients retry. Without idempotency keys, your API executes the same payment, email, or database write multiple times. Here's how to design APIs that are safe to retry — and why most teams skip this until their first support ticket saying 'I was charged five times.'"
tags:
  - backend
  - api-design
  - node-js
  - databases
  - distributed-systems
featured: true
---

Here's a scenario that will haunt your nightmares: a user clicks "Pay Now." Your API call goes out. The response never comes back — network timeout. The client retries. The charge goes through twice. Your on-call phone explodes at 2 AM.

This is not a hypothetical. It's Tuesday.

The fix is a pattern called **idempotency keys**, and once you understand it, you'll be genuinely angry that you didn't learn it sooner.

## What Is Idempotency, Anyway?

An operation is idempotent if doing it multiple times has the same effect as doing it once. Think of `DELETE /users/123` — whether you call it once or five times, the user ends up deleted. The HTTP spec says GET, PUT, and DELETE are idempotent. POST is not.

The problem is that POST is also the most useful verb. Creating payments, sending emails, provisioning infrastructure — all POST requests, all dangerous to retry naively.

Idempotency keys are how you make non-idempotent operations safe.

## The Idea in 30 Seconds

The client generates a unique key (usually a UUID) for each *logical operation* and sends it in a request header:

```
POST /payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Your API stores this key alongside the result of the operation. If the same key comes in again — regardless of how many times — you return the **original result** without re-executing the operation.

The client retried? Great, it gets the same `200 OK` and the same `payment_id`. No duplicate charge. No angry users. No 2 AM page.

## Building It: The Core Pattern

Here's a minimal Express implementation using Redis as the idempotency store:

```javascript
async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  const cacheKey = `idempotency:${req.user.id}:${key}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const { status, body } = JSON.parse(cached);
    return res.status(status).json(body);
  }

  // Intercept the response to cache it before sending
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    // Only cache successful responses — don't cache server errors
    if (res.statusCode < 500) {
      redis.setex(cacheKey, 86400, JSON.stringify({ status: res.statusCode, body }));
    }
    return originalJson(body);
  };

  next();
}
```

The critical detail: you only cache non-5xx responses. If your server errored, the client should retry and get a fresh attempt — not a cached failure. A cached `500` is arguably worse than no caching at all.

## The Tricky Part: Concurrent Retries

Here's where most blog posts stop, and where most implementations quietly break.

What happens if two identical requests arrive at *exactly the same time*, before the first one completes? Both see no cache entry, both proceed to execute the operation, and you're back to double-charging. Welcome to the race condition.

The fix is a short-lived distributed lock before you run your business logic:

```javascript
async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();

  const cacheKey = `idempotency:${req.user.id}:${key}`;
  const lockKey  = `idempotency:lock:${req.user.id}:${key}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    const { status, body } = JSON.parse(cached);
    return res.status(status).json(body);
  }

  // NX = only set if not exists, EX = auto-expire in 30 seconds
  const lock = await redis.set(lockKey, '1', 'NX', 'EX', 30);
  if (!lock) {
    return res.status(409).json({
      error: 'A request with this idempotency key is already in progress. Retry in a moment.'
    });
  }

  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (res.statusCode < 500) {
      await redis.setex(cacheKey, 86400, JSON.stringify({ status: res.statusCode, body }));
    }
    await redis.del(lockKey);
    return originalJson(body);
  };

  next();
}
```

At Cubet, returning `409 Conflict` for in-flight duplicates turned out to be cleaner than making clients wait. It tells them unambiguously: "back off, try again in a second." Smart retry logic handles this gracefully, and it avoids holding the lock open indefinitely if the first request crashes before releasing it.

## Scope It Right

A few things that matter in production and don't always make it into the documentation:

**Keys must be scoped per user.** If user A sends key `abc123` and user B also sends `abc123`, they should not share a cached result. Notice in the code above the cache key is `idempotency:${req.user.id}:${key}` — always include a user or tenant identifier.

**Keys should expire.** 24 hours is the Stripe standard and it's a good default. Don't store them forever — you'll accumulate garbage. Don't make them too short either, or a retry after a long network partition won't be protected.

**Document the contract clearly.** Clients need to understand: generate a new key per unique *intent*, not per *request*. If the user changes the amount and resubmits, that's a new intent — new key. This sounds obvious until your first mobile team ships a client that generates a fresh UUID on every button tap, and you spend two days wondering why idempotency isn't working.

## Where It Really Matters

Idempotency keys are table stakes for:

- **Payment processing** — the canonical use case. Stripe, Braintree, and most payment APIs require or strongly encourage them.
- **Email and SMS dispatch** — sent twice is almost always worse than not sent at all.
- **Inventory deductions** — atomic at the database level, but the API response still gets lost in transit.
- **Infrastructure provisioning** — creating a VM or a managed database shouldn't happen twice because a load balancer timed out.

They're less critical for read operations, search endpoints, or anything where duplicate execution is genuinely harmless. Don't add complexity where you don't need it.

## A Note on Database-Level Idempotency

For some operations you can lean on your database instead of Redis. A unique constraint on `(user_id, idempotency_key)` in your payments table catches duplicates at the persistence layer — the second `INSERT` fails, and you handle that by looking up and returning the existing row.

This is elegant for simple cases. It doesn't fully solve the concurrent in-flight problem (both requests can still reach your payment processor before either writes to the DB), but if your operation is a single atomic write with no external service calls, it's a valid and simpler approach. Fewer moving parts is usually the right call.

## The Takeaway

The next time you design a POST endpoint for anything with real-world side effects — money, messages, infrastructure — your checklist should include idempotency handling before it ships. It's not a nice-to-have. It's load-bearing infrastructure for any API that lives in the real world, where networks lie and clients retry.

Build the happy path. Then ask yourself: what happens if this exact request arrives twice? If the answer is "something bad," add an idempotency key.

Your on-call rotation will thank you. Your finance team will thank you. Your users who definitely do not want to be charged five times will thank you.

---

*Got burned by missing idempotency in production? I'd love to hear the war story — find me on [Twitter/X](https://twitter.com/kpanuragh).*
