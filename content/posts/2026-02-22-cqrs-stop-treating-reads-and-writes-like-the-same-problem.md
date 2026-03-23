---
title: "CQRS: Stop Treating Reads and Writes Like They're the Same Problem 📖✍️⚡"
date: "2026-02-22"
excerpt: "I had one database handling millions of product listing reads AND high-throughput order writes. They hated each other. Locks everywhere. Timeouts at checkout. Then I discovered CQRS — and my reads and writes finally got their own rooms."
tags: ["\"architecture\"", "\"scalability\"", "\"system-design\"", "\"cqrs\"", "\"distributed-systems\""]
featured: "true"
---

# CQRS: Stop Treating Reads and Writes Like They're the Same Problem 📖✍️⚡

**Unpopular opinion:** The `User` model in your Laravel app probably has 40 different responsibilities — fetching profiles, validating logins, generating admin reports, building recommendation feeds, and processing account updates. It's basically a Swiss Army knife that's slowly becoming a weapon against your own database.

I lived this reality for two years. Our e-commerce backend had one beautiful Eloquent `Product` model. It handled everything. Browse the catalog? `Product::with('reviews', 'variants', 'inventory')->paginate()`. Update the price? `$product->save()`. Run analytics? `Product::join('order_items', ...)->groupBy(...)->get()`. Totally fine until it wasn't.

**The breaking point:** During a flash sale, product listing pages were timing out. Not because of traffic. Because 50,000 read queries were fighting 8,000 write queries for the same table locks. Our reads were blocked by our writes. Our writes were slowed down by read-heavy indexes. One database. One model. Two completely different workloads tearing each other apart.

That's when I finally understood CQRS.

## What Is CQRS, Actually? 🤔

CQRS stands for **Command Query Responsibility Segregation**. In English: separate how you write data from how you read data.

Not just different endpoints. Different **models**. Potentially different **databases**.

```
Traditional Architecture:
┌──────────────────────────────────┐
│          One Model               │
│  (reads + writes + reports)      │
└──────────────┬───────────────────┘
               │
        ┌──────▼──────┐
        │  One DB     │
        │ (doing ALL  │
        │ the things) │
        └─────────────┘

CQRS Architecture:
┌──────────────┐        ┌──────────────┐
│  Commands    │        │  Queries     │
│  (writes)    │        │  (reads)     │
│              │        │              │
│  - Place     │        │  - Browse    │
│    Order     │        │    Catalog   │
│  - Update    │        │  - Get       │
│    Inventory │        │    Dashboard │
│  - Add       │        │  - Search    │
│    Product   │        │    Products  │
└──────┬───────┘        └──────┬───────┘
       │                       │
┌──────▼───────┐        ┌──────▼───────┐
│  Write DB    │        │   Read DB    │
│ (normalized, │        │ (denormalized│
│  ACID, slow  │        │  fast, cache │
│  reads OK)   │        │  everything) │
└──────────────┘        └──────────────┘
```

The key insight: **reads and writes have fundamentally different needs**, and forcing them to share a model is like making your marathon runner and your powerlifter share the same training program.

## The Real Problem: Read vs Write Workloads Are Opposites 🏋️‍♂️🏃

**Write models need:**
- Normalization (no data duplication)
- ACID transactions (consistency over speed)
- Domain logic enforcement (business rules)
- Locking (to prevent conflicts)

**Read models need:**
- Denormalization (join everything upfront, query it flat)
- Speed over consistency (eventual consistency is fine for browsing)
- Pre-computed aggregates
- No locking (reads should never block reads)

**A scalability lesson that cost us:** We added an index on `products.updated_at` to speed up the "recently updated" admin view. That index slowed down every `INSERT` and `UPDATE` on the products table by 15%. One read optimization directly hurt write performance. With CQRS, that tradeoff doesn't exist — you tune the read model for reads, the write model for writes, never crossing streams.

## Level 1: CQRS in Code (No Extra Database Required) 📐

You don't have to split databases on day one. Start by splitting your code.

