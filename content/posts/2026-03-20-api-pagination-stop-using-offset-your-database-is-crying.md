---
title: "API Pagination: Stop Using OFFSET or Your Database Is Quietly Crying 📄⚡"
date: "2026-03-20"
excerpt: "I built our e-commerce product listing with OFFSET pagination and it worked great — until we hit 500K products and every page-10 query started taking 4 seconds. Here's the pagination strategy that saved our backend."
tags: ["\\\"architecture\\\"", "\\\"scalability\\\"", "\\\"system-design\\\"", "\\\"api-design\\\"", "\\\"databases\\\""]
featured: "true"
---

# API Pagination: Stop Using OFFSET or Your Database Is Quietly Crying 📄⚡

**Hot take:** OFFSET pagination is the `SELECT *` of API design — everyone learns it first, everyone uses it in production, and it silently destroys your database at scale.

I built our e-commerce product listing with it. Classic stuff:

```http
GET /api/products?page=1&limit=20
GET /api/products?page=2&limit=20
GET /api/products?page=50&limit=20
```

It worked beautifully. Until it didn't. The wake-up call was our DBA Slack-ing me a screenshot of a query at 4 seconds with a single comment: "Page 50 of your product listing. Fix this."

That started my education in pagination strategies. Let me save you the 3am alerts.

## Why OFFSET Is a Performance Time Bomb 💣

When you do `OFFSET 1000 LIMIT 20`, you might think the database cleverly jumps to row 1001. It doesn't.

**What actually happens:**

```sql
-- This looks innocent:
SELECT * FROM products ORDER BY created_at DESC LIMIT 20 OFFSET 1000;

-- What the database does internally:
-- 1. Scan and sort the first 1020 rows
-- 2. Throw away the first 1000
-- 3. Return the remaining 20
-- ↑ That "throw away" is not free. You paid for ALL 1020 rows.
```

```
OFFSET performance reality:

Page 1   (OFFSET 0):    reads 20 rows    ← fast ✅
Page 5   (OFFSET 100):  reads 120 rows   ← fine ✅
Page 25  (OFFSET 500):  reads 520 rows   ← okay ✅
Page 50  (OFFSET 1000): reads 1020 rows  ← 🐢
Page 500 (OFFSET 10000): reads 10020 rows ← 💀
Page 5000 (OFFSET 100K): reads 100020 rows ← ☠️
```

**On our 500K-product catalog, page 100 took 4.2 seconds.** Nobody goes to page 100 of a product listing, but our internal admin tools did — running exports, reports, data migrations. The whole system crawled.

A scalability lesson that cost us: we had an export script that paginated through ALL products 20 at a time. At 500K products, 25K paginated queries. The last few hundred queries were taking 3–4 seconds each. A 5-minute export became a 6-hour job. We noticed when it started competing with user traffic.

## Option 1: Cursor-Based Pagination ⚡

Cursor pagination replaces "page number" with "give me items after this specific item." Instead of counting rows, you're using an indexed column as a bookmark.

```sql
-- OFFSET: "Skip 1000 rows, give me the next 20"
SELECT * FROM products ORDER BY created_at DESC LIMIT 20 OFFSET 1000;

-- CURSOR: "Give me 20 rows where created_at is older than this timestamp"
SELECT * FROM products
WHERE created_at < '2024-01-15T10:30:00Z'  -- the cursor
ORDER BY created_at DESC
LIMIT 20;
```

**The database doesn't throw away any rows.** It uses the index on `created_at` to find the cursor position and reads exactly 20 rows. O(log N + 20) instead of O(N).

Here's how I implemented it in our Node.js API:

```javascript
// GET /api/products?limit=20&cursor=<token>
async function getProducts(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const cursor = req.query.cursor
    ? decodeCursor(req.query.cursor)
    : null;

  let query = db('products')
    .select('*')
    .orderBy('created_at', 'desc')
    .limit(limit + 1);  // Fetch one extra to detect "has more"

  if (cursor) {
    // "Give me rows older than the cursor timestamp"
    query = query.where('created_at', '<', cursor.created_at);
  }

  const products = await query;
  const hasMore = products.length > limit;
  if (hasMore) products.pop();  // Remove the extra row

  // Encode the cursor from the LAST item in results
  const nextCursor = hasMore
    ? encodeCursor({ created_at: products[products.length - 1].created_at })
    : null;

  return res.json({
    data: products,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit
    }
  });
}

// Opaque cursor encoding — users can't tamper with it
function encodeCursor(data) {
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(token) {
  return JSON.parse(Buffer.from(token, 'base64url').toString());
}
```

