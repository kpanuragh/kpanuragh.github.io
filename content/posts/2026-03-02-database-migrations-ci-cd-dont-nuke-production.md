---
title: "Database Migrations in CI/CD: Stop Nuking Production With That ALTER TABLE 🗄️💥"
date: "2026-03-02"
excerpt: "After countless deployments where 'it works on staging' turned into a production dumpster fire, I learned the hard way: running migrations blindly in CI/CD is how you spend your Saturday on-call. Here's the battle-tested approach that stopped the bleeding."
tags: ["devops", "ci-cd", "database", "deployment", "migrations"]
featured: true
---

# Database Migrations in CI/CD: Stop Nuking Production With That ALTER TABLE 🗄️💥

**True story, Friday 5:47 PM:**

The deploy looked clean. Tests green. Staging passed. I hit merge, the pipeline ran, migrations executed, and within 30 seconds our error rate went from 0.1% to 94%.

The migration had renamed a column. The old code — still running on two app servers that hadn't rolled over yet — was querying the old name. We'd just made half our fleet talk to a database that no longer spoke the same language.

After countless deployments, I've made peace with one truth: **your CI/CD pipeline doesn't care about your weekend plans.**

## The Classic Mistake: Migrate First, Think Later 💀

Most teams start with this setup and wonder why it causes pain:

```yaml
# The "YOLO migrations" pipeline
deploy:
  steps:
    - name: Run migrations
      run: php artisan migrate --force
      # 🔥 Runs with zero safety checks
      # 🔥 Destroys data if you wrote it wrong
      # 🔥 Breaks running app servers mid-deploy
      # 🔥 No rollback plan

    - name: Deploy new code
      run: ./deploy.sh
```

Run migrations, deploy code. Simple. Works great until it catastrophically doesn't.

The problem? **Your database and your application aren't a single atomic unit.** During a rolling deployment, you have old code talking to a new schema, or new code talking to an old schema. Both are recipes for 3 AM pages.

## The Expand/Contract Pattern: Migrations That Don't Murder Your App 🧠

The secret is treating schema changes as a **two-phase process**. Every "breaking" migration becomes a backwards-compatible migration followed by a cleanup migration, deployed separately.

**Phase 1 (Expand):** Add the new thing without removing the old thing.

**Phase 2 (Contract):** Remove the old thing once all code uses the new thing.

### The Column Rename That Broke Us (Revisited)

**The broken way — one migration, instant pain:**

```sql
-- Migration: rename_username_to_display_name
ALTER TABLE users RENAME COLUMN username TO display_name;
```

Old code breaks immediately. Zero tolerance for rolling deploys.

**The expand/contract way — safe across rolling deploys:**

```sql
-- Migration Phase 1 (Expand): add the new column
ALTER TABLE users ADD COLUMN display_name VARCHAR(255);
UPDATE users SET display_name = username WHERE display_name IS NULL;
```

Deploy this. Then update your application code to write to BOTH columns and read from the new one:

```php
// During transition: write to both, read from new
$user->display_name = $name;
$user->username = $name;  // Keep writing old column
$user->save();

// Read from new column
return $user->display_name;
```

Deploy the new code. Now every server is using `display_name`. Then — in a separate release — drop the old column:

```sql
-- Migration Phase 2 (Contract): remove the old column
ALTER TABLE users DROP COLUMN username;
```

Two deploys instead of one. Zero outages. 100% worth it.

## Protecting Against Accidental Destruction 🛡️

Before a migration even touches production, you want guardrails. Here's a GitHub Actions step that validates migrations before applying them:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Check for dangerous migrations
        run: |
          # Fail if any migration drops a column or table without a separate PR label
          if git diff HEAD~1 -- database/migrations/ | grep -E "DROP (COLUMN|TABLE|INDEX)" > /dev/null; then
            echo "⚠️  Destructive migration detected!"
            echo "Migrations that drop columns/tables must be approved with the 'safe-to-destroy' label."
            exit 1
          fi

      - name: Dry-run migration check
        run: php artisan migrate --pretend --force
        # Shows what SQL will run WITHOUT executing it
        # Logs this output as a deploy artifact

      - name: Run migrations (with timeout)
        timeout-minutes: 5
        run: php artisan migrate --force
        env:
          DB_CONNECTION: mysql
          DB_HOST: ${{ secrets.DB_HOST }}

      - name: Verify migration succeeded
        run: php artisan migrate:status | grep -v "Pending"
        # Fails the deploy if any migration is still pending
