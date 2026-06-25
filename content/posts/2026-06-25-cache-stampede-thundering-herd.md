---
title: "Cache Stampede: The Performance Win That Becomes a Catastrophe 🐂"
date: "2026-06-25"
excerpt: "You add a cache and everything gets faster — until the cache expires and 10,000 requests simultaneously obliterate your database. Here's how cache stampedes happen and how to stop them."
tags:
  - backend
  - caching
  - performance
  - redis
  - databases
featured: true
---

You did everything right. You added Redis in front of your database. Response times dropped from 400ms to 8ms. Your database CPU is lounging at 3%. You're a hero.

Then your cache key expires.

In the next 200 milliseconds, 8,000 simultaneous requests notice the cache miss, each decides *it* will be the one to recompute the value, each fires an expensive query at your database, your database keels over, and your "cached" API is now slower than it ever was without the cache.

Congratulations. You just experienced a **cache stampede** — also called the **thundering herd problem**. You added a performance optimization that turned into a time bomb.

## What Actually Happens

The sequence is painfully predictable:

1. A cache key with TTL expires (or you deploy and flush the cache).
2. Traffic is ongoing — say 500 requests/second.
3. Every incoming request checks the cache: miss.
4. Every incoming request, independently, decides to regenerate the value.
5. Every incoming request hits your database with the same expensive query *simultaneously*.
6. Your database, designed to handle maybe 50 concurrent heavy queries, gets 500 at once.
7. Queries time out. Connections pool up. Everything slows down. The cache takes longer to warm because the database is saturated. More requests pile in. Death spiral.

The cruel irony: this gets *worse* the more popular your service is. A quiet endpoint stampedes with 10 requests. A viral endpoint stampedes with 10,000.

## The Naive Fix That Doesn't Work

Your first instinct might be: "I'll just use a lock. First request acquires a lock and populates the cache; the rest wait."

```javascript
// ⚠️ This seems clever but has problems
async function getCachedValue(key) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 10);

  if (acquired) {
    const value = await expensiveDbQuery();
    await redis.setex(key, 300, JSON.stringify(value));
    await redis.del(lockKey);
    return value;
  } else {
    // Someone else has the lock... now what?
    await sleep(100);
    return getCachedValue(key); // recursive retry
  }
}
```

This partially works but has its own failure mode: if the lock holder crashes or takes too long, everyone else is sleeping and retrying in a tight loop. You've traded a stampede for a queue of sleeping requests burning through your connection pool.

## Fix 1: Probabilistic Early Expiration (XFetch)

The elegant solution comes from a 2015 paper and it's delightfully weird: **start refreshing the cache *before* it expires**, but do so probabilistically so not every request triggers a refresh.

```javascript
async function getCachedWithXFetch(key, ttl, fetchFn) {
  const raw = await redis.get(key);
  
  if (raw) {
    const { value, expiry, delta } = JSON.parse(raw);
    const now = Date.now() / 1000;
    
    // XFetch formula: recompute early if this random check passes
    // delta = time it took to compute the value last time (in seconds)
    // The longer the computation, the earlier we start refreshing
    const shouldEarlyRefresh = now - delta * Math.log(Math.random()) > expiry;
    
    if (!shouldEarlyRefresh) {
      return value; // Cache hit, still "fresh enough"
    }
    // Fall through to recompute (probabilistic early refresh)
  }

  const start = Date.now();
  const value = await fetchFn();
  const delta = (Date.now() - start) / 1000;
  
  const expiry = Date.now() / 1000 + ttl;
  await redis.setex(key, ttl, JSON.stringify({ value, expiry, delta }));
  
  return value;
}
```

What this does: as the TTL shrinks, the probability of triggering an early refresh increases. A query that takes 2 seconds to compute might start refreshing 10–20 seconds before expiry. Only one or two requests out of thousands will hit the recompute path — the rest keep serving the old value. By the time the TTL actually hits zero, a fresh value is already in cache.

This is what we use at Cubet for high-read dashboard aggregations. The math looks intimidating but the implementation is about 20 lines, and it completely eliminates stampedes.

## Fix 2: Staggered TTLs

Simpler, less elegant, still surprisingly effective: add random jitter to your TTL.

```javascript
function setWithJitter(redis, key, value, baseTtl) {
  // Add ±10% random jitter to the TTL
  const jitter = baseTtl * 0.1 * (Math.random() * 2 - 1);
  const ttl = Math.round(baseTtl + jitter);
  return redis.setex(key, ttl, JSON.stringify(value));
}
```

This spreads cache expiration events across time instead of having them all fire simultaneously. Especially useful if you bulk-loaded your cache at startup (a deployment flush) — without jitter, every key you set at 09:00:00 with a 5-minute TTL expires at 09:05:00, all at once.

Jitter won't save you from single-key hot spots (one viral item everyone's reading), but it dramatically reduces the blast radius of bulk expiration events.

## Fix 3: Background Refresh with Stale-While-Revalidate

The most operationally comfortable pattern: serve stale data while refreshing in the background.

```javascript
async function getCachedStaleWhileRevalidate(key, fetchFn, freshTtl, staleTtl) {
  const raw = await redis.get(key);
  
  if (raw) {
    const { value, cachedAt } = JSON.parse(raw);
    const age = (Date.now() - cachedAt) / 1000;
    
    if (age < freshTtl) {
      return value; // Fresh, return immediately
    }
    
    if (age < staleTtl) {
      // Stale but acceptable — refresh in background, return now
      setImmediate(async () => {
        const fresh = await fetchFn();
        await redis.setex(key, staleTtl, JSON.stringify({
          value: fresh,
          cachedAt: Date.now()
        }));
      });
      return value; // Serve stale immediately, no one waits
    }
  }

  // Cache empty or too stale — must compute synchronously
  const value = await fetchFn();
  await redis.setex(key, staleTtl, JSON.stringify({ value, cachedAt: Date.now() }));
  return value;
}
```

The user sees slightly stale data (fine for most things — dashboards, product listings, user counts) but *never* waits for a cache miss to resolve. The background refresh happens quietly. This is how HTTP's `Cache-Control: stale-while-revalidate` directive works, and it translates cleanly to server-side caching too.

## Which One Should You Reach For?

| Scenario | Best fix |
|---|---|
| Single hot key, expensive computation | XFetch probabilistic refresh |
| Bulk cache load at deploy time | TTL jitter |
| Data can be slightly stale (seconds-minutes) | Stale-while-revalidate |
| Absolute freshness required | Lock + fallback, accept the pain |

## The Monitoring Signal You're Missing

Most engineers discover their stampede via an alert — database CPU spike, p99 blowout — long after it started. The signal to watch *before* the crisis is your **cache miss rate over time**. A healthy cache miss rate is roughly flat. A stampede shows up as a sudden vertical spike followed by the miss rate crashing back to zero as the cache repopulates.

Add a counter for cache misses and graph it. If you see a repeating sawtooth pattern — misses spike every N minutes — your TTLs are synchronized and you're having mini-stampedes on a schedule.

## The Bottom Line

A cache that expires is a loaded gun pointed at your database. The expiration itself isn't the danger — it's the assumption that only one request will notice the miss. Under any real traffic, dozens or thousands will notice simultaneously.

Pick one of the three patterns above based on your freshness requirements, and add it before your next traffic spike. Because the worst time to discover you have a thundering herd is when the herd is already through the door.

Your database will thank you.
