---
title: "🔥 The Hot Key Problem: When One Row Melts Your Entire Cache Cluster"
date: "2026-08-20"
excerpt: "Your cache cluster has ten nodes at 5% CPU and one node on fire. Meet the hot key problem — the celebrity user, the viral post, the flash-sale SKU that overwhelms a single shard no matter how much you scale out."
tags: ["redis", "caching", "performance", "distributed-systems", "backend"]
featured: true
---

Picture this: your Redis cluster has ten nodes, evenly sharded, humming along at 5% CPU. Beautiful. Then someone posts something that goes viral, or a flash sale drops, or a celebrity logs in — and suddenly one node is pegged at 100% CPU while the other nine are still bored out of their minds.

You didn't run out of capacity. You ran out of *one key's* capacity. Welcome to the hot key problem — the part of caching nobody warns you about because "just add more nodes" is the advice for everything else, and it does absolutely nothing here.

## Why sharding doesn't save you

Consistent hashing (you've probably read a post about it — everyone has) solves the *distribution* problem: keys spread evenly across nodes, and adding a node only reshuffles a small slice of the keyspace. That's great when your traffic is evenly spread across keys too.

But real traffic isn't uniform. It's Zipfian — a small number of keys get a disproportionate share of requests. `user:12345` (a celebrity account), `product:flash-sale-item`, `config:feature-flags` — these get hit thousands of times a second while millions of other keys get hit once a day. Consistent hashing still routes all million requests for that one hot key to the *same* physical node, because that's the entire point of hashing — same key, same shard, always.

So no matter how many nodes you add, that one node eats the whole storm alone.

## How it actually shows up

At Cubet, we saw this play out on a leaderboard feature — one Redis key (`leaderboard:global`) got read on literally every page load. Traffic was healthy for months, then a marketing push doubled daily actives overnight. CPU on one shard spiked to 100%, replication lag on that node crept up, and every client waiting on that connection started timing out — while eight other shards sat idle. The dashboards looked like sharding was broken. It wasn't. Sharding worked exactly as designed; the workload just didn't fit the assumption sharding makes.

The tell is almost always the same: cluster-wide metrics look fine (average CPU, average QPS), but per-node metrics show one node is a clear outlier. If you're only graphing averages, you'll miss this every time.

## Fix #1: stop asking the cache at all

The cheapest fix for a hot *read* key is to not hit the distributed cache for it in the first place. Add a tiny local, in-process cache (a `Map` with a short TTL) in front of Redis for keys you know get read-heavy traffic:

```js
const localCache = new Map();
const LOCAL_TTL_MS = 2000;

async function getHotKey(key, fallback) {
  const cached = localCache.get(key);
  if (cached && Date.now() - cached.at < LOCAL_TTL_MS) {
    return cached.value;
  }
  const value = await redis.get(key);
  localCache.set(key, { value, at: Date.now() });
  return value;
}
```

A two-second local TTL sounds negligible, but if you have 50 app server instances each serving thousands of requests per second, a 2-second local cache turns "50,000 requests/sec hitting Redis" into "25 requests/sec hitting Redis" (one per instance, per TTL window). Redis never even feels it.

## Fix #2: split the key, not the traffic

When you can't tolerate any staleness (or the key gets *written* frequently too), split the hot key into N shadow copies and pick one at random per request:

```js
const REPLICAS = 8;

async function readSplitKey(baseKey) {
  const shard = Math.floor(Math.random() * REPLICAS);
  return redis.get(`${baseKey}:shard:${shard}`);
}

async function writeSplitKey(baseKey, value) {
  await Promise.all(
    Array.from({ length: REPLICAS }, (_, i) =>
      redis.set(`${baseKey}:shard:${i}`, value)
    )
  );
}
```

Now `leaderboard:global` is really `leaderboard:global:shard:0` through `:shard:7`, and consistent hashing happily spreads those eight keys across eight different physical nodes. Reads fan out across all of them; writes get slightly more expensive (you're writing N copies), which is exactly the trade you want for a read-heavy hot key — pay a little extra on the rare write to save a lot on the constant reads.

## Fix #3: coalesce concurrent requests

If the hot key is expensive to *compute* (not just to fetch — think a cache miss that triggers a heavy DB aggregation), a thundering herd of simultaneous misses can take down your database even with a cache in place. Request coalescing collapses concurrent in-flight requests for the same key into a single upstream call:

```js
const inFlight = new Map();

async function coalescedFetch(key, loader) {
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = loader(key).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}
```

A hundred requests arriving in the same millisecond for the same missing key now trigger exactly one database call instead of a hundred.

## The real lesson

Horizontal scaling assumes traffic distributes horizontally. Hot keys are proof that it often doesn't, and no amount of adding nodes fixes a problem that lives entirely inside one node's slice of the keyspace. The fix isn't "more infrastructure" — it's recognizing that a handful of your keys need fundamentally different treatment than the rest.

Next time you're debugging a cache cluster that "should" be fine on paper, don't just check the averages — graph per-shard CPU and per-key hit counts. If you find a spike, you've found your hot key. Go split it, cache it locally, or coalesce its misses — just don't reach for "add another node" and wonder why nothing changes.
