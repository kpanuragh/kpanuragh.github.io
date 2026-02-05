---
title: "Database Sharding: When One Database Just Isn't Enough Anymore 🗄️⚡"
date: "2026-02-05"
excerpt: "Your database is drowning in 50 million rows and queries are taking 8 seconds. After architecting e-commerce systems handling millions of users, here's how I learned that sometimes you need to split your data across multiple databases - and why it's scarier than it sounds!"
tags: ["architecture", "scalability", "database", "system-design", "performance"]
featured: true
---

# Database Sharding: When One Database Just Isn't Enough Anymore 🗄️⚡

**Real talk:** The first time our database hit 10 million users, I thought adding more indexes would fix our performance issues. Spoiler alert: It didn't. Queries that took 100ms were now taking 5-8 seconds. My boss asked, "Can we just get a bigger database server?"

**Me:** "We're already on the biggest RDS instance. It has 768GB RAM and costs $15,000/month!"

**Boss:** "So what's the solution?"

**Me:** "We need to... split the database."

**Boss:** "Split it? Like, break it into pieces?"

**Me:** "Exactly. It's called sharding. And I'm terrified." 😱

Welcome to database sharding - the day you realize one database can't handle everything, and you need to split your data across multiple databases like dealing cards!

## What's Database Sharding Anyway? 🤔

Think of sharding like a library system across multiple buildings:

**Single Database (One Library):**
```
One Library Building
├─ 10 million books
├─ 1 librarian (overwhelmed!)
├─ Finding a book: 30 minutes
└─ Line out the door 😰
```

**Sharded Database (Multiple Libraries):**
```
Library System
├─ Library A (Books A-F)    ← 2M books, fast!
├─ Library B (Books G-M)    ← 2M books, fast!
├─ Library C (Books N-S)    ← 2M books, fast!
├─ Library D (Books T-Z)    ← 2M books, fast!
└─ Finding a book: 3 minutes ✅
```

**Translation:** Instead of one massive database struggling, split data across multiple smaller databases. Each shard handles a portion of the data!

## The Database Nightmare That Forced Me to Shard 💀

When designing our e-commerce backend at my previous company, we started simple:

**Year 1 (The Happy Times):**
```javascript
// Single PostgreSQL database
const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
// 50,000 users
// Query time: 10ms ✅
// Life is good! 😊
```

**Year 2 (Growing Pains):**
```javascript
// Same query
const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
// 5 million users
// Query time: 100ms ⚠️
// Added more indexes, upgraded RAM
// Still manageable
```

**Year 3 (The Breaking Point):**
```javascript
// Same query
const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
// 50 million users
// Query time: 5-8 seconds! 🔥
// Table size: 2.5TB
// Backups taking 6 hours
// Index rebuilds taking 12 hours
// Every deploy is terrifying
// Boss threatening to fire the database
```

**What we tried first (all failed):**
- ✅ Added indexes → Helped initially, then made writes slower
- ✅ Upgraded to bigger server → Ran out of bigger servers!
- ✅ Added read replicas → Helped reads, but master still drowning on writes
- ✅ Optimized queries → Only helped specific slow queries
- ✅ Added caching → Helped for reads, but cache invalidation is nightmare
- ❌ Nothing scaled beyond 50M users!

**The only solution left:** Sharding! Split the `users` table across multiple databases!

## Sharding Strategy #1: Range-Based Sharding 📊

**The concept:** Split data by ranges (like alphabetical order).

```
Shard 1: users.id 1 - 10,000,000
Shard 2: users.id 10,000,001 - 20,000,000
Shard 3: users.id 20,000,001 - 30,000,000
Shard 4: users.id 30,000,001 - 40,000,000
```

**Implementation:**

