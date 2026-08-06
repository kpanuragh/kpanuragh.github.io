---
title: "👻 Negative Caching: Why Caching 'Nothing' Still Saves Your Database"
date: "2026-08-06"
excerpt: "Every caching tutorial teaches you to cache the thing that exists. Nobody teaches you to cache the thing that doesn't — and that gap is exactly what lets a bot hammer your database with 50,000 requests for user IDs that were never real."
tags:
  - nodejs
  - caching
  - performance
  - databases
  - backend
featured: true
---

# 👻 Negative Caching: Why Caching 'Nothing' Still Saves Your Database

Quick question: what does your app do when someone requests `/users/999999999` and that user doesn't exist?

If your answer is "it queries the database, gets nothing back, and returns a 404" — congratulations, you've just described the exact behavior that let a misconfigured retry loop take down a service I worked on at Cubet Techno Labs. Not by finding data. By repeatedly, enthusiastically, asking for data that was never going to be there.

We spend so much time optimizing the cache-hit path — Redis, TTLs, cache-aside, all the greatest hits — that we forget there's a whole other category of request: the ones that miss on purpose, forever, because the thing being asked for doesn't exist. And every single one of those requests, in a naive setup, goes straight past your cache and lands on your database like it's the first time anyone's ever asked.

## The bug that isn't a bug

Here's the thing that makes this sneaky: nothing is actually broken. Cache-aside is working exactly as designed.

```js
async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);

  const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  if (!user) return null; // nothing to cache, right?

  await redis.set(`user:${id}`, JSON.stringify(user), "EX", 300);
  return user;
}
```

Look closely — the `if (!user) return null` line is the entire vulnerability. When the DB comes back empty, we shrug and go home. Nothing gets written to Redis, which means the *next* request for that same nonexistent ID skips the cache just as cleanly as this one did. Ask for it a hundred times, hit the database a hundred times. Ask for it 50,000 times because a scraper is enumerating sequential user IDs, and you've built yourself a very expensive, very avoidable database fire drill — one where every single query returns the same nothing, over and over, at full price.

This is what the caching literature calls a **cache penetration** attack (or, less dramatically, "what happens when your ID space is guessable and nobody thought about the miss path"). It doesn't need malice to hurt you — a broken frontend polling a deleted resource does the exact same damage.

## Cache the absence, not just the presence

The fix is almost insultingly simple once you see it: a "not found" is a fact about the world too, and facts are cacheable.

```js
const NOT_FOUND = Symbol("not_found");

async function getUser(id) {
  const cached = await redis.get(`user:${id}`);
  if (cached === "__NF__") return null;
  if (cached) return JSON.parse(cached);

  const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);

  if (!user) {
    // cache the miss too — short TTL, this isn't a decision, just a shield
    await redis.set(`user:${id}`, "__NF__", "EX", 30);
    return null;
  }

  await redis.set(`user:${id}`, JSON.stringify(user), "EX", 300);
  return user;
}
```

Two lines of difference, and now the 50,000th request for a ghost ID never touches the database — Redis answers "still nothing, I checked 4 seconds ago" and moves on. Note the shorter TTL on the negative entry: a "not found" today doesn't deserve the same five minutes of trust as real data, because unlike a user record, this fact can flip the instant someone actually signs up with that ID. Cache the absence like you're not entirely sure it'll stay absent — because you're not.

## The part everyone forgets: invalidate the ghost

Negative caching has exactly one sharp edge, and it's the one that turns "clever optimization" into "why is a brand-new signup getting 404'd." If you cache "user 12345 doesn't exist" and then user 12345 actually gets created three seconds later, your negative cache entry is now actively lying to every request until it expires.

```js
async function createUser(data) {
  const user = await db.insert("users", data);
  await redis.del(`user:${user.id}`); // kill the ghost, if one exists
  return user;
}
```

This is why the TTL on negative entries should be short and the invalidation on creation should be non-negotiable — treat it the same way you'd treat any other write-path cache invalidation, because that's exactly what it is. Skip this step and you'll spend an afternoon debugging why a "successfully created" account can't log in for the next 30 seconds, which is a genuinely confusing bug to chase because the create endpoint reports success and the read endpoint insists you don't exist.

## Where this actually pays off

You don't need this everywhere. A low-traffic internal admin panel doesn't need negative caching; the juice isn't worth the squeeze. But it earns its keep fast in a few specific shapes:

- **Public, guessable ID spaces** — sequential IDs, slugs, anything a scanner or bot can enumerate.
- **Auth and permission checks** — "does this API key exist / is this session valid" gets hit on *every request*, and a revoked key still gets checked forever until someone stops asking.
- **Feature flag / config lookups** — "does this tenant have flag X" for tenants that don't have it set is a miss you'll see constantly, not rarely.

The common thread: high request volume against a key space where "not found" is a frequent, legitimate, and repeatable answer — not a rare edge case.

## Try it before you need it

Go find your busiest lookup endpoint and check its logs for the 404/null rate. If more than a sliver of your traffic is asking for things that don't exist, you're paying full database price for an answer you already know. A negative cache entry with a short TTL and a solid invalidation-on-write hook is maybe ten lines of code, and it turns "please stop asking, I already told you" into an actual, enforced policy instead of a database groaning under repeated disappointment.

What's the emptiest query your database answers the most — and does it even know it's being asked the same nothing over and over?
