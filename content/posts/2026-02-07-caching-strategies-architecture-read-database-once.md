---
title: "Caching Strategies: Stop Reading the Same Database Row 10,000 Times 🚀💾"
date: "2026-02-07"
excerpt: "Your database is dying because you keep querying the same product page for every visitor. After 7 years architecting high-traffic systems, here's how I learned that caching isn't just 'adding Redis' - it's the difference between a $200/month server and a $50,000/month catastrophe!"
tags: ["architecture", "scalability", "caching", "system-design", "performance"]
featured: true
---

# Caching Strategies: Stop Reading the Same Database Row 10,000 Times 🚀💾

**Real confession:** The first time our homepage got featured on TechCrunch, I watched in horror as our database CPU hit 98% and stayed there. Response times went from 200ms to 12 seconds. The site was basically unusable. I frantically checked - we were querying the EXACT SAME product listings 10,000 times per minute. Every single visitor was hammering the database for identical data that changed maybe once per day! 😱

**My boss:** "Can we just get a bigger database?"

**Me, looking at the AWS pricing:** "That would cost $50,000 per month..."

**Boss:** "So what's the alternative?"

**Me:** "Cache it. We query once, serve 10,000 times."

**Boss:** "Why didn't we do that from the start?!"

**Me:** "I'm learning that now..." 😅

Welcome to caching strategies - where you learn that reading from memory is 100,000x faster than reading from disk, and sometimes the simplest optimization is "just don't do the same work twice!"

## What's Caching Anyway? 🤔

Think of caching like a restaurant keeping popular dishes ready:

**Without caching (Database Hell):**
```
Customer 1: "I want spaghetti"
Chef: *Starts cooking from scratch* (5 minutes)

Customer 2: "I want spaghetti"
Chef: *Starts cooking from scratch AGAIN* (5 minutes)

Customer 3: "I want spaghetti"
Chef: *STILL cooking from scratch* (5 minutes)

// 100 customers = 500 minutes of cooking!
// Chef is exhausted! 😰
```

**With caching (Smart Restaurant):**
```
Morning prep:
Chef: *Cooks 50 portions of spaghetti* (1 hour)

Customer 1: "I want spaghetti"
Chef: *Serves pre-made* (30 seconds) ✅

Customer 2: "I want spaghetti"
Chef: *Serves pre-made* (30 seconds) ✅

Customer 3: "I want spaghetti"
Chef: *Serves pre-made* (30 seconds) ✅

// 100 customers = 50 minutes total!
// Chef is happy! 😊
```

**Translation:** Cache = Store frequently accessed data in fast memory instead of hitting slow database every time!

## The Database Meltdown That Taught Me Caching 💀

When designing our e-commerce backend, I was naive about caching:

**My original "architecture":**

```javascript
// Homepage controller (NO CACHING!)
app.get('/', async (req, res) => {
  // Query 1: Featured products
  const featured = await db.query(`
    SELECT * FROM products
    WHERE featured = true
    ORDER BY sales DESC
    LIMIT 12
  `); // 150ms

  // Query 2: Categories
  const categories = await db.query(`
    SELECT * FROM categories
    ORDER BY name
  `); // 50ms

  // Query 3: Top sellers
  const topSellers = await db.query(`
    SELECT p.*, COUNT(o.id) as sales
    FROM products p
    JOIN orders o ON p.id = o.product_id
    WHERE o.created_at > NOW() - INTERVAL 30 DAY
    GROUP BY p.id
    ORDER BY sales DESC
    LIMIT 10
  `); // 300ms

  // Query 4: User's cart (if logged in)
  if (req.user) {
    const cart = await db.query(`
      SELECT * FROM cart_items WHERE user_id = ?
    `, [req.user.id]); // 50ms
  }

  res.render('homepage', { featured, categories, topSellers, cart });
  // Total: 550ms PER REQUEST! 😱
});
```

**What happened in production:**

