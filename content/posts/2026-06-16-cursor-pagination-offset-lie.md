---
title: "🔢 OFFSET Pagination is a Lie: Switch to Cursors Before Your Table Eats You Alive"
date: "2026-06-16"
excerpt: "OFFSET-based pagination sounds innocent until your table hits a million rows and your database starts full-scanning just to skip the first 50,000. Here's why cursor-based pagination is the fix your API deserves."
tags: ["databases", "postgresql", "pagination", "backend", "performance"]
featured: true
---

Let me paint you a familiar picture. You ship a `/posts?page=2&limit=20` endpoint. Feels clean, works fine in dev. Stakeholders are happy. Six months later your table has 2 million rows, a user clicks page 500, and your database goes silent for three seconds before returning a response. Your Slack starts lighting up.

Congratulations — you've hit the OFFSET wall.

## What OFFSET Actually Does (It's Not What You Think)

When you write:

```sql
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 10000;
```

PostgreSQL doesn't teleport to row 10,001. It reads **every single row** from the start, counts ten thousand of them, throws them away, and *then* returns your twenty. You paid the full cost of scanning 10,020 rows to give the user 20.

Do this on a 5-million-row table at page 250, and you're scanning 5,000 rows × however many concurrent users are browsing. You've built a self-inflicted full-table-scan machine.

The math is brutal: response time grows linearly with page number. Page 1 is fast. Page 1,000 is slow. Page 10,000 is a production incident.

And that's before you account for the **phantom row problem**: if someone inserts a row while a user is paginating, rows shift. The user skips one entry or sees one twice. Your pagination is lying about what data exists.

## Cursor Pagination: Bookmark, Don't Count

Cursor pagination replaces "skip N rows" with "give me rows that come after this specific row." Instead of a page number, you hand the client an opaque cursor that encodes the position of the last seen item.

```sql
-- First page (no cursor)
SELECT id, title, created_at
FROM posts
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- Subsequent pages (cursor = last row's values)
SELECT id, title, created_at
FROM posts
WHERE (created_at, id) < ('2024-03-15 10:23:00', 8472)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Notice what changed: the `WHERE` clause lets the database use your index on `(created_at, id)`. Instead of scanning from the top and counting, PostgreSQL seeks directly to the right place in the index and returns the next 20 rows. Page 10,000 is just as fast as page 1.

The `id` column in the composite sort is the tiebreaker — `created_at` alone isn't unique, so without it two rows at the same timestamp could cause you to skip or repeat data. Always include a unique column as the secondary sort key.

## Building the Cursor

The cursor itself is just the last row's sort values, base64-encoded so clients treat it as opaque:

```typescript
interface CursorPayload {
  created_at: string;
  id: number;
}

function encodeCursor(row: { created_at: Date; id: number }): string {
  const payload: CursorPayload = {
    created_at: row.created_at.toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}

async function getPosts(cursor?: string, limit = 20) {
  let whereClause = "";
  const params: unknown[] = [limit + 1]; // fetch one extra to detect hasNextPage

  if (cursor) {
    const { created_at, id } = decodeCursor(cursor);
    whereClause = `WHERE (created_at, id) < ($2, $3)`;
    params.push(created_at, id);
  }

  const rows = await db.query(
    `SELECT id, title, created_at
     FROM posts
     ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    params
  );

  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const nextCursor = hasNextPage ? encodeCursor(items[items.length - 1]) : null;

  return { items, nextCursor, hasNextPage };
}
```

The trick of fetching `limit + 1` rows and checking if you got them all is a clean way to know if a next page exists without a separate `COUNT(*)` query. Count queries are expensive. Don't pay for them if you can avoid it.

## The Index You Actually Need

None of this works without the right index. Make sure it exists:

```sql
CREATE INDEX idx_posts_cursor ON posts (created_at DESC, id DESC);
```

Without this, your cursor query just trades one full scan for another. With it, PostgreSQL uses an index-only scan or a fast index range scan — the query is nearly instantaneous regardless of table size.

At Cubet, we added this index to a client's content API that had been limping along with OFFSET pagination on a table with ~8 million rows. Page 200 went from 4.2 seconds to under 40ms. Same data, same query logic, just the right index and the right WHERE clause.

## The Trade-offs (Be Honest About Them)

Cursor pagination is not free. The main limitation is that **you can't jump to an arbitrary page**. If your UI has a "go to page 47" button, cursors won't help you — you can only go forward (or backward with some extra work). This makes it ideal for infinite-scroll UIs, feeds, and API consumers iterating through results, but awkward for traditional numbered pagination.

You also can't easily give users a total count. `SELECT COUNT(*)` on a large table is slow and often unnecessary — most users don't care that there are exactly 847,293 results. But if your product team insists on showing "Page 3 of 1,247", you're either back to expensive counts or you need to cache them separately.

And cursors can break if your sort column is updated. If you're paginating by `updated_at` and rows get updated between requests, the cursor position becomes unreliable. Sort by an immutable column (like `created_at` or `id`) whenever possible.

## When to Use Which

| Scenario | Use |
|---|---|
| Infinite scroll / feed | Cursor |
| API consumers iterating all records | Cursor |
| User-facing "next/prev" buttons | Cursor |
| Numbered page UI with jump-to-page | OFFSET (or cache counts) |
| Admin tools, small tables | OFFSET (fine up to ~50k rows) |
| Export / bulk processing | Neither — stream or batch by ID range |

## Stop Defaulting to OFFSET

OFFSET pagination is the default because it matches how humans think about pages. But databases don't think in pages — they think in indexes and seeks. The moment you align your query with how the database works, performance stops being a problem.

If you're building a new endpoint today: start with cursors. If you have an existing OFFSET endpoint that's getting slow: migrate incrementally — keep the old endpoint alive, ship the new cursor endpoint alongside it, and let clients migrate at their own pace.

Your database will thank you. And so will your on-call rotation.
