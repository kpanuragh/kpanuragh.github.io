---
title: "Distributed Locks: Stop Two Servers Stepping on Each Other's Feet 🔒⚡"
date: "2026-03-17"
excerpt: "Our e-commerce backend was charging customers twice because two Lambda functions raced to process the same order simultaneously. Distributed locking saved us - and here's everything I learned the hard way."
tags: ["\"architecture\"", "\"scalability\"", "\"system-design\"", "\"distributed-systems\"", "\"redis\""]
featured: "true"
---

# Distributed Locks: Stop Two Servers Stepping on Each Other's Feet 🔒⚡

**True story:** We had a promo where customers got a "first-time buyer" discount. One Monday morning I got a Slack message: "Hey, why did this customer get the discount TWICE?"

They'd clicked "Apply Discount" really fast. Two Lambda functions spun up simultaneously. Both checked "has this user used the discount?" — both answered "No" — both applied it.

Two Lambda functions walked into the same bar and both ordered a round. The customer paid once, got two rounds. We lost $40.

And that was just ONE customer. We had 12,000 orders that day. 😱

Welcome to the world of distributed locking — where you teach multiple servers to take turns!

## What's the Problem, Exactly? 🤔

In a single-server world, concurrency is handled with mutexes. One thread locks a resource, does its thing, unlocks. Simple.

In a distributed world (multiple servers, multiple Lambda instances, multiple workers), you can't use a regular mutex. Server A and Server B don't share memory. They don't even know each other exists.

This is called a **race condition** at scale:

```
Timeline:
t=0ms  Server A: checks if order #123 is processed → "No"
t=1ms  Server B: checks if order #123 is processed → "No"
t=2ms  Server A: starts processing order #123
t=3ms  Server B: starts processing order #123
t=100ms Server A: charges card $99.99 ✅
t=101ms Server B: charges card $99.99 ✅
t=200ms Customer: "why did you charge me twice?!" 😤
```

The fix? A distributed lock. Before any server does "the dangerous thing", it must acquire a lock. If it can't get the lock, it backs off.

## The Redis Solution (My Go-To) 🔴

Redis has an atomic command called `SET NX PX` (Set if Not eXists, with expiry in ms). This is the foundation of most distributed locks.

**The naive version:**

```javascript
const redis = require('redis');
const client = redis.createClient();

async function acquireLock(resourceKey, ttlMs = 30000) {
  const lockKey = `lock:${resourceKey}`;
  const lockValue = `${process.pid}-${Date.now()}`; // Unique identifier

  // SET key value NX PX milliseconds
  // NX = Only set if key doesn't exist
  // PX = Expire after N milliseconds
  const result = await client.set(lockKey, lockValue, {
    NX: true,
    PX: ttlMs
  });

  return result === 'OK' ? lockValue : null;
}

async function releaseLock(resourceKey, lockValue) {
  const lockKey = `lock:${resourceKey}`;

  // CRITICAL: Only release YOUR lock, not someone else's!
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  return await client.eval(script, 1, lockKey, lockValue);
}

// Usage
async function processOrder(orderId) {
  const lockValue = await acquireLock(`order:${orderId}`);

  if (!lockValue) {
    throw new Error('Another server is already processing this order!');
  }

  try {
    // Do the dangerous thing
    await chargeCard(orderId);
    await updateInventory(orderId);
    await markOrderComplete(orderId);
  } finally {
    // ALWAYS release the lock
    await releaseLock(`order:${orderId}`, lockValue);
  }
}
```

**Why the Lua script for release?**

If you do a simple `DEL lockKey`, you might accidentally delete ANOTHER server's lock! The Lua script is atomic: check AND delete happen in one operation. No race condition possible.

## A Scalability Lesson That Cost Us 💀

When designing our e-commerce backend, I initially skipped the `lockValue` check in the release. I just deleted the key.

Here's what happened:

```
t=0ms   Server A: acquires lock, starts processing
t=29s   Server A: lock is about to expire (29s elapsed, TTL=30s)
t=30s   Lock expires automatically (Server A is still running!)
t=30s   Server B: acquires the now-expired lock
t=31s   Server A: FINISHES work, calls releaseLock()
t=31s   Server A: deletes Server B's lock! 💥
t=32s   Server C: acquires the lock (Server B still running!)
t=32s   Server B + C: both processing the same order
t=33s   Double charge. Again.
```

The `lockValue` uniqueness check prevents Server A from releasing Server B's lock. If the lock expired and someone else grabbed it, Server A's release call is a no-op.

**Lesson:** Your lock TTL must be longer than your worst-case operation time. And you should add fencing tokens for truly critical operations (more on that in a sec).

## Production-Ready Lock with Retry 🏭