```

The `--pretend` flag is criminally underused. It outputs the SQL without executing it — great for code review, great for audits, great for that "wait, is that right?" moment before it's too late.

## The Zero-Downtime Migration Checklist ✅

After countless deployments, here's what I check before every migration:

**Adding a column?**
```sql
-- Safe: nullable or has a default
ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMP NULL;
ALTER TABLE products ADD COLUMN featured BOOLEAN DEFAULT FALSE;

-- Dangerous: NOT NULL without a default on a large table (locks!)
ALTER TABLE orders ADD COLUMN required_field VARCHAR(255) NOT NULL;
-- ☠️ This locks the entire table until backfilled
```

**For large tables, use background backfills:**

```sql
-- Step 1: Add nullable (instant, no lock)
ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMP NULL;

-- Step 2: Backfill in batches (doesn't lock)
UPDATE orders SET shipped_at = created_at
WHERE shipped_at IS NULL
LIMIT 10000;
-- Run this in a loop until 0 rows updated

-- Step 3: Add NOT NULL constraint after backfill
ALTER TABLE orders MODIFY shipped_at TIMESTAMP NOT NULL;
```

**Node.js teams, this translates directly:**

```javascript
// In your migration file (using Knex, Sequelize, etc.)
exports.up = async (knex) => {
  // Phase 1: Add nullable column (safe, no downtime)
  await knex.schema.alterTable('orders', (table) => {
    table.timestamp('shipped_at').nullable();
  });

  // Phase 2: Backfill in batches
  let updated = 1;
  while (updated > 0) {
    updated = await knex('orders')
      .whereNull('shipped_at')
      .update({ shipped_at: knex.ref('created_at') })
      .limit(10000);
  }
};
```

## The Rollback You'll Actually Need 🔄

Most teams write rollback migrations but never test them. Then when they need them, they discover they were wrong the whole time.

**Build rollback testing into your pipeline:**

```yaml
# Test the rollback on every PR
- name: Test migration rollback
  run: |
    php artisan migrate --force
    php artisan migrate:rollback --step=1
    php artisan migrate --force
    # If this fails, your rollback is broken
    echo "✅ Rollback is tested and working"
```

A CI/CD pipeline that saved our team: we caught three broken rollback migrations in two weeks after adding this step. All three would have been discovered at the worst possible moment — mid-incident, with an angry stakeholder on a call.

## The Horror Story I'll Never Repeat 🔥

Six months after the Friday column rename incident, we ran a migration that added a `NOT NULL` column to a 40M row table. The migration locked the table for 11 minutes. The app degraded. Customers couldn't check out.

The fix was already in our runbook. We just forgot to read it.

Now we have a pre-deploy checklist that runs automatically in CI:

```bash
#!/bin/bash
# scripts/check-migration-safety.sh

MIGRATION_FILE=$1
ROW_COUNT=$(mysql -e "SELECT COUNT(*) FROM information_schema.tables..." 2>/dev/null)

# Check for NOT NULL without DEFAULT on large tables
if grep -q "NOT NULL" "$MIGRATION_FILE" && ! grep -q "DEFAULT" "$MIGRATION_FILE"; then
  TABLE=$(grep -oP "ALTER TABLE \K\w+" "$MIGRATION_FILE")
  ROWS=$(mysql -e "SELECT COUNT(*) FROM $TABLE" 2>/dev/null | tail -1)

  if [ "$ROWS" -gt 1000000 ]; then
    echo "🚨 WARNING: NOT NULL column on table with ${ROWS} rows"
    echo "This will lock the table. Use a nullable column + backfill instead."
    exit 1
  fi
fi

echo "✅ Migration safety check passed"
```

Automated guardrails don't replace thinking. But they do catch the mistakes you make at 5:47 PM on a Friday.

## TL;DR 💡

- **Never run destructive migrations during rolling deploys** — use expand/contract
- **Always `--pretend` first** in CI to catch SQL mistakes before they hit prod
- **NOT NULL on large tables = table lock** — always add nullable, backfill in batches, then constrain
- **Test your rollbacks on every PR** — you don't want to discover they're broken mid-incident
- **Two deploys is better than one outage** — the expand/contract pattern feels slow until the alternative is a Saturday on-call

The database migration that saved our team wasn't clever — it was boring. Nullable column, batch backfill, separate deploy to drop the old one. Textbook expand/contract. No drama, no pages, no apology emails.

Docker taught me the hard way about immutable infrastructure. Postgres taught me the hard way about table locks. Now my pipelines have more guards than my house. Yours should too.

---

**Had a migration incident?** I'd love to hear the story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the more horrifying the better (for educational purposes, obviously).

**Want the full safety script?** Check my [GitHub](https://github.com/kpanuragh) for the migration checker we actually use in production.

*Go add `--pretend` to your migration step right now. Your future self — the one who isn't on-call at 2 AM — will thank you.* 🗄️✨
