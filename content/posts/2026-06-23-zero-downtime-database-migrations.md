---
title: "Zero-Downtime Database Migrations: Stop Scheduling 3 AM Maintenance Windows"
date: "2026-06-23"
excerpt: "Dropping a column shouldn't require a maintenance window. Here's the expand-contract pattern and other techniques that let you migrate live databases without waking anyone up at 3 AM."
tags:
  - databases
  - backend
  - postgresql
  - migrations
  - devops
featured: true
---

# Zero-Downtime Database Migrations: Stop Scheduling 3 AM Maintenance Windows

Every team has a story. Ours involved a PostgreSQL table rename that "should take five seconds" and ended up locking the `users` table for forty minutes during peak traffic. Slack was on fire. The CEO was refreshing the dashboard. Someone microwaved fish in the kitchen at exactly that moment, making everything worse.

It doesn't have to be this way.

Zero-downtime migrations aren't rocket science — they're mostly discipline and a pattern called **expand-contract**. Let me walk you through it.

## Why Naive Migrations Cause Downtime

A migration like `ALTER TABLE users RENAME COLUMN email TO email_address` feels innocent. But your deployed application still has code referencing `email`. The moment the migration runs, every in-flight query using the old column name throws an error. If you're running a rolling deployment, half your pods use the old column and half use the new one — and they're all fighting the database at the same time.

The core tension: **your database and your application code don't deploy atomically.** During a rolling restart, multiple versions of your app coexist. Your migration strategy must account for that window.

## The Expand-Contract Pattern

Think of it as a three-phase operation spread across multiple deployments:

**Phase 1 — Expand:** Add the new thing without removing the old thing. The database now supports both old and new application code.

**Phase 2 — Migrate:** Deploy application code that writes to both old and new, then backfill historical data.

**Phase 3 — Contract:** Once every pod runs the new code and the old column has zero reads, remove the old thing.

Here's a concrete example: renaming `users.email` to `users.email_address`.

### Phase 1: Add the new column (safe to run immediately)

```sql
-- Migration 001: expand
ALTER TABLE users ADD COLUMN email_address VARCHAR(255);

-- Copy existing data
UPDATE users SET email_address = email WHERE email_address IS NULL;

-- Make it non-null once backfill is done (add a default or do it in batches)
ALTER TABLE users ALTER COLUMN email_address SET DEFAULT '';
```

Your old application code still reads and writes `email`. Nothing breaks. The new column just... exists.

### Phase 2: Dual-write in application code

```typescript
// During the transition deployment, write to both columns
async function updateUserEmail(userId: string, newEmail: string) {
  await db.query(
    `UPDATE users 
     SET email = $1, email_address = $1 
     WHERE id = $2`,
    [newEmail, userId]
  );
}

// Read from the new column, fall back to old (defensive)
async function getUserEmail(userId: string): Promise<string> {
  const row = await db.query(
    `SELECT COALESCE(email_address, email) as email 
     FROM users WHERE id = $1`,
    [userId]
  );
  return row.rows[0].email;
}
```

Deploy this. Let it soak. Watch your logs. If both columns stay in sync, you're ready for Phase 3.

### Phase 3: Contract — drop the old column

Once 100% of your pods run Phase 2 code and you've verified the data is consistent:

```sql
-- Migration 003: contract (run after Phase 2 is fully deployed)
ALTER TABLE users DROP COLUMN email;
-- At this point, update app code to remove the dual-write and COALESCE
```

Then do one final deployment removing the dual-write logic. You're done. No maintenance window. No 3 AM Slack notifications.

## The Tricks That Actually Save You

### 1. Batch your backfills

Never run `UPDATE users SET email_address = email` on a 50M-row table in a single transaction. You'll hold a table lock for minutes and replicate lag will spike.

```sql
-- Backfill in chunks
DO $$
DECLARE
  batch_size INT := 10000;
  last_id BIGINT := 0;
BEGIN
  LOOP
    UPDATE users
    SET email_address = email
    WHERE id > last_id
      AND email_address IS NULL
    RETURNING id INTO last_id;
    
    EXIT WHEN NOT FOUND;
    PERFORM pg_sleep(0.1); -- breathe
  END LOOP;
END $$;
```

At Cubet, we've wrapped this pattern into a reusable job that runs as a background task post-migration, reports progress via a metrics endpoint, and alerts if it stalls. Backfills should be observable, not fire-and-forget.

### 2. Validate constraints concurrently

Adding a NOT NULL constraint or a foreign key? Don't do it the naive way — PostgreSQL will scan the entire table while holding a lock.

```sql
-- Wrong: locks the table for a full scan
ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);

-- Right: validate without blocking writes
ALTER TABLE orders 
  ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) 
  NOT VALID;

-- Later, validate concurrently (only needs ShareUpdateExclusiveLock)
ALTER TABLE orders VALIDATE CONSTRAINT fk_user;
```

The `NOT VALID` + `VALIDATE` two-step is one of the most underused PostgreSQL features. It keeps the constraint without the table-scan lock.

### 3. Use lock timeout as a safety net

Even "safe" DDL can occasionally queue behind a long-running transaction and then block everything else that's waiting. Set a lock timeout to fail fast:

```sql
SET lock_timeout = '2s';
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
RESET lock_timeout;
```

If your migration can't acquire a lock in 2 seconds, it fails loudly instead of silently queuing and starving the app. You can retry during a quieter moment. Silence is not safety.

## When You Can't Avoid a Real Lock

Some operations genuinely need table-level locks — `VACUUM FULL`, certain index types, changing column types. For these:

- Schedule during your actual low-traffic window (not "2 AM because that's what we've always done" — look at your actual traffic graphs)
- Wrap in explicit lock timeout
- Have a rollback migration ready
- Announce in your status page, even for internal services

The goal isn't zero locks forever — it's **not taking unnecessary locks** during normal schema evolution.

## Tooling That Helps

Most migration frameworks don't enforce safe patterns by default, but there are guardrails:

- **pgroll** (Xata's open-source tool) enforces expand-contract natively and maintains multiple schema versions simultaneously — particularly nice for teams with long-lived feature branches.
- **Flyway** and **Liquibase** support `NO TRANSACTION` migrations for DDL that can't run inside a transaction (like `CREATE INDEX CONCURRENTLY`).
- **squawk** is a linter for PostgreSQL migrations that flags dangerous patterns before they reach production. Add it to your CI pipeline.

## The Mindset Shift

The real change isn't technical — it's temporal. You stop thinking of a migration as a single atomic event ("run migration, done") and start thinking of it as a multi-deployment process with a clear contract at each step.

It feels slower. Three deployments instead of one. But the alternative is a 3 AM maintenance window, a locked table during peak hours, or a rollback that still leaves production inconsistent.

I'll take slower and boring over fast and dramatic every time.

---

**Next time you're about to schedule a maintenance window for a column rename:** pause. Write out the three phases. The window you're protecting your users from is the same window your expand-contract migration keeps open without anyone noticing.

What's the most painful migration war story you've survived? My DMs are open — misery loves company.