```php
// ❌ The "everything in one model" chaos
class Product extends Model {
    // Used for write operations
    public function updatePrice(float $price): void { ... }
    public function decrementInventory(int $qty): void { ... }

    // Used for read operations
    public function scopeForCatalogListing($query) { ... }
    public function scopeWithAggregateReviews($query) { ... }
    public function scopeForAdminDashboard($query) { ... }

    // Used for recommendations
    public function scopeRelatedProducts($query) { ... }
}

// ✅ CQRS in code: Commands are writes, Queries are reads
// Commands (writes) — enforce domain logic
class UpdateProductPriceCommand {
    public function __construct(
        public readonly int $productId,
        public readonly float $newPrice,
        public readonly string $updatedBy
    ) {}
}

class UpdateProductPriceHandler {
    public function handle(UpdateProductPriceCommand $cmd): void {
        $product = Product::findOrFail($cmd->productId);

        if ($cmd->newPrice < 0) throw new InvalidPriceException();
        if ($cmd->newPrice > $product->max_allowed_price) throw new PriceExceedsLimitException();

        $product->update(['price' => $cmd->newPrice]);

        event(new ProductPriceUpdated($cmd->productId, $cmd->newPrice));
    }
}

// Queries (reads) — optimized for display, not domain logic
class ProductCatalogQuery {
    public function getListingPage(int $categoryId, int $page): Collection {
        return DB::table('products')
            ->join('categories', 'products.category_id', '=', 'categories.id')
            ->leftJoin('inventory', 'products.id', '=', 'inventory.product_id')
            ->select([
                'products.id', 'products.name', 'products.price',
                'products.thumbnail_url', 'inventory.stock_count',
                'categories.name as category_name'
            ])
            ->where('products.category_id', $categoryId)
            ->where('products.is_active', true)
            ->paginate(24);
        // No Eloquent overhead, no model hydration, just raw data
    }
}
```

**When designing our e-commerce backend**, I started here. No new infrastructure. Just discipline: commands go through handlers (validation + domain logic), queries go through dedicated query classes (just optimized SQL). Write logic and read logic stopped sharing the same class.

Read response time for the catalog dropped 40% just from removing Eloquent overhead and lazy-load relations on read-only queries.

## Level 2: Separate Read Models (The Real Payoff) 🚀

Now the interesting part. Your write model keeps your normalized, ACID-compliant database. But your read model becomes a **precomputed, denormalized view** optimized purely for your UI.

```
Write Model (MySQL - normalized):
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   products   │   │  inventory   │   │   reviews    │
│  id, name,   │   │  product_id, │   │  product_id, │
│  price,      │◄──│  stock,      │   │  rating,     │
│  category_id │   │  warehouse   │   │  text        │
└──────────────┘   └──────────────┘   └──────────────┘

Read Model (Redis/Elasticsearch - denormalized):
┌────────────────────────────────────────────────────┐
│  product_listing:category:42                       │
│  {                                                 │
│    id: 123,                                        │
│    name: "Wireless Earbuds",                       │
│    price: 49.99,                                   │
│    stock_available: true,    ← pre-computed        │
│    avg_rating: 4.3,          ← pre-aggregated      │
│    review_count: 847,        ← pre-counted         │
│    category_name: "Audio",   ← pre-joined          │
│    thumbnail: "cdn.../img"   ← pre-resolved        │
│  }                                                 │
└────────────────────────────────────────────────────┘
```

The read model is rebuilt whenever a relevant event fires:

```javascript
// Event handler that keeps read model in sync
eventBus.on('product.price.updated', async (event) => {
    // Update the read model in Redis
    const cachedProduct = await redis.get(`product:${event.productId}`);
    if (cachedProduct) {
        const product = JSON.parse(cachedProduct);
        product.price = event.newPrice;
        await redis.set(`product:${event.productId}`, JSON.stringify(product));
    }

    // Invalidate catalog pages that showed this product
    await redis.del(`catalog:category:${event.categoryId}:*`);
});

eventBus.on('inventory.updated', async (event) => {
    // Stock availability in read model updated instantly
    await redis.hset(`product:${event.productId}`, 'stock_available', event.newStock > 0);
});

eventBus.on('review.created', async (event) => {
    // Recalculate aggregate in background — read model stays fast
    await queue.dispatch(new RecalculateProductRatingJob(event.productId));
});
```

**Read query against the read model:**
```javascript
// This query is now embarrassingly simple
async function getProductListing(categoryId, page) {
    const cached = await redis.get(`catalog:${categoryId}:page:${page}`);
    if (cached) return JSON.parse(cached); // Cache hit: < 1ms

    // Cache miss: read from pre-denormalized store
    const products = await elasticsearch.search({
        index: 'products',
        query: { term: { category_id: categoryId } },
        from: (page - 1) * 24,
        size: 24
    });

    await redis.setex(`catalog:${categoryId}:page:${page}`, 30, JSON.stringify(products));
    return products;
}
```

