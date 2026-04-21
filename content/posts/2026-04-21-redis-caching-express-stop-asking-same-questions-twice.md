---
title: "🗃️ Redis Caching in Express: Stop Asking the Same Questions Twice"
date: "2026-04-21"
excerpt: "Every time your server hits the database for the same data, it's like asking a colleague the same question ten times in a row. Redis caching lets you write the answer on a sticky note — and grab it instantly next time."
tags: ["nodejs", "express", "redis", "caching", "backend", "performance"]
featured: true
---

# 🗃️ Redis Caching in Express: Stop Asking the Same Questions Twice

Imagine you work in an office. Every time someone asks you "What's the WiFi password?", you walk all the way to the server room, check the router, walk back, and answer them. Then five minutes later, someone else asks. You do it again. And again.

You're the bottleneck. You're the slow database query. You're the reason the API response is 800ms when it could be 3ms.

**The fix?** Write the password on a sticky note. Slap it on your monitor. Answer instantly.

That sticky note is Redis. Let's talk about how to use it properly in your Express app.

---

## What Redis Actually Is (No Fluff)

Redis is an in-memory key-value store. It lives in RAM, which makes reads blazingly fast — we're talking sub-millisecond fast. It's not a replacement for your database; it's a **cache layer** that holds frequently-read, rarely-changing data so your database can breathe.

Common use cases:
- Caching API responses
- Storing session data
- Rate limiting counters (hey, we covered that one!)
- Leaderboards, pub/sub, and queues

Today we're focused on **response caching** — the thing that'll make your `/api/products` endpoint go from "please wait..." to "here you go, instantly."

---

## Setting Up Redis with Express

First, install the dependencies:

```bash
npm install redis express
```

Then create a Redis client and connect it:

```javascript
import express from 'express';
import { createClient } from 'redis';

const app = express();
const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

redis.on('error', (err) => console.error('Redis error:', err));
await redis.connect();

app.listen(3000, () => console.log('Server running on port 3000'));
```

Nothing magic yet. We've just told our Express app "hey, there's a Redis server over there, and here's how to reach it." Now let's actually use it.

---

## The Cache-Aside Pattern (The Classic)

The most common caching pattern is **cache-aside** (also called lazy loading):

1. Request comes in → check the cache first
2. Cache hit? Return instantly. Done.
3. Cache miss? Hit the database, store the result in cache, return the data.

Here's what that looks like as Express middleware:

```javascript
// A reusable caching middleware factory
function cacheMiddleware(ttlSeconds = 60) {
  return async (req, res, next) => {
    const cacheKey = `cache:${req.originalUrl}`;

    try {
      const cached = await redis.get(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
      }

      // Intercept res.json to cache the response before it's sent
      const originalJson = res.json.bind(res);
      res.json = async (data) => {
        await redis.setEx(cacheKey, ttlSeconds, JSON.stringify(data));
        res.setHeader('X-Cache', 'MISS');
        return originalJson(data);
      };

      next();
    } catch (err) {
      // If Redis is down, don't crash — just skip the cache
      console.error('Cache error:', err);
      next();
    }
  };
}

// Apply it to any route
app.get('/api/products', cacheMiddleware(300), async (req, res) => {
  const products = await db.query('SELECT * FROM products');
  res.json(products);
});
```

The `X-Cache: HIT` header is a nice touch — it lets you verify in DevTools or Postman that caching is actually working. Your future self will thank you.

Notice the `try/catch` around Redis calls. **Never let a caching layer take down your app.** If Redis goes offline at 2am, your users should still get data — just a little slower. Fail gracefully, not catastrophically.

---

## TTL: The Expiry Date on Your Sticky Note

`setEx` sets a key with a TTL (time-to-live) in seconds. After that, Redis automatically deletes it. This is crucial because stale data is worse than slow data.

Think about TTL in terms of "how often does this actually change?"

| Data | Suggested TTL |
|------|--------------|
| Product catalog | 5–10 minutes |
| User profile | 1–2 minutes |
| Sports scores | 10–30 seconds |
| Stock prices | 1–5 seconds |
| Auth tokens | Match token expiry |

Don't cache everything forever. Don't cache nothing. Find the sweet spot for your data's freshness requirements.

---

## Cache Invalidation: The Hard Part

There are only two hard problems in computer science: cache invalidation, naming things, and off-by-one errors.

When data changes, your cache needs to know. The simplest approach: **delete the relevant cache keys on mutations**.

```javascript
app.put('/api/products/:id', async (req, res) => {
  await db.query('UPDATE products SET ...', [...]);

  // Invalidate the affected cache entries
  await redis.del('cache:/api/products');
  await redis.del(`cache:/api/products/${req.params.id}`);

  res.json({ success: true });
});
```

For more complex scenarios, use a **naming convention** that lets you delete keys by pattern — like prefixing all product-related keys with `products:` so you can flush them in one sweep with `SCAN` + `DEL`.

---

## What You Get

Let's say your database query takes 120ms. With Redis caching and a 5-minute TTL:

- **First request**: 120ms (cache miss, hits DB, warms cache)
- **Next 300 requests** (over 5 minutes): ~1ms each (cache hit)
- **Database load**: reduced by ~99% for read-heavy endpoints

That's not an optimization — that's a transformation. Your database goes from sweating under load to sipping tea.

---

## Quick Wins Before You Go

- **Monitor cache hit rates** — if it's below 70%, your TTLs might be too short or your keys too granular.
- **Don't cache user-specific data on shared keys** — always include the user ID in the key for personalized responses.
- **Use `redis-cli monitor`** to watch cache activity in real time during development.
- **Set a `maxmemory-policy`** in Redis config (e.g., `allkeys-lru`) so it gracefully evicts old data instead of erroring when full.

---

## Wrapping Up

Caching with Redis isn't just a performance trick — it's a fundamental shift in how your app handles repeated work. Stop walking to the server room every time. Write it on the sticky note.

The pattern is simple: check cache → return or fetch → store → serve. The discipline is in the TTL choices, the invalidation strategy, and making sure your app survives when Redis has a bad day.

**Try it this week**: pick one slow, read-heavy endpoint in your app, wrap it with the `cacheMiddleware` above, and watch your response times plummet. Then check those DB query logs and enjoy the silence.

Got questions about Redis patterns, cache stampedes, or distributed caching? Drop them in the comments — I read every one.
