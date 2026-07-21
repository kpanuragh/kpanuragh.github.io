---
title: "🪞 Read Replicas: Why Your App Forgets What It Just Wrote"
date: "2026-07-21"
excerpt: "You save a profile, refresh the page, and your old bio is back. Nobody deleted your change — it's sitting happily on the primary. Your GET request just talked to a replica that hasn't caught up yet. Welcome to read-your-writes consistency, the bug that only shows up in production."
tags: ["databases", "read-replicas", "distributed-systems", "backend"]
featured: true
---

Here's a bug report that will ruin your Tuesday: "I updated my profile, but it shows the old data." You check the database directly — the new value is right there, correctly saved, exactly as expected. You ask the user to refresh. It's fixed. You ask them to try again in five minutes. It breaks again, sometimes.

You haven't lost your mind. You've just met **replication lag**, and it's about to become your new least favorite phrase.

## The setup that got you here

At some point your single database started sweating under read traffic — dashboards, search, reporting queries, whatever — so you did the textbook-correct thing: you added one or more **read replicas**. Writes go to the primary, reads get spread across replicas, and suddenly your primary isn't pegged at 90% CPU anymore. Everyone claps.

```
Client → Write → Primary
Client → Read  → Replica (async copy of Primary)
```

The catch is right there in the word "async." Replication isn't teleportation — it's the primary streaming its write-ahead log to replicas, which apply those changes a beat behind. Usually that beat is milliseconds. Under load, a slow query, or a network hiccup, it can stretch into seconds. And in that gap, a very specific and very embarrassing thing happens: a user writes data, your load balancer immediately routes their next request to a replica that hasn't seen the write yet, and the app confidently serves them stale information — their *own* stale information, moments after they created it.

This is the **read-your-writes** consistency guarantee, and it's the first one most teams accidentally violate the moment they introduce replicas.

## Why this bites harder than it sounds

The nasty part isn't that it's wrong — it's that it's *intermittent*. It won't show up in your staging environment, where you're the only user and replication lag is basically zero because nothing else is competing for I/O. It shows up in production, under real load, for a random subset of users, which makes it look like a frontend caching bug, a CDN issue, or "user error" long before anyone suspects the database topology.

I've watched a support queue fill up with "the save button is broken" tickets that were actually just replica lag spiking during a nightly batch job that hammered the replicas with analytics queries. The writes were fine. The reads were reading the wrong copy.

## Fix #1: pin the user to the primary after a write

The blunt, effective fix is session affinity — after a write, route that user's *reads* to the primary for some window, instead of round-robining them to a replica.

```js
// crude but works: stash a "just wrote" flag with a short TTL
async function updateProfile(userId, data) {
  await primaryDb.query(
    'UPDATE users SET bio = $1 WHERE id = $2',
    [data.bio, userId]
  );
  await redis.set(`sticky:${userId}`, '1', 'EX', 5); // 5s window
}

function pickConnection(userId) {
  return redis.get(`sticky:${userId}`)
    ? primaryDb
    : pickReplica();
}
```

Five seconds is arbitrary — tune it to your actual replication lag, which you should be graphing, not guessing at. This isn't elegant, but it solves the exact failure mode: the user who just wrote something is the one who notices staleness. Everyone else genuinely doesn't care if their feed is 200ms behind reality.

## Fix #2: chase the LSN, not the clock

Sticky-to-primary-for-N-seconds is a blunt instrument because lag isn't constant — it might be 20ms, it might be 4 seconds during a migration. Postgres and MySQL both let you check *how far behind* a replica actually is, so instead of a flat timer you can wait for the replica to catch up to the log position your write produced.

```sql
-- Postgres: capture the LSN your write produced
SELECT pg_current_wal_lsn();  -- returns e.g. '0/16B3748'

-- On the replica, before serving the read, check it's caught up
SELECT pg_last_wal_replay_lsn() >= '0/16B3748';
```

At Cubet, we do a cheaper version of this for account-settings pages specifically — the endpoints where "why is my own change not showing" turns into a support ticket. High-traffic, low-stakes reads (public listings, search) still hit replicas freely, because nobody notices a two-second lag on someone else's data.

## Fix #3: just don't re-read what you already have

The most underrated fix is architectural: after a successful write, don't issue a fresh read at all — return the object you just wrote.

```js
app.put('/profile', async (req, res) => {
  const updated = await primaryDb.query(
    'UPDATE users SET bio = $1 WHERE id = $2 RETURNING *',
    [req.body.bio, req.user.id]
  );
  res.json(updated.rows[0]); // no replica round-trip needed
});
```

`RETURNING *` (or your ORM's equivalent) sidesteps the entire problem for the most common case — the client that literally just sent you the data doesn't need to ask a replica for it back.

## The actual lesson

Read replicas trade consistency for scale, and that trade is invisible until someone hits it at exactly the wrong moment. If you're adding replicas, decide *up front* which reads are allowed to be stale and which ones absolutely cannot be — don't wait for the support tickets to draw that line for you.

Got a replication-lag war story, or a cleaner pattern than sticky sessions? I'd genuinely like to hear it — drop a comment or find me on the socials linked below.