```javascript
// Normal day:
// 100 concurrent users
// 100 × 550ms = Database is chill at 30% CPU

// TechCrunch feature day:
// 5,000 concurrent users 🔥
// 5,000 × 550ms = Database at 98% CPU!
// Connection pool exhausted: 500/500 connections used
// New requests waiting up to 30 seconds for a connection
// Response time: 200ms → 12 seconds
// Database: "Please stop hitting me!" 💀

// The absurdity:
// Featured products: SAME for everyone
// Categories: SAME for everyone
// Top sellers: SAME for everyone
// We queried this data 5,000 times when it only changed once per day!
```

**Impact:**
- Site unusable for 3 hours
- Lost 80% of traffic
- Estimated lost revenue: $25,000
- Trending on Twitter: "Site can't handle traffic"
- My confidence level: 📉📉📉

**The emergency fix:**

```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10 minute TTL

app.get('/', async (req, res) => {
  // Check cache first
  let featured = cache.get('featured');
  let categories = cache.get('categories');
  let topSellers = cache.get('topSellers');

  // Cache miss? Query database
  if (!featured) {
    featured = await db.query('SELECT * FROM products WHERE featured = true LIMIT 12');
    cache.set('featured', featured);
  }

  if (!categories) {
    categories = await db.query('SELECT * FROM categories ORDER BY name');
    cache.set('categories', categories);
  }

  if (!topSellers) {
    topSellers = await db.query(/* complex query */);
    cache.set('topSellers', topSellers);
  }

  // User cart: NEVER cache (personalized!)
  let cart = null;
  if (req.user) {
    cart = await db.query('SELECT * FROM cart_items WHERE user_id = ?', [req.user.id]);
  }

  res.render('homepage', { featured, categories, topSellers, cart });
  // Total: 550ms first request, then 1ms for cached! 🚀
});
```

**Results after caching:**
- Response time: 12s → 50ms (240x improvement!)
- Database CPU: 98% → 15%
- Connection pool usage: 500/500 → 50/500
- Handled 10x the traffic with same infrastructure
- Boss: "Why does everything feel faster?"
- Me: 😎

## Caching Strategy #1: Cache-Aside (Lazy Loading) 🦥

**The pattern:** Check cache first, query database on miss, then cache it.

```javascript
// Cache-aside pattern
async function getProduct(productId) {
  const cacheKey = `product:${productId}`;

  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('Cache HIT! ✅');
    return JSON.parse(cached);
  }

  // 2. Cache miss - query database
  console.log('Cache MISS - querying database 🔍');
  const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);

  if (!product) {
    return null;
  }

  // 3. Store in cache for next time
  await redis.setex(cacheKey, 3600, JSON.stringify(product)); // 1 hour TTL

  return product;
}

// Usage
app.get('/products/:id', async (req, res) => {
  const product = await getProduct(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});
```

**Flow:**
```
Request 1 (Product 123):
  → Check Redis: MISS
  → Query Database: 150ms
  → Store in Redis
  → Return to user
  Total: 150ms

Request 2-1000 (Product 123):
  → Check Redis: HIT!
  → Return from Redis: 1ms
  Total: 1ms

// 999 requests saved from hitting database! 🎉
```

**Why I love cache-aside:**
- ✅ Simple to implement
- ✅ Only caches what's actually used
- ✅ Cache failures don't kill the app (falls back to DB)
- ✅ Works great for read-heavy workloads

**The catch:**
- ⚠️ First request is always slow (cache miss)
- ⚠️ Stale data if not invalidated properly
- ⚠️ Cache stampede problem (more on this later!)

**When designing our e-commerce backend**, cache-aside became my default pattern for 90% of caching needs!

## Caching Strategy #2: Write-Through Cache 📝

**The pattern:** Write to cache AND database simultaneously.

