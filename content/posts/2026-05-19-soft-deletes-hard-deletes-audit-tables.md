---
title: "🗑️ Soft Deletes vs Hard Deletes vs Audit Tables: Pick Your Strategy Before Production Picks It for You"
date: 2026-05-19
excerpt: "Deleting a database row sounds trivial — until your boss asks why the customer record vanished and nobody knows. Here is how to pick the right deletion strategy before a production incident forces your hand."
tags: ["databases", "postgresql", "sql", "backend", "data-modeling"]
featured: true
---

Deleting a database row sounds like the simplest thing in the world. `DELETE FROM users WHERE id = 42`. Done. Gone. Clean.

Then three days later your support team is screaming because a customer swears they never cancelled their account, your compliance team needs a 90-day audit trail for a regulator, and your analytics dashboard shows a mysterious revenue dip that nobody can explain.

Congratulations. You needed a deletion *strategy*, not just a DELETE statement.

Let's break down your three main options — hard deletes, soft deletes, and audit tables — and when each one will save or ruin your weekend.

---

## Hard Deletes: The Nuclear Option

A hard delete is exactly what it sounds like. The row is physically gone. Vanished from the earth like it never existed.

```sql
DELETE FROM orders WHERE id = 1234;
```

Simple. Fast. Honest. And terrifying in hindsight.

**When hard deletes make sense:**
- Truly transient data: sessions, OTP tokens, rate-limit buckets, temporary uploads
- Data that legally *must* be purged (GDPR "right to be forgotten" — though even here, you usually audit *that* the erasure happened)
- Tables with massive write throughput where dead-row bloat becomes a real performance concern

The problem is that "delete it and move on" feels convenient right now, and catastrophic in three months when someone asks "why did revenue drop on the 14th?" and you have no record of anything. Every hard delete is a bet that you'll never need that data again. That's a bet you lose more often than you expect.

---

## Soft Deletes: The Safe Default

A soft delete adds a `deleted_at` column to your table. You never actually remove the row — you just mark it as dead and filter it out everywhere.

```sql
-- Schema addition
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- "Deleting" a user
UPDATE users SET deleted_at = NOW() WHERE id = 42;

-- Active users only
SELECT * FROM users WHERE deleted_at IS NULL;
```

The record stays in the database. You can recover it. Foreign keys don't break. Referential integrity survives. And when a client calls support saying "we deleted the wrong record," you can bring it back in thirty seconds instead of apologising for a week.

At Cubet, we default to soft deletes for almost every core business entity — users, orders, subscriptions, products. The `deleted_at IS NULL` filter becomes second nature, and it has saved us multiple times when a client reports an accidental deletion that would otherwise be unrecoverable.

**But soft deletes carry gotchas you need to handle upfront:**

**1. Every query needs the filter.** Forget `WHERE deleted_at IS NULL` once, and your API happily returns deleted users. This will happen. Build it into your ORM layer so it's automatic — Sequelize's `paranoid: true`, Prisma middleware, ActiveRecord's default scope — and don't let it leak.

**2. Unique constraints break.** If a user soft-deletes their account and re-registers with the same email, you'll hit a constraint violation against the old dead row. The fix is a partial index:

```sql
CREATE UNIQUE INDEX users_email_active_idx
  ON users (email)
  WHERE deleted_at IS NULL;
```

Now the uniqueness constraint only applies to living rows. Problem solved.

**3. Table bloat.** Soft-deleted rows still occupy space and still get scanned by non-partial indexes. On large tables, add a partial index on your most-filtered columns (`WHERE deleted_at IS NULL`) and consider a background job to hard-delete rows that have been soft-deleted for more than, say, 180 days — after your business has confirmed it no longer needs them.

---

## Audit Tables: The Full Paper Trail

Sometimes knowing *that* something was deleted isn't enough. You need to know *every change* that ever happened to a row — who made it, when, and what the old value was. That's where audit tables come in.

```sql
CREATE TABLE users_audit (
  audit_id    BIGSERIAL PRIMARY KEY,
  operation   TEXT NOT NULL,          -- INSERT, UPDATE, DELETE
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by  TEXT,                   -- set by app via SET LOCAL
  old_data    JSONB,
  new_data    JSONB
);

CREATE OR REPLACE FUNCTION log_users_audit() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users_audit (operation, changed_by, old_data, new_data)
  VALUES (
    TG_OP,
    current_setting('app.current_user', true),
    row_to_json(OLD),
    row_to_json(NEW)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION log_users_audit();
```

Set `SET LOCAL app.current_user = 'user-uuid'` at the start of each database transaction, and the trigger captures who made every change automatically. Now you have a complete, tamper-evident changelog — every insert, every update, every delete, with before-and-after snapshots stored as JSONB.

**When audit tables are the right call:**
- Regulated industries: fintech, healthcare, anything SOC 2 or HIPAA adjacent
- Any entity where "who changed this and when" is a business question, not just a debugging curiosity
- Multi-tenant SaaS where customers occasionally dispute what happened to their data
- Admin-controlled config where accountability matters

The tradeoff is storage. A frequently-updated table will generate several times its own size in audit history within a year. Plan for this upfront — partition the audit table on `changed_at` so pruning old records is a cheap partition drop, or ship old audit rows to cold storage automatically.

---

## The Decision Matrix

| Scenario | Strategy |
|---|---|
| OTP codes, session tokens | Hard delete |
| Core business entities (users, orders) | Soft delete |
| GDPR erasure requests | Hard delete (audit the erasure itself) |
| Financial records, billing events | Soft delete + audit table |
| Admin permission changes | Audit table |
| High-churn ephemeral data | Hard delete |

---

## What a Practical Stack Actually Looks Like

In production you end up using all three — the art is matching each strategy to the right table.

Our current standard at Cubet: soft deletes on every core business entity via an ORM middleware that injects the `deleted_at IS NULL` filter automatically, so engineers can't accidentally bypass it. Audit triggers on high-value tables — anything touching money, user permissions, or contract terms. Hard deletes for genuinely throwaway data with a defined TTL.

The worst outcome isn't picking the wrong strategy — it's having no strategy at all and hard-deleting everything out of laziness, then scrambling when a production incident demands history you no longer have. Build your deletion approach into the schema from day one, not after the first angry support ticket.

---

## TL;DR

- **Hard delete** — fast and final; use it for truly throwaway data with no business value.
- **Soft delete** — the safe default for anything business-critical; watch out for the query-filter trap and broken unique constraints.
- **Audit table** — the full paper trail; required for compliance and any high-stakes mutation history.

Pick your strategy before you build the table, not after the production incident. Your future self — and your support team — will thank you.

What's your default deletion strategy? Are you a `deleted_at` purist, a hard-delete minimalist, or a "triggers on everything" paranoid? Hit me up on Twitter/X at [@kpanuragh](https://x.com/kpanuragh) — I read every reply.
