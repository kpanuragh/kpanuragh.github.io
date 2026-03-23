---
title: "CQRS: Stop Reading and Writing from the Same Database Like a Caveman 📖✍️"
date: "2026-03-07"
excerpt: "Your dashboard query is locking the table while your checkout is trying to write orders. I've been there. After scaling an e-commerce backend to handle Black Friday chaos, I learned that separating reads from writes isn't premature optimization — it's survival!"
tags: ["\\\"architecture\\\"", "\\\"scalability\\\"", "\\\"system-design\\\"", "\\\"cqrs\\\"", "\\\"database\\\""]
featured: "true"
---

# CQRS: Stop Reading and Writing from the Same Database Like a Caveman 📖✍️

**Real story:** Our e-commerce platform had a single PostgreSQL database. One database. Reads and writes, everyone sharing the same pool, living together in harmony — until Black Friday.

At 11:03 PM, some overly enthusiastic product manager triggered a sales report query. A full table scan across 50 million orders. No index. Just vibes.

Every checkout request started timing out. Database CPU: 99%. Write latency: 4 seconds. 12,000 users trying to complete purchases while one report query held the entire table hostage.

**Me:** "Why is checkout broken?"

**DBA:** "There's a report query running. It's been going for 11 minutes."

**Me:** "KILL IT."

**DBA:** "It's... the CEO's dashboard."

**Me:** 😶

That night I learned the most important architecture lesson of my career: **reads and writes have completely different requirements, and treating them the same is asking for trouble.**

Welcome to CQRS — Command Query Responsibility Segregation.

## What Is CQRS? 🤔

CQRS is a pattern where you **separate the read side (queries) from the write side (commands)** of your application.

**Without CQRS (what everyone starts with):**
```
User Request
     │
     ▼
  Service Layer
     │
     ▼
  Repository
     │
     ▼
  Single Database ← reads AND writes compete here
```

**With CQRS:**
```
Write Request            Read Request
     │                        │
     ▼                        ▼
Command Handler          Query Handler
     │                        │
     ▼                        ▼
Write Database ──sync──► Read Database
(normalized,             (denormalized,
 consistent)              optimized for reads)
```

**The core idea:** Your checkout process needs ACID transactions and consistency. Your product listing page needs speed and can tolerate data that's 2 seconds stale. These are different problems — stop solving them with the same tool!

## The Problem With "One Database For Everything" 💀

When designing our e-commerce backend, we had these two queries hitting the same database:

**Write: Checkout process**
```sql
BEGIN TRANSACTION;
  INSERT INTO orders (user_id, total, status) VALUES (?, ?, 'pending');
  INSERT INTO order_items (order_id, product_id, qty, price) VALUES ...;
  UPDATE inventory SET stock = stock - ? WHERE product_id = ?;
  INSERT INTO payments (order_id, amount, gateway_ref) VALUES ...;
COMMIT;
```
Needs: Strict consistency, row locks, ACID guarantees. Should take < 200ms.

**Read: Admin dashboard**
```sql
SELECT
    u.name,
    COUNT(o.id) as order_count,
    SUM(o.total) as lifetime_value,
    AVG(o.total) as avg_order_value,
    MAX(o.created_at) as last_order,
    GROUP_CONCAT(DISTINCT p.category) as purchased_categories
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN products p ON oi.product_id = p.id
GROUP BY u.id
ORDER BY lifetime_value DESC;
```
Needs: Eventually consistent is fine, can take 10 seconds, nobody is waiting in real-time.

**The problem:** Both queries fight for the same connection pool, same CPU, same I/O. The slow analytical query steals resources from the fast transactional query. Users suffer. Revenue drops. You get paged at 2 AM.

## CQRS in Practice: The E-Commerce Example 🛍️

Here's how I restructured our system:

**Before (everything in one place):**
```javascript
// productService.js - does EVERYTHING
class ProductService {
    // Reads
    async getProduct(id) { return db.query('SELECT * FROM products WHERE id = ?', [id]); }
    async searchProducts(query) { return db.query('SELECT * FROM products WHERE name LIKE ?', [`%${query}%`]); }
    async getProductWithReviews(id) { /* massive JOIN query */ }
    async getDashboardStats() { /* 10-table JOIN that kills the DB */ }

    // Writes
    async createProduct(data) { return db.query('INSERT INTO products ...', data); }
    async updateStock(id, qty) { return db.query('UPDATE products SET stock = ? WHERE id = ?', [qty, id]); }
    async processOrder(orderData) { /* multi-table transaction */ }
}
```

**After CQRS:**

