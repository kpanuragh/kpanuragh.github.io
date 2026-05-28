---
title: "⚡ Cache Stampede: When Your Cache Becomes the Problem"
date: 2026-05-28
excerpt: "A cache miss isn't just a minor slowdown — when thousands of requests miss at once, they all charge your database simultaneously. That's a cache stampede, and it can take down a healthy system in seconds."
tags: [backend, caching, redis, performance, node-js, distributed-systems]
featured: true
---

Your cache is humming along beautifully. Hit rate is 98%. Database load is low. Life is good.

Then a popular cache key expires.

In the next 50 milliseconds, 3,000 requests arrive for that key. They all miss the cache. They all go to the database. Simultaneously. Your database, which was casually handling 40 queries per second, is now handling 3,000. It falls over. Your cache, the thing that was *protecting* your database, just caused a production incident.

Welcome to the cache stampede. Also called the thundering herd problem. Also called "why is everything on fire at 2 AM."

---

## What's Actually Happening

The setup is deceptively simple:

1. A hot key is cached with a TTL of, say, 5 minutes.
2. The TTL expires.
3. Multiple requests arrive at nearly the same time — which is normal for any popular endpoint.
4. Every single one sees a cache miss and independently decides to go fetch the data from the source.
5. The database or downstream API suddenly gets hammered with N identical queries, where N is your concurrency.

The cruel irony is that the more popular the cached item, the worse the stampede. Your most-requested data is also the data most likely to detonate when it expires.

At Cubet, we ran into this with a product catalog endpoint that was cached for 10 minutes. Works great 99.9% of the time. But every 10 minutes, like clockwork, there'd be a latency spike visible on our dashboards. It took us an embarrassingly long time to connect "cache TTL expiry" with "periodic latency blip."

---

## Solution 1: The Cache Lock (Mutex Pattern)

The classic fix: when a cache miss happens, only *one* request should go fetch the data. Everyone else waits.

```javascript
const redis = require('redis');
const client = redis.createClient();

async function getWithLock(key, fetchFn, ttl = 300) {
  // Try the cache first
  const cached = await client.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const lockTtl = 10; // seconds

  // Try to acquire the lock (SET NX = only set if not exists)
  const acquired = await client.set(lockKey, '1', {
    NX: true,
    EX: lockTtl,
  });

  if (acquired) {
    // We won the lock — go fetch and populate the cache
    try {
      const data = await fetchFn();
      await client.set(key, JSON.stringify(data), { EX: ttl });
      return data;
    } finally {
      await client.del(lockKey);
    }
  } else {
    // Someone else is fetching — wait and retry
    await new Promise(r => setTimeout(r, 50));
    return getWithLock(key, fetchFn, ttl); // retry
  }
}
```

The `SET NX` (set if not exists) is atomic in Redis, so only one process wins the lock. Everyone else backs off, waits 50ms, and retries — by which point the cache is usually warm again.

**Tradeoff:** Callers that don't win the lock experience slightly higher latency. For most use cases, that's fine — 50ms of waiting beats hammering the database. But if your `fetchFn` is slow (say, 2 seconds), you're holding 3,000 requests in a retry loop.

---

## Solution 2: Probabilistic Early Expiration

This one is clever. Instead of waiting for the key to expire, you start refreshing it *before* it expires — but with some randomness so only one process triggers the refresh at a time.

The algorithm is called **XFetch** (from a 2015 paper by Vattani, Chiusano, and Colombo, which is a genuinely fun read if you enjoy cache math):

```javascript
async function getWithEarlyExpiry(key, fetchFn, ttl = 300, beta = 1.0) {
  const raw = await client.get(key);

  if (raw) {
    const { value, expiresAt, fetchDuration } = JSON.parse(raw);
    const now = Date.now() / 1000;
    const remainingTtl = expiresAt - now;

    // XFetch formula: recompute if this random check triggers early refresh
    const shouldRecompute =
      now - fetchDuration * beta * Math.log(Math.random()) >= expiresAt;

    if (!shouldRecompute) {
      return value;
    }
    // Otherwise fall through and refresh
  }

  const start = Date.now();
  const data = await fetchFn();
  const fetchDuration = (Date.now() - start) / 1000;

  await client.set(
    key,
    JSON.stringify({
      value: data,
      expiresAt: Date.now() / 1000 + ttl,
      fetchDuration,
    }),
    { EX: ttl + 60 } // store a bit longer than the logical TTL
  );

  return data;
}
```

