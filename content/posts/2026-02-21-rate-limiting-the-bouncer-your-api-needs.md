---
title: "Rate Limiting: The Bouncer Your API Desperately Needs 🚪"
date: "2026-02-21"
excerpt: "Without rate limiting, your API is an open bar with no closing time. Learn how to add the bouncer that keeps your server alive when traffic goes sideways."
tags: ["nodejs", "express", "backend", "api", "security", "performance"]
featured: true
---

# Rate Limiting: The Bouncer Your API Desperately Needs 🚪

Imagine you open a restaurant. No reservations, no waitlist, no limit on how many people can walk in. Sounds generous, right? Now imagine 10,000 people show up at once. Your kitchen implodes. Your waitstaff quits. The health inspector shows up. Nobody gets fed.

That's your API without rate limiting.

Rate limiting is the bouncer standing at the door saying, *"You've had enough requests for now, buddy. Come back in a minute."* It's one of those things that feels optional — right up until the moment a scrapy script, a bored teenager, or a misconfigured client absolutely hammers your server into the ground.

Let's fix that.

## Why Rate Limiting Actually Matters

There are three scenarios where rate limiting saves your life:

1. **Abuse & scraping** — Someone decides to download your entire product catalog at 10,000 requests per second.
2. **Accidental self-DDoS** — A frontend bug puts a `fetch()` call inside an infinite loop. You did this. We've all done this.
3. **Credential stuffing** — Bots spray username/password combos at your `/login` endpoint until something sticks.

None of these people are announcing their intentions. Your server just quietly melts while you're asleep.

## The Simplest Possible Rate Limiter in Express

The easiest way to add rate limiting to an Express app is `express-rate-limit`. It's battle-tested, configurable, and takes about four lines to set up.

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';
import express from 'express';

const app = express();

// Global limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,   // Return limit info in `RateLimit-*` headers
  legacyHeaders: false,     // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests. Slow down.',
    retryAfter: 'Check the Retry-After header.',
  },
});

app.use(globalLimiter);

app.get('/api/products', (req, res) => {
  res.json({ products: [] });
});
```

That's it. Every IP now gets 100 requests per 15-minute window. Exceed it, and they get a `429 Too Many Requests` response. The `standardHeaders: true` option adds `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers so well-behaved clients know when to back off.

## Tighter Limits for Sensitive Endpoints

A global 100 req/15min is fine for browsing, but your `/login` endpoint shouldn't get anywhere near that generous. Credential stuffing attacks burn through 100 attempts in seconds.

Apply stricter limits to specific routes:

```javascript
// Strict limiter for auth routes: 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Don't count successful logins against the limit
  message: {
    error: 'Too many login attempts. Try again later.',
  },
});

// Stricter limiter for password reset: 3 per hour
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    error: 'Too many password reset requests.',
  },
});

app.post('/auth/login', authLimiter, loginHandler);
app.post('/auth/reset-password', passwordResetLimiter, resetPasswordHandler);
app.use('/api', globalLimiter, apiRouter);
```

`skipSuccessfulRequests: true` is a nice touch for login — legitimate users who log in successfully don't eat into their quota. Only the failed attempts count, which is exactly what you want to throttle.

## Beyond the Basics: What to Think About

Once the basics are wired up, a few things are worth considering before you ship this to production.

**Store rate limit state in Redis, not memory.**
The default in-memory store works great locally. In production with multiple Node processes or replicas, each process keeps its own counter — so an attacker can just round-robin between instances and bypass the limit entirely. Use `rate-limit-redis` or any of the other available stores to centralize state.

**Rate limit by more than just IP.**
IP-based limiting is easy to defeat with residential proxy pools. For authenticated endpoints, limit by user ID instead. A compromised IP can be rotated; a compromised account is your actual problem.

**Return useful headers.**
The `standardHeaders` option adds headers that tell clients how many requests they have left and when the window resets. Clients that respect these headers (well-behaved SDKs, browsers with retry logic) will naturally back off without you needing to block them. Clients that ignore them are probably up to no good anyway.

**Don't rate-limit health checks.**
Your load balancer and monitoring tools hit `/health` or `/ping` constantly. Exclude these endpoints from your limiter or you'll get false positives and frantic 3 AM alerts.

## The Mental Model

Think of your API as a bar, not a vending machine. A vending machine has no judgment — it dispenses as fast as you can press buttons. A bar has a bartender who notices when someone's had too many and cuts them off. You don't need the customer to explain themselves. You just set the rule, enforce it consistently, and move on.

Rate limiting isn't about punishing legitimate users. It's about making sure your server is still standing for them when someone else tries to abuse it. The bouncer isn't there to ruin the party — they're there so the party can keep going.

## Start Here

If you're running an Express API and you don't have rate limiting yet, here's your action list:

1. `npm install express-rate-limit`
2. Add a global limiter with a reasonable window (100–200 req / 15 min is a safe start)
3. Add a strict limiter on `/login`, `/register`, and any SMS/email-sending endpoints
4. Add Redis-backed storage before you scale past one process
5. Monitor your `429` rate in production — if it spikes, something interesting is happening

Your future self at 3 AM will thank you.

---

*Have a war story about an API getting hammered without rate limiting? I'd love to hear it — find me on [GitHub](https://github.com/kpanuragh) and let's commiserate.*
