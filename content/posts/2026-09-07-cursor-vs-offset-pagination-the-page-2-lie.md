---
title: "📄 Cursor vs Offset Pagination: The 'Page 2' Lie"
date: 2026-09-07
excerpt: "OFFSET/LIMIT looks so innocent in a code review. Then your table hits a few million rows, users start deleting things mid-scroll, and 'page 2' quietly starts lying to everyone about what page 2 even means."
tags: ["backend", "api-design", "databases", "postgresql", "performance"]
featured: true
---

Every backend developer has written this query at least once, usually on day one of a new job, usually with total confidence:

```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

It works. It ships. Nobody complains. Then eighteen months later the `orders` table has 12 million rows, someone's scrolling through page 400 of the admin dashboard, and that innocent little query is now doing a full index scan just to throw away 8,000 rows it never needed to look at in the first place. `OFFSET` doesn't skip rows for free — the database still has to walk past every single one of them to know where "page 400" starts. It's like being told to find the 8,001st person in a line by counting heads instead of just... standing where the line actually is.

That's the performance problem. The *correctness* problem is worse, and way sneakier.

## The page 2 lie

Offset pagination assumes the list underneath you holds still while you paginate through it. It never does. Imagine a live feed sorted by `created_at DESC`, and a user is on page 1 (rows 1–20) when three new rows get inserted. They click "next page" for rows 21–40 using `OFFSET 20`. But the whole list just shifted down by three — so what used to be rows 18, 19, 20 now show up *again* on page 2, and whatever used to be rows 38, 39, 40 never gets shown to that user at all.

Same failure mode, opposite direction, with deletes: something gets removed from earlier in the list, everything shifts up, and the user silently skips over rows they never saw. I spent an annoying afternoon at Cubet chasing a support ticket that boiled down to exactly this — a customer was "missing" invoices in a paginated export, and the invoices weren't missing at all, they'd just been quietly dodged by an `OFFSET` query racing against new inserts. The data was fine. The pagination contract was the bug.

## Cursor pagination: pointing instead of counting

Cursor-based pagination sidesteps this by not counting at all. Instead of "give me rows 41 through 60," you ask "give me the next 20 rows *after this specific one*." The cursor is usually an opaque encoding of the last row's sort key (and its primary key, for tie-breaking):

```sql
SELECT * FROM orders
WHERE (created_at, id) < (:last_created_at, :last_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Because you're filtering on an indexed column instead of skipping a computed number of rows, this is a straight index seek — page 400 costs exactly the same as page 1. And because each page is anchored to a real row instead of a numeric offset, inserts and deletes elsewhere in the list don't shift anything under your feet. You either see the row you were pointed at, or it's gone, but you never see duplicates or silently skip a neighbor.

The tuple comparison `(created_at, id) < (:last_created_at, :last_id)` matters more than it looks — `created_at` alone isn't unique, so two orders placed in the same millisecond would break strict ordering without the `id` tiebreaker. Skip that and you get the exact same duplicate/skip bug you were trying to escape, just rarer and harder to reproduce.

## What you give up

Cursors aren't a free upgrade, they're a trade:

- **No "jump to page 7."** A cursor only knows "the next N after X." If your UI has numbered page links, cursor pagination can't drive them — you're committed to "next/previous" or infinite scroll.
- **No cheap total count.** `SELECT COUNT(*)` on a huge table is its own performance headache regardless of pagination style, but offset-based UIs tend to lean on it for "showing 41–60 of 14,203," and product folks *like* that number. With cursors you either estimate, cache the count separately, or convince the design to drop it.
- **Slightly more API surface.** You're returning and accepting an opaque token instead of a plain integer, which means clients have to treat it as opaque and you have to version it if the encoding ever changes.

In practice, here's the rule of thumb I actually use: offset pagination is fine for small, mostly-static, admin-facing tables where nobody's paginating past page 5 and a `COUNT(*)` is cheap. The moment you're dealing with a feed, a timeline, an export, or anything backed by a table that grows past low hundreds of thousands of rows *and gets written to concurrently with being read*, reach for cursors before someone files a "missing data" ticket that turns out to be a pagination bug wearing a data-integrity costume.

A decent middle ground, if product genuinely needs numbered pages *and* the table is large: keyset-paginate under the hood for the actual data fetch, and cache/estimate the total row count separately (a periodic `COUNT(*) ` job, or `pg_class.reltuples` if approximate is good enough) instead of computing it per request.

## The takeaway

`OFFSET` isn't wrong, it's just honest about being a blunt instrument — it counts rows because you told it to count rows, and it doesn't know or care that your data is a moving target. Cursor pagination trades a bit of API flexibility for correctness and consistent performance at scale, which is usually the trade you want once real traffic and real concurrent writes show up.

If you've got an endpoint doing `OFFSET` past a few hundred thousand rows right now, go check its `EXPLAIN ANALYZE` output today — I'd bet it's spending more time skipping rows than returning them, and it's probably lying to at least one user about what "page 2" means.
