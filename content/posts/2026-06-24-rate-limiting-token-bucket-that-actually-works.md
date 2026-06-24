---
title: "🪣 Rate Limiting That Actually Works: The Token Bucket Algorithm"
date: "2026-06-24"
excerpt: "Fixed-window rate limiting is lying to you. Here's why the token bucket algorithm is what your API actually needs — and how to implement it without losing your mind."
tags:
  - API Security
  - Rate Limiting
  - Backend
  - Redis
  - Node.js
featured: true
---

Your API has rate limiting. You added `429 Too Many Requests` responses. You feel good about yourself.

And then some clever user sends 999 requests in the last second of window one and 999 in the first second of window two — effectively hammering you with 1998 requests in two seconds, well over your "1000 per minute" limit.

Congratulations: your rate limiter is a prop.

This is the **fixed-window problem**, and almost everyone falls for it. Let me show you why it happens and how the token bucket algorithm actually solves it.

---

## The Problem With Fixed Windows

The naive approach looks like this:

```python
# Fixed window - looks safe, isn't
def is_allowed(user_id: str, limit: int = 1000) -> bool:
    window_key = f"ratelimit:{user_id}:{int(time.time() // 60)}"
    count = redis.incr(window_key)
    if count == 1:
        redis.expire(window_key, 60)
    return count <= limit
```

The logic is clean. The security isn't. Here's the attack:

- Window resets at `:00` every minute
- Attacker sends 1000 requests from `:58` to `:59` — all allowed
- Window resets at `:00`
- Attacker sends 1000 more from `:00` to `:01` — all allowed
- You just served 2000 requests in 2 seconds to one client

Your backend just ate a ~16x burst. If your downstream database or third-party service can't absorb that, you have an availability problem dressed up as a rate limiting problem.

---

## The Token Bucket Algorithm

Think of it as a literal bucket of tokens:

- The bucket holds up to `capacity` tokens (say, 100)
- Tokens **refill at a steady rate** — e.g., 10 tokens/second
- Each API request **consumes one token**
- If the bucket is empty: `429`. If there are tokens: request proceeds

The key insight is that **bursts are allowed, but bounded**. A user can burn through their full 100 tokens in a second if they have them, but then they're throttled to 10 req/s until the bucket refills. No more double-window exploits.

Here's a Redis-based implementation in Node.js that I've shipped at Cubet on API gateways handling client-facing integrations:

```typescript
import Redis from 'ioredis';

interface TokenBucketConfig {
  capacity: number;       // max tokens in bucket
  refillRate: number;     // tokens added per second
  windowSeconds: number;  // key TTL (set > capacity/refillRate)
}

async function tokenBucket(
  redis: Redis,
  key: string,
  config: TokenBucketConfig
): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const now = Date.now() / 1000; // seconds with millisecond precision
  const { capacity, refillRate, windowSeconds } = config;

  const luaScript = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])

    local data = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(data[1]) or capacity
    local last_refill = tonumber(data[2]) or now

    -- Refill tokens based on elapsed time
    local elapsed = now - last_refill
    tokens = math.min(capacity, tokens + elapsed * refill_rate)

    local allowed = 0
    if tokens >= 1 then
      tokens = tokens - 1
      allowed = 1
    end

    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, ttl)

    return { allowed, math.floor(tokens) }
  `;

  const result = await redis.eval(
    luaScript, 1, key,
    capacity, refillRate, now, windowSeconds
  ) as [number, number];

  const allowed = result[0] === 1;
  const remaining = result[1];
  const retryAfter = allowed ? undefined : Math.ceil(1 / refillRate);

  return { allowed, remaining, retryAfter };
}
```

A few things worth noting here:

**The Lua script runs atomically.** This is non-negotiable. If you do read-modify-write as three separate Redis commands, you have a race condition under concurrent requests. Lua scripts in Redis execute as a single unit — no interleaving.

**Tokens are stored as floats.** We compute `elapsed * refillRate` which might be `0.37` tokens. Keeping the precision means the bucket fills smoothly rather than in integer jumps that create micro-bursts at refill boundaries.

---

## Wiring It Into Express Middleware

```typescript
function createRateLimiter(redis: Redis, config: TokenBucketConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Key by IP for unauthenticated, by user ID for authenticated
    const identifier = req.user?.id ?? req.ip;
    const key = `ratelimit:${req.path}:${identifier}`;

    const { allowed, remaining, retryAfter } = await tokenBucket(
      redis, key, config
    );

    res.setHeader('X-RateLimit-Limit', config.capacity);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      res.setHeader('Retry-After', retryAfter!);
      return res.status(429).json({
        error: 'Too Many Requests',
        retryAfter,
      });
    }

    next();
  };
}

// Usage: 100 tokens max, refill 10/sec, TTL 30s
app.use('/api/', createRateLimiter(redis, {
  capacity: 100,
  refillRate: 10,
  windowSeconds: 30,
}));
```

Always send `X-RateLimit-Remaining` and `Retry-After`. Clients that do the right thing (back off and retry) will thank you. Clients that don't will hit the wall again faster — that's their problem.

---

## Tuning Your Bucket

The three numbers you pick (`capacity`, `refillRate`, `windowSeconds`) define your entire rate limiting policy:

| Scenario | Capacity | Refill Rate | Result |
|---|---|---|---|
| Public read API | 60 | 1/sec | 1 req/sec sustained, burst to 60 |
| Authenticated user | 100 | 10/sec | 10 req/sec sustained, burst to 100 |
| Webhook ingest | 500 | 50/sec | 50/sec sustained, absorbs event storms |
| Password reset | 5 | 0.003/sec | ~10/hour sustained, 5 burst max |

For password resets, login endpoints, and anything authentication-adjacent: **set capacity low and refill slow**. A legitimate user doesn't need 100 password reset attempts. An attacker trying to brute-force OTPs does.

---

## What This Doesn't Solve

Token bucket stops per-key abuse — but it won't save you if an attacker has 10,000 IP addresses (botnets, residential proxies). For that layer you need:

- **Fingerprinting** beyond IP (device headers, TLS fingerprinting)
- **Aggregate rate limits** at the account or org level, not just per-IP
- **Anomaly detection** when burst patterns look coordinated

Rate limiting is one defense layer, not a moat. But it's a foundational one, and doing it correctly — with token bucket instead of fixed windows — is the difference between a policy that holds under adversarial conditions and one that crumbles at the seams.

---

## The One-Sentence Summary

Fixed windows let double-window attacks double your burst capacity; token buckets refill continuously so the math holds at every millisecond, not just at window boundaries.

Get this right and you've removed one of the most common "but we had rate limiting!" post-incident surprises from your future.

---

*Have a war story about rate limiting going sideways in production? Hit me up on [Twitter/X](https://x.com/imanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh) — I collect these.*
