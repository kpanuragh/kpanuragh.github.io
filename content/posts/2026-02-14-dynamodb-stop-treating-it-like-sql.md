---
title: "DynamoDB: Stop Treating It Like a SQL Database 🔥📊"
date: "2026-02-14"
excerpt: "You're doing JOINs in application code, scanning entire tables, and wondering why your AWS bill is $500/month? After architecting production DynamoDB systems handling millions of requests, here's how to actually use NoSQL - not SQL in denial!"
tags: ["aws", "dynamodb", "nosql", "serverless"]
featured: true
---

# DynamoDB: Stop Treating It Like a SQL Database 🔥📊

**Real talk:** The first time I used DynamoDB, I thought "It's just a database, right? Tables, rows, queries... I got this!" Then I tried to JOIN two tables. No JOIN support. Tried to query by any field. Access Denied. Scanned a table. $87 bill for ONE query. My boss asked if I was mining Bitcoin. 😅

Welcome to DynamoDB - where your SQL habits will bankrupt you and confuse you in equal measure!

## What Even Is DynamoDB? (Beyond "AWS NoSQL") 🤔

**DynamoDB = AWS's managed NoSQL database** - Key-value and document store that scales to trillions of requests per day.

**Think of it like:** A massive HashMap on steroids, NOT a relational database wearing a disguise!

**SQL Database (PostgreSQL):**
```
Users Table:
┌──────┬──────────┬───────────────┬─────────┐
│ id   │ username │ email         │ status  │
├──────┼──────────┼───────────────┼─────────┤
│ 1    │ john     │ john@mail.com │ active  │
│ 2    │ jane     │ jane@mail.com │ active  │
└──────┴──────────┴───────────────┴─────────┘

Orders Table:
┌──────┬─────────┬─────────┬────────┐
│ id   │ user_id │ total   │ status │
├──────┼─────────┼─────────┼────────┤
│ 101  │ 1       │ 99.99   │ paid   │
│ 102  │ 1       │ 49.99   │ paid   │
└──────┴─────────┴─────────┴────────┘

Query: SELECT * FROM orders
       JOIN users ON orders.user_id = users.id
       WHERE users.status = 'active';
```

**DynamoDB (The Right Way):**
```
Single Table Design:
┌─────────────────┬──────────────┬──────────────────┐
│ PK              │ SK           │ attributes       │
├─────────────────┼──────────────┼──────────────────┤
│ USER#1          │ PROFILE      │ {name, email...} │
│ USER#1          │ ORDER#101    │ {total, status...}│
│ USER#1          │ ORDER#102    │ {total, status...}│
│ USER#2          │ PROFILE      │ {name, email...} │
└─────────────────┴──────────────┴──────────────────┘

Query: GetItem or Query on PK="USER#1"
// Gets user AND all their orders in ONE request! 🎯
```

**Why DynamoDB is everywhere:** Infinite scale, predictable performance, fully managed, serverless pricing (pay per request!)

**Why DynamoDB is confusing:** Everything you learned from SQL is now WRONG! 🤯

## The $847 DynamoDB Bill: My NoSQL Horror Story 💀

When architecting our serverless e-commerce backend, I needed to store users and their orders. "Simple!" I thought. "Just like PostgreSQL tables!"

**What I naively did (SQL mindset):**

```javascript
// Created separate tables (WRONG!)
const usersTable = 'Users';
const ordersTable = 'Orders';

// Tried to "JOIN" in application code
async function getUserWithOrders(userId) {
  // Get user
  const user = await dynamodb.get({
    TableName: usersTable,
    Key: { userId }
  }).promise();

  // "JOIN" - scan orders table for this user (DISASTER!)
  const orders = await dynamodb.scan({
    TableName: ordersTable,
    FilterExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId
    }
  }).promise();

  return { ...user.Item, orders: orders.Items };
  // Scanned ENTIRE orders table (1M rows)! 😱
}
```

**What happened:**
- Scan operation read 1M rows × 4KB avg = 4GB of data
- Read Capacity Units: 4GB / 4KB = 1,000,000 RCUs
- On-Demand pricing: 1M RCUs × $1.25 per million = **$1.25 PER QUERY**
- 100 users loaded dashboard = **$125**
- 1000 users = **$1,250**
- Monthly bill with 10K daily active users: **$37,500** 💸💸💸

