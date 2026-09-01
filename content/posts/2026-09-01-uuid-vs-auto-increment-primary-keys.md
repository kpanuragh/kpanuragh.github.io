---
title: "🔑 UUID vs Auto-Increment: The Primary Key Fight Nobody Warns You About"
date: "2026-09-01"
excerpt: "UUIDs feel modern and auto-increment feels quaint, but the choice quietly decides how fast your database will be in two years. Here's what actually breaks."
tags: ["databases", "postgresql", "backend", "performance", "sql"]
featured: true
---

Every new project has that one meeting. Someone says "let's just use UUIDs for the primary keys, they're more scalable." Everyone nods. Nobody asks "scalable for what, exactly?" and six months later you're staring at a `pg_stat_user_tables` dashboard wondering why your `orders` table's index is the size of a small moon.

Primary key choice feels like a five-minute decision. It's actually a bet on how your database will behave under load, and like most bets made in a kickoff meeting, it's rarely revisited until it hurts.

## The pitch for UUIDs

UUIDs are genuinely great for some things:

- You can generate the ID on the client, before the row even exists in the database. No round trip needed.
- They don't leak information. An auto-increment `id=4821` on `/invoices/4821` tells a competitor roughly how many invoices you've issued this month. A UUID tells them nothing.
- Merging data from multiple services or shards without collisions is trivial — nobody's `id=1` collides with anybody else's `id=1`.

That's a real list. This isn't a "UUIDs are bad" post. It's a "UUIDs have a cost and almost nobody prices it in" post.

## The part nobody prices in: your index just became a random number generator

Here's the thing about a standard B-tree index, which is what backs your primary key in Postgres, MySQL, or basically anything else you're using: it likes locality. New rows that get inserted with sequentially increasing keys land at the right edge of the index, in the same few disk pages, over and over. The database's buffer cache loves this — it's already got those pages hot.

A random UUID (the default `uuidv4`) inserts *anywhere* in the keyspace. Every insert potentially touches a totally different, probably-cold page. At small scale you'll never notice. At the scale where your `orders` table has 40 million rows and gets 200 inserts a second, you'll notice as:

- Index bloat that never seems to shrink even after `VACUUM`
- Write throughput that degrades as the table grows, not stays flat
- A working set that no longer fits in memory, so every insert costs a disk seek

On a project at Cubet, we had a UUID-keyed events table that went from "fine" to "why is ingestion falling behind" almost overnight once it crossed a few hundred million rows. The fix wasn't more hardware — it was rethinking the key.

```sql
-- classic uuidv4: random, terrible for index locality
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- same guarantees, but the leading bits are time-ordered
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_uuid_v7(),  -- or generate in app code
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

UUIDv7 (and similar schemes like ULIDs, or Twitter's old Snowflake IDs) solve the actual problem by putting a timestamp in the high bits. You keep the "generate anywhere, no collisions, no leaked sequence" properties of a UUID, but new IDs are still roughly increasing, so inserts land near the right edge of the index again. It's the best-of-both option most teams don't know exists.

## Auto-increment isn't free either

Don't swing all the way to "just use `SERIAL` and move on" — that has its own bill:

```js
// client generates the ID before the insert happens — no round trip,
// works offline, works across services without a central sequence
const order = {
  id: crypto.randomUUID(),
  userId,
  items,
};
await db.insert('orders').values(order);
```

You can't do that with an auto-increment key. You have to insert first, then find out what ID the database gave you, which is awkward in anything distributed — multi-region writes, offline-first mobile apps, event sourcing where the ID needs to exist before the write is durable. And if you ever need to merge two databases (an acquisition, a shard rebalance, a disaster-recovery failover that lost the sequence counter), colliding integer IDs are a special kind of Saturday-morning nightmare.

## What I'd actually tell you to do

1. If your table is small, low-write, or internal — auto-increment (`BIGINT GENERATED ALWAYS AS IDENTITY`, not `SERIAL`, use the newer syntax) is simpler and you should stop overthinking it.
2. If you need client-generated IDs, offline support, or ID-privacy — use a time-ordered UUID variant (UUIDv7/ULID), not `uuidv4`. You get the distributed-generation benefits without nuking your index locality.
3. Whatever you pick, don't expose it as your *only* identifier in the URL if it also drives internal joins at scale — some teams use a `BIGINT` internal PK plus a public UUID/slug for anything user-facing. More columns, but it decouples "what the database is fast at" from "what an API consumer should see."
4. Benchmark before 40 million rows, not after. `pgbench` a synthetic insert-heavy workload against both key types on realistic hardware. It takes an afternoon and it's cheaper than an incident.

The primary key type is one of those decisions that's trivial to change on day one and genuinely painful to change on day 400. Spend the five extra minutes in the kickoff meeting — your on-call self in a year will not remember to thank you, but they'll definitely remember if you don't.

What's your default? Auto-increment, random UUID, or one of the time-ordered flavors? I'd genuinely like to know what other teams are landing on in 2026.
