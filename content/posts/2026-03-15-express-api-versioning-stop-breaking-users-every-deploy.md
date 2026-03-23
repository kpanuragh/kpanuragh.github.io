---
title: "🔢 Express API Versioning: Stop Breaking Your Users with Every Deploy"
date: "2026-03-15"
excerpt: "Every time you change your API without versioning, a developer somewhere cries. Learn how to version your Express API properly so your users don't wake up to a broken integration at 3am."
tags: ["\\\"nodejs\\\"", "\\\"express\\\"", "\\\"backend\\\"", "\\\"api\\\"", "\\\"rest\\\""]
featured: "true"
---

# 🔢 Express API Versioning: Stop Breaking Your Users with Every Deploy

Picture this: you ship a "small refactor" that renames `user.name` to `user.fullName`. You think nothing of it. Then your inbox explodes. Three mobile apps are down. A partner's integration is throwing 500s. Your weekend plans? Cancelled.

This is the API versioning wake-up call. Every production API eventually learns this lesson — the hard way or the smart way. Let's do it the smart way.

## Why Versioning Exists (and Why You're Probably Skipping It)

Here's the thing: when you own both the frontend and the API, you can change them together. No problem. But the moment someone else — a mobile app, a third-party integration, a customer's internal tool — starts consuming your API, you've made a promise. A silent, unwritten promise that **what they built today will still work tomorrow**.

API versioning is how you keep that promise while still being able to evolve your API. It's not bureaucracy. It's respect for your users.

The most common excuse for skipping versioning? *"We'll add it later."* Spoiler: later is always after the incident.

## The Three Main Versioning Strategies

Before we write code, let's talk options. There are three common approaches:

- **URL path versioning** — `/api/v1/users`, `/api/v2/users`
- **Header versioning** — `Accept: application/vnd.myapi.v2+json`
- **Query param versioning** — `/api/users?version=2`

URL path versioning wins almost every time. It's explicit, debuggable, bookmarkable, and logs cleanly. Headers are elegant but invisible. Query params feel like an afterthought. Use URL versioning unless you have a very specific reason not to.

## Setting Up Versioned Routes in Express

Here's the cleanest way to structure API versioning in Express — using separate routers per version:

```javascript
// routes/v1/users.js
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    users: [{ id: 1, name: 'Alice' }]  // v1 shape
  });
});

module.exports = router;

// routes/v2/users.js
const router = require('express').Router();

router.get('/', (req, res) => {
  res.json({
    data: [{ id: 1, fullName: 'Alice', email: 'alice@example.com' }],
    meta: { total: 1, page: 1 }  // v2: new shape, pagination
  });
});

module.exports = router;

// app.js — wire it all together
const express = require('express');
const app = express();

const v1Users = require('./routes/v1/users');
const v2Users = require('./routes/v2/users');

app.use('/api/v1/users', v1Users);
app.use('/api/v2/users', v2Users);
```

That's it. V1 consumers keep working. V2 gets the new shape. Nobody cries at 3am.

The key insight here: **each version is just a router**. You can share middleware, share database queries, and diverge only where the response shape changes. Don't copy-paste everything — extract shared logic into service functions that both versions call.

## The Deprecation Dance

Adding versions is easy. The hard part is sunsetting old ones without stranding users.

The golden rule: **never delete a version without warning**. Here's a lightweight deprecation pattern using response headers:

```javascript
// middleware/deprecation.js
function deprecationWarning(version, sunsetDate) {
  return (req, res, next) => {
    res.set('Deprecation', 'true');
    res.set('Sunset', new Date(sunsetDate).toUTCString());
    res.set('Link', '</api/v2/docs>; rel="successor-version"');
    console.warn(`[DEPRECATION] v${version} hit by ${req.ip} at ${req.path}`);
    next();
  };
}

module.exports = { deprecationWarning };

// app.js
const { deprecationWarning } = require('./middleware/deprecation');

// Warn users that v1 is going away
app.use('/api/v1', deprecationWarning(1, '2026-09-01'));
app.use('/api/v1/users', v1Users);
```

Now every v1 response carries a `Sunset` header with the retirement date. Good API clients (and developers debugging in DevTools) will see it. Send an email too. Tweet about it. Put it in your changelog. Deprecation is a communication problem, not just a code problem.

A reasonable deprecation timeline: **announce 6 months out, start sending headers at 3 months, shut down at the deadline**. If you have big enterprise customers, double those numbers.

## Versioning Your Folder Structure

Good versioning isn't just about routes — it's about having a folder structure that doesn't become a maze. Here's a pattern that scales:

```
src/
  routes/
    v1/
      users.js
      products.js
      index.js        ← mounts all v1 routes
    v2/
      users.js
      products.js
      index.js        ← mounts all v2 routes
  controllers/
    users.js          ← shared business logic
  services/
    userService.js    ← reusable across versions
```

The controllers and services are version-agnostic. The routes in each version directory are just thin adapters — they call the same service functions but shape the response differently. When you create v3, you don't rewrite your database layer. You add a new route folder and new response shapes.

## Common Versioning Mistakes

A few pitfalls to dodge:

**Versioning too granularly** — you don't need `/api/v1.2.3/users`. Major versions only. Minor changes should be backwards-compatible by design (adding fields is fine, removing them is a breaking change).

**Forgetting to version your documentation** — if your docs only describe v2 but you still support v1, you'll spend more time in support Slack than writing code.

**Creating versions for every little change** — if you're adding a new optional field, that's not a new version. New versions are for breaking changes: removing fields, changing data types, restructuring response shapes, or altering authentication mechanisms.

**Not logging which version gets hit** — you can't sunset what you can't measure. Track version usage in your metrics so you know when it's actually safe to pull the plug on v1.

## A Note on "Default" Versions

Some teams set up a default version that unversioned requests fall back to. Resist this temptation. It's a footgun. If someone calls `/api/users` and you've been silently defaulting to v1, the day you flip that default to v2 is the day everything breaks. Require an explicit version. Return a 404 or a helpful error for unversioned requests.

```javascript
app.use('/api', (req, res) => {
  res.status(400).json({
    error: 'API version required',
    message: 'Please use /api/v1 or /api/v2',
    docs: 'https://docs.example.com/api/versioning'
  });
});
```

## Wrapping Up

API versioning isn't glamorous. You won't get a GitHub star for adding `/v1/` to your routes. But you will earn the quiet gratitude of every developer who didn't wake up to a broken integration because you were thoughtful enough to version your API.

The rule is simple: **any API consumed by something you don't control needs versioning**. Add it before you need it. Your future self — and your users — will thank you.

Now go add those version prefixes. And maybe ping your team about that v1 endpoint you've been meaning to deprecate for six months. 👋
