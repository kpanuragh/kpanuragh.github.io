---
title: "🔢 Stop Using OFFSET Pagination — Cursor-Based Pagination Will Save Your Database"
date: 2026-02-26
excerpt: "OFFSET pagination feels fine until page 500 brings your database to its knees. Here's how cursor-based pagination works, why it's faster, and how to implement it in Express."
tags: ["nodejs", "express", "backend", "database", "api", "performance"]
featured: true
---

# 🔢 Stop Using OFFSET Pagination — Cursor-Based Pagination Will Save Your Database

You've built a nice little API. It paginates results. Users can ask for page 1, page 2, page 50. You're proud of yourself. Life is good.

Then your app grows. Now someone requests **page 3,000**. Your database quietly begins digging through 30,000 rows it doesn't need, just to throw away 29,975 of them and return 25. Your CPU fan sounds like a jet engine. Your DBA sends you a passive-aggressive Slack message.

This is the `OFFSET` trap — and almost every developer walks straight into it.

## What's Wrong With OFFSET?

Classic pagination looks like this:

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 25 OFFSET 3000;
```

Seems innocent. But here's the dirty secret: the database **still reads all 3,025 rows** from the beginning. It processes them in order, counts up to offset 3,000, then tosses them aside and hands you the last 25. That's like asking a librarian to count 3,000 books off a shelf just so you can look at book numbers 3,001 through 3,025.

As your dataset grows, deep pages get **exponentially slower**. Page 1 is instant. Page 1,000 is noticeable. Page 10,000 is a prayer.

There's also a fun bonus bug: if someone inserts a new row while a user is paginating, rows shift. They'll either see duplicates or skip records entirely. Your data is silently lying to them.

## Enter Cursor-Based Pagination

Instead of saying "skip N rows", cursor pagination says "give me rows *after this specific record*." The database uses an index to jump directly to that record, then reads forward. No counting. No scanning. Just surgical precision.

The "cursor" is usually an encoded pointer to the last item the client saw — typically its ID or timestamp. You return it in your response, and the client passes it back on the next request.

Here's the concept in SQL:

```sql
SELECT * FROM posts
WHERE created_at < '2026-02-25T10:00:00'
ORDER BY created_at DESC
LIMIT 25;
```

The database hits the index on `created_at`, jumps directly to that timestamp, and reads the next 25. Doesn't matter if you're on "page" 1 or "page" 10,000 — the query time is **constant**.

## Implementing It in Express

Let's build a clean cursor pagination endpoint. We'll use a timestamp-based cursor encoded in base64 (so it's opaque to clients and you can change the internals later).

```javascript
const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/api/posts', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 25, 100);
  const cursor = req.query.cursor;

  let cursorDate = null;
  if (cursor) {
    try {
      cursorDate = new Date(Buffer.from(cursor, 'base64').toString('utf8'));
      if (isNaN(cursorDate.getTime())) throw new Error('Invalid cursor');
    } catch {
      return res.status(400).json({ error: 'Invalid cursor value' });
    }
  }

  const query = cursorDate
    ? `SELECT id, title, created_at FROM posts
       WHERE created_at < $1
       ORDER BY created_at DESC
       LIMIT $2`
    : `SELECT id, title, created_at FROM posts
       ORDER BY created_at DESC
       LIMIT $1`;

  const params = cursorDate ? [cursorDate, limit] : [limit];
  const { rows } = await pool.query(query, params);

  const nextCursor = rows.length === limit
    ? Buffer.from(rows[rows.length - 1].created_at.toISOString()).toString('base64')
    : null;

  res.json({
    data: rows,
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
    },
  });
});
```

The client gets something like:

```json
{
  "data": [...],
  "pagination": {
    "nextCursor": "MjAyNi0wMi0yNVQxMDowMDowMC4wMDBa",
    "hasMore": true
  }
}
```

To get the next page, they just hit `/api/posts?cursor=MjAyNi0wMi0yNVQxMDowMDowMC4wMDBa`. No page numbers. No math. No drama.

## The Gotchas (Because Nothing Is Free)

**Timestamps can collide.** If two rows have the exact same `created_at`, you might miss one. The fix: use a composite cursor — encode both the timestamp *and* the row ID, then filter on `(created_at, id)`. This gives you a tiebreaker.

**You can't jump to an arbitrary page.** Cursor pagination is inherently sequential. You can't say "take me to page 47." This is a feature for infinite scroll and feed-style UIs, not a replacement for everything. If users genuinely need to jump to a specific page (think search results), OFFSET is still fine — just keep your datasets small.

**Cursors can expire.** If your cursor encodes a row ID that gets deleted, things get weird. Build in validation, and communicate clearly in your API docs that cursors are short-lived (treat them like session tokens).

**Bidirectional pagination is harder.** "Previous page" requires either storing cursor history on the client or using a separate `before` cursor. Most infinite-scroll UIs don't need this, but classic table UIs do. Plan accordingly.

## When to Use Which

| Scenario | Use |
|---|---|
| Infinite scroll / feeds | Cursor ✅ |
| Large datasets (100k+ rows) | Cursor ✅ |
| Consistent results during live updates | Cursor ✅ |
| User needs "go to page N" | OFFSET ✅ |
| Small, static datasets | Either works |

## The Takeaway

OFFSET pagination is the path of least resistance. It's easy to understand, easy to implement, and completely fine until it isn't. Cursor pagination takes a little more thought up front, but it scales gracefully and keeps your database happy.

Your database doesn't hate you. It just hates being asked to count to 30,000 before every query.

Switch to cursors before page 500 becomes a production incident. Your future self — and your DBA — will thank you.

---

**Have you hit the OFFSET wall in production?** Drop a comment or reach out on [GitHub](https://github.com/kpanuragh) — I'd love to hear what dataset size finally broke you. It's always a fun (in hindsight) story.