**The lesson:** DynamoDB is NOT PostgreSQL. Scans are EVIL. JOINs don't exist. You must think in access patterns!

## DynamoDB Mistake #1: Multiple Tables Instead of Single Table Design 🚨

**The SQL habit:**
```
users_table
orders_table
products_table
reviews_table
// "One table per entity, just like SQL!"
```

**Why this fails in DynamoDB:**
- Can't JOIN tables (no native support!)
- Multiple queries to fetch related data (latency × N)
- Higher costs (separate requests for each table)
- Complex application code (manual "JOINs")

**The DynamoDB way - Single Table Design:**

```javascript
// ONE table for EVERYTHING!
const TableName = 'EcommerceApp';

// User entity
{
  PK: 'USER#john@email.com',
  SK: 'PROFILE',
  email: 'john@email.com',
  name: 'John Doe',
  createdAt: '2024-01-15'
}

// User's orders (same PK, different SK!)
{
  PK: 'USER#john@email.com',
  SK: 'ORDER#2024-02-14#abc123',
  orderId: 'abc123',
  total: 99.99,
  status: 'delivered'
}

// Product entity
{
  PK: 'PRODUCT#laptop-xyz',
  SK: 'DETAILS',
  productId: 'laptop-xyz',
  name: 'MacBook Pro',
  price: 2499.99,
  stock: 50
}

// Product reviews (same PK, different SK!)
{
  PK: 'PRODUCT#laptop-xyz',
  SK: 'REVIEW#user123#2024-02-10',
  userId: 'user123',
  rating: 5,
  comment: 'Amazing laptop!'
}
```

**Query all user data in ONE request:**

```javascript
// Get user profile AND all their orders!
const result = await dynamodb.query({
  TableName: 'EcommerceApp',
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: {
    ':pk': 'USER#john@email.com'
  }
}).promise();

// Result contains:
// - User profile (SK='PROFILE')
// - All orders (SK starts with 'ORDER#')
// In ONE efficient query! ✨
```

**In production, I've deployed** a single DynamoDB table serving 8 different entity types. Queries that used to take 300ms (5 table lookups) now take 15ms (1 query)! 🚀

## DynamoDB Mistake #2: Using Scan Instead of Query 📡

**The disaster:**

```javascript
// WRONG: Scan reads ENTIRE table!
const result = await dynamodb.scan({
  TableName: 'Users',
  FilterExpression: 'email = :email',
  ExpressionAttributeValues: {
    ':email': 'john@email.com'
  }
}).promise();

// What happens:
// 1. DynamoDB reads ALL items in table
// 2. Filters results in-memory
// 3. You pay for EVERY item read (not just results!)
// 4. 1M items × 4KB = 1,000,000 RCUs = $1.25 per scan!
```

**The proper way:**

```javascript
// RIGHT: Query uses PK (reads only what you need!)
const result = await dynamodb.query({
  TableName: 'EcommerceApp',
  KeyConditionExpression: 'PK = :pk',
  ExpressionAttributeValues: {
    ':pk': 'USER#john@email.com'
  }
}).promise();

// What happens:
// 1. DynamoDB uses PK index (instant lookup!)
// 2. Reads ONLY items with PK='USER#john@email.com'
// 3. 10 items × 4KB = 10 RCUs = $0.0000125
// 4. 80,000× cheaper! 🎉
```

**When Scan is acceptable:**
- ✅ Small tables (<100 items)
- ✅ Batch jobs that process ALL data
- ✅ Migrations or one-time operations
- ❌ NEVER in user-facing queries!

**Real example that saved us:**

```javascript
// Before (Scan - SLOW & EXPENSIVE):
async function getActiveOrders() {
  const result = await dynamodb.scan({
    TableName: 'Orders',
    FilterExpression: 'status = :status',
    ExpressionAttributeValues: { ':status': 'active' }
  }).promise();

  return result.Items;
  // Scanned 500K orders, returned 1K active ones
  // Cost: $0.625 per call! 💸
}

// After (Query with GSI - FAST & CHEAP):
async function getActiveOrders() {
  const result = await dynamodb.query({
    TableName: 'EcommerceApp',
    IndexName: 'GSI1', // Global Secondary Index on status
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'STATUS#active' }
  }).promise();

  return result.Items;
  // Queried only active orders
  // Cost: $0.00125 per call (500× cheaper!) 🎯
}
```

