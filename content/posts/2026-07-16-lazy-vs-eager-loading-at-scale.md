---
title: "🐢🐇 Lazy vs. Eager Loading at Scale: The Tortoise, the Hare, and Your P99"
date: "2026-07-16"
excerpt: "Lazy loading feels responsible. Eager loading feels wasteful. At scale, both of those instincts will betray you at least once. Here's how to actually pick."
tags:
  - performance
  - databases
  - caching
  - backend
  - architecture
featured: true
---

Every backend engineer eventually has the same argument with themselves at 11 PM: "should I fetch this now, or fetch it when someone actually asks for it?" It sounds like a trivial question. It is not a trivial question. It's the question behind N+1 queries, cold cache stampedes, bloated API payloads, and at least one outage I've personally contributed to.

Lazy loading and eager loading are both correct answers — to different problems. The trouble is that most teams pick one as a philosophy ("we're a lazy-loading shop") and then apply it everywhere, which works great until it very publicly doesn't.

## The Tortoise: Lazy Loading

Lazy loading defers work until the exact moment it's needed. You don't fetch the user's order history until they click "Order History." You don't join the `comments` table until someone expands the comment thread. It's frugal. It's polite to your database. It's also how you accidentally build the N+1 query from hell.

```javascript
// Looks innocent. Is not innocent.
const posts = await Post.findAll({ limit: 50 });

for (const post of posts) {
  post.author = await User.findByPk(post.authorId); // lazy load, 50 times
}
```

That loop just turned one query into fifty-one. At low traffic, nobody notices — the database shrugs it off in 40ms. At scale, with 50 posts fanning out to 50 round trips, each carrying its own network latency and connection-pool checkout, you've turned a 10ms endpoint into a 400ms endpoint, and you did it without writing a single obviously wrong line of code. That's the trap with lazy loading: it's locally correct and globally catastrophic, and it never shows up in a code review because each individual call looks fine.

## The Hare: Eager Loading

Eager loading flips the bet: fetch everything you *might* need, up front, in one shot.

```javascript
const posts = await Post.findAll({
  limit: 50,
  include: [{ model: User, as: "author" }], // one JOIN, not fifty round trips
});
```

One query. One round trip. Predictable latency. This is the fix for the N+1 problem above, and for a huge class of "why is this endpoint slow" tickets. But eager loading has its own failure mode, and it's just as sneaky: **you can eager-load data nobody asked for.**

I've seen a "get user profile" endpoint eager-load the user's *entire* activity log — every like, comment, and login event, going back years — because someone reasoned "we might show this on the profile page eventually." The endpoint went from 20ms to 900ms for power users with a lot of history, and it wasn't even a bug — it was doing exactly what it was told, fetching data that got thrown away by the frontend nine times out of ten. Eager loading isn't free just because it's one query; it's free *per query*, and it gets very expensive when the query is dragging along payload nobody reads.

## The Actual Decision Framework

The instinct to pick a team-wide default is the mistake. The right question is per-access-pattern, and it comes down to three things:

**1. Access probability.** If a related resource is read on >80% of requests to the parent, eager-load it — you're paying the fetch cost either way, might as well pay it in one trip. If it's read on <20% of requests (a "view full history" click, an admin-only field), lazy-load it and let the minority pay for what they use.

**2. Fan-out shape.** Eager loading is a JOIN or a batched `WHERE id IN (...)` — it scales with *query count*, not row count, so it's cheap even for wide fan-outs, as long as you batch it (more on that below). Lazy loading scales with *access count*, and if that access happens inside a loop, you've built an N+1 query without meaning to.

**3. Payload cost vs. compute cost.** Some "lazy" data isn't lazy because it's rarely needed — it's lazy because it's expensive to compute (a rolled-up analytics aggregate, a recommendation score) and you don't want to pay that cost for requests that never look at it. That's a caching decision wearing a loading-strategy costume; treat it as one.

## The Middle Path: Batch-Lazy

The false dichotomy is "one giant eager query" vs "N lazy queries." There's a third option that dataloader-style batching gives you: lazy *timing*, eager *execution*.

```javascript
// DataLoader collapses N calls in the same tick into one batched query
const userLoader = new DataLoader(async (ids) => {
  const users = await User.findAll({ where: { id: ids } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return ids.map((id) => byId.get(id)); // must preserve input order
});

for (const post of posts) {
  post.author = await userLoader.load(post.authorId); // still "lazy" call sites
}
// but under the hood: one query for all 50 authors, not 50 queries
```

Every call site still reads like lazy loading — no upfront `include`, no over-fetching guesswork. But DataLoader batches everything requested within the same tick into a single query behind the scenes. You get the ergonomics of lazy loading with the round-trip count of eager loading. This is why GraphQL resolvers lean on it so heavily: resolver functions are written lazily, per-field, but the N+1 problem that would otherwise create is neutralized at the batching layer.

## What I Actually Check Before Shipping

At Cubet, when a new endpoint touches a one-to-many or many-to-many relationship, the question I ask isn't "lazy or eager" — it's "what's the access probability, and is there a loop involved." If there's a loop and the child data is nearly always needed, that's an eager `include`, full stop. If it's rarely needed, lazy is fine — but only if it's a single lazy call, not one hiding inside iteration. And if I can't tell the access pattern yet because the feature is new, DataLoader-style batching is the safe default that doesn't paint you into a corner either way.

None of this shows up in a load test until you've got real traffic and real fan-out, which is exactly why it's worth deciding on purpose instead of by default. Go grep your codebase for a `for` loop with an `await` inside it that hits your ORM — I'd bet money you'll find at least one N+1 query wearing a trench coat, and now you know what to do about it.