**When designing our e-commerce backend**, switching the product catalog to a denormalized read model in Elasticsearch brought average catalog page latency from 340ms to 18ms. The write model didn't change at all.

## The Trade-offs (It's Not All Magic) ⚖️

| | Traditional Single Model | CQRS |
|---|---|---|
| Consistency | Strong (immediate) | Eventual |
| Read performance | Constrained by write model | Highly optimizable |
| Write performance | Constrained by read indexes | Focused, fast |
| Complexity | Low | High |
| Data sync bugs | Not possible | Definitely possible |
| Operational overhead | Low | Moderate-high |

**The big price you pay: eventual consistency.** When you update a price, the write database updates immediately. The read model updates... a few milliseconds later. For most use cases, this is invisible. For some (like financial balances), it's catastrophic.

**Use CQRS when:**
- ✅ Your read workload dwarfs writes (e-commerce catalog: 10,000 reads per write)
- ✅ Read and write optimizations conflict (indexes hurting writes)
- ✅ You have complex domain logic on writes and complex aggregation on reads
- ✅ Different teams own different parts of the system

**Do NOT use CQRS when:**
- ❌ Simple CRUD app with balanced reads/writes
- ❌ Strong consistency is non-negotiable (bank ledgers, medical records)
- ❌ Your team is < 5 engineers (operational complexity will kill you)
- ❌ You're trying to use it to avoid writing good SQL (I've seen this)

**As a Technical Lead, I've learned:** CQRS is a solution to a specific scaling problem. Teams that adopt it too early spend 3x longer building features because every field change requires updating both models. Wait until you actually feel the pain.

## Common Mistakes I Made 🪤

**Mistake #1: Stale read models in production**
```
User updates their profile → write model updated ✅
Page refreshes → still shows old data → user submits again → duplicate!
```
Fix: After a command succeeds, tell the UI "data may take a moment to update" — or optimistically update the local state while the read model syncs.

**Mistake #2: Read model out of sync after bug fix**
```
Bug in event handler ran for 3 hours → read model has wrong data
How do you fix 50,000 corrupted read records?
```
Fix: **Always archive your events.** If your read model can be rebuilt from the event stream, no data is ever truly lost. This is why EventBridge's replay feature exists.

**Mistake #3: Putting domain logic in query handlers**
```php
// ❌ This is a query. It should just query.
class GetUserDashboardQuery {
    public function handle(): array {
        $user = User::find($this->userId);
        if ($user->subscription_expired) {
            $user->downgrade_to_free(); // SIDE EFFECT IN A QUERY! 😱
        }
        return $user->dashboardData();
    }
}
```
Commands change state. Queries just read it. Never let queries have side effects.

## TL;DR 💡

CQRS isn't a magic performance button — it's an architectural discipline for when your reads and writes genuinely have different requirements.

**The three levels to adopt gradually:**
1. **Code-level CQRS** — separate command handlers from query classes. Zero infrastructure cost.
2. **Read model optimization** — denormalize your read data into Redis or Elasticsearch. Big wins.
3. **Full CQRS + Event Sourcing** — separate databases, events drive read model updates. Maximum scalability, maximum complexity.

Start at level 1. Go to level 2 when you measure a real problem. Get to level 3 only when you genuinely need it.

**A scalability lesson that cost us:** I went straight to level 3 on a feature that turned out to need level 1. Spent two weeks building the infrastructure. Feature got deprioritized. Infrastructure sat unused for four months. Don't do that.

Your reads and writes don't have to share everything. Sometimes the kindest thing you can do for your database is give them separate rooms.

---

**Running a split read/write architecture in production?** I'd love to compare notes on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — especially around consistency strategies on the read model.

**Want to see a real CQRS implementation in Laravel?** Check out [GitHub](https://github.com/kpanuragh) for patterns from a production e-commerce backend.

*Go separate those concerns. Your DB will thank you.* 📖✍️⚡

---

**P.S.** CQRS and Event Sourcing are often mentioned together, but they're independent patterns. You can do CQRS without Event Sourcing (most should). Event Sourcing without CQRS is theoretically possible but painful in practice. Post on Event Sourcing coming soon — it's wild enough to deserve its own post. 🎯