**A scalability lesson that cost us:** Replace every Scan with a Query + GSI. Our DynamoDB bill dropped from $847/month to $63/month! 💰

## DynamoDB Mistake #3: Not Understanding Partition Keys (PK) and Sort Keys (SK) 🔑

**The confusion:**

```javascript
// WRONG: Using auto-incrementing IDs as PK
{
  PK: '1',  // Sequential IDs = hot partition!
  SK: 'USER',
  name: 'John'
}
{
  PK: '2',
  SK: 'USER',
  name: 'Jane'
}

// Problem: All writes go to one partition (slow!)
// DynamoDB spreads data across partitions by PK hash
// Sequential PKs = uneven distribution = throttling!
```

**The right way:**

```javascript
// GOOD: Composite PK with high cardinality
{
  PK: 'USER#john@email.com',  // Email (unique!)
  SK: 'PROFILE',
  name: 'John Doe'
}
{
  PK: 'USER#jane@email.com',  // Different PK = different partition
  SK: 'PROFILE',
  name: 'Jane Smith'
}

// Now writes are distributed across many partitions! ✅
```

**Understanding PK and SK:**

**Partition Key (PK):**
- Determines WHERE data is stored physically
- DynamoDB hashes PK to assign partition
- High cardinality = better distribution
- Example: Email, UUID, composite key

**Sort Key (SK):**
- Orders items within same partition
- Enables range queries (begins_with, between, etc.)
- Optional but super useful!
- Example: Timestamp, status, entity type

**Real-world design pattern:**

```javascript
// E-commerce orders by user
{
  PK: 'USER#john@email.com',     // Partition by user
  SK: 'ORDER#2024-02-14#abc123',  // Sort by date + order ID
  orderId: 'abc123',
  total: 99.99,
  status: 'shipped',
  items: [...]
}

// Query user's recent orders
const recent = await dynamodb.query({
  TableName: 'EcommerceApp',
  KeyConditionExpression: 'PK = :pk AND SK > :date',
  ExpressionAttributeValues: {
    ':pk': 'USER#john@email.com',
    ':date': 'ORDER#2024-02-01'  // Orders after Feb 1
  },
  ScanIndexForward: false,  // Newest first!
  Limit: 10
}).promise();
```

**When architecting on AWS, I learned:** PK determines cost and performance. Choose wisely! High cardinality PKs = happy DynamoDB = happy wallet! 🎯

## DynamoDB Mistake #4: Not Using Global Secondary Indexes (GSI) 📇

**The problem - Can only query by PK:**

```javascript
// Table design:
{
  PK: 'USER#john@email.com',
  SK: 'ORDER#abc123',
  orderId: 'abc123',
  status: 'shipped',
  createdAt: '2024-02-14'
}

// Can query:
✅ "Get all orders for john@email.com" (PK query)

// CAN'T query (without GSI):
❌ "Get all orders with status='shipped'"
❌ "Get all orders from Feb 14, 2024"
❌ "Get order by orderId"
```

**The solution - Add GSI:**

```javascript
// Create GSI on status
{
  PK: 'USER#john@email.com',
  SK: 'ORDER#2024-02-14#abc123',
  orderId: 'abc123',
  status: 'shipped',
  // GSI1 attributes
  GSI1PK: 'STATUS#shipped',
  GSI1SK: '2024-02-14#abc123'
}

// Now you can query by status!
const shipped = await dynamodb.query({
  TableName: 'EcommerceApp',
  IndexName: 'GSI1',
  KeyConditionExpression: 'GSI1PK = :status',
  ExpressionAttributeValues: {
    ':status': 'STATUS#shipped'
  }
}).promise();
```

**Pro tip - Overload GSI for multiple access patterns:**

```javascript
{
  PK: 'USER#john@email.com',
  SK: 'ORDER#abc123',
  orderId: 'abc123',
  status: 'shipped',
  createdAt: '2024-02-14',

  // GSI1: Query by status
  GSI1PK: 'STATUS#shipped',
  GSI1SK: '2024-02-14#abc123',

  // GSI2: Query by date
  GSI2PK: 'DATE#2024-02-14',
  GSI2SK: 'ORDER#abc123'
}
```