```javascript
// Write-through pattern
async function updateProduct(productId, updates) {
  const cacheKey = `product:${productId}`;

  // 1. Write to database
  await db.query(
    'UPDATE products SET name = ?, price = ? WHERE id = ?',
    [updates.name, updates.price, productId]
  );

  // 2. Fetch updated data
  const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);

  // 3. Update cache immediately
  await redis.setex(cacheKey, 3600, JSON.stringify(product));

  return product;
}

// Now reads are ALWAYS from cache!
async function getProduct(productId) {
  const cached = await redis.get(`product:${productId}`);

  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - this should be rare!
  const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
  await redis.setex(`product:${productId}`, 3600, JSON.stringify(product));

  return product;
}
```

**Benefits:**
- ✅ Cache is always consistent with database
- ✅ Reads are always fast (cached)
- ✅ No stale data issues
- ✅ Predictable behavior

**The catch:**
- ⚠️ Writes are slower (write to 2 places)
- ⚠️ More complex to implement
- ⚠️ If cache write fails, inconsistency!

**As a Technical Lead, I've learned:** Use write-through for critical data that MUST be consistent (user profiles, order status). Use cache-aside for everything else!

## Caching Strategy #3: Write-Behind (Write-Back) 🔙

**The pattern:** Write to cache immediately, sync to database asynchronously.

```javascript
// Write-behind pattern
const writeQueue = [];

async function updateProduct(productId, updates) {
  const cacheKey = `product:${productId}`;

  // 1. Update cache IMMEDIATELY
  const product = { id: productId, ...updates, updatedAt: Date.now() };
  await redis.setex(cacheKey, 3600, JSON.stringify(product));

  // 2. Queue for database write
  writeQueue.push({
    productId,
    updates,
    timestamp: Date.now()
  });

  // 3. Return to user (fast!)
  return product;
}

// Background worker flushes queue to database
setInterval(async () => {
  if (writeQueue.length === 0) return;

  const batch = writeQueue.splice(0, 100); // Process 100 at a time

  for (const item of batch) {
    try {
      await db.query(
        'UPDATE products SET name = ?, price = ?, updated_at = ? WHERE id = ?',
        [item.updates.name, item.updates.price, new Date(item.timestamp), item.productId]
      );
    } catch (error) {
      console.error('Failed to sync product to DB:', error);
      // Re-queue or log for manual intervention
    }
  }
}, 5000); // Every 5 seconds
```

**Why write-behind is powerful:**
- ✅ Writes are BLAZING fast (just cache)
- ✅ Reduced database load
- ✅ Can batch writes for efficiency
- ✅ Great for high-write workloads

**The catch:**
- ⚠️ Risk of data loss if cache crashes
- ⚠️ Complex to implement correctly
- ⚠️ Eventual consistency (not immediate)
- ⚠️ Need reliable queue/worker

**When architecting on AWS, I learned:** Only use write-behind for non-critical data (view counts, analytics). Never for transactions or orders!

## Caching Strategy #4: Time-To-Live (TTL) Strategies ⏰

**The problem:** How long should data stay cached?

**Bad TTL strategies:**

```javascript
// ❌ Too short (1 second)
redis.setex('product:123', 1, data);
// Cache expires too fast, database still hammered!

// ❌ Too long (1 week)
redis.setex('product:123', 604800, data);
// Stale data shown to users for days!

// ❌ No TTL (forever)
redis.set('product:123', data);
// Memory fills up, cache eviction chaos!
```

**Good TTL strategies:**

