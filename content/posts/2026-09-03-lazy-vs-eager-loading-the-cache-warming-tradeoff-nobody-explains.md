---
title: "🐢🐇 Lazy vs Eager Loading: The Cache-Warming Tradeoff Nobody Explains"
date: "2026-09-03"
excerpt: "Lazy loading is the intern who only does work when someone asks. Eager loading is the overachiever who does everything before you need it. At scale, picking the wrong one either melts your database on deploy day or wastes half your infra budget precomputing things nobody reads."
tags: ["caching", "performance", "redis", "backend", "distributed-systems"]
featured: true
---

Every caching tutorial teaches you `cache-aside`: check the cache, miss, go to the database, store the result, return it. Five lines of code, works great in the demo, ships to production, and then on Monday morning after a deploy wipes the cache, your database gets hit with the exact same traffic spike it would've gotten with *no cache at all* — except now it's a surprise.

That's lazy loading biting you. And the fix isn't "add more cache" — it's understanding that lazy and eager loading are two entirely different bets about *when* you're willing to pay the cost of computing something.

## The two philosophies

**Lazy loading (cache-aside):** don't compute anything until someone asks for it. First request pays the tax, every request after that is cheap.

```js
async function getProduct(id) {
  const cached = await redis.get(`product:${id}`);
  if (cached) return JSON.parse(cached);

  const product = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  await redis.set(`product:${id}`, JSON.stringify(product), 'EX', 3600);
  return product;
}
```

**Eager loading (cache warming / refresh-ahead):** compute it before anyone asks, on a schedule or a trigger, so the cache is never empty when traffic arrives.

```js
async function warmTopProducts() {
  const topIds = await db.query(
    'SELECT id FROM products ORDER BY views_last_24h DESC LIMIT 500'
  );
  for (const { id } of topIds) {
    const product = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    await redis.set(`product:${id}`, JSON.stringify(product), 'EX', 3600);
  }
}
// run on a cron, or right after deploy, before traffic hits
```

Both are "correct." Neither is universally right. The whole game is knowing which failure mode you'd rather have.

## Lazy loading's problem: the empty cache is a landmine

Lazy loading only stores what's actually been requested — which sounds efficient, until you realize it means your cache is *always* empty for anything new: a fresh deploy, a cold cache after a Redis failover, a newly popular item that just went viral. All of those look identical to your database: a wall of cache misses arriving at once, all asking for the same expensive query, all landing at the same moment.

I've watched this happen on a deploy at Cubet — nothing wrong with the code, the release was clean, but the deploy flushed the cache layer as a side effect of a config change, and for about ninety seconds the database took the full unfiltered weight of production traffic. It recovered, but it was a self-inflicted incident with a completely avoidable cause: we'd built a system that was fast *only after* it had already been asked the same question once.

That's the core tradeoff: lazy loading never wastes work (it only computes what's demanded), but it guarantees that "first demand" is always a cold, unprotected hit.

## Eager loading's problem: you're guessing, and guessing costs money

Eager loading flips it — precompute before demand arrives, so the cache is always warm. Great, until you ask: precompute *what*? You're now forecasting demand instead of reacting to it, and forecasts are wrong.

Warm the top 500 products and you're fine for the homepage. Try to warm "every product, just in case" and you're now running a batch job that recomputes millions of rows on a schedule, most of which nobody looks at between refreshes. You've traded a *possible* database spike for a *guaranteed* background load, all the time, whether or not it's needed. At small scale this is a rounding error. At scale it's a line item — I've seen warming jobs that cost more in compute than the traffic they were protecting against, because someone set the refresh interval to "every 5 minutes" without ever measuring whether the underlying data changed that often.

## The pattern that actually works: hybrid, with jitter

Production systems rarely pick one pure strategy. The usual answer is lazy loading as the default, with eager warming reserved for the narrow set of keys you *know* are hot — and a stampede guard on the lazy path for everything else, because "first request pays the tax" becomes "first thousand *concurrent* requests all pay the tax" the moment something goes viral:

```js
async function getProductSafely(id) {
  const cached = await redis.get(`product:${id}`);
  if (cached) return JSON.parse(cached);

  // stampede guard: only one request per key computes it,
  // others wait on the same in-flight promise
  return coalesce(`product:${id}`, async () => {
    const product = await db.query('SELECT * FROM products WHERE id = $1', [id]);
    // jittered TTL so thousands of keys set at once don't all expire together
    const ttl = 3600 + Math.floor(Math.random() * 300);
    await redis.set(`product:${id}`, JSON.stringify(product), 'EX', ttl);
    return product;
  });
}
```

The TTL jitter matters more than people give it credit for — if you warm or populate a batch of keys at the same moment, they all expire at the same moment too, and you've just scheduled your own thundering herd for exactly one hour from now. A few minutes of random spread turns a synchronized cliff into a gentle, staggered slope.

## How to actually decide

Ask one question: **is the access pattern predictable, or is it demand-driven?**

- Predictable and small (homepage, top-N leaderboard, config, feature flags) → eager. You know exactly what to warm, and the cost of precomputing it is trivial compared to the cost of a cold miss on high-traffic paths.
- Unpredictable or long-tail (individual user profiles, arbitrary product pages, search results) → lazy, with a stampede guard. You can't afford to precompute the entire tail, and you shouldn't try.
- Anything that gets nuked on deploy or failover → add a warming step to your deploy pipeline for the predictable subset, even if the rest of the cache stays lazy. A five-minute warmup script that repopulates your top 100 keys before traffic is routed back in is cheap insurance against the exact incident I described above.

## The takeaway

Lazy vs eager isn't a style preference, it's a bet on whether you can predict what's about to be asked for. Bet on the predictable stuff eagerly, let the long tail stay lazy, and put a stampede guard between "cache miss" and "database" so the two strategies don't quietly become the same incident wearing different names.

Next time someone says "just cache it," ask them when it gets populated — before the request or because of it. That one answer tells you whether you're looking at a performance win or a deploy-day landmine.