**Now you support:**
1. Get user's orders: Query PK
2. Get orders by status: Query GSI1
3. Get orders by date: Query GSI2

**GSI gotchas I learned the hard way:**

```javascript
// BAD: GSI with low cardinality PK
GSI1PK: 'PREMIUM'  // Only 2 values: PREMIUM or FREE
// All premium users = one hot partition!

// GOOD: GSI with composite key
GSI1PK: 'PREMIUM#US-EAST'  // Split by region!
// Better distribution = better performance!
```

**In production, I've deployed** tables with 3-5 GSIs supporting different query patterns. Cost increase: ~30%. Query performance: 100× faster! 🚀

## DynamoDB Mistake #5: Not Using Conditional Writes (Race Conditions!) 🏁

**The disaster:**

```javascript
// WRONG: Read-modify-write without conditions
async function decrementStock(productId, quantity) {
  // 1. Read current stock
  const product = await dynamodb.get({
    TableName: 'Products',
    Key: { PK: `PRODUCT#${productId}`, SK: 'DETAILS' }
  }).promise();

  const currentStock = product.Item.stock;

  // 2. Calculate new stock
  const newStock = currentStock - quantity;

  // 3. Write new stock (RACE CONDITION!)
  await dynamodb.update({
    TableName: 'Products',
    Key: { PK: `PRODUCT#${productId}`, SK: 'DETAILS' },
    UpdateExpression: 'SET stock = :stock',
    ExpressionAttributeValues: { ':stock': newStock }
  }).promise();

  // Problem: Two concurrent requests can oversell!
  // Request A reads stock=10
  // Request B reads stock=10
  // A writes stock=8 (sold 2)
  // B writes stock=7 (sold 3)
  // Actual stock should be 5, but shows 7! 😱
}
```

**The atomic way:**

```javascript
// RIGHT: Atomic update with condition
async function decrementStock(productId, quantity) {
  try {
    await dynamodb.update({
      TableName: 'Products',
      Key: { PK: `PRODUCT#${productId}`, SK: 'DETAILS' },
      UpdateExpression: 'SET stock = stock - :qty',
      ConditionExpression: 'stock >= :qty',  // Only if enough stock!
      ExpressionAttributeValues: { ':qty': quantity }
    }).promise();

    return { success: true };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return { success: false, reason: 'Insufficient stock' };
    }
    throw error;
  }
}

// Atomic operation - no race conditions!
// DynamoDB handles concurrent updates safely! ✅
```

**More conditional write patterns:**

```javascript
// Optimistic locking with version numbers
{
  PK: 'USER#john@email.com',
  SK: 'PROFILE',
  name: 'John Doe',
  version: 5
}

await dynamodb.update({
  TableName: 'Users',
  Key: { PK: 'USER#john@email.com', SK: 'PROFILE' },
  UpdateExpression: 'SET #name = :name, version = version + 1',
  ConditionExpression: 'version = :expectedVersion',
  ExpressionAttributeNames: { '#name': 'name' },
  ExpressionAttributeValues: {
    ':name': 'John Smith',
    ':expectedVersion': 5
  }
}).promise();

// If version changed since read, update fails!
// Prevents lost updates! 🛡️
```

**Prevent duplicate orders:**

```javascript
// Idempotency with conditional put
await dynamodb.put({
  TableName: 'Orders',
  Item: {
    PK: 'USER#john@email.com',
    SK: `ORDER#${orderId}`,
    orderId,
    total: 99.99
  },
  ConditionExpression: 'attribute_not_exists(PK)'
  // Fails if order already exists (duplicate request!)
}).promise();
```

**A production lesson that saved us:** Black Friday 2023, conditional writes prevented overselling by 1,247 units! Always use conditions for critical updates! 🎯

## DynamoDB Mistake #6: Ignoring Read/Write Capacity Modes 💸

**Two pricing modes:**

### Provisioned Capacity (Predictable Traffic)

```javascript
// Set fixed capacity
await dynamodb.updateTable({
  TableName: 'EcommerceApp',
  ProvisionedThroughput: {
    ReadCapacityUnits: 100,   // 100 RCUs = 100 strongly consistent reads/sec
    WriteCapacityUnits: 50    // 50 WCUs = 50 writes/sec
  }
}).promise();

