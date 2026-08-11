---
title: "🚦 Zero-Downtime Database Migrations: The Expand/Contract Two-Step"
date: "2026-08-11"
excerpt: "Adding a NOT NULL column feels harmless until it locks a production table mid-deploy and your API starts timing out. Here's the expand/contract pattern that lets you change a live schema without anyone noticing — except the one time I forgot step three."
tags:
  - databases
  - postgresql
  - backend
  - migrations
  - devops
featured: true
---

# 🚦 Zero-Downtime Database Migrations: The Expand/Contract Two-Step

There's a special kind of dread that comes from watching a deploy pipeline go green on the app code while the migration step just... sits there. Spinning. No logs. No progress bar. Just a table lock somewhere, quietly eating your error budget one timed-out request at a time.

I've caused this. Not proud of it, but it's the fastest way to learn why "just add the column" is a lie schema migrations tell you.

## Why a single ALTER TABLE can take your site down

The naive migration looks perfectly innocent:

```sql
ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
```

On an empty table, this runs in milliseconds. On a production `orders` table with 40 million rows, older Postgres versions (pre-11) rewrite every single row to backfill the default, and the whole time it's doing that, it's holding an `ACCESS EXCLUSIVE` lock. Every read, every write, every innocent `SELECT * FROM orders WHERE id = 1` — all of it queues up behind that lock like commuters behind a stalled train.

Even on modern Postgres, where adding a column with a constant default is instant, plenty of other everyday changes still take the exclusive lock: renaming a column, changing a type, adding a `NOT NULL` constraint to an existing column, dropping a column your app still reads from. The mistake isn't running a migration. It's running a migration that assumes the old code and the new code will never both be running against the same schema at the same time — because during a rolling deploy, they always are.

That's the part people miss. A "migration" isn't one atomic moment. It's a window — sometimes seconds, sometimes the length of a canary rollout — where old pods and new pods are both live, both querying the same database, and both need the schema to make sense to them.

## The pattern: expand, migrate, contract

The fix isn't a clever SQL trick. It's discipline: split every breaking schema change into steps that are each, individually, backward AND forward compatible.

**1. Expand** — add the new thing without touching the old thing.

```sql
-- Old code doesn't know this column exists, and doesn't care.
ALTER TABLE orders ADD COLUMN status TEXT;
```

**2. Dual-write, then backfill** — ship an app version that writes to *both* the old and new columns/tables, deploy it, let it fully roll out, then backfill historical rows in small batches so you're not re-triggering the giant-lock problem you were trying to avoid.

```js
// Deployed *before* anything reads from `status`.
async function createOrder(data) {
  return db.query(
    `INSERT INTO orders (legacy_state, status) VALUES ($1, $1)`,
    [data.state]
  );
}
```

```sql
-- Backfill in batches, off-peak, with a sleep between chunks.
UPDATE orders SET status = legacy_state
WHERE status IS NULL
  AND id BETWEEN 1 AND 10000;
```

**3. Switch reads** — deploy the version that reads from the new column instead of the old one. This is its own deploy, separate from the dual-write one, so you can roll it back independently if something looks wrong.

**4. Contract** — once every pod is on the new code path and you've watched it for a while, drop the old column.

```sql
ALTER TABLE orders DROP COLUMN legacy_state;
```

Four steps to do what used to be one line. Slower, yes. But every single step is safe to run while old and new code coexist, which is the entire point — nobody's request breaks because the pod that served it hadn't been rolled yet.

## The rule I now tattoo on every migration PR

Never combine "add" and "require" in the same deploy. A `NOT NULL` constraint is a promise about data that doesn't exist yet from the app's point of view — you can only make that promise safely after every writer has already been writing it for a while.

The corollary: renames don't exist. There's no safe single-step rename in a live system. `rename_column` is always secretly "add new, dual-write, backfill, switch reads, drop old" wearing a trench coat.

## The time I skipped step three

At Cubet Techno Labs we had a migration that added a `region` column to a table backing a routing service. Expand: fine. Dual-write: fine, rolled out clean. Then, in a hurry to close the ticket, someone (me) merged the backfill and the "switch reads to the new column" logic into the *same* deploy instead of separating them.

For about six minutes, older pods that hadn't finished their rolling restart were still reading the legacy column — which the backfill script was updating in batches, but which the dual-write code from a still-older release hadn't been writing to consistently before that. A thin slice of requests got routed with stale region data. Nothing catastrophic, no data loss, but customer support got a handful of "why did my order get assigned to the wrong warehouse" tickets that took an afternoon to trace back to a five-minute deploy overlap.

The lesson wasn't "be more careful." It was "the whole point of expand/contract is that each step is its own deploy, verified independently, before you touch the next one." Collapsing steps to save time is exactly how you reintroduce the coupling the pattern exists to remove.

## Tools that make this less manual

You don't have to hand-roll every step. `pg-osc` and `gh-ost` (originally MySQL, now with Postgres-flavored equivalents like `pgroll`) automate online schema changes by creating a shadow table, dual-writing via triggers, and swapping it in atomically. Rails' Strong Migrations gem and similar linters will flag a raw `ADD COLUMN ... NOT NULL` in CI before it ever reaches production. If you're on Postgres 11+, know your defaults: constant `DEFAULT` values on new columns are metadata-only now and don't rewrite the table — but a `NOT NULL` on an *existing* nullable column still does a full table scan to validate, so that one still needs the careful version.

## Try this on your next migration

Before you write the `ALTER TABLE`, ask: if this ran right now, while half my fleet is on the old code and half is on the new code, does anything break? If the honest answer is "maybe," split it into expand and contract, and give each half its own deploy. Your on-call self will not remember to thank you, but they also won't be paged, which is better.