The key insight: slow-to-fetch items have a higher `fetchDuration`, which makes them more likely to trigger an early refresh with more remaining TTL. Fast items barely re-fetch early at all.

`beta = 1.0` is the default. Higher values mean more aggressive early recomputation (fewer stampedes, more database load). Lower values are more conservative.

**Tradeoff:** Slightly more cache refreshes than strictly necessary, but you almost never get a cold stampede. No locks, no retry loops. This is the approach I'd reach for in a read-heavy system with variable fetch times.

---

## Solution 3: Background Refresh (Stale-While-Revalidate)

The third pattern: serve stale data immediately, refresh in the background.

```javascript
const cache = new Map(); // or Redis with longer TTL

async function getStaleWhileRevalidate(key, fetchFn, ttl = 300, staleTtl = 60) {
  const entry = cache.get(key);
  const now = Date.now();

  if (entry) {
    const age = (now - entry.setAt) / 1000;
    if (age < ttl) {
      // Fresh — return immediately
      return entry.value;
    }
    if (age < ttl + staleTtl) {
      // Stale but within tolerance — return immediately, refresh async
      if (!entry.refreshing) {
        entry.refreshing = true;
        fetchFn()
          .then(data => cache.set(key, { value: data, setAt: Date.now(), refreshing: false }))
          .catch(() => { entry.refreshing = false; });
      }
      return entry.value;
    }
  }

  // Fully expired — must fetch synchronously
  const data = await fetchFn();
  cache.set(key, { value: data, setAt: now, refreshing: false });
  return data;
}
```

This is HTTP's `stale-while-revalidate` cache directive, applied at the application layer. Users always get a fast response (even if slightly stale), and refreshes happen out-of-band.

**Tradeoff:** Your data can be up to `staleTtl` seconds stale. For a product catalog or a trending posts list, that's usually completely fine. For "current account balance," probably not.

---

## Which One Should You Use?

| Pattern | Best for | Downside |
|---|---|---|
| Mutex lock | Data that must be fresh | Adds latency for waiting requests |
| XFetch / probabilistic | High-traffic, variable fetch times | Slightly more cache churn |
| Stale-while-revalidate | Anything tolerant of brief staleness | Can serve outdated data |

In practice: **stale-while-revalidate for most things, mutex for critical data**. XFetch is worth reaching for when you have very hot keys with expensive computation behind them.

---

## The Quick Win: Jittered TTLs

Even before implementing any of the above, there's one dead-simple fix: add random jitter to your TTLs.

```javascript
function ttlWithJitter(baseTtl, jitterPercent = 0.1) {
  const jitter = baseTtl * jitterPercent * Math.random();
  return Math.floor(baseTtl + jitter);
}

await client.set(key, value, { EX: ttlWithJitter(300) }); // 300–330s
```

If all your cache keys were set at the same time (say, after a cold deploy), they'll all expire at the same time without jitter. A 10% TTL jitter spreads expiries across a 30-second window and turns one massive stampede into dozens of tiny, manageable ripples.

It won't fully solve stampedes under heavy concurrent load, but it's a zero-cost improvement you can ship in five minutes.

---

## The Lesson

A cache with a hard TTL and no stampede protection is a ticking clock. Every popular key is a scheduled appointment with a latency spike. The good news: all three patterns above are genuinely straightforward to implement, and any one of them eliminates the problem entirely.

Start with jitter. Add stale-while-revalidate for anything that can tolerate it. Reach for the mutex only when freshness is non-negotiable.

Your database at 2 AM will thank you.

---

**Have you been bitten by a cache stampede in production?** Drop the story in the comments — the more embarrassing, the better. We all have at least one.