```javascript
// commands/CreateOrderCommand.js - Write side
class CreateOrderCommandHandler {
    constructor(writeDb, eventBus) {
        this.writeDb = writeDb;  // PostgreSQL - normalized, ACID
        this.eventBus = eventBus;
    }

    async handle(command) {
        const { userId, items, paymentDetails } = command;

        // This ONLY writes. Clean, fast, consistent.
        return await this.writeDb.transaction(async (trx) => {
            // Validate stock (with row locks)
            for (const item of items) {
                const product = await trx('products')
                    .where('id', item.productId)
                    .forUpdate()  // Lock row!
                    .first();

                if (product.stock < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}`);
                }
            }

            // Create order
            const [orderId] = await trx('orders').insert({
                user_id: userId,
                total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
                status: 'pending',
                created_at: new Date()
            });

            // Create order items
            await trx('order_items').insert(
                items.map(item => ({
                    order_id: orderId,
                    product_id: item.productId,
                    quantity: item.quantity,
                    price: item.price
                }))
            );

            // Decrement stock
            for (const item of items) {
                await trx('products')
                    .where('id', item.productId)
                    .decrement('stock', item.quantity);
            }

            // Publish event so READ side can sync
            await this.eventBus.publish('OrderCreated', {
                orderId,
                userId,
                items,
                createdAt: new Date()
            });

            return { orderId };
        });
    }
}
```

```javascript
// queries/GetProductListQuery.js - Read side
class GetProductListQueryHandler {
    constructor(readDb) {
        this.readDb = readDb;  // Read replica or DynamoDB or Elasticsearch
    }

    async handle(query) {
        const { category, page, search, sortBy } = query;

        // This ONLY reads. Optimized for display, denormalized, fast.
        // The read DB has a pre-computed "product_catalog" view
        // that's already joined, formatted, and indexed.
        const products = await this.readDb('product_catalog')
            .where(builder => {
                if (category) builder.where('category', category);
                if (search) builder.where('name', 'like', `%${search}%`);
            })
            .orderBy(sortBy || 'created_at', 'desc')
            .paginate({ currentPage: page, perPage: 20 });

        // Response time: 5ms vs 200ms before CQRS 🚀
        return products;
    }
}
```

```javascript
// Event handler: Sync write events to read database
class OrderCreatedEventHandler {
    constructor(readDb) {
        this.readDb = readDb;
    }

    async handle(event) {
        const { orderId, userId, items } = event;

        // Update the read-optimized "user_stats" table
        // This is pre-computed so dashboard queries are instant
        await this.readDb('user_stats')
            .where('user_id', userId)
            .increment({
                order_count: 1,
                total_spent: items.reduce((sum, i) => sum + i.price * i.quantity, 0)
            });

        // Update the "product_popularity" table
        for (const item of items) {
            await this.readDb('product_popularity')
                .where('product_id', item.productId)
                .increment('order_count', item.quantity);
        }

        // The dashboard now reads from pre-computed tables = instant!
    }
}
```

## The Architecture That Saved Black Friday 🏗️

After restructuring, here's what our system looked like:

```
           WRITE PATH                    READ PATH

    Mobile App / Web                Mobile App / Web
          │                               │
          ▼                               ▼
    Command Bus                      Query Bus
  (async, queued)                  (sync, cached)
          │                               │
          ▼                               ▼
  Command Handlers               Query Handlers
  (business logic,               (no business logic,
   validation, rules)             just fetch & format)
          │                               │
          ▼                               ▼
   Write Database               Read Database(s)
   (PostgreSQL)                 (Read Replica +
   Normalized,                   Elasticsearch +
   ACID, Consistent              Redis Cache)
          │                               ▲
          │     Event Bus                 │
          └──── (SQS/SNS) ───────────────┘
                                    (async sync)
```

**The result after this change:**
- Checkout latency: 800ms → 120ms ✅
- Dashboard query: 45s → 80ms ✅
- Database CPU during reports: 99% → 15% (write DB) ✅
- CEO could run reports without killing sales ✅
- My pager no longer went off at 2 AM ✅

## When CQRS Is Overkill (Be Honest With Yourself) 🛑

**As a Technical Lead, I've learned:** CQRS is NOT for every app. I've seen junior devs implement CQRS on a blog with 50 users. Please don't.

**You DON'T need CQRS when:**
- Your app has simple CRUD operations
- Read and write loads are similar
- Your team is small (< 5 devs)
- You're pre-product-market fit
- One database handles the load fine

**A scalability lesson that cost us:** We tried CQRS too early on a non-critical internal tool. We spent 3 weeks building the infrastructure, adding event sync, debugging eventual consistency bugs — for a tool with 20 users and 100 requests/day. Pure over-engineering. The simplest solution is always the right solution until it isn't.

**You DO need CQRS when:**
- Read load >> Write load (typical for e-commerce: 100:1 ratio)
- Dashboard/reporting queries slow down transactional operations
- You need different scaling strategies for reads vs writes
- Your domain has complex business logic on writes but simple display on reads
- You're hitting database CPU limits on reads while writes are fine

## Common Mistakes I Made Implementing CQRS 🪤

### Mistake #1: Treating Eventual Consistency as "Data Loss"

```javascript
// BAD: Trying to make the read side immediately consistent
await commandBus.handle(createOrderCommand);
// Immediately query the read side
const order = await queryBus.handle(getOrderQuery); // ← WILL FAIL or return stale data!