// Cost:
// 100 RCUs × $0.00013/hour × 730 hours = $9.49/month
// 50 WCUs × $0.00065/hour × 730 hours = $23.73/month
// Total: $33.22/month (predictable!)
```

**Good for:**
- ✅ Consistent, predictable traffic
- ✅ Always-on applications
- ✅ Reserved Capacity discount (1-year commit = 53% off!)

**Bad for:**
- ❌ Spiky traffic (Black Friday, viral posts)
- ❌ Dev/test environments (wasted capacity)

### On-Demand Mode (Spiky Traffic)

```javascript
// Enable on-demand (no capacity planning!)
await dynamodb.updateTable({
  TableName: 'EcommerceApp',
  BillingMode: 'PAY_PER_REQUEST'
}).promise();

// Cost:
// $1.25 per million reads
// $6.25 per million writes
```

**Real cost comparison:**

```
Scenario: E-commerce site
- 10M reads/month (consistent)
- 2M writes/month (consistent)

Provisioned (Reserved Capacity):
- 40 RCUs × $0.00013 × 730 × 0.47 (discount) = $1.78
- 10 WCUs × $0.00065 × 730 × 0.47 (discount) = $2.23
- Total: $4.01/month ✅ CHEAP!

On-Demand:
- 10M reads × $1.25/million = $12.50
- 2M writes × $6.25/million = $12.50
- Total: $25/month ⚠️ 6× more expensive!

BUT during Black Friday spike:
- 100M reads, 20M writes in 1 day
- On-Demand: $125 + $125 = $250 (scales automatically!)
- Provisioned: Throttled! ❌ (unless you overprovision year-round)
```

**My production setup:**
- **Main tables:** Provisioned with Auto Scaling (predictable traffic)
- **Event logs:** On-Demand (spiky writes from user actions)
- **Dev/Test:** On-Demand (pay only when testing)

**When architecting on AWS, I learned:** Start with On-Demand, measure traffic patterns, switch to Provisioned once stable. Saved us $200/month! 💰

## DynamoDB Mistake #7: Not Using DynamoDB Streams (Missing Events!) 📨

**The problem - Need to react to data changes:**

```javascript
// User places order
await dynamodb.put({
  TableName: 'Orders',
  Item: { PK: 'USER#john', SK: 'ORDER#123', total: 99.99 }
}).promise();

// How do you:
// ❌ Send confirmation email?
// ❌ Update inventory?
// ❌ Trigger shipping?
// ❌ Log to analytics?

// Without Streams: Poll database or duplicate logic everywhere!
```

**The solution - DynamoDB Streams:**

```javascript
// Enable Streams on table
await dynamodb.updateTable({
  TableName: 'Orders',
  StreamSpecification: {
    StreamEnabled: true,
    StreamViewType: 'NEW_AND_OLD_IMAGES'  // See before/after!
  }
}).promise();

// Lambda triggers on every change!
exports.handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const newOrder = record.dynamodb.NewImage;

      // Send email
      await ses.sendEmail({
        to: newOrder.email.S,
        subject: 'Order Confirmation',
        body: `Thank you for ordering ${newOrder.total.N}!`
      });

      // Update inventory
      await decrementStock(newOrder.items.L);

      // Log analytics
      await analytics.track('order_placed', newOrder);
    }
  }
};
```

**Stream view types:**

```javascript
// KEYS_ONLY: Just PK and SK (minimal data)
{ Keys: { PK: 'USER#john', SK: 'ORDER#123' } }

// NEW_IMAGE: After the change
{ NewImage: { PK: 'USER#john', SK: 'ORDER#123', total: 99.99, status: 'paid' } }

// OLD_IMAGE: Before the change
{ OldImage: { PK: 'USER#john', SK: 'ORDER#123', total: 99.99, status: 'pending' } }

// NEW_AND_OLD_IMAGES: Both!
{
  OldImage: { status: 'pending' },
  NewImage: { status: 'paid' }
}
// Perfect for tracking changes! ✨
```

**Real-world pattern - Event sourcing:**

```javascript
// Order table (source of truth)
{
  PK: 'ORDER#123',
  SK: 'DETAILS',
  status: 'shipped',
  total: 99.99
}