**API response:**

```json
{
  "data": [...20 products...],
  "pagination": {
    "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0xNVQxMDozMDowMFoifQ",
    "has_more": true,
    "limit": 20
  }
}
```

**Client fetches next page:**

```http
GET /api/products?limit=20&cursor=eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0xNVQxMDozMDowMFoifQ
```

Performance on 500K products: **page 1 = 3ms. Page 50,000 = 3ms.** The cursor is an index seek, not a table scan. The database doesn't care how deep you are.

## The Cursor Trap: Non-Unique Columns 🪤

Here's where I got burned. I used `created_at` as my cursor. Products can have the same `created_at` timestamp if they were bulk-imported. When your cursor falls in a tie, you skip rows or return duplicates.

```
Products with same created_at:
 row 18: created_at = 2024-01-15T10:30:00Z, id = "abc"
 row 19: created_at = 2024-01-15T10:30:00Z, id = "def"  ← cursor lands here
 row 20: created_at = 2024-01-15T10:30:00Z, id = "ghi"
 row 21: created_at = 2024-01-15T10:30:00Z, id = "xyz"

Next page: WHERE created_at < '2024-01-15T10:30:00Z'
           ↑ This skips "ghi" and "xyz"! They have the same timestamp as the cursor!
```

**Fix: use a composite cursor with a tiebreaker.**

```javascript
// Composite cursor: (created_at, id) — always unique
function encodeCursor(item) {
  return Buffer.from(JSON.stringify({
    created_at: item.created_at,
    id: item.id
  })).toString('base64url');
}

// Query with composite cursor
if (cursor) {
  query = query.where(function() {
    this.where('created_at', '<', cursor.created_at)
      .orWhere(function() {
        this.where('created_at', '=', cursor.created_at)
          .andWhere('id', '<', cursor.id);
      });
  });
}
```

Now ties are broken by `id`. No skipped rows, no duplicates. **This is the version I should have built first.**

## Option 2: Keyset Pagination (for Sorted Results) 🗂️

When designing our e-commerce backend, I needed to paginate products sorted by price — a common user filter. Cursor by `created_at` doesn't help here. Enter keyset pagination.

```sql
-- User sorted by price ascending, currently seeing items up to $49.99
-- Next page: items starting from the "keyset" of the last item seen

SELECT * FROM products
WHERE
  price > 49.99  -- last price seen
  OR (price = 49.99 AND id > 'uuid-of-last-item')  -- tiebreaker
ORDER BY price ASC, id ASC
LIMIT 20;
```

```javascript
// Keyset pagination — works for any sort order
async function getProductsByPrice(lastPrice, lastId, limit = 20) {
  let query = db('products')
    .orderBy([
      { column: 'price', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(limit + 1);

  if (lastPrice !== undefined && lastId) {
    query = query.where(function() {
      this.where('price', '>', lastPrice)
        .orWhere(function() {
          this.where('price', '=', lastPrice)
            .andWhere('id', '>', lastId);
        });
    });
  }

  const products = await query;
  const hasMore = products.length > limit;
  if (hasMore) products.pop();

  return {
    data: products,
    next: hasMore ? {
      last_price: products[products.length - 1].price,
      last_id: products[products.length - 1].id
    } : null
  };
}
```

**As a Technical Lead, I've learned:** the cursor needs to encode your entire sort key. If you sort by `(price, name, id)`, your cursor needs all three values. It's verbose but it's correct.

## When OFFSET Is Actually Fine 🤷

I said OFFSET is bad, but let me be honest about when it's fine:

```
OFFSET is acceptable when:
✅ Small datasets (< 10K rows total) — deep pages don't exist
✅ Admin panels with fixed row counts — nobody pages to row 500K
✅ You need "jump to page 47" — cursors can't do this
✅ Reporting/analytics — running once, slow queries are tolerable

OFFSET is a problem when:
❌ Large datasets (> 100K rows) + deep pagination
❌ Infinite scroll / "load more" UIs
❌ Public APIs where clients might paginate deeply
❌ Background jobs processing all records in batches
```

**For our e-commerce product catalog (public-facing):** cursor pagination.
**For our internal admin panel with a 200-product table:** OFFSET is fine, I'm not rewriting it.