```javascript
// 1. Based on data volatility
const TTL_STRATEGIES = {
  // Static data: Cache for hours
  categories: 3600 * 24, // 24 hours
  staticPages: 3600 * 12, // 12 hours

  // Semi-static data: Cache for minutes
  products: 3600, // 1 hour
  searchResults: 1800, // 30 minutes

  // Dynamic data: Cache for seconds
  inventory: 60, // 1 minute
  prices: 300, // 5 minutes

  // Real-time data: Don't cache OR very short
  cart: 30, // 30 seconds
  userSession: 900 // 15 minutes
};

async function cacheProduct(product) {
  await redis.setex(
    `product:${product.id}`,
    TTL_STRATEGIES.products,
    JSON.stringify(product)
  );
}

// 2. Conditional refresh (refresh before expiry)
async function getProductSmart(productId) {
  const cacheKey = `product:${productId}`;

  // Get with TTL info
  const cached = await redis.get(cacheKey);
  const ttl = await redis.ttl(cacheKey);

  if (cached) {
    const product = JSON.parse(cached);

    // If less than 5 minutes left, refresh in background
    if (ttl < 300) {
      console.log('TTL low, refreshing in background...');

      // Async refresh (don't wait)
      refreshProductCache(productId).catch(err => {
        console.error('Background refresh failed:', err);
      });
    }

    return product;
  }

  // Cache miss - fetch from DB
  return await refreshProductCache(productId);
}

async function refreshProductCache(productId) {
  const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
  await redis.setex(`product:${productId}`, 3600, JSON.stringify(product));
  return product;
}
```

**A scalability lesson that saved us:** We cached product prices for 1 hour. During a flash sale with price changes every 5 minutes, users saw wrong prices! Changed to 5-minute TTL + manual invalidation on price updates!

## The Cache Invalidation Problem (The Hardest Problem!) 🔥

**Phil Karlton's famous quote:** "There are only two hard things in Computer Science: cache invalidation and naming things."

**The nightmare scenario:**

```javascript
// User updates their profile
async function updateProfile(userId, updates) {
  // Update database
  await db.query('UPDATE users SET name = ? WHERE id = ?', [updates.name, userId]);

  // Oops, forgot to invalidate cache! 😱
  // Cache still has old data!

  return { success: true };
}

// User refreshes page
async function getProfile(userId) {
  const cached = await redis.get(`user:${userId}`);

  if (cached) {
    return JSON.parse(cached); // Returns OLD name! 💀
  }

  // ...
}
```

**Solution #1: Invalidate on write**

```javascript
async function updateProfile(userId, updates) {
  // 1. Update database
  await db.query('UPDATE users SET name = ? WHERE id = ?', [updates.name, userId]);

  // 2. Invalidate cache
  await redis.del(`user:${userId}`);

  // Next read will fetch fresh data!
  return { success: true };
}
```

**Solution #2: Update cache on write (write-through)**

```javascript
async function updateProfile(userId, updates) {
  // 1. Update database
  await db.query('UPDATE users SET name = ? WHERE id = ?', [updates.name, userId]);

  // 2. Fetch updated data
  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);

  // 3. Update cache
  await redis.setex(`user:${userId}`, 3600, JSON.stringify(user));

  return user;
}
```

**Solution #3: Event-driven invalidation**

```javascript
// Publish event when data changes
async function updateProfile(userId, updates) {
  await db.query('UPDATE users SET name = ? WHERE id = ?', [updates.name, userId]);

  // Publish event
  await eventBus.publish('user.updated', { userId });

  return { success: true };
}

// Cache service listens to events
eventBus.on('user.updated', async (event) => {
  await redis.del(`user:${event.userId}`);
  console.log(`Cache invalidated for user ${event.userId}`);
});
```

**Solution #4: Cache tags (for related data)**

```javascript
// When caching, add tags
async function cacheProduct(product) {
  // Cache the product
  await redis.setex(`product:${product.id}`, 3600, JSON.stringify(product));

  // Add to category tag set
  await redis.sadd(`category:${product.categoryId}:products`, product.id);
}

// Invalidate entire category
async function invalidateCategory(categoryId) {
  // Get all product IDs in this category
  const productIds = await redis.smembers(`category:${categoryId}:products`);

  // Delete all product caches
  for (const productId of productIds) {
    await redis.del(`product:${productId}`);
  }

  // Clear the tag set
  await redis.del(`category:${categoryId}:products`);

  console.log(`Invalidated ${productIds.length} products in category ${categoryId}`);
}
```