// Stream Lambda writes to event log
exports.handler = async (event) => {
  for (const record of event.Records) {
    const { OldImage, NewImage } = record.dynamodb;

    if (OldImage?.status !== NewImage?.status) {
      // Status changed - log event!
      await dynamodb.put({
        TableName: 'EventLog',
        Item: {
          PK: 'ORDER#123',
          SK: `EVENT#${Date.now()}`,
          eventType: 'STATUS_CHANGE',
          oldStatus: OldImage.status.S,
          newStatus: NewImage.status.S,
          timestamp: new Date().toISOString()
        }
      }).promise();
    }
  }
};

// Now you have full audit trail of every change! 📜
```

**In production, I've deployed** Streams for:
- Email notifications (order confirmations)
- Search indexing (replicate to Elasticsearch)
- Real-time dashboards (push updates to frontend)
- Cache invalidation (clear stale Redis cache)

**A serverless pattern that saved us:** Streams + Lambda = event-driven architecture! No polling, instant reactions, scales automatically! 🚀

## The DynamoDB Access Pattern Design Process 🎨

**Step 1: List ALL access patterns FIRST**

```
User Management:
1. Get user by email
2. Get user by userId
3. Get all users by registration date
4. Get all premium users

Orders:
5. Get order by orderId
6. Get all orders for a user
7. Get recent orders (last 30 days)
8. Get orders by status

Products:
9. Get product by productId
10. Get products by category
11. Get trending products
```

**Step 2: Design table structure to support patterns**

```javascript
// Single table design
{
  // User entity
  PK: 'USER#john@email.com',
  SK: 'PROFILE',
  userId: 'user123',
  name: 'John Doe',
  plan: 'premium',
  createdAt: '2024-01-15',
  GSI1PK: 'PLAN#premium',
  GSI1SK: '2024-01-15'
}

{
  // Order entity
  PK: 'USER#john@email.com',
  SK: 'ORDER#2024-02-14#order123',
  orderId: 'order123',
  total: 99.99,
  status: 'shipped',
  GSI1PK: 'ORDER#order123',
  GSI1SK: 'ORDER#order123',
  GSI2PK: 'STATUS#shipped',
  GSI2SK: '2024-02-14'
}

{
  // Product entity
  PK: 'PRODUCT#laptop-xyz',
  SK: 'DETAILS',
  productId: 'laptop-xyz',
  name: 'MacBook Pro',
  category: 'laptops',
  views: 15847,
  GSI1PK: 'CATEGORY#laptops',
  GSI1SK: 'VIEWS#15847'
}
```

**Step 3: Map queries to indexes**

```javascript
// 1. Get user by email
// Query PK='USER#john@email.com' AND SK='PROFILE'

// 2. Get all orders for user
// Query PK='USER#john@email.com' AND begins_with(SK, 'ORDER#')

// 3. Get all premium users
// Query GSI1 where GSI1PK='PLAN#premium'

// 4. Get order by orderId
// Query GSI1 where GSI1PK='ORDER#order123'

// 5. Get orders by status
// Query GSI2 where GSI2PK='STATUS#shipped'

// 6. Get trending products in category
// Query GSI1 where GSI1PK='CATEGORY#laptops'
// ScanIndexForward=false (highest views first!)
```

**The template I use for every DynamoDB project:**

```javascript
const AccessPatterns = {
  // Entity: User
  getUserByEmail: (email) => ({
    TableName: 'App',
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': `USER#${email}`,
      ':sk': 'PROFILE'
    }
  }),

  getUserOrders: (email) => ({
    TableName: 'App',
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${email}`,
      ':prefix': 'ORDER#'
    }
  }),

  // Entity: Order
  getOrderById: (orderId) => ({
    TableName: 'App',
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `ORDER#${orderId}`
    }
  }),

  getOrdersByStatus: (status) => ({
    TableName: 'App',
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `STATUS#${status}`
    }
  })
};
```

## DynamoDB Best Practices Checklist ✅

**Before going to production:**

- [ ] **Designed access patterns FIRST** (not table structure!)
- [ ] **Using single table design** (not one table per entity)
- [ ] **All queries use PK** (no scans in user-facing code!)
- [ ] **Added GSIs for alternate access patterns**
- [ ] **Using composite sort keys** (enables range queries)
- [ ] **Conditional writes for atomic operations**
- [ ] **Enabled DynamoDB Streams** (for change events)
- [ ] **Chose right capacity mode** (Provisioned vs On-Demand)
- [ ] **Set up CloudWatch alarms** (throttling, capacity)
- [ ] **Implemented exponential backoff** (for retries)

## Common DynamoDB Patterns I Use in Production 🎯

### Pattern 1: Single Table with Entity Prefixes

```javascript
// All entities in ONE table!
{
  PK: 'USER#john@email.com',
  SK: 'PROFILE',
  type: 'User',  // Helps with filtering
  ...attributes
}
{
  PK: 'USER#john@email.com',
  SK: 'ORDER#2024-02-14#abc',
  type: 'Order',
  ...attributes
}
{
  PK: 'PRODUCT#laptop-xyz',
  SK: 'DETAILS',
  type: 'Product',
  ...attributes
}
```

### Pattern 2: Inverted Index with GSI

```javascript
// Main table: Query users by email
{
  PK: 'USER#john@email.com',
  SK: 'PROFILE',
  userId: 'user123',
  GSI1PK: 'USERID#user123',  // Inverted!
  GSI1SK: 'PROFILE'
}