Real code needs retry logic:

```javascript
class DistributedLock {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async acquire(resourceKey, options = {}) {
    const {
      ttl = 30000,          // Lock TTL in ms
      retryDelay = 100,     // Wait between retries
      retryCount = 10,      // Max retries
    } = options;

    const lockKey = `lock:${resourceKey}`;
    const lockValue = `${require('crypto').randomBytes(16).toString('hex')}`;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const result = await this.redis.set(lockKey, lockValue, {
        NX: true,
        PX: ttl
      });

      if (result === 'OK') {
        return { acquired: true, lockValue, lockKey };
      }

      if (attempt < retryCount) {
        // Jitter: add randomness to avoid thundering herd
        const jitter = Math.random() * 50;
        await sleep(retryDelay + jitter);
      }
    }

    return { acquired: false };
  }

  async release(lockKey, lockValue) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    return await this.redis.eval(script, 1, lockKey, lockValue);
  }

  // Convenience: acquire, run, release
  async withLock(resourceKey, fn, options = {}) {
    const lock = await this.acquire(resourceKey, options);

    if (!lock.acquired) {
      throw new Error(`Could not acquire lock for: ${resourceKey}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(lock.lockKey, lock.lockValue);
    }
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Usage - clean and simple!
const lock = new DistributedLock(redisClient);

await lock.withLock(`order:${orderId}`, async () => {
  await processPayment(orderId);
  await updateInventory(orderId);
});
```

**The jitter is important!** Without it, 50 servers all waiting 100ms will ALL retry at the exact same time. That's a thundering herd — and it hammers Redis.

## Real-World Use Cases 🌍

### Use Case #1: Preventing Duplicate Orders

```javascript
app.post('/api/checkout', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];

  await lock.withLock(`checkout:${idempotencyKey}`, async () => {
    // Check if already processed
    const existing = await db.orders.findOne({ idempotencyKey });
    if (existing) {
      return res.json({ orderId: existing.id, status: 'already_processed' });
    }

    // Safe to process!
    const order = await createAndChargeOrder(req.body);
    await db.orders.insert({ ...order, idempotencyKey });

    res.json({ orderId: order.id });
  }, { ttl: 60000 }); // 60 second lock
});
```

### Use Case #2: Rate-Limited Background Jobs

```javascript
// Only run price sync once, even if multiple workers try
async function syncProductPrices() {
  const lock = await distributedLock.acquire('job:price-sync', {
    ttl: 300000, // 5 minutes
    retryCount: 0 // Don't retry — if locked, skip
  });

  if (!lock.acquired) {
    console.log('Price sync already running, skipping');
    return;
  }

  try {
    await fetchAndUpdateAllPrices(); // Takes 3-4 minutes
  } finally {
    await distributedLock.release(lock.lockKey, lock.lockValue);
  }
}

// Runs every minute, but only ONE instance runs at a time
setInterval(syncProductPrices, 60 * 1000);
```

### Use Case #3: Flash Sale Inventory

```javascript
async function purchaseFlashSaleItem(userId, itemId) {
  // Lock PER ITEM — multiple items can be purchased simultaneously
  return await lock.withLock(`flash-sale:${itemId}`, async () => {
    const item = await db.flashSaleItems.findOne({ id: itemId });

    if (item.quantity <= 0) {
      throw new Error('SOLD OUT');
    }

    await db.flashSaleItems.decrement(itemId, 'quantity', 1);
    await createOrder(userId, itemId);

    return { success: true };
  }, { ttl: 5000 }); // 5 second lock — flash sale ops are fast
}
```

**As a Technical Lead, I've learned:** Lock granularity matters! Lock `flash-sale:item-123`, not `flash-sale:*`. Otherwise you serialize ALL purchases when you only need to serialize purchases of the SAME item.

## The Fencing Token Pattern (For the Paranoid) 🛡️

Here's the uncomfortable truth: **Redis locks are not perfect.** In edge cases (network partitions, clock skew, garbage collection pauses), two servers CAN hold the lock simultaneously.

For truly critical operations (like billing), add a **fencing token**:

```javascript
// Lock returns a monotonically increasing token
async function acquireLockWithToken(resourceKey) {
  const token = await redis.incr(`fence:${resourceKey}`); // Always increasing!
  const lockValue = await acquireLock(resourceKey);

  if (!lockValue) return null;

  return { lockValue, fencingToken: token };
}