```javascript
// sharding.js
const shards = [
  { id: 1, range: [1, 10000000], host: 'db-shard-1.internal:5432' },
  { id: 2, range: [10000001, 20000000], host: 'db-shard-2.internal:5432' },
  { id: 3, range: [20000001, 30000000], host: 'db-shard-3.internal:5432' },
  { id: 4, range: [30000001, 40000000], host: 'db-shard-4.internal:5432' },
];

// Determine which shard a user belongs to
function getShardForUser(userId) {
  for (const shard of shards) {
    const [min, max] = shard.range;
    if (userId >= min && userId <= max) {
      return shard;
    }
  }
  throw new Error(`No shard found for user ${userId}`);
}

// Query a specific user
async function getUserById(userId) {
  const shard = getShardForUser(userId);
  const connection = await getConnection(shard.host);

  const result = await connection.query(
    'SELECT * FROM users WHERE id = ?',
    [userId]
  );

  return result[0];
}

// Example usage
const user = await getUserById(15000000);
// Automatically queries shard 2!
```

**Why range-based sharding is simple:**
- ✅ Easy to understand (IDs 1-10M, 10M-20M, etc.)
- ✅ Easy to implement
- ✅ Works great for sequential IDs
- ✅ New data goes to newest shard

**The catch - Hot shards!**

```javascript
// The problem: Uneven distribution
Shard 1 (oldest users): 5,000 queries/sec 💤
Shard 2 (old users):    8,000 queries/sec 💤
Shard 3 (recent users): 50,000 queries/sec 🔥🔥🔥
Shard 4 (new users):    100,000 queries/sec 🔥🔥🔥🔥

// Newest users are most active!
// Shard 4 is MELTING while Shard 1 is chilling!
```

**A scalability lesson that cost us:** New users are WAY more active than old users. Range sharding put all active users on the newest shard. We had to re-shard after 3 months! 😭

## Sharding Strategy #2: Hash-Based Sharding (The Even One) 🎲

**The concept:** Use a hash function to distribute data evenly!

```javascript
// Hash-based sharding
function getShardForUser(userId) {
  // Hash the user ID
  const hash = hashFunction(userId);

  // Modulo by number of shards
  const shardId = hash % NUM_SHARDS;

  return shards[shardId];
}

// Example with simple hash
function simpleHash(userId) {
  // Convert to string and hash
  let hash = 0;
  const str = userId.toString();

  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
}

// Using it
const NUM_SHARDS = 4;

function getShardForUser(userId) {
  const hash = simpleHash(userId);
  const shardIndex = hash % NUM_SHARDS;
  return shards[shardIndex];
}

// Examples:
getUserById(1)        // → Shard 2
getUserById(2)        // → Shard 1
getUserById(3)        // → Shard 3
getUserById(1000000)  // → Shard 1
getUserById(9999999)  // → Shard 4

// Distribution is MUCH more even! ✨
```

**Production implementation with connection pooling:**

```javascript
// db-sharding.js
const { Pool } = require('pg');

class ShardedDatabase {
  constructor(shardConfigs) {
    this.shards = shardConfigs.map(config => ({
      id: config.id,
      pool: new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        max: 20, // Connection pool size
      })
    }));
  }

  getShardForKey(key) {
    const hash = this.hash(key);
    const shardIndex = hash % this.shards.length;
    return this.shards[shardIndex];
  }

  hash(key) {
    // Use a proper hash function (MurmurHash, CRC32, etc.)
    const crypto = require('crypto');
    return parseInt(
      crypto.createHash('md5').update(key.toString()).digest('hex').substring(0, 8),
      16
    );
  }

  async query(shardKey, sql, params) {
    const shard = this.getShardForKey(shardKey);
    const client = await shard.pool.connect();

    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async getUserById(userId) {
    return this.query(
      userId, // Shard key
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
  }

  async createUser(userData) {
    const userId = await generateUserId(); // Generate unique ID

    await this.query(
      userId, // Shard key
      'INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)',
      [userId, userData.email, userData.name, new Date()]
    );

    return userId;
  }
}

// Initialize with 4 shards
const db = new ShardedDatabase([
  { id: 1, host: 'db-shard-1.internal', port: 5432, database: 'app_shard_1' },
  { id: 2, host: 'db-shard-2.internal', port: 5432, database: 'app_shard_2' },
  { id: 3, host: 'db-shard-3.internal', port: 5432, database: 'app_shard_3' },
  { id: 4, host: 'db-shard-4.internal', port: 5432, database: 'app_shard_4' },
]);

module.exports = db;
```