**When designing our e-commerce backend**, we learned: Simple invalidation (delete on update) works 90% of the time. Use complex strategies only when needed!

## The Cache Stampede Problem (Thundering Herd) 🦬

**The disaster:**

```javascript
// Popular product, cache expires at exactly 12:00 PM
// At 12:00 PM, 1,000 requests arrive simultaneously!

12:00:00.000 - Request 1: Cache miss → Query DB (200ms)
12:00:00.001 - Request 2: Cache miss → Query DB (200ms)
12:00:00.002 - Request 3: Cache miss → Query DB (200ms)
...
12:00:00.999 - Request 1000: Cache miss → Query DB (200ms)

// 1,000 identical database queries! 💀
// Database CPU: 98%
// Database connections: Exhausted
// Response time: 30 seconds
// Users: Angry
```

**Solution #1: Locking (first request wins)**

```javascript
async function getProductWithLock(productId) {
  const cacheKey = `product:${productId}`;
  const lockKey = `lock:${cacheKey}`;

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Try to acquire lock
  const lockAcquired = await redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (lockAcquired) {
    // I got the lock! Fetch from database
    try {
      const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
      await redis.setex(cacheKey, 3600, JSON.stringify(product));
      return product;
    } finally {
      // Release lock
      await redis.del(lockKey);
    }
  } else {
    // Someone else has the lock, wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Try cache again
    const nowCached = await redis.get(cacheKey);
    if (nowCached) {
      return JSON.parse(nowCached);
    }

    // Still not cached? Fetch from database
    return await db.query('SELECT * FROM products WHERE id = ?', [productId]);
  }
}
```

**Solution #2: Early expiration + background refresh**

```javascript
// Store TTL metadata with cache
async function cacheWithMetadata(key, data, ttl) {
  const cached = {
    data,
    cachedAt: Date.now(),
    expiresAt: Date.now() + (ttl * 1000)
  };

  await redis.setex(key, ttl + 60, JSON.stringify(cached)); // Extra 60s grace period
}

async function getProductWithEarlyRefresh(productId) {
  const cacheKey = `product:${productId}`;

  const cached = await redis.get(cacheKey);

  if (cached) {
    const parsed = JSON.parse(cached);
    const timeLeft = parsed.expiresAt - Date.now();

    // Less than 5 minutes left? Refresh in background!
    if (timeLeft < 300000) {
      // Background refresh (don't wait)
      refreshCache(productId).catch(console.error);
    }

    return parsed.data;
  }

  // Cache miss - synchronous fetch
  return await refreshCache(productId);
}

async function refreshCache(productId) {
  const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
  await cacheWithMetadata(`product:${productId}`, product, 3600);
  return product;
}
```

**Solution #3: Probabilistic early expiration**

```javascript
async function getProductProbabilistic(productId) {
  const cacheKey = `product:${productId}`;

  const cached = await redis.get(cacheKey);
  const ttl = await redis.ttl(cacheKey);

  if (cached) {
    // Calculate probability of early refresh
    // As TTL gets lower, probability increases
    const maxTTL = 3600;
    const probability = 1 - (ttl / maxTTL);

    if (Math.random() < probability) {
      // Probabilistically refresh in background
      console.log(`Probabilistic refresh triggered (${(probability * 100).toFixed(1)}% chance)`);
      refreshCache(productId).catch(console.error);
    }

    return JSON.parse(cached);
  }

  return await refreshCache(productId);
}
```

**In production, I've learned:** Locking + background refresh = best combo! Prevents stampede and keeps cache warm!

## Multi-Level Caching (The Performance Multiplier) 🚀

**The strategy:** Multiple cache layers, each faster but smaller!

