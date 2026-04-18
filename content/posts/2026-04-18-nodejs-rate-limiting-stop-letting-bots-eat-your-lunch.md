---
title: "🚦 Node.js Rate Limiting: Stop Letting Bots Eat Your Lunch"
date: 2026-04-18
excerpt: "Your API is an all-you-can-eat buffet — and bots are the guy who shows up with Tupperware. Rate limiting is the bouncer that fixes that."
tags: ["nodejs", "express", "backend", "security", "api"]
featured: true
---

# 🚦 Node.js Rate Limiting: Stop Letting Bots Eat Your Lunch

Imagine you open a restaurant. The food is great, the vibe is immaculate, and on opening day a single guy walks in, sits down, and orders 10,000 plates of pasta — simultaneously. Your kitchen explodes. Your real customers leave. You cry.

That's what happens when you ship an Express API without rate limiting.

Your endpoints are public. Bots are relentless. And without a bouncer at the door, every scraper, credential stuffer, and rage-clicking user is a potential kitchen fire. Let's fix that.

---

## What Even Is Rate Limiting?

Rate limiting caps how many requests a client can make in a given time window. Think of it as:

> "You get 100 requests per minute. After that, you get a polite `429 Too Many Requests` and a shame walk back to the waiting area."

It protects you from:

- **Brute-force attacks** — someone hammering your `/login` endpoint with 50,000 password guesses
- **Scraping** — bots vacuuming your entire product catalog at machine speed
- **Accidental DDoS** — a misconfigured client in a tight loop nuking your own API
- **Cost overruns** — if you pay per request downstream (AI APIs, SMS, email), unlimited calls = unlimited bills

---

## The Express Way: `express-rate-limit`

The fastest way to add rate limiting to an Express app is the `express-rate-limit` package. It's battle-tested, has sensible defaults, and takes about 10 minutes to set up properly.

```bash
npm install express-rate-limit
```

Here's a global rate limiter that covers your entire API:

```js
import rateLimit from 'express-rate-limit';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per window per IP
  standardHeaders: true,     // sends RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests, take a breath and try again later.',
  },
});

app.use(globalLimiter);
```

Slap that on your `app.use()` stack early — before your routes — and every IP is now limited to 100 requests per 15 minutes globally. Simple. Effective. Done.

---

## Targeted Limiting: Protect Your Sensitive Endpoints

Global limits are a good baseline, but some endpoints deserve their own bouncers. Your `/login` route shouldn't get 100 attempts per 15 minutes — that's still enough to brute-force a weak password.

Create stricter limiters for sensitive routes:

```js
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10,                   // only 10 login attempts per hour
  skipSuccessfulRequests: true, // don't count successful logins
  message: {
    error: 'Too many login attempts. Account temporarily locked.',
  },
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3, // 3 reset emails per hour — that's already generous
});

app.post('/auth/login', authLimiter, loginHandler);
app.post('/auth/reset-password', passwordResetLimiter, resetHandler);
```

`skipSuccessfulRequests: true` is a nice touch on auth endpoints — legitimate users who log in successfully don't burn through their quota. Only failed attempts count. Bots hammering wrong passwords hit the wall; real users glide through.

---

## Going Further: Redis for Distributed Rate Limiting

Here's the trap that catches everyone: `express-rate-limit`'s default store is **in-memory**. That means each Node.js process has its own counter. If you're running 4 instances behind a load balancer, a bot can make 100 requests to each instance for a total of 400 "allowed" requests. Your limit is now effectively useless.

The fix is a shared store — Redis is the go-to:

```bash
npm install rate-limit-redis ioredis
```

```js
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
  standardHeaders: true,
  legacyHeaders: false,
});
```

Now all your instances share one counter per IP. A bot that hits instance A 60 times and instance B 41 times hits the limit — as intended.

If you're on a single server and never plan to scale horizontally, the in-memory store is fine. But if you're behind a load balancer or running multiple processes with `cluster`, Redis is non-negotiable.

---

## Don't Forget the Headers

Good rate limiting sends headers so clients know what's happening:

```
RateLimit-Limit: 100
RateLimit-Remaining: 43
RateLimit-Reset: 1713456000
Retry-After: 843
```

`standardHeaders: true` in `express-rate-limit` handles this automatically. These headers let well-behaved API clients back off gracefully instead of hammering your server until they get blocked. If you're building a public API, this is the difference between a professional product and an amateur one.

---

## Practical Tips That Save You Later

**Use a key generator for authenticated routes.** By default, `express-rate-limit` uses the client's IP. But if your users are behind a corporate proxy, 500 employees share one IP and they'll all hit the limit together. For authenticated endpoints, key on the user ID instead:

```js
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip, // user ID if authenticated
});
```

**Return meaningful errors.** A raw `429` with no body is confusing. Tell users what happened and when they can retry. Include `Retry-After` and a human-readable message. Your support inbox will thank you.

**Whitelist internal services.** If you have internal microservices calling your API, you don't want them hitting rate limits. Use `skip` to bypass limits for trusted internal IPs or tokens:

```js
skip: (req) => req.headers['x-internal-token'] === process.env.INTERNAL_TOKEN,
```

**Monitor your 429s.** Log every rate-limit hit. A spike of 429s on `/login` at 3am is a brute-force attack in progress. You want to know about that — ideally before your users do.

---

## The Bottom Line

Rate limiting is one of those features that feels optional until the day it saves you from a catastrophic incident. It takes an afternoon to implement properly and can save you from DDoS bills, credential stuffing attacks, and API abuse that costs you real money.

Start with a global limit, tighten the screws on sensitive endpoints, and switch to Redis the moment you add a second server. Your future self — sitting calmly with a coffee instead of frantically debugging a production incident — will be grateful.

Now go add a bouncer to your API. The bots are already in the parking lot.

---

**Got rate limiting horror stories or clever tricks?** Drop them in the comments — I'd love to hear how creatively bots have tried to ruin your day.