// The read side hasn't synced yet! Events are async!
```

```javascript
// GOOD: Design for eventual consistency from the start
const { orderId } = await commandBus.handle(createOrderCommand);

// Return the ID immediately, let the UI poll or use websockets
res.json({
    orderId,
    status: 'processing',
    message: 'Order placed! Refreshing in a moment...'
});

// Or: Use the write DB for the "just placed" confirmation screen
// and read DB only for the "order history" page
```

### Mistake #2: Sharing the Same Database

```javascript
// BAD: Same DB, different tables — you've gained nothing
// "Read" table: order_read_view
// "Write" table: orders
// Same database. Same connection pool. Same CPU. Useless.
```

```javascript
// GOOD: Physically separate the data stores
const writeDb = knex({ client: 'pg', connection: process.env.WRITE_DB_URL });
const readDb = knex({ client: 'pg', connection: process.env.READ_REPLICA_URL });
// OR: readDb could be DynamoDB, Elasticsearch, Redis — whatever fits the query
```

### Mistake #3: Putting Business Logic in Query Handlers

```javascript
// BAD: Business logic in read side
class GetOrderQueryHandler {
    async handle(query) {
        const order = await this.readDb('orders').where('id', query.orderId).first();

        // ❌ NO! Don't do business calculations here!
        order.canRefund = order.status === 'delivered' &&
            (new Date() - new Date(order.created_at)) < 30 * 24 * 60 * 60 * 1000;
        order.loyaltyPoints = Math.floor(order.total * 0.1);

        return order;
    }
}

// GOOD: Query handlers just fetch data. Business logic lives on write side.
// Pre-compute these values when the event fires and store them in the read DB!
```

## The Read Model: Your Secret Weapon 🎯

The real power of CQRS is designing read models specifically for how you display data.

**Without CQRS:** You have one Order table and join it everywhere.

**With CQRS:** You have multiple read models, each optimized for its use case:

```javascript
// Event handler builds multiple read models from one write event
class OrderCreatedEventHandler {
    async handle(event) {
        // Read model 1: "My Orders" page — needs order summary
        await this.readDb('order_summaries').insert({
            order_id: event.orderId,
            user_id: event.userId,
            item_count: event.items.length,
            total: event.total,
            status_label: 'Processing',
            created_at: event.createdAt
        });

        // Read model 2: Admin dashboard — needs analytics
        await this.readDb('daily_revenue').insert({
            date: event.createdAt.toDateString(),
            revenue: event.total,
            order_id: event.orderId
        }).onConflict('date').merge({
            revenue: this.readDb.raw('daily_revenue.revenue + ?', [event.total])
        });

        // Read model 3: Product page — needs "X people bought this today"
        for (const item of event.items) {
            await this.readDb('product_sales_today')
                .where('product_id', item.productId)
                .increment('count', item.quantity);
        }
    }
}

// Now each page reads from its own optimized table
// My Orders page: SELECT * FROM order_summaries WHERE user_id = ? — instant!
// Admin dashboard: SELECT SUM(revenue) FROM daily_revenue WHERE date = ? — instant!
// Product page: SELECT count FROM product_sales_today WHERE product_id = ? — instant!
```

No joins. No aggregations at query time. Everything pre-computed. 🚀

## Quick Implementation Checklist ✅

Before adding CQRS to your system:

- [ ] Are your reads genuinely slower than your writes due to reporting/analytics?
- [ ] Is read load 10x+ higher than write load?
- [ ] Do you have complex domain logic that's getting muddied by display concerns?
- [ ] Can your team handle eventual consistency without panicking?
- [ ] Do you have monitoring for event sync lag?

If you checked 3+, CQRS will help. If you checked 1 or fewer — go home, your database is fine.

## The Bottom Line 💡

CQRS isn't magic. It's not even particularly complicated. It's just **accepting that reading data and writing data are different problems** and designing your system accordingly.

**When I reflect on scaling our e-commerce backend**, the shift to CQRS wasn't about following a fancy pattern. It was about acknowledging that our checkout flow and our reporting dashboard had nothing in common except the data they touched — and fighting over the same database was hurting both.

The moment we separated them, read performance went through the roof, write reliability improved, and the on-call rotation became a lot less stressful.

**The rule I live by now:** One database is fine until reads and writes start fighting. Once they fight, separate them. CQRS gives you the blueprint for that separation.

Start simple. Scale when you must. Separate reads from writes when the pain is real — not before.

---

**Scaling distributed systems?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk architecture war stories!

**See real patterns in production?** Check out my [GitHub](https://github.com/kpanuragh) for implementations that actually ship.

*Now go separate your reads from your writes!* 📖✍️

---

**P.S.** That CEO dashboard query? After CQRS, it runs in 80ms off a pre-computed read model. The CEO is happy. Checkout is happy. My pager is silent. This is what good architecture feels like. 😌