```javascript
const NodeCache = require('node-cache');
const localCache = new NodeCache({ stdTTL: 60 }); // 1-minute local cache

async function getProductMultiLevel(productId) {
  const cacheKey = `product:${productId}`;

  // Level 1: In-memory cache (FASTEST - 0.1ms)
  const local = localCache.get(cacheKey);
  if (local) {
    console.log('🟢 L1 cache HIT (in-memory)');
    return local;
  }

  // Level 2: Redis cache (FAST - 1ms)
  const redis = await redisClient.get(cacheKey);
  if (redis) {
    console.log('🟡 L2 cache HIT (Redis)');
    const product = JSON.parse(redis);

    // Populate L1 cache
    localCache.set(cacheKey, product);

    return product;
  }

  // Level 3: Database (SLOW - 50-200ms)
  console.log('🔴 Cache MISS - querying database');
  const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);

  // Populate all cache levels
  localCache.set(cacheKey, product); // L1
  await redisClient.setex(cacheKey, 3600, JSON.stringify(product)); // L2

  return product;
}

// Cache hierarchy:
// L1: In-memory (Node.js) - 60s TTL - 0.1ms latency - 50MB capacity
// L2: Redis - 1 hour TTL - 1ms latency - 4GB capacity
// L3: Database - Forever - 50ms latency - 2TB capacity
```

**Benefits:**
```javascript
// Single instance:
Request 1: DB → Redis → Memory → User (50ms)
Request 2: Memory → User (0.1ms) 🚀
Request 3: Memory → User (0.1ms) 🚀
Request 4: Memory → User (0.1ms) 🚀

// Multiple instances:
Instance 1, Request 1: DB → Redis → Memory → User (50ms)
Instance 2, Request 1: Redis → Memory → User (1ms) ⚡
Instance 3, Request 1: Redis → Memory → User (1ms) ⚡

// 500x improvement over database!
```

**A scalability lesson that saved us:** Multi-level caching reduced our Redis bill by 70% because in-memory cache absorbed 80% of requests!

## Real-World Production Caching Architecture 🏗️

**My battle-tested setup:**

```javascript
// config/cache.js
const redis = require('redis');
const NodeCache = require('node-cache');

class CacheService {
  constructor() {
    // L1: Local in-memory cache (per instance)
    this.localCache = new NodeCache({
      stdTTL: 60, // 1 minute
      checkperiod: 120,
      maxKeys: 10000 // Limit memory usage
    });

    // L2: Shared Redis cache
    this.redisClient = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      retry_strategy: (options) => {
        if (options.total_retry_time > 1000 * 60) {
          return new Error('Redis retry time exhausted');
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });

    // Cache strategies per data type
    this.strategies = {
      product: { l1TTL: 60, l2TTL: 3600 },
      category: { l1TTL: 300, l2TTL: 86400 },
      user: { l1TTL: 30, l2TTL: 900 },
      cart: { l1TTL: 10, l2TTL: 300 }
    };

    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      misses: 0
    };
  }

  async get(key, strategy = 'product') {
    const { l1TTL, l2TTL } = this.strategies[strategy];

    // L1 check
    const l1 = this.localCache.get(key);
    if (l1 !== undefined) {
      this.stats.l1Hits++;
      return l1;
    }

    // L2 check
    try {
      const l2 = await this.redisClient.get(key);
      if (l2) {
        this.stats.l2Hits++;
        const parsed = JSON.parse(l2);

        // Populate L1
        this.localCache.set(key, parsed, l1TTL);

        return parsed;
      }
    } catch (error) {
      console.error('Redis error:', error);
      // Fall through to database
    }

    this.stats.misses++;
    return null;
  }

  async set(key, value, strategy = 'product') {
    const { l1TTL, l2TTL } = this.strategies[strategy];

    // Set in both levels
    this.localCache.set(key, value, l1TTL);

    try {
      await this.redisClient.setex(key, l2TTL, JSON.stringify(value));
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async invalidate(key) {
    // Clear from both levels
    this.localCache.del(key);

    try {
      await this.redisClient.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  async invalidatePattern(pattern) {
    // Clear local cache (can't do pattern matching easily)
    this.localCache.flushAll();

    // Clear Redis by pattern
    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
      }
    } catch (error) {
      console.error('Redis pattern delete error:', error);
    }
  }

  getStats() {
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.misses;
    return {
      l1Hits: this.stats.l1Hits,
      l2Hits: this.stats.l2Hits,
      misses: this.stats.misses,
      total,
      hitRate: total > 0 ? ((this.stats.l1Hits + this.stats.l2Hits) / total * 100).toFixed(2) + '%' : '0%'
    };
  }
}

module.exports = new CacheService();
```

