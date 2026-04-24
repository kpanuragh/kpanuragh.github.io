---
title: "🚦 Rate Limiting in Express: Stop Letting Bots Ruin Your Day"
date: 2026-04-24
excerpt: "Your API is an all-you-can-eat buffet, and bots are that one guy with a forklift. Here's how to add a bouncer with Express rate limiting."
tags: ["nodejs", "express", "backend", "security", "api"]
featured: true
---

# 🚦 Rate Limiting in Express: Stop Letting Bots Ruin Your Day

Imagine you open a pizza shop. You're ready to serve customers, the dough is fresh, the oven is hot. Then one guy walks in and orders 10,000 pizzas in 30 seconds. Your staff collapses, your oven explodes, and real customers leave hungry.

That guy is a bot. And your API is the pizza shop.

Rate limiting is your bouncer — politely (or not so politely) telling aggressive clients to slow the heck down. Let's add one.

---

## Why Bother?

Without rate limiting, your Express API is wide open to:

- **Brute force attacks** — hammering your `/login` endpoint with password guesses until something sticks
- **Scraping** — bots hoovering up all your data before you've had your morning coffee
- **Accidental DDoS** — a misconfigured client in a retry loop destroying your infrastructure
- **Cost spikes** — if your API calls a paid third-party service, each abusive request burns money

Rate limiting won't stop a determined, distributed attacker on its own, but it's an essential first line of defense that costs almost nothing to add.

---

## The Simplest Possible Rate Limiter

`express-rate-limit` is the go-to package. It's battle-tested, zero-dependency, and fits in about five lines.

```bash
npm install express-rate-limit
```

```js
import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 100,                  // 100 requests per window per IP
  standardHeaders: true,     // Sends RateLimit-* headers
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many requests. Breathe. Try again in 15 minutes.'
  }
});

app.use(limiter); // apply globally

app.get('/api/data', (req, res) => {
  res.json({ message: 'Here is your data, human.' });
});

app.listen(3000);
```

That's it. Every IP now gets 100 requests per 15-minute window. The `standardHeaders: true` option sends the fancy `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers so well-behaved clients know what's happening.

---

## Don't Use One-Size-Fits-All Limits

Global rate limiting is good. **Endpoint-specific** rate limiting is better.

Your `/api/articles` endpoint can probably handle 500 requests per minute — it's just reading a blog. But `/api/login`? That should be locked down harder than your ex's Instagram. A brute-force attack on a login form is a real threat, and five attempts per 15 minutes is a generous limit.

```js
// Strict limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    status: 429,
    error: 'Too many login attempts. Your keyboard needs a time-out.'
  },
  skipSuccessfulRequests: true, // only count failed attempts
});

// Generous limiter for public API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
});

app.post('/api/login', authLimiter, loginController);
app.post('/api/register', authLimiter, registerController);
app.use('/api', apiLimiter);
```

`skipSuccessfulRequests: true` is a sneaky-good option for login endpoints — legitimate users who enter the right password don't eat into their quota. Only the hammering guesses count.

---

## Scaling Up: Move State to Redis

The default `express-rate-limit` stores counters in memory. That's fine for a single server, but the moment you run multiple Node.js instances (hello, Kubernetes), each process has its own counter — meaning a bot can hit your 10 servers in rotation and effectively get 10× your limit for free.

The fix: use a shared store. Redis is the standard choice.

```bash
npm install rate-limit-redis ioredis
```

```js
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis({ host: 'localhost', port: 6379 });

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
});

app.use('/api', limiter);
```

Now all your instances share a single counter per IP. Scale to 50 pods — doesn't matter. The bot still only gets 100 requests per window, total.

---

## The Gotchas You'll Hit

**Behind a reverse proxy?** By default, `express-rate-limit` reads the IP from `req.ip`, but Nginx/load balancers set `X-Forwarded-For`. You need to tell Express to trust the proxy:

```js
app.set('trust proxy', 1); // trust one hop (your load balancer)
```

Without this, every user looks like they're coming from `127.0.0.1` and they all share a single quota. Your entire user base gets locked out. Don't skip this.

**Rate limiting by user, not IP?** IP-based limiting punishes everyone on a shared network (offices, universities, coffee shops with NAT). For authenticated routes, consider keying by user ID instead:

```js
const userLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id ?? req.ip,
});
```

---

## What to Return on 429

A bare `429 Too Many Requests` is fine, but a helpful response is better. Tell clients *when* they can retry:

```js
message: (req, res) => ({
  status: 429,
  error: 'Rate limit exceeded',
  retryAfter: res.getHeader('RateLimit-Reset'),
})
```

Well-built clients will read `Retry-After` or `RateLimit-Reset` headers and back off automatically. That's the difference between a frustrated developer and a politely rate-limited one.

---

## The Bottom Line

Rate limiting is one of those features that feels optional right up until the moment your server melts at 2am because a bored script kiddie found your `/api/login` route. Adding `express-rate-limit` takes ten minutes and saves you from a very bad morning.

Start global, tighten on sensitive endpoints, move to Redis when you scale. That's the whole playbook.

**Your API worked hard to get here — give it a bouncer it deserves.**

---

*What's the worst bot-induced disaster you've survived? Drop it in the comments — misery loves company.*