**Using it in your API:**

```javascript
// routes/users.js
const db = require('../db-sharding');

app.get('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await db.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Results after implementing hash-based sharding:**

```javascript
// Before (single database)
50M users → 1 database
Query time: 5-8 seconds 🔥
Writes: 500/sec max
CPU: 95% constantly

// After (4 shards)
50M users → 4 databases (12.5M each)
Query time: 50-100ms ✅
Writes: 2000/sec total
CPU: 40% average on each shard

// 50-80x improvement! 🚀
```

**Why I love hash-based sharding:**
- ✅ **Even distribution** - No hot shards!
- ✅ **Predictable** - Same user always goes to same shard
- ✅ **Scalable** - Add more shards as you grow
- ✅ **No manual rebalancing** - Hash function handles it

**The catch - Resharding is PAINFUL:**

```javascript
// Problem: Adding a 5th shard changes the hash!
// Old: hash % 4 shards
// New: hash % 5 shards

// User 12345:
// Old: hash(12345) % 4 = 2 → Shard 2
// New: hash(12345) % 5 = 3 → Shard 3 (different!)

// ALL data needs to move! 😱
```

**When architecting on AWS, I learned:** Use consistent hashing to minimize data movement when resharding!

## Sharding Strategy #3: Consistent Hashing (The Smart One) 🎯

**The problem with modulo hashing:**

When you add a shard, EVERYTHING moves!

```
4 shards → 5 shards
80% of data needs to move! 💀
```

**Consistent hashing solution:**

Only ~20% of data moves when adding shards!

```javascript
// Consistent hashing with virtual nodes
class ConsistentHash {
  constructor(shards, virtualNodes = 150) {
    this.ring = new Map();
    this.shards = shards;
    this.virtualNodes = virtualNodes;

    // Create virtual nodes for each shard
    shards.forEach(shard => {
      for (let i = 0; i < virtualNodes; i++) {
        const hash = this.hash(`${shard.id}:${i}`);
        this.ring.set(hash, shard);
      }
    });

    // Sort ring by hash value
    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  hash(key) {
    const crypto = require('crypto');
    return parseInt(
      crypto.createHash('md5').update(key.toString()).digest('hex').substring(0, 8),
      16
    );
  }

  getShard(key) {
    const hash = this.hash(key);

    // Find the first virtual node >= hash
    for (const ringHash of this.sortedKeys) {
      if (ringHash >= hash) {
        return this.ring.get(ringHash);
      }
    }

    // Wrap around to first node
    return this.ring.get(this.sortedKeys[0]);
  }

  addShard(shard) {
    // Add virtual nodes for new shard
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hash(`${shard.id}:${i}`);
      this.ring.set(hash, shard);
    }

    this.sortedKeys = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }
}

// Usage
const consistentHash = new ConsistentHash([
  { id: 1, host: 'shard-1' },
  { id: 2, host: 'shard-2' },
  { id: 3, host: 'shard-3' },
  { id: 4, host: 'shard-4' },
]);

// Get shard for user
const shard = consistentHash.getShard(userId);
```

**Why consistent hashing is brilliant:**

```javascript
// Adding a 5th shard
// Before: 4 shards, each handling ~25% of data
// After:  5 shards, each handling ~20% of data

// Only 5% of data moves per shard! (not 80%)
// Total data movement: ~20% (not 80%)
// Much less painful! ✅
```

**When designing our e-commerce backend**, consistent hashing let us add shards during peak season without massive downtime!

## Sharding Strategy #4: Geo-Based Sharding (The Global One) 🌍

**The concept:** Shard by geographic region!

```javascript
// Geo-based sharding
const geoShards = {
  'us-east': { host: 'db-us-east-1', users: [] },
  'us-west': { host: 'db-us-west-1', users: [] },
  'eu-west': { host: 'db-eu-west-1', users: [] },
  'ap-south': { host: 'db-ap-south-1', users: [] },
};