```
Architecture rule I live by:
"Premature optimization is the root of all evil.
 But ignoring obvious O(N) queries on growing tables is just evil."
```

## The "Seek Method" for Background Jobs 🔄

Our export and migration scripts used to do this:

```javascript
// TERRIBLE for large datasets — gets slower with each page
let page = 1;
while (true) {
  const products = await db('products')
    .limit(100)
    .offset((page - 1) * 100);  // O(N) for each page!

  if (products.length === 0) break;
  await processProducts(products);
  page++;
}
```

The seek method with cursor pagination:

```javascript
// FAST — each iteration is O(log N) regardless of position
let cursor = null;

while (true) {
  const { data: products, pagination } = await getProducts({ limit: 100, cursor });

  if (products.length === 0) break;

  await processProducts(products);

  if (!pagination.has_more) break;
  cursor = pagination.next_cursor;
}
```

**Our 500K-product export went from 6 hours to 8 minutes.** Same data, different pagination strategy.

## Pagination Strategies at a Glance 📐

```
┌─────────────────┬────────────────┬─────────────────┬───────────────┐
│ Strategy        │ Performance    │ Can Jump Pages? │ Best For      │
├─────────────────┼────────────────┼─────────────────┼───────────────┤
│ OFFSET          │ O(N) deep pages│ ✅ Yes          │ Small datasets│
│ Cursor-based    │ O(log N)       │ ❌ No           │ Infinite scroll│
│ Keyset          │ O(log N)       │ ❌ No           │ Sorted lists  │
│ Seek method     │ O(log N)       │ ❌ No           │ Batch jobs    │
└─────────────────┴────────────────┴─────────────────┴───────────────┘
```

**Pro tip:** Make sure your cursor column has an index. `WHERE created_at < ?` is O(log N) only because of the B-tree index. Without it, you've traded one full scan for another.

```sql
-- Without this index, cursor pagination is just slow OFFSET in disguise
CREATE INDEX idx_products_created_at_id ON products(created_at DESC, id DESC);
```

## Common Mistakes to Avoid 🚫

**Mistake 1: Exposing raw cursor values**

```javascript
// BAD: client sees your internal data structure
next_cursor: { "created_at": "2024-01-15T10:30:00Z", "id": "abc-123" }

// GOOD: encode it, clients can't tamper with it
next_cursor: "eyJjcmVhdGVkX2F0IjoiMjAyNC0wMS0xNVQxMDozMDowMFoiLCJpZCI6ImFiYy0xMjMifQ"
```

**Mistake 2: Cursor pagination with unstable sort orders**

```javascript
// BAD: What's the cursor when two items have the same relevance score?
ORDER BY relevance_score DESC  // ← ties cause duplicate/missing items

// GOOD: always add a unique tiebreaker
ORDER BY relevance_score DESC, id ASC
```

**Mistake 3: Forgetting that cursor pages can go stale**

```
User opens page 1. New product added at the top of the list.
User fetches page 2 via cursor.
The cursor is CORRECT — it gives them what comes after page 1.
But their "page 1" is now actually showing old data.

This is fine for most UIs (infinite scroll handles it gracefully).
It's NOT fine if you're counting rows for an export — use snapshots or transactions.
```

## TL;DR 💡

- **OFFSET** is simple and works fine for small tables or admin tools where deep pagination is rare
- **Cursor pagination** is O(log N) regardless of depth — use it for public APIs, infinite scroll, and large datasets
- **Always use a composite cursor** (timestamp + id) to handle ties
- **Index your cursor columns** — this is non-negotiable
- **Background jobs processing all rows** should use the seek method, not offset loops

**When designing our e-commerce backend**, switching from OFFSET to cursor pagination was a one-sprint effort that paid off in year two when our catalog hit 500K products. Don't wait for the 3am Slack message. Build it right from page one.

---

**Got a pagination horror story?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the one about the nightly report that used OFFSET on a 10M-row table is even worse than this one.

**See the implementation?** My [GitHub](https://github.com/kpanuragh) has working examples from real projects.

*Build your pages right. Your DBA, your users, and your 3am self will thank you.* 📄⚡

---

**P.S.** If you're running background jobs that page through large tables with OFFSET, go check the query times RIGHT NOW. I'll wait. 🙏

**P.P.S.** "But OFFSET worked fine in development!" — yes, with 100 seed records. Try it with 500K. That's not a development environment, that's a controlled illusion.