// Now query by EITHER email OR userId!
```

### Pattern 3: Adjacency List (Relationships)

```javascript
// Users follow each other
{
  PK: 'USER#john',
  SK: 'FOLLOWS#jane',
  followedAt: '2024-02-14'
}
{
  PK: 'USER#jane',
  SK: 'FOLLOWED_BY#john',
  followedAt: '2024-02-14'
}

// Get who John follows:
Query PK='USER#john' AND begins_with(SK, 'FOLLOWS#')

// Get John's followers:
Query PK='USER#john' AND begins_with(SK, 'FOLLOWED_BY#')
```

## The Bottom Line 💡

DynamoDB is NOT a SQL database wearing a costume. It's a completely different paradigm!

**The essentials:**
1. **Think in access patterns, not tables**
2. **Single table design for related entities**
3. **Always query by PK (never scan!)**
4. **Use GSIs for alternate queries**
5. **Conditional writes for consistency**
6. **Streams for event-driven architecture**

**The truth about DynamoDB:**

It's not "easier than PostgreSQL" - it's DIFFERENT! You trade SQL flexibility for infinite scale and predictable performance. Learn the patterns, embrace NoSQL thinking, and DynamoDB becomes a superpower!

**When architecting our e-commerce backend**, I learned: Stop fighting DynamoDB's design. Embrace single table. Design for queries, not entities. Use GSIs liberally. And for the love of all that is holy, NEVER use Scan in production! 🙏

You don't need perfect table design from day one - you need access patterns documented and table structure that supports them! 🚀

## Your Action Plan 🎯

**This week:**
1. List ALL access patterns for your app
2. Design single table structure
3. Test queries with sample data
4. Migrate one entity from SQL to DynamoDB

**This month:**
1. Replace all Scans with Query + GSI
2. Add conditional writes for critical updates
3. Enable DynamoDB Streams
4. Monitor costs and optimize capacity mode

**This quarter:**
1. Complete migration to single table design
2. Add GSIs for all access patterns
3. Implement event-driven architecture with Streams
4. Become the NoSQL guru on your team! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [NoSQL Workbench](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/workbench.html) - Design and test tables
- [DynamoDB Toolbox](https://github.com/jeremydaly/dynamodb-toolbox) - Better DX for Node.js
- [AWS DynamoDB Pricing Calculator](https://calculator.aws/#/createCalculator/DynamoDB)

**Reading list:**
- [The DynamoDB Book](https://www.dynamodbbook.com/) by Alex DeBrie (THE bible!)
- [AWS DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)

**Real talk:** The best DynamoDB design starts with access patterns, not entities. Think queries first, tables second!

---

**Still scanning tables in production?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your DynamoDB war stories!

**Want to see my single table designs?** Check out my [GitHub](https://github.com/kpanuragh) - real production examples!

*Now go forth and NoSQL responsibly!* 🔥📊

---

**P.S.** If you're doing JOINs in application code, you're using DynamoDB wrong. Single table design exists for a reason - use it! 🎯

**P.P.S.** I once left a Scan operation in production that cost $847 in one month. The lesson? Monitor your read patterns, set CloudWatch alarms, and ALWAYS use Query over Scan. Learn from my expensive mistake! 💸
