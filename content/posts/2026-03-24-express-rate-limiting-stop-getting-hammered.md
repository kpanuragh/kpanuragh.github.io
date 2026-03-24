---
title: "🚦 Rate Limiting in Express: Stop Getting Hammered by Your Own API"
date: "2026-03-24"
excerpt: "Your Express API is wide open and someone's already firing 10,000 requests a minute at it. Here's how to add rate limiting before your server turns into a crater."
tags: ["nodejs", "express", "backend", "api", "security", "performance"]
featured: true
---

# 🚦 Rate Limiting in Express: Stop Getting Hammered by Your Own API

Picture this: you've just shipped your shiny new Express API. It's elegant, fast, and handles JSON like a champ. Then you check your logs at 2am and see one IP address has made **47,000 requests in the last hour**. Is it a bot? A very enthusiastic user? A disgruntled ex-colleague?

Doesn't matter. Your server is sweating, your database is crying, and you're suddenly very awake.

This is exactly why rate limiting exists — and why you should add it *before* you need it, not after your first incident.

## What Is Rate Limiting, Actually?

Rate limiting is a bouncer for your API. It tracks how many requests a client makes in a time window and starts rejecting them once they hit the limit. Simple concept, massive impact.

Without it, any client can:
- Scrape your entire dataset in minutes
- Brute-force login endpoints
- Accidentally (or intentionally) DoS your server
- Rack up your cloud bill into the stratosphere

With it, you control the flow. You're the one holding the velvet rope.

## The Quick Win: `express-rate-limit`

The fastest way to get rate limiting into an Express app is the [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit) package. It's battle-tested, zero-dependency (for the in-memory store), and takes about 5 minutes to set up.

```bash
npm install express-rate-limit
```

Now slap a global limiter on your app:

```javascript
import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();

// Global limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,   // Send RateLimit-* headers
  legacyHeaders: false,     // Don't send X-RateLimit-* headers
  message: {
    status: 429,
    error: 'Too many requests. Slow down, friend.'
  }
});

app.use(globalLimiter);

app.get('/products', (req, res) => {
  res.json({ products: [] });
});

app.listen(3000);
```

That's it. Every IP now gets 100 requests per 15-minute window. Hit the limit? They get a 429 response with a polite message to back off.

The `standardHeaders: true` option is worth highlighting — it sends `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers so well-behaved clients can throttle themselves automatically. It's the API equivalent of posting the speed limit sign instead of just handing out tickets.

## Tiered Limits: Because Not All Endpoints Are Equal

Here's where it gets interesting. A global limit is fine, but different endpoints have wildly different risk profiles. Your `/health` check? Hammer away. Your `/auth/login`? That thing needs a padlock.

```javascript
import rateLimit from 'express-rate-limit';

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 login attempts per 15 minutes
  message: {
    status: 429,
    error: 'Too many login attempts. Account temporarily locked out.'
  },
  skipSuccessfulRequests: true, // Don't count successful logins against the limit
});

// Relaxed limiter for public read endpoints
const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60,             // 1 request per second on average
});

// Apply them selectively
app.post('/auth/login', authLimiter, loginController);
app.post('/auth/register', authLimiter, registerController);

app.get('/api/posts', publicLimiter, postsController);
app.get('/api/products', publicLimiter, productsController);
```

`skipSuccessfulRequests: true` on the auth limiter is a nice touch — legitimate users who log in successfully don't burn through their quota. Only failed attempts count. This makes the limiter smarter: it's specifically targeting brute-force behavior, not punishing people who remembered their password.

## Production Reality: Ditch the In-Memory Store

The default in-memory store works great on a single server. But the moment you scale to multiple Node instances or containers, each one has its own counter. An attacker can round-robin your load balancer and effectively multiply their limit by the number of instances you have. Oops.

For production, use a shared store backed by Redis:

```javascript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
});

app.use(limiter);
```

Now all your instances share the same counters. One Redis, one source of truth, no loopholes.

The tradeoff: Redis is now a dependency. If it goes down, your rate limiter breaks. You can handle this gracefully by setting `skip` to return `true` when Redis is unavailable, but then you're back to unprotected endpoints. Pick your poison based on your threat model.

## Trust Your Proxy (But Verify First)

One subtle gotcha: if your Express app sits behind a load balancer or reverse proxy (Nginx, AWS ALB, Cloudflare), `req.ip` will always be the proxy's IP — not the real client's IP. Your rate limiter will throttle *everyone* simultaneously instead of per-client.

Fix it with one line:

```javascript
app.set('trust proxy', 1); // Trust one hop of proxy headers
```

This tells Express to use the `X-Forwarded-For` header to determine the real client IP. Set the number to however many proxy hops sit between the internet and your app. If you're not sure, check your infrastructure docs — getting this wrong in either direction is a security problem.

## What Rate Limiting Doesn't Do

Rate limiting is powerful but not magic. It won't:

- **Stop a distributed attack** — a botnet with 10,000 IPs each sending 99 requests gets right through per-IP limits. That's what WAFs and DDoS protection services are for.
- **Replace authentication** — don't use rate limiting as your only protection for sensitive data. Proper auth comes first.
- **Fix a slow API** — if your endpoint takes 5 seconds to respond, rate limiting just makes it take longer for more people. Optimize the endpoint first.

Think of rate limiting as one layer in a defense-in-depth strategy, not the whole strategy.

## The TL;DR

1. **Add a global limiter** with `express-rate-limit` as a baseline — takes 5 minutes
2. **Add stricter limits on auth endpoints** — 5-10 requests per window is plenty
3. **Switch to Redis** when you scale past a single instance
4. **Set `trust proxy`** if you're behind a load balancer

Your API will thank you. Your on-call schedule will thank you even more.

Now go add that rate limiter before the bots find you. They always find you. 🤖

---

*Building Express APIs and want to go deeper? Check out the posts on [Node.js Streams](/posts/2026-03-23-nodejs-streams-stop-loading-the-whole-file) and [the Event Loop](/posts/2026-03-22-nodejs-event-loop-stop-blocking-the-bouncer) — because a rate-limited API that blocks the event loop is still a bad time.*
