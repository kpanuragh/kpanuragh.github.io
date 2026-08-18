---
title: "🪦 Soft Deletes vs Hard Deletes vs Audit Tables: The Database Never Forgets (Unless You Told It To)"
date: "2026-08-18"
excerpt: "DELETE FROM users WHERE id = 42 feels satisfying right up until legal, support, and future-you all ask where that row went. A field guide to soft deletes, hard deletes, and the audit tables that actually save you."
tags: ["databases", "backend", "sql", "architecture", "data-modeling"]
featured: true
---

Every backend engineer eventually writes `DELETE FROM users WHERE id = 42`, hits enter, and feels a brief flicker of god-like power. Then three weeks later support asks "what was in that account before it got deleted" and you realize you played yourself.

Deleting data is one of those things that sounds simple — "just remove the row" — until you actually think about who needs that row later: compliance audits, "oops I didn't mean to cancel" support tickets, analytics that break because a foreign key now points at nothing, or a very unfun legal discovery request. There are three main strategies for this, and picking the wrong one for your use case is how you end up either drowning in `WHERE deleted_at IS NULL` clauses or explaining to your CTO why you can't produce records from six months ago.

Let's go through all three like adults.

## Option 1: Hard deletes — the "no take-backs" approach

```sql
DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '30 days';
```

Hard deletes are exactly what they sound like: the row is gone, the disk space is (eventually) reclaimed, and nobody's coming back for it. This is the right call for genuinely disposable data — expired sessions, stale cache entries, temp upload records, rate-limit counters. Nobody is filing a support ticket asking to restore their Redis-adjacent session row from last Tuesday.

The trap is reaching for hard deletes on anything a human actually cares about: user accounts, orders, payments, comments. Once it's gone, "can you check what this looked like before" becomes an unanswerable question, and you've also just broken every foreign key and every join that assumed that row might still be referenced by history.

## Option 2: Soft deletes — the "it's not gone, it's resting" approach

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- "Deleting" a user
UPDATE users SET deleted_at = NOW() WHERE id = 42;

-- Every query that should ignore deleted rows now needs this
SELECT * FROM users WHERE id = 42 AND deleted_at IS NULL;
```

Soft deletes flip a flag instead of removing the row. Great for "undo" flows, GDPR-adjacent "deactivate but retain for compliance window" scenarios, and anything where a support agent's first instinct will be "can we just bring it back."

The catch — and this bites almost everyone at some point — is that `deleted_at IS NULL` has to appear in *every single query* against that table, forever, including the join in that one report someone wrote eighteen months ago and forgot about. Miss it once and a "deleted" user shows back up in a leaderboard, an email blast, or worse, a billing run. At Cubet we ended up wrapping this in a Postgres view (`active_users`) plus a lint rule flagging raw queries against the base table, because relying on every engineer to remember the `WHERE` clause is not a strategy, it's a prayer.

Soft deletes also don't actually answer "what changed and who did it" — they only tell you *that* something was deleted, not what it looked like before or after, and definitely not who clicked the button.

## Option 3: Audit tables — the "we keep receipts" approach

```sql
CREATE TABLE user_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  action TEXT NOT NULL,          -- 'created' | 'updated' | 'deleted'
  changed_by INT,                 -- who did it
  diff JSONB,                     -- what changed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger fires on every UPDATE/DELETE to `users`
CREATE OR REPLACE FUNCTION log_user_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_audit (user_id, action, diff, created_at)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    to_jsonb(OLD) - 'password_hash', -- never log secrets
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

This is the heavyweight option, and it's solving a different problem than the first two. Soft deletes answer "is this record active." Audit tables answer "show me the full history of this record, every change, every actor, every timestamp" — which is what you actually need for compliance, dispute resolution, or debugging "why does this customer's balance say $400 when they swear they paid $500."

The main cost is volume — an audit table on a hot table grows fast, and you'll want to partition it by month and set a retention/archival policy from day one, not after someone notices the table is 40GB. The trigger-based approach above is transparent (nobody can bypass it by forgetting a `WHERE` clause), but it does add write overhead, so measure it on your actual write path before shipping it on something latency-sensitive.

## So which one do you actually use?

Realistically, most production systems end up running all three at once, just on different tables:

- **Hard delete**: ephemeral stuff nobody will ever ask about again — sessions, cache rows, expired tokens.
- **Soft delete**: user-facing entities where "undo" or a grace period matters — accounts, posts, subscriptions.
- **Audit table**: anything regulated, anything money-related, or anything where "who changed this and when" is a question your business will eventually get asked, under oath or otherwise.

The mistake isn't picking the wrong one of these — it's picking one strategy and applying it to everything because it's easier to remember. Your session table doesn't need a JSONB diff history, and your payments table absolutely should not be one `DELETE` statement away from having no paper trail.

Next time you write a migration that touches deletion, don't default to whatever the last table did. Ask what question someone's going to ask about that row in six months, and build the answer in now — because retrofitting an audit trail onto a table that's already been silently hard-deleting for a year is a genuinely miserable Friday afternoon.

What's your team's default — soft delete everything, or hard delete and pray? Curious what's bitten people in production.