**Using it:**

```javascript
const cache = require('./config/cache');

// Product service
class ProductService {
  async getProduct(productId) {
    const cacheKey = `product:${productId}`;

    // Try cache first
    const cached = await cache.get(cacheKey, 'product');
    if (cached) {
      return cached;
    }

    // Cache miss - query database
    const product = await db.query('SELECT * FROM products WHERE id = ?', [productId]);

    if (product) {
      await cache.set(cacheKey, product, 'product');
    }

    return product;
  }

  async updateProduct(productId, updates) {
    // Update database
    await db.query('UPDATE products SET ? WHERE id = ?', [updates, productId]);

    // Invalidate cache
    await cache.invalidate(`product:${productId}`);

    // Could also refresh cache immediately
    // return await this.getProduct(productId);
  }

  async deleteProduct(productId) {
    await db.query('DELETE FROM products WHERE id = ?', [productId]);
    await cache.invalidate(`product:${productId}`);
  }
}

// Dashboard endpoint
app.get('/admin/cache-stats', (req, res) => {
  res.json(cache.getStats());
});
```

## Common Caching Mistakes (I Made All of These!) 🪤

### Mistake #1: Caching Everything

```javascript
// ❌ BAD: Cache everything blindly
app.get('/random-number', async (req, res) => {
  const cached = await cache.get('random');
  if (cached) return res.json({ number: cached });

  const random = Math.random();
  await cache.set('random', random, 3600);
  res.json({ number: random });
  // Random numbers should NOT be cached! 🤦
});

// ❌ BAD: Cache personal data across users
const userProfile = await cache.get('user-profile');
// This returns the WRONG user's profile!

// ✅ GOOD: Only cache appropriate data
// Cache: Static content, public data, computationally expensive results
// Don't cache: Random data, personalized content, real-time data
```

### Mistake #2: No Cache Key Strategy

```javascript
// ❌ BAD: Inconsistent key naming
redis.set('product-123', data);
redis.set('Product:456', data);
redis.set('PRODUCT_789', data);
// Nightmare to manage!

// ✅ GOOD: Consistent key naming
const KEY_PATTERNS = {
  product: (id) => `product:${id}`,
  category: (id) => `category:${id}`,
  userCart: (userId) => `cart:user:${userId}`,
  searchResults: (query, page) => `search:${query}:${page}`
};

// Usage
await redis.set(KEY_PATTERNS.product(123), data);
await redis.set(KEY_PATTERNS.userCart(456), cart);
```

### Mistake #3: Cache Without Monitoring

```javascript
// ❌ BAD: No idea what's happening
// Cache could be 0% hit rate and you wouldn't know!

// ✅ GOOD: Monitor cache performance
class MonitoredCache {
  constructor() {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  async get(key) {
    const value = await redis.get(key);

    if (value) {
      this.metrics.hits++;
    } else {
      this.metrics.misses++;
    }

    // Send to monitoring (Datadog, CloudWatch, etc.)
    metrics.gauge('cache.hit_rate', this.getHitRate());

    return value;
  }

  getHitRate() {
    const total = this.metrics.hits + this.metrics.misses;
    return total > 0 ? (this.metrics.hits / total) * 100 : 0;
  }
}
```

### Mistake #4: Ignoring Cache Warming