function getShardForUser(userCountry) {
  const regionMap = {
    'US': 'us-east',
    'CA': 'us-east',
    'MX': 'us-east',

    'GB': 'eu-west',
    'DE': 'eu-west',
    'FR': 'eu-west',

    'IN': 'ap-south',
    'SG': 'ap-south',
    'AU': 'ap-south',
  };

  const region = regionMap[userCountry] || 'us-east'; // Default
  return geoShards[region];
}

// API endpoint
app.get('/users/:id', async (req, res) => {
  const user = await getUserFromCache(req.params.id);
  const shard = getShardForUser(user.country);

  const connection = await getConnection(shard.host);
  const userData = await connection.query('SELECT * FROM users WHERE id = ?', [req.params.id]);

  res.json(userData);
});
```

**Why geo-sharding is powerful:**
- ✅ **Lower latency** - Data close to users!
- ✅ **Compliance** - Keep EU data in EU (GDPR)
- ✅ **Disaster recovery** - Regional failures isolated
- ✅ **Natural partitioning** - Users rarely cross regions

**The catch:**
- ⚠️ **Uneven distribution** - More US users than Luxembourg users!
- ⚠️ **Cross-region queries** - Need to query multiple shards
- ⚠️ **User migration** - What if user moves countries?

## The Cross-Shard Query Problem (The Nightmare!) 😱

**The horror:**

```javascript
// Easy query on single database
SELECT users.*, orders.*
FROM users
JOIN orders ON users.id = orders.user_id
WHERE users.country = 'US';

// On sharded database: DISASTER!
// users table is sharded by user_id
// orders table is sharded by user_id
// But they might be on DIFFERENT shards! 💀
```

**The painful solutions:**

### Solution #1: Denormalization (Duplicate Data)

```javascript
// Instead of JOIN, duplicate data
// orders table stores user data directly
{
  orderId: 123,
  userId: 456,
  userName: "John",        // Duplicated!
  userEmail: "john@email", // Duplicated!
  userCountry: "US",       // Duplicated!
  total: 99.99
}

// Now orders shard has everything!
// No cross-shard JOIN needed! ✅
```

**Pros:** Fast queries, no JOINs
**Cons:** Data duplication, sync issues, storage cost

### Solution #2: Application-Level JOINs

```javascript
// Query multiple shards and merge in app
async function getUserOrders(userId) {
  // Step 1: Get user from shard
  const userShard = getShardForKey(userId);
  const user = await userShard.query('SELECT * FROM users WHERE id = ?', [userId]);

  // Step 2: Get orders from (potentially different) shard
  const orderShard = getShardForKey(userId);
  const orders = await orderShard.query('SELECT * FROM orders WHERE user_id = ?', [userId]);

  // Step 3: Merge in application
  return {
    ...user,
    orders: orders
  };
}

// Slower than SQL JOIN, but works! ✅
```

### Solution #3: Distributed Query Engine

```javascript
// Use tools like Vitess, Citus, or Presto
// They handle cross-shard queries automatically

// You write normal SQL
SELECT users.*, orders.*
FROM users
JOIN orders ON users.id = orders.user_id
WHERE users.country = 'US';

// Query engine:
// 1. Determines which shards to query
// 2. Sends parallel queries to each shard
// 3. Merges results
// 4. Returns to you

// Magic! 🪄 (but with overhead)
```

**As a Technical Lead, I've learned:** Avoid cross-shard queries when possible. Denormalize data and accept eventual consistency!

## The Shard Key Decision (The Most Important Choice!) 🔑

**Your shard key determines EVERYTHING!**

**Bad shard key examples:**

```javascript
// ❌ Country (uneven distribution)
Shard "US": 40M users 🔥
Shard "Luxembourg": 500 users 💤

// ❌ Timestamp (hot shard problem)
Shard "2026-01": All new users! 🔥
Shard "2020-01": Ghost town 💀

// ❌ Email domain (weird patterns)
Shard "gmail.com": 25M users 🔥
Shard "aol.com": 1000 users 💤
```

**Good shard key examples:**

```javascript
// ✅ User ID (hash-based)
// - Even distribution
// - Predictable
// - Scales linearly

// ✅ Tenant ID (multi-tenant SaaS)
// - All tenant data on same shard
// - No cross-shard queries
// - Easy tenant isolation

