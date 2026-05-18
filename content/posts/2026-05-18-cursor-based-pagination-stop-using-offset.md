---
title: "Cursor-Based Pagination: Why OFFSET Is Slowly Killing Your API 🐌"
date: "2026-05-18"
excerpt: "OFFSET pagination feels intuitive until your database is scanning 500,000 rows to serve page 100. Cursor-based pagination fixes the performance cliff, ghost records, and duplicate entries in one shot."
tags: ["backend", "api-design", "databases", "pagination", "performance"]
featured: true
---

# Cursor-Based Pagination: Why OFFSET Is Slowly Killing Your API 🐌

Let me paint a picture.

You're at a library. You want the 10,000th book in the catalog. With OFFSET pagination, the librarian goes through every single book from #1 to #9,999, tosses them on the floor, *then* hands you the stack starting at #10,000. Thanks. Very helpful. Great system.

That's OFFSET pagination. And it's what most APIs ship by default.

## The Problem With OFFSET

OFFSET/LIMIT is seductive because it maps perfectly to "page 1, page 2, page 3" — the way humans think about lists. Here's what it looks like:

```sql
-- Page 1
SELECT * FROM posts ORDER BY created_at DESC LIMIT 10 OFFSET 0;

-- Page 5
SELECT * FROM posts ORDER BY created_at DESC LIMIT 10 OFFSET 40;

-- Page 5000 (enjoy the scan)
SELECT * FROM posts ORDER BY created_at DESC LIMIT 10 OFFSET 49990;
```

The database doesn't teleport to row 49,990. It reads every row before that point, discards them, then returns 10. On a table with millions of rows, deep pagination becomes a full table scan wearing a disguise.

But performance isn't even the worst part. Here's the sneaky one:

**Data shifts while users paginate.**

Imagine a user is on page 3 of a news feed. While they're reading, a new post comes in. The entire list shifts down by one. Page 4 now contains the last item from page 3. They scroll forward and see a duplicate. They scroll back and something vanished. Ghost records and duplicates — introduced by a completely normal INSERT.

At Cubet, we hit this hard on a high-traffic dashboard showing real-time transaction logs. Users kept reporting "I see the same transaction on two pages." OFFSET pagination plus active writes equals chaos. The fix wasn't tuning indexes. The fix was throwing out OFFSET entirely.

## Enter Cursor-Based Pagination

Instead of "give me rows 40–50," you say "give me 10 rows *after this specific row*."

The "specific row" identifier is your cursor — typically an encoded version of the last item's ID or timestamp. The client gets a cursor back with each response and passes it on the next request.

```javascript
// Express endpoint
app.get('/api/posts', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const cursor = req.query.cursor; // base64-encoded last post ID

  let query = db('posts').orderBy('id', 'desc').limit(limit + 1);

  if (cursor) {
    const lastId = Buffer.from(cursor, 'base64').toString('ascii');
    query = query.where('id', '<', lastId);
  }

  const posts = await query;
  const hasNextPage = posts.length > limit;
  const results = hasNextPage ? posts.slice(0, limit) : posts;

  const nextCursor = hasNextPage
    ? Buffer.from(String(results[results.length - 1].id)).toString('base64')
    : null;

  res.json({ data: results, nextCursor, hasNextPage });
});
```

Notice the trick: fetch `limit + 1` rows. If you get that extra row, there's a next page. Slice it off before returning. No COUNT(*). No scanning half your table.

The SQL becomes:

```sql
-- First page (no cursor)
SELECT * FROM posts ORDER BY id DESC LIMIT 11;

-- Next page (cursor decoded to id 9999847)
SELECT * FROM posts WHERE id < 9999847 ORDER BY id DESC LIMIT 11;
```

The database hits an index on `id` directly. No matter how deep you go — page 1 or page 10,000 — the query cost is identical. That's not a micro-optimization; it's a completely different complexity class.

## What You Gain (and Lose)

**Gains:**
- Consistent O(log n) query time regardless of page depth
- No duplicates when records are inserted between fetches
- Works naturally with infinite scroll UIs
- Each cursor response is stable and cacheable

**Losses:**
- No "jump to page 47" — cursors are forward/backward only
- Harder to display "showing results 470–480 of 3,291"
- Sorting gets complicated if your cursor field isn't unique

That last point bites people. If you cursor on `created_at` and two posts share the exact same timestamp, your cursor is ambiguous. The fix: composite cursors — combine the timestamp with the ID.

```javascript
const encodeCursor = (post) => {
  const raw = `${post.created_at.toISOString()}__${post.id}`;
  return Buffer.from(raw).toString('base64');
};

const decodeCursor = (cursor) => {
  const raw = Buffer.from(cursor, 'base64').toString('ascii');
  const [timestamp, id] = raw.split('__');
  return { timestamp, id };
};
// WHERE clause: (created_at, id) < (:cursor_ts, :cursor_id)
```

A composite index on `(created_at, id)` makes this just as fast as the simple case.

## When to Use Which

Not every API needs cursor pagination. Here's my rough rule:

| Use OFFSET when… | Use Cursor when… |
|---|---|
| Dataset is small and mostly static | Dataset is large or append-heavy |
| Users need to jump to arbitrary pages | You're building infinite scroll |
| You need a total count in the response | Query performance matters at depth |
| Simplicity beats everything else | Data consistency between pages matters |

Admin dashboards exporting a static 200-row report? OFFSET is fine. User-facing feeds, transaction histories, chat messages, audit logs? Cursor, every time.

## The Response Shape That Actually Works

One thing teams get wrong: inconsistent pagination envelopes across endpoints. Standardize it from day one:

```json
{
  "data": [...],
  "pagination": {
    "nextCursor": "MTAwNQ==",
    "prevCursor": "OTk5MA==",
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

If you're building a public API, consider following the Relay cursor connection spec — your GraphQL and REST clients can share pagination logic instead of each inventing their own.

## The Real Lesson

OFFSET feels like it works because it *does* work at small scale. You build it, it passes tests, you ship it. Then your dataset hits 2 million rows and page 200 starts taking 800ms and you're adding indexes to indexes trying to fix a fundamentally broken approach.

Cursor pagination is slightly more work upfront. You lose free page numbers. But you get a system that performs identically on row 1 and row 5,000,000 — and that's the kind of guarantee that lets you sleep at night.

After migrating the transaction log dashboard at Cubet to cursor-based pagination, deep-page queries dropped from \~700ms to under 20ms. The "dashboard is slow" complaints stopped entirely. Not because we threw hardware at it — because we stopped asking the database to do something it was never meant to do.

Build it right from the start. Your future self — the one debugging why page 847 takes 12 seconds in production — will thank you.

---

*Using cursor pagination in the wild? Ran into edge cases with composite cursors or bi-directional traversal? I'd love to hear about it — find me on [Twitter/X](https://x.com/kpanuragh).*
