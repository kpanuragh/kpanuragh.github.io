---
title: "🚦 Node.js Rate Limiting: Stop Letting Bots Eat Your Server Alive"
date: 2026-05-12
excerpt: "Your API is an all-you-can-eat buffet and bots are filling their plates 10,000 times per minute. Here's how to be the bouncer your Express app desperately needs."
tags: ["nodejs", "express", "backend", "security", "performance"]
featured: true
---

# 🚦 Node.js Rate Limiting: Stop Letting Bots Eat Your Server Alive

Imagine you opened a restaurant. No menu prices, no reservation limits, no bouncers at the door. Just "come in, eat whatever you want, as fast as you want." Sounds lovely until someone shows up with a bus full of hungry robots who eat 10,000 meals per minute.

That's your unprotected API.

Rate limiting is the bouncer, the reservation system, and the "please wait to be seated" sign all rolled into one. And if you're running a Node.js/Express app without it, you're that restaurant — one bad day away from a very expensive AWS bill and zero legitimate users getting served.

Let's fix that.

## Why Rate Limiting Isn't Optional

Before the code, let's be real about what happens without rate limiting:

- **Brute force attacks**: Someone tries every possible password on your `/login` endpoint at machine speed.
- **Scraping**: Competitors vacuum up your entire product catalog in minutes.
- **Accidental self-destruction**: A misconfigured client in a retry loop hammers your database into the ground.
- **DDoS amplification**: One angry person with a script makes your server cry uncle.

The funny part? Rate limiting is shockingly easy to add. There's almost no excuse not to.

## The "Just Works" Solution: express-rate-limit

For most Express apps, `express-rate-limit` is the swiss army knife you need. It's battle-tested, simple, and doesn't require Redis out of the box.

```bash
npm install express-rate-limit
```

Here's a basic setup that covers 90% of use cases:

```javascript
import express from 'express';
import rateLimit from 'express-rate-limit';

const app = express();

// Global limiter: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please slow down.',
    retryAfter: 'Check the Retry-After header'
  }
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 login attempts per 15 minutes
  skipSuccessfulRequests: true, // Don't count successful logins
  message: { error: 'Too many login attempts. Take a breather.' }
});

app.use(globalLimiter);              // Apply globally
app.post('/login', authLimiter, handleLogin);
app.post('/register', authLimiter, handleRegister);
```

Notice the `skipSuccessfulRequests: true` on the auth limiter — that's a nice trick. Legitimate users who log in successfully don't burn through their limit. Only the failed attempts (the ones that look like brute force) count against the quota.

## Level Up: Per-User Limits with Redis

The in-memory store works great for a single server. But the moment you scale horizontally — two instances, three, a whole fleet — each server has its own memory and has no idea what the others are tracking. User A could hit the limit on Server 1 and then happily keep hammering through Server 2.

For production distributed systems, you need a shared store. Redis is the standard choice:

```javascript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60,             // 60 requests per minute (1 per second average)
  store: new RedisStore({
    sendCommand: (...args) => redisClient.sendCommand(args),
  }),
  keyGenerator: (req) => {
    // Rate limit by authenticated user ID if available, else by IP
    return req.user?.id ?? req.ip;
  },
  handler: (req, res, next, options) => {
    console.warn(`Rate limit hit: ${req.user?.id ?? req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Rate limit exceeded',
      limit: options.max,
      windowMs: options.windowMs,
      retryAfter: Math.ceil(options.windowMs / 1000)
    });
  }
});
```

The `keyGenerator` function is where the magic happens. By defaulting to user ID when authenticated, you avoid punishing an entire office (sharing one IP behind a NAT) because one employee's script went rogue. Each user gets their own bucket.

## The Headers Matter More Than You Think

One thing developers frequently skip: the response headers. When you rate limit someone, tell them about it. The `RateLimit-*` headers (standardized in RFC 6585 and RFC 9110) give clients everything they need to behave politely:

```
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1747094400
Retry-After: 847
```

A well-behaved API client reads `Retry-After` and waits before retrying. A poorly designed client ignores headers and hammers you repeatedly — but that's their problem (and now they're in your logs as a bad actor). Always include `standardHeaders: true` and `legacyHeaders: false` for the modern standard format.

## What NOT to Do

A few mistakes I see constantly in the wild:

**Don't rate limit only by IP behind a load balancer.** If your app sits behind a reverse proxy (nginx, AWS ALB, Cloudflare), `req.ip` will be the proxy's IP, not the user's. Set `app.set('trust proxy', 1)` to make Express use the `X-Forwarded-For` header correctly. Miss this and you'll rate limit *everyone* with the same limit because they all look like they're coming from one IP.

**Don't use the same limit for everything.** Your `/health` endpoint can handle thousands of hits — it's just returning `{ status: 'ok' }`. Your `/ai/generate` endpoint that calls a paid API? That one should be on a very tight leash.

**Don't forget to monitor it.** Rate limiting silently swallowing requests is how you end up debugging why "the app works fine in testing but users keep complaining." Log when limits are hit, alert on spikes, and review the patterns — sometimes rate limit hits are the first sign of an attack in progress.

## The Bottom Line

Rate limiting is one of those unsexy, invisible features that nobody notices when it works and everybody screams about when it's missing. It takes about 15 minutes to add to an Express app, protects you from a whole category of attacks and abuse, and keeps your legitimate users from getting crushed by someone else's bad behavior.

Add the global limiter today. Add stricter limits on your auth endpoints. Upgrade to Redis when you scale. Watch your logs.

Your server will thank you. Your wallet will thank you. Your 3 AM pager will thank you most of all.

---

**What's your current rate limiting setup?** Are you using express-rate-limit, rolling your own middleware, or relying entirely on a CDN/WAF layer? Drop a comment or reach out — I'm always curious how people solve this at different scales.