// ✅ Customer ID (e-commerce)
// - All customer data together
// - Orders, cart, wishlist on same shard
// - Fast queries!
```

**The golden rules for shard keys:**
1. **High cardinality** - Lots of unique values
2. **Even distribution** - No hot shards
3. **Query aligned** - Minimize cross-shard queries
4. **Immutable** - Never changes (or resharding hell!)

## Common Sharding Mistakes (I Made All of These) 🪤

### Mistake #1: Sharding Too Early

```javascript
// Me at 50,000 users:
"Let's shard now to be prepared!"

// Reality:
// - Added complexity for no benefit
// - Debugging is harder
// - Development slower
// - Should have waited until 5M+ users
```

**The rule:** Don't shard until you HAVE to!

**When architecting on AWS, I learned:** Try these first:
1. ✅ Indexes and query optimization
2. ✅ Read replicas
3. ✅ Caching (Redis)
4. ✅ Vertical scaling (bigger server)
5. ✅ Table partitioning (same DB, split tables)
6. 🔴 Sharding (last resort!)

### Mistake #2: No Global ID Generator

```javascript
// BAD: Auto-increment IDs per shard
Shard 1: User ID 1, 2, 3, 4...
Shard 2: User ID 1, 2, 3, 4... // DUPLICATE IDs! 💥

// GOOD: Global ID generator
const { Snowflake } = require('nodejs-snowflake');
const uid = new Snowflake({
  instance_id: 1,
  epoch: 1609459200000 // 2021-01-01
});

// Generate globally unique IDs
const userId = uid.getUniqueID(); // 175928847299117063
// This ID is unique across ALL shards! ✅
```

**Popular ID generation strategies:**
- **Snowflake IDs** (Twitter's algorithm)
- **UUIDs** (universally unique, but not sortable)
- **Database sequences** (coordinated across shards)
- **Custom ID service** (centralized ID generator)

### Mistake #3: No Shard Mapping Table

```javascript
// BAD: Hardcoded shard logic
function getShard(userId) {
  if (userId < 10000000) return shard1;
  if (userId < 20000000) return shard2;
  // Adding shard? Rewrite code! 😱
}

// GOOD: Shard mapping in database
// shard_map table
{
  shardId: 1,
  host: 'db-shard-1.internal',
  minKey: 0,
  maxKey: 10000000,
  status: 'active'
}

// Dynamic lookup!
async function getShard(userId) {
  const mapping = await redis.get(`shard:${userId}`);
  if (!mapping) {
    // Lookup from shard_map table
    const shard = await db.query(
      'SELECT * FROM shard_map WHERE ? BETWEEN min_key AND max_key',
      [userId]
    );
    await redis.set(`shard:${userId}`, JSON.stringify(shard));
    return shard;
  }
  return JSON.parse(mapping);
}
```

### Mistake #4: Forgetting About Backups

```javascript
// Before sharding: 1 backup job
pg_dump database > backup.sql

// After sharding: 4 backup jobs!
pg_dump shard_1 > backup_shard_1.sql
pg_dump shard_2 > backup_shard_2.sql
pg_dump shard_3 > backup_shard_3.sql
pg_dump shard_4 > backup_shard_4.sql

// And they all need to be point-in-time consistent! 😅
```

**A production lesson that saved us:** Automate everything! Use AWS RDS automated backups for each shard!

## Real-World Sharding Tools 🛠️

### Option #1: Vitess (YouTube's Solution)

**What it is:** Sharding middleware for MySQL

```yaml
# vtgate-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vtgate
spec:
  template:
    spec:
      containers:
      - name: vtgate
        image: vitess/vtgate:latest
        env:
        - name: TOPOLOGY_FLAGS
          value: "--topo_implementation=consul"
```

**Why Vitess is awesome:**
- ✅ Handles sharding automatically
- ✅ Connection pooling
- ✅ Query routing
- ✅ Battle-tested (runs YouTube!)

### Option #2: Citus (PostgreSQL Extension)

```sql
-- Convert table to distributed table
SELECT create_distributed_table('users', 'user_id');

