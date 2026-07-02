---
title: "Cache-Aside vs Write-Through vs Write-Behind: Pick Wrong and Find Out 🎰"
date: "2026-07-02"
excerpt: "Everyone slaps Redis in front of a database and calls it caching. But cache-aside, write-through, and write-behind fail in wildly different ways — and picking the wrong one means either stale reads or a very confused on-call engineer."
tags:
  - backend
  - caching
  - performance
  - redis
  - databases
featured: true
---

Somewhere in your codebase there's a function called `getUser()` that does this:

```js
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  await redis.set(`user:${id}`, JSON.stringify(user), "EX", 300);
  return user;
}
```

Congratulations, you've implemented a caching strategy. You probably didn't decide to — it's just what you typed when you wanted things to be faster. This pattern has a name (**cache-aside**), and it has two siblings (**write-through** and **write-behind**) that nobody reaches for by accident, because they require you to actually think about writes, not just reads.

Here's the thing nobody tells you in the "add Redis, get 10x" tutorials: the strategy you pick determines *how* your system lies to you when it's wrong. Not *if* — how. Let's go through all three and figure out which lie you can live with.

## Cache-Aside: The Lazy One (and Also the Default)

This is the snippet above. The application owns the cache. On read: check cache, fall back to DB, repopulate cache. On write: update the DB and either invalidate or ignore the cache entry.

```js
async function updateUser(id, patch) {
  await db.query("UPDATE users SET name = $1 WHERE id = $2", [patch.name, id]);
  await redis.del(`user:${id}`); // invalidate, don't update
}
```

Why `del` instead of `set`? Because if two writes race, whoever's `redis.set` lands last wins with **stale data cached indefinitely** — the classic "cache doesn't reflect the last write" bug. Deleting forces the next reader to go fetch the fresh row. You trade a slightly slower next read for correctness. Take that trade every time.

Cache-aside's failure mode is honest: if the cache goes down, you're just hitting the database at full traffic (hopefully it survives). If a key isn't there, you get a miss, not garbage. This is why it's the default — it fails in the direction of "slow," not "wrong."

## Write-Through: The Paranoid One

Here, every write goes through the cache first, and the cache synchronously writes to the database before acknowledging.

```js
async function updateUser(id, patch) {
  const updated = { id, ...patch, updatedAt: Date.now() };
  await db.query("UPDATE users SET name = $1 WHERE id = $2", [patch.name, id]);
  await redis.set(`user:${id}`, JSON.stringify(updated), "EX", 300);
  return updated;
}
```

The cache and the database are updated together, so reads are always fresh — no stale-read window at all. This is genuinely nice for data that gets read immediately after being written (a profile update that redirects straight to the profile page, for example).

The cost is latency: every write now pays for two round trips instead of one, and it's on your critical path. If Redis is having a bad day, your writes are having a bad day too, even though Redis wasn't supposed to be in the write path in the first place. I've seen a "just add caching" ticket turn into a P1 because someone wired write-through into an already-slow write endpoint and doubled its tail latency. Use write-through when correctness-on-read matters more than write speed — not as a reflex.

## Write-Behind: The Reckless One (Use With Adult Supervision)

Write-behind (also called write-back) updates the cache immediately and returns to the caller — then asynchronously flushes to the database later, batched.

```js
async function updateUser(id, patch) {
  const updated = { id, ...patch, updatedAt: Date.now() };
  await redis.set(`user:${id}`, JSON.stringify(updated));
  await writeQueue.push({ table: "users", id, patch }); // flushed by a worker every N ms
  return updated; // caller never waited on the DB
}
```

Writes are blazing fast because the database isn't even in the request path. This is how systems absorb huge write bursts — think leaderboard score updates or view counters, where losing a few seconds of the freshest state in a crash is an acceptable trade for not falling over under load.

But notice what you just signed up for: if the process dies before the queue flushes, that data is **gone**. Not stale — gone. You need the write queue to be durable (a real message broker, not an in-memory array) and you need a story for what happens when the batch flush fails halfway through. Write-behind is the strategy equivalent of "I'll clean the kitchen tomorrow" — fine until three tomorrows stack up and the DB and cache have drifted apart in ways nobody notices until an audit.

## So Which One Do You Actually Use?

At Cubet Techno Labs, the honest answer for most services is: cache-aside for reads, always, and write-through only for the specific fields where "user sees stale data for 5 seconds" is an actual support ticket waiting to happen (billing status, permission flags — anything where staleness looks like a bug, not a delay). Write-behind gets reserved for high-volume, loss-tolerant counters, and even then it sits behind a durable queue, not a `setInterval`.

A decision table that's served me well:

| Need | Strategy |
|---|---|
| Reads dominate, occasional staleness is fine | Cache-aside |
| Read-after-write must be fresh | Write-through |
| Write volume is huge, losing the last few seconds is acceptable | Write-behind |
| You're not sure | Cache-aside — it fails the safest |

The mistake isn't picking the "wrong" strategy — it's picking one without knowing you picked it, because the tutorial only showed you the `redis.get` half of the story. Go look at your `updateX` functions today. If they're not invalidating or updating the cache at all, you don't have a caching strategy — you have a bug that hasn't been reported yet.

What's the staleness bug that finally taught your team to care about cache invalidation? I promise it's a good story — mine involved a discount code that "expired" for one user and not the other 40,000.