```javascript
// ❌ BAD: Cold cache after deploy
// All caches empty → Database hammered → Slow responses

// ✅ GOOD: Warm cache on startup
async function warmCache() {
  console.log('Warming cache...');

  // Preload popular products
  const popular = await db.query('SELECT * FROM products WHERE sales > 1000');
  for (const product of popular) {
    await cache.set(`product:${product.id}`, product);
  }

  // Preload categories
  const categories = await db.query('SELECT * FROM categories');
  await cache.set('categories:all', categories);

  console.log(`Cache warmed: ${popular.length} products, ${categories.length} categories`);
}

// Call on startup
app.listen(3000, async () => {
  await warmCache();
  console.log('Server ready with warm cache! 🔥');
});
```

## The Bottom Line 💡

Caching isn't just "add Redis and hope" - it's strategic placement of data at the right level with the right TTL!

**The essentials:**
1. **Cache-aside** for most use cases (simple and reliable)
2. **Write-through** for critical consistency
3. **Multi-level** caching for maximum performance
4. **Smart TTLs** based on data volatility
5. **Proper invalidation** to avoid stale data
6. **Monitor hit rates** to verify it's working

**The truth about caching:**

It's not "cache everything!" - it's "cache the right things, at the right level, with the right TTL, and invalidate properly!" You're trading memory for speed!

**When designing our e-commerce backend**, I learned this: Good caching is the difference between a $200/month server and a $50,000/month database cluster. Cache reads aggressively, invalidate writes carefully, and monitor everything! 🎯

You don't need Redis from day one - start with in-memory caching in your app! Graduate to Redis when you need shared cache across instances! 🚀

## Your Caching Checklist ✅

Before going to production:

- [ ] Identified cacheable data (high read, low write)
- [ ] Implemented cache-aside pattern
- [ ] Set appropriate TTLs per data type
- [ ] Cache invalidation on writes
- [ ] Cache key naming strategy
- [ ] Multi-level caching (optional but recommended)
- [ ] Cache stampede prevention
- [ ] Cache hit rate monitoring
- [ ] Cache warming on startup
- [ ] Load tested under various cache scenarios

## Your Action Plan 🎯

**This week:**
1. Find your slowest database query
2. Add in-memory cache with 5-minute TTL
3. Measure response time improvement
4. Celebrate 10-100x speedup! 🎉

**This month:**
1. Set up Redis for shared caching
2. Implement cache-aside for top 10 queries
3. Add cache hit rate monitoring
4. Optimize TTLs based on access patterns

**This quarter:**
1. Multi-level caching for hot paths
2. Implement cache warming
3. Add cache stampede prevention
4. Document caching strategy for team

## Resources Worth Your Time 📚

**Tools I use daily:**
- [Redis](https://redis.io/) - The gold standard for caching
- [node-cache](https://github.com/node-cache/node-cache) - In-memory caching
- [Memcached](https://memcached.org/) - Alternative to Redis

**Reading:**
- [Caching at Reddit](https://redditblog.com/2017/12/15/caching-at-reddit/)
- [Facebook's Memcache](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf)
- [Scaling Memcache at Facebook](https://www.usenix.org/legacy/event/nsdi11/tech/full_papers/Nishtala.pdf)

**Real talk:** The best caching strategy is the one that actually gets monitored and tuned!

---

**Struggling with database performance?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your caching wins!

**Want to see my production caching setup?** Check out my [GitHub](https://github.com/kpanuragh) - real patterns from production!

*Now go forth and cache responsibly!* 🚀💾

---

**P.S.** If you're reading the same database row 1,000 times per minute, you're not doing architecture - you're doing self-harm! Add caching! 💀

**P.P.S.** I once cached user shopping carts for 24 hours. Users added items, refreshed, and their cart was empty (old cache). Changed to 5-minute TTL + invalidation on updates. Always think about data freshness vs performance trade-off! 😅
