---
title: "🐘 Cache Stampede: The Thundering Herd That Eats Your Database"
date: "2026-08-13"
excerpt: "Your cache TTL expires at 3am. Ten thousand requests notice at the exact same millisecond. All ten thousand miss, and all ten thousand politely ask your database to compute the same expensive thing at once. This is how a cache — the thing protecting your database — becomes the thing that kills it."
tags: ["caching", "redis", "performance", "backend", "distributed-systems"]
featured: true
---

Here's a plot twist nobody warns you about when you first add a cache: the cache itself can be the thing that takes your database down. Not because it's slow. Because it's *too good* at synchronizing failure.

Picture the setup. You've got a popular endpoint — a product page, a leaderboard, a "trending" feed — backed by a query that takes 800ms to compute. You do the sensible thing and cache the result in Redis with a 60-second TTL. Traffic is happy. CPU on the database drops. Everyone gets a raise.

Then the TTL hits zero. And in the same millisecond, five hundred requests that were all waiting on that same key all get a cache miss, all shrug, and all go run the same 800ms query against your database at once. Your database, which was previously doing this query once every 60 seconds, is now doing it five hundred times in the same instant. This is a **cache stampede** (also called a thundering herd, and if you've ever worked with `flock()` on a Unix socket, the name will feel personally familiar).

The cruel part is that caching made this worse, not better. Without a cache, that load would have been spread out — a query here, a query there, mostly independent. The cache synchronized everyone's clock. It turned "occasional load" into "simultaneous load," and simultaneous load is exactly what tips a database from "fine" into "connection pool exhausted, alerts firing, someone's phone buzzing at 3am."

## Why this is sneakier than it sounds

The failure mode is deceptive because your cache hit rate looks *great* right up until it doesn't. 99.8% hit rate, dashboards green, and then one hot key expires and you get a correlated spike that looks nothing like normal traffic — it looks like a mini DDoS you launched against yourself. I've seen this exact shape of incident: a cache warms fine in staging (low traffic, nobody notices the gap), then the same TTL ships to production where a popular key gets tens of thousands of concurrent readers, and the recompute stampede saturates the DB connection pool in under a second. The graphs are almost pretty — a flat line, then a cliff.

## Fix #1: request coalescing (a.k.a. "dogpile prevention")

The core idea: when a key is missing, only *one* caller should be allowed to go compute it. Everyone else should wait for that result instead of racing to recompute it themselves.

```js
const inflight = new Map(); // key -> Promise

async function getCached(key, computeFn, ttlSeconds) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  // Someone's already fetching this key — piggyback on their promise
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await computeFn();
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
```

This handles the stampede *within a single process* — five hundred concurrent requests hitting the same Node process collapse into one database call. It doesn't help if you're running twenty instances behind a load balancer, though, because each instance has its own `inflight` map. For that you need coalescing at the cache layer itself, which is what a distributed lock buys you.

## Fix #2: a lock in Redis, held by whoever gets there first

```js
async function getCachedDistributed(key, computeFn, ttlSeconds) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `lock:${key}`;
  const gotLock = await redis.set(lockKey, "1", "NX", "EX", 10);

  if (!gotLock) {
    // Someone else is computing it — poll briefly, then bail to a stale value
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const retry = await redis.get(key);
      if (retry) return JSON.parse(retry);
    }
    return computeFn(); // last resort: just eat the cost, don't block forever
  }

  try {
    const value = await computeFn();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    return value;
  } finally {
    await redis.del(lockKey);
  }
}
```

This caps the number of concurrent recomputes across your whole fleet to one (per key), while everyone else politely waits for the winner to finish. The 10-second lock TTL is a safety valve — if the process holding the lock crashes mid-computation, the lock self-destructs instead of wedging every future request forever.

## Fix #3: never let the cache actually go empty

The cleverest fix skips the race entirely: serve the *stale* value while quietly refreshing it in the background, so nobody ever sees a bare cache miss for a hot key.

```js
// Store value with an "early expiry" marker well before the real TTL
await redis.set(key, JSON.stringify({ value, freshUntil: Date.now() + 45_000 }), "EX", 120);

async function getStaleWhileRevalidate(key, computeFn) {
  const raw = await redis.get(key);
  if (!raw) return computeFn(); // truly cold — nothing to serve

  const { value, freshUntil } = JSON.parse(raw);
  if (Date.now() > freshUntil) {
    // Stale but present — serve it immediately, refresh async
    computeFn().then((fresh) =>
      redis.set(key, JSON.stringify({ value: fresh, freshUntil: Date.now() + 45_000 }), "EX", 120)
    );
  }
  return value;
}
```

This is the same idea behind HTTP's `stale-while-revalidate` header, just implemented by hand. The tradeoff is honest: users occasionally see data that's a few seconds old, in exchange for your database never seeing a synchronized spike. For a leaderboard or a trending feed, that's almost always a trade worth making.

## Fix #4: jitter the TTLs

The cheapest fix of all, and the one people skip because it feels too simple to work: don't expire every related key at exactly the same second.

```js
const jitterSeconds = Math.floor(Math.random() * 15);
await redis.set(key, JSON.stringify(value), "EX", 60 + jitterSeconds);
```

If you cached a hundred product pages at the same deploy time with the same fixed 60-second TTL, they'll all expire together, forever, in lockstep — a stampede baked right into your rollout schedule. A few seconds of random jitter spreads the recomputation over a window instead of a single instant, which alone can turn a sharp spike into a manageable ripple.

## Pick based on what you can tolerate

Coalescing and locking cap concurrent recomputes but still make someone wait. Stale-while-revalidate never makes anyone wait but trades in freshness. Jitter is free but only smooths things out, it doesn't eliminate the underlying race. On a team I led at Cubet Techno Labs, we ended up layering jitter (cheap, always-on) with stale-while-revalidate for the handful of endpoints that actually got hammered — belt and suspenders, but each layer earned its keep.

The one thing not to do is nothing. A cache with a fixed TTL and no stampede protection isn't a performance optimization sitting quietly in the corner — it's a loaded spring pointed at your database, and it only takes one popular key and one bad moment for it to go off. Go check your caching layer for exactly this pattern today; if you find a bare `GET` → miss → recompute with no coalescing anywhere in the chain, that's your next fix, not your next feature.
