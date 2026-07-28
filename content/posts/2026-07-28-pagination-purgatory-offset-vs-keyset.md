---
title: "📄 Pagination Purgatory: Why Page 4,000 Is Where Your API Goes to Die"
date: "2026-07-28"
excerpt: "OFFSET pagination works beautifully in every demo and every code review, right up until a customer scrolls far enough to bring your database to its knees. Here's why, and what to do instead."
tags: ["databases", "performance", "backend", "postgresql"]
featured: true
---

Every backend engineer has written `LIMIT 20 OFFSET 40` at some point, felt nothing, and moved on with their life. It's the pagination equivalent of a firm handshake — simple, expected, nobody questions it in the interview. Then six months later a power user scrolls to page 4,000 of your export table, your database pins a CPU core at 100%, and you're suddenly reading about something called "keyset pagination" at 1 AM.

I've been there. Not hypothetically — at Cubet Techno Labs, we had an internal reporting endpoint that let ops staff page through audit logs. It shipped with `OFFSET`, worked great in staging with 500 rows, and quietly became the slowest endpoint in the system once a client's table crossed a few million rows. Nobody noticed until someone tried to page all the way through it for a compliance export.

## Why OFFSET betrays you

Here's the thing nobody tells you about `OFFSET`: the database doesn't teleport to row 80,000. It has to generate and then throw away every row before it.

```sql
SELECT id, action, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 20 OFFSET 80000;
```

To return 20 rows, Postgres walks the index (or worse, the table), counts off 80,000 rows it doesn't care about, discards them, and *then* hands you your page. Page 1 is instant. Page 4,000 is a scan wearing a pagination costume. The deeper you paginate, the more work every single request does — it's O(offset), not O(page size), and that curve is exactly as ugly as it sounds on a dashboard someone loves to `Ctrl+End` through.

There's a second, sneakier failure mode too: **rows shift under you**. If someone inserts a new audit log while a user is paginating, everything after it shifts by one, and that user either sees a duplicate row or skips one entirely. OFFSET pagination isn't just slow — it's quietly wrong the whole time, it just doesn't tell you.

## Keyset pagination: stop counting, start pointing

Keyset (a.k.a. "seek") pagination throws out the idea of a page number entirely. Instead of "skip N rows," you ask the database for "rows after the last one I saw." That's a question an index can answer directly, with no counting involved.

```sql
-- First page
SELECT id, action, created_at
FROM audit_logs
ORDER BY created_at DESC, id DESC
LIMIT 20;

-- Next page: pass the last row's cursor back
SELECT id, action, created_at
FROM audit_logs
WHERE (created_at, id) < ('2026-07-28 09:14:02', 91422)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

That `WHERE (created_at, id) < (...)` clause is a row-value comparison, and with a composite index on `(created_at, id)` it's a direct index seek — Postgres jumps straight to the right spot, no matter whether you're on page 2 or page 40,000. Constant time, every page. And because you're always asking "what comes after this specific row," inserts elsewhere in the table can't shift your results out from under you.

The tradeoff is real, though: you lose the ability to jump to "page 47" directly, because there's no such thing as page 47 anymore — only "after this cursor." For most product UIs (infinite scroll, "load more," API consumers walking a feed) that's not a loss anyone notices. For an admin table with page number buttons, it's a genuine UX conversation you need to have before you rip OFFSET out.

## The cursor you send back should be opaque, not a raw ID

If you're building an API, don't hand clients a raw `created_at` + `id` pair to round-trip — base64-encode it into an opaque token. It stops clients from depending on the internal shape of your cursor, and it gives you room to change the sort key later without breaking every integration that squirreled away a raw timestamp.

```js
function encodeCursor(row) {
  return Buffer.from(JSON.stringify({
    createdAt: row.created_at,
    id: row.id,
  })).toString("base64url");
}

function decodeCursor(cursor) {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
}
```

This is the same trick GitHub's REST API, Stripe's API, and basically every API built past 2015 all landed on independently. It's not a coincidence — it's the only version of pagination that survives contact with a table that actually grows.

## When OFFSET is still fine

I want to be clear this isn't "OFFSET is always wrong, burn it down." If your table tops out at a few thousand rows, or your UI genuinely needs "jump to page 12" and the table is small enough that a full scan costs microseconds, `OFFSET` is simpler to implement and reason about, and simple is a feature. The rule of thumb I use: if the table is bounded and small, or the access pattern truly needs random page access, OFFSET is fine. If the table grows without bound and users mostly page forward through it — logs, feeds, exports, activity streams — keyset pagination isn't an optimization, it's the correct default from day one.

The annoying part is that you usually can't tell which bucket you're in until the table has grown past the point where migrating hurts. So here's the actual takeaway: any endpoint paginating over a table that *could* grow unbounded — logs, events, transactions, anything with a `created_at` — deserves keyset pagination from the first commit, not as a fix after page 4,000 sets your database on fire.

Go check your slowest paginated endpoint's query plan right now. If you see `OFFSET` next to a five-digit number and a `Seq Scan` or a suspiciously wide "rows removed" count, you already know what your next PR is.