-- Citus automatically shards!
-- Your app uses normal PostgreSQL!
INSERT INTO users (id, email) VALUES (1, 'test@email.com');
SELECT * FROM users WHERE id = 1;

-- Citus routes queries to correct shard! 🪄
```

**Why I love Citus:**
- ✅ PostgreSQL extension (familiar!)
- ✅ Minimal code changes
- ✅ Automatic query routing
- ✅ Great for analytics workloads

### Option #3: MongoDB (Built-in Sharding)

```javascript
// Enable sharding on database
sh.enableSharding("myapp");

// Shard collection
sh.shardCollection("myapp.users", { "userId": "hashed" });

// MongoDB handles everything!
db.users.find({ userId: 12345 });
// Automatically queries correct shard! ✨
```

### Option #4: Custom Application-Level Sharding

**When I do it custom:**
- ✅ Full control over shard logic
- ✅ Can optimize for specific use case
- ✅ No external dependencies
- ⚠️ More code to maintain

**My production stack:**
- PostgreSQL (multiple instances)
- Node.js sharding layer
- Redis for shard mapping cache
- Snowflake IDs for global uniqueness

## The Bottom Line 💡

Sharding isn't a fun architectural pattern - it's a necessary evil when you outgrow a single database!

**The essentials:**
1. **Shard key is critical** - Choose wisely, you're stuck with it!
2. **Hash-based for even distribution** - Avoid hot shards
3. **Avoid cross-shard queries** - Denormalize data
4. **Global ID generation** - No duplicate IDs across shards
5. **Automate everything** - Backups, monitoring, failover
6. **Consistent hashing** - Makes resharding less painful

**The truth about sharding:**

It's not "Let's shard to be cool!" - it's "We have 50 million users and one database is dying!" You're trading simplicity for scalability!

**When designing our e-commerce backend**, I learned this: Sharding is powerful but comes with complexity. Exhaust all other options first (indexes, caching, read replicas, vertical scaling). When you finally shard, do it right - bad shard keys haunt you forever! 🎯

You don't need sharding from day one - start with a single database and graduate to sharding when you have actual scale! 🚀

## Your Action Plan 🎯

**This month (if you have 1M+ users):**
1. Analyze query patterns - Which queries are slow?
2. Identify hotspot tables - Which tables are massive?
3. Choose shard key - High cardinality, even distribution
4. Test sharding in staging - Before production!

**This quarter (if sharding makes sense):**
1. Implement global ID generation (Snowflake)
2. Set up 2-3 shards initially
3. Migrate data gradually (not all at once!)
4. Monitor shard distribution and balance

**This year:**
1. Add more shards as needed
2. Optimize cross-shard queries
3. Automate resharding process
4. Document everything for your team!

## Resources Worth Your Time 📚

**Tools I've used:**
- [Vitess](https://vitess.io/) - MySQL sharding middleware
- [Citus](https://www.citusdata.com/) - PostgreSQL extension
- [Snowflake ID](https://github.com/twitter-archive/snowflake) - Distributed ID generation

**Reading:**
- [Sharding by Uber Engineering](https://eng.uber.com/schemaless-part-one/)
- [How Discord Stores Billions of Messages](https://discord.com/blog/how-discord-stores-billions-of-messages)
- [Instagram Sharding](https://instagram-engineering.com/sharding-ids-at-instagram-1cf5a71e5a5c)

**Real talk:** The best sharding strategy is the one that fits YOUR data access patterns!

---

**Drowning in database performance issues?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk scaling strategies!

**Want to see sharding implementations?** Check out my [GitHub](https://github.com/kpanuragh) - real production patterns!

*Now go forth and shard responsibly!* 🗄️⚡

---

**P.S.** If your database has 100M+ rows and every query is slow, sharding might be your only option. But seriously, try adding indexes first! I once spent a month planning sharding, then added 3 indexes and solved 90% of problems! 🤦

**P.P.S.** I once sharded by email domain. "gmail.com" shard had 30 million users while "hotmail.com" had 500. Learn from my pain - shard by user ID or similar high-cardinality key! 😅
