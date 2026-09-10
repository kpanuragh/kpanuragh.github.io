---
title: "🐘 Cache Stampede: When Everyone Shows Up at Once"
date: "2026-09-10"
excerpt: "Your cache key expires at 2:00:00 AM and 8,000 requests hit your database in the same millisecond. This is the cache stampede problem, and here's how to actually fix it."
tags: ["backend", "performance", "caching", "redis", "distributed-systems"]
featured: true
---

Picture this: your homepage's "trending posts" list is cached in Redis with a nice clean 60-second TTL. Traffic is steady, life is good. Then, at some unlucky millisecond, that key expires — and 8,000 concurrent requests, all asking "hey, what's trending?", find nothing in the cache and all sprint to your database at the exact same instant.

Your database, which was happily serving cached responses a moment ago, now has to run the same expensive aggregation query 8,000 times in parallel. It falls over. Not because your app is under real load — because your *cache* decided to take a coffee break and everyone panicked at once.

This is the **cache stampede** (also called the "thundering herd" problem, or the "dog-pile effect" if you like your incidents named after animals). It's one of those bugs that's invisible in dev, invisible in staging, and shows up in production exactly when a popular key happens to expire during peak traffic.

## The naive cache-aside pattern (and why it breaks)

Most of us start with something like this:

```javascript
async function getTrendingPosts() {
  const cached = await redis.get('trending:posts');
  if (cached) return JSON.parse(cached);

  // Cache miss — go compute the expensive thing
  const posts = await db.query(EXPENSIVE_TRENDING_QUERY);
  await redis.set('trending:posts', JSON.stringify(posts), 'EX', 60);
  return posts;
}
```

This works great — right up until the key expires under load. Every single one of those 8,000 requests independently checks the cache, independently finds nothing, and independently decides *it* is the one responsible for repopulating it. Nobody's talking to each other. It's like a group project where everyone assumes someone else will email the professor, except in this version everyone emails at once and the professor's inbox catches fire.

## Fix #1: the distributed lock

The classic fix is to make sure only *one* request rebuilds the cache while everyone else either waits briefly or serves something stale:

```javascript
async function getTrendingPosts() {
  const cached = await redis.get('trending:posts');
  if (cached) return JSON.parse(cached);

  const lockKey = 'trending:posts:lock';
  const gotLock = await redis.set(lockKey, '1', 'NX', 'EX', 10);

  if (gotLock) {
    try {
      const posts = await db.query(EXPENSIVE_TRENDING_QUERY);
      await redis.set('trending:posts', JSON.stringify(posts), 'EX', 60);
      return posts;
    } finally {
      await redis.del(lockKey);
    }
  }

  // Someone else is already rebuilding it — wait a bit and retry the cache
  await sleep(50);
  return getTrendingPosts();
}
```

`SET ... NX EX 10` is an atomic "only I get to do this" check. Everyone else politely backs off and polls again. It's not glamorous, but it turns 8,000 database queries into 1.

The downside: every straggler is now blocking on a retry loop, and if your database query genuinely takes longer than a few hundred milliseconds, you've traded a stampede for a pile of slow requests all waiting on the same lock. Better than a crash, but still not free.

## Fix #2: probabilistic early expiration (my favorite)

The lock approach treats expiration as a hard cliff. A more elegant idea — used in Facebook's caching infrastructure, among others — is to let cache entries recompute themselves *slightly before* they actually expire, with the probability increasing as the deadline approaches. It's sometimes called "XFetch."

```javascript
async function getTrendingPosts() {
  const entry = await redis.get('trending:posts'); // stores { value, expiresAt, computeTimeMs }
  const now = Date.now();

  if (entry) {
    const { value, expiresAt, computeTimeMs } = JSON.parse(entry);
    const timeLeft = expiresAt - now;

    // Roll the dice: the closer we are to expiry, the more likely
    // *this* request decides to refresh early — before anyone hits a hard miss.
    const shouldRefreshEarly = Math.random() * computeTimeMs > timeLeft;

    if (!shouldRefreshEarly) return value;
  }

  const start = Date.now();
  const posts = await db.query(EXPENSIVE_TRENDING_QUERY);
  const computeTimeMs = Date.now() - start;

  await redis.set('trending:posts', JSON.stringify({
    value: posts,
    expiresAt: Date.now() + 60_000,
    computeTimeMs,
  }), 'EX', 60);

  return posts;
}
```

The beauty here is that there's no hard "cliff" moment where everyone finds an empty cache simultaneously — refreshes get spread probabilistically across the tail end of the TTL window, so by the time the key would have actually expired, it's already been quietly renewed by one of the many requests passing through. No locks, no polling loops, no thundering herd.

## What I'd actually reach for in production

On my team at Cubet, we mostly reach for a hybrid: probabilistic early refresh for hot, expensive keys (trending feeds, dashboard aggregates), combined with a short "stale-while-revalidate" fallback — serve the last known value immediately while one background request refreshes it. Users get a fast response, the database only gets hit once, and nobody notices the cache ever expired at all.

The pattern to avoid, regardless of which fix you pick: never let TTL expiration and "who rebuilds the cache" be the same unguarded decision made independently by every single caller. That's the root cause every time.

## Try it yourself

Next time you're setting a TTL on a cache key, ask: *what happens if 1,000 requests hit this at the exact moment it expires?* If the honest answer is "the database falls over," you've got a stampede waiting to happen. Add a lock, add jitter, add probabilistic early expiration — just don't leave it to chance (well, unless the chance is the deliberate kind).

Got a caching horror story of your own? I'd love to hear about the time your Redis key expired at the worst possible moment — drop it in the comments.