// Your datastore rejects writes with old tokens
async function updateDatabase(resourceKey, data, fencingToken) {
  // Only accept if this is a newer token than we've seen
  const lastToken = await db.getLastFencingToken(resourceKey);

  if (fencingToken <= lastToken) {
    throw new Error(`Stale write rejected! Token ${fencingToken} <= ${lastToken}`);
  }

  await db.update(resourceKey, data, fencingToken);
}
```

The fencing token is a counter that always goes up. Even if an old lock holder wakes up late and tries to write, the database sees "token 7? We already accepted token 8 — REJECTED."

**In production, I've learned:** Most teams don't need fencing tokens. For payment processing? Seriously consider it.

## When NOT to Use Distributed Locks ⚠️

As a Technical Lead, I've seen distributed locks abused. They're not always the answer:

**Don't use locks when:**
- **Idempotency solves it** — Unique constraints in your DB are often better than locks. `INSERT ... ON CONFLICT DO NOTHING` is simpler and more reliable.
- **Optimistic locking works** — Add a `version` column. Update only if version matches. Retry on conflict. No Redis needed.
- **You're locking too broadly** — Locking `all-orders` instead of `order-123` kills throughput.
- **The operation is read-only** — Reads don't need locks (usually). Use caching instead.

**Use locks when:**
- Multiple servers compete to do the same one-time thing
- You're coordinating job scheduling across workers
- You need "at most one" execution semantics
- Flash sales, first-come-first-served, limited slots

```
Simple decision tree:

Can I use a DB unique constraint? → YES → Use that instead
Can I use optimistic locking?    → YES → Use that instead
Is this a leader election?       → YES → Use locks
Is this job deduplication?       → YES → Use locks
Is this inventory dec?           → Maybe → Benchmark first
```

## Alternatives to Redis Locks 🔧

| Tool | Best For | Complexity |
|------|----------|------------|
| Redis SET NX | General purpose | Low |
| Postgres advisory locks | Same DB transactions | Low |
| DynamoDB conditional writes | AWS-native, no Redis | Medium |
| Zookeeper / etcd | Leader election, critical infra | High |
| Redlock algorithm | Multi-Redis, high availability | High |

**My setup at work:** Redis for application-level locks, PostgreSQL advisory locks for database migrations, Redlock for anything that touches billing.

## Common Mistakes (I Made All of These) 🪤

### Mistake #1: Forgetting the TTL

```javascript
// BAD: Lock forever if server crashes!
await redis.set(`lock:${key}`, 'locked', { NX: true });

// GOOD: Lock expires even if server dies
await redis.set(`lock:${key}`, 'locked', { NX: true, PX: 30000 });
```

### Mistake #2: TTL Too Short

```javascript
// BAD: Operation takes 10s, lock expires in 5s → another server grabs it
await lock.acquire(key, { ttl: 5000 });

// GOOD: TTL > worst-case operation time, with buffer
await lock.acquire(key, { ttl: 60000 }); // 60s for a 10s operation
```

### Mistake #3: Not Releasing on Error

```javascript
// BAD: Exception? Lock stays forever (well, until TTL)
const lockValue = await acquireLock(key);
await doSomethingThatMightThrow(); // throws! lock not released
await releaseLock(key, lockValue);

// GOOD: Always release in finally
const lockValue = await acquireLock(key);
try {
  await doSomethingThatMightThrow();
} finally {
  await releaseLock(key, lockValue); // Always runs!
}
```

### Mistake #4: Using Lock as a Queue

```javascript
// BAD: Locking for every single request, creating a bottleneck
app.post('/api/update-user', async (req, res) => {
  await lock.withLock('all-users', async () => { // 🚨 GLOBAL LOCK!
    await updateUser(req.body);
  });
});

// GOOD: Lock per resource
app.post('/api/update-user', async (req, res) => {
  await lock.withLock(`user:${req.userId}`, async () => {
    await updateUser(req.body);
  });
});
```

## The Bottom Line 💡

Distributed locks are one of those things you don't think about until they burn you. Then they become one of the first things you think about.

**The essentials:**
1. **Always set a TTL** — locks must auto-expire if servers crash
2. **Use unique lock values** — don't release someone else's lock
3. **Release in `finally`** — always, no exceptions
4. **Lock at the right granularity** — per-resource, not globally
5. **Prefer simpler alternatives** — DB constraints and optimistic locking first

**A scalability lesson that cost us:** The double-discount bug cost us about $800 before we caught it. Redis locking costs about $0.01/month in compute. Some of the best ROI in distributed systems engineering.

When designing our e-commerce backend, locking wasn't in the initial design. It was bolted on after our first production incident. Do it right from day one — your future self (and your customers) will thank you!

---

**Fighting race conditions in production?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got war stories.

**Want to see my distributed systems patterns?** Check out my [GitHub](https://github.com/kpanuragh) for production-ready examples!

*Now go lock your resources. Not all of them, though — please read the "when NOT to use" section first!* 🔒
