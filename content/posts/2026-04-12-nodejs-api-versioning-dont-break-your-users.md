---
title: "📦 Node.js API Versioning: Because Breaking Your Users Is Not a Feature"
date: 2026-04-12
excerpt: "You shipped a \"small\" API change and now 3 mobile apps are on fire. Sound familiar? Let's talk API versioning in Express — how to evolve your backend without nuking your users."
tags: ["nodejs", "express", "backend", "api", "rest", "architecture"]
featured: true
---

You merged a "tiny" API change on Friday afternoon. Nothing big — just renamed `user_name` to `username` in the response. Five fields, twenty seconds, what could go wrong?

By Monday morning, three different mobile apps were crashing, a third-party integration was screaming into the void, and your Slack was full of messages that started with "Hey, quick question..."

Welcome to the consequences of your actions. The API you changed was a **contract**, and you just broke it.

## APIs Are Promises, Not Suggestions

Here's the thing: every API endpoint you ship is a handshake with the outside world. Mobile apps, third-party integrations, that one bash script Carl in accounting swears he never wrote — they all depend on your API staying stable.

The fix isn't to stop shipping changes. The fix is **API versioning**: a way to evolve your backend while keeping older clients working until they're ready to upgrade (or retired into the digital graveyard).

There are three main strategies. Let's walk through them.

## Strategy 1: URL Versioning (The Obvious One)

The most common approach — stick the version right in the URL path.

```js
const express = require('express');
const app = express();

// v1 - the original contract
app.get('/api/v1/users/:id', (req, res) => {
  res.json({
    user_name: 'alice',   // old field name
    user_email: 'alice@example.com'
  });
});

// v2 - the improved contract
app.get('/api/v2/users/:id', (req, res) => {
  res.json({
    username: 'alice',    // renamed field
    email: 'alice@example.com',
    createdAt: new Date()
  });
});

app.listen(3000);
```

Simple. Visible. Easy to test in a browser. Your clients update their base URL when they're ready.

The downside? URL proliferation. Before long you've got `/v1`, `/v2`, `/v3`, and a `/v2-but-with-the-hotfix` living rent-free in your router. Keep your versioning strategy disciplined or it becomes a changelog archaeology project.

**When to use it:** Public APIs, mobile backends, anything where clients control their own upgrade timeline.

## Strategy 2: Header Versioning (The Fancy One)

This is what the cool kids do. The URL stays clean — `/api/users/:id` forever — and the version lives in a request header.

```js
const express = require('express');
const app = express();

function versionMiddleware(req, res, next) {
  const version = req.headers['api-version'] || 'v1';
  req.apiVersion = version;
  next();
}

app.use(versionMiddleware);

app.get('/api/users/:id', (req, res) => {
  const user = { id: req.params.id };

  if (req.apiVersion === 'v2') {
    return res.json({
      ...user,
      username: 'alice',
      email: 'alice@example.com',
      createdAt: new Date()
    });
  }

  // Default: v1 response
  res.json({
    ...user,
    user_name: 'alice',
    user_email: 'alice@example.com'
  });
});

app.listen(3000);
```

Now a client sends `api-version: v2` in the header and gets the new response. No URL changes required.

This is cleaner architecturally, but there's a catch: headers are invisible. Your junior dev will forget to set them. Your API documentation will need to shout about them. And debugging in a browser? You're going to be opening DevTools a lot.

**When to use it:** Internal APIs, microservices, situations where you control all the clients.

## Strategy 3: Router Prefixing (The Organized One)

As your API grows, shoving every version into one file turns into spaghetti. The real move is to split your versions into separate routers.

```js
// routes/v1/users.js
const router = require('express').Router();

router.get('/:id', (req, res) => {
  res.json({ user_name: 'alice', user_email: 'alice@example.com' });
});

module.exports = router;

// routes/v2/users.js
const router = require('express').Router();

router.get('/:id', (req, res) => {
  res.json({ username: 'alice', email: 'alice@example.com', createdAt: new Date() });
});

module.exports = router;

// app.js
const express = require('express');
const app = express();

const v1Users = require('./routes/v1/users');
const v2Users = require('./routes/v2/users');

app.use('/api/v1/users', v1Users);
app.use('/api/v2/users', v2Users);

app.listen(3000);
```

Now each version lives in its own file. You can change v2 without touching v1. You can deprecate and delete v1 cleanly when the time comes. Your future self will send you a thank-you card.

**When to use it:** Any production API you care about. Seriously, this is the one.

## The Deprecation Dance

Here's the part everyone skips: **communicating when a version is going away**.

Add a `Deprecation` header to old version responses:

```js
app.use('/api/v1', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2027 00:00:00 GMT');
  res.set('Link', '</api/v2>; rel="successor-version"');
  next();
});
```

These headers are part of an IETF draft standard and most good API clients will surface them as warnings. It's the difference between "we killed v1 without warning" and "we warned you for six months." Legal will appreciate you too.

## Practical Rules for Version Sanity

**Only create a new version when you break something.** Adding fields is backwards compatible — you don't need v2 for that. Removing fields, renaming keys, changing types? That's a breaking change, bump the version.

**Support at least two versions at once.** When v2 ships, v1 keeps working. Give clients a real migration window — three to six months minimum for public APIs.

**Document what changed between versions.** A changelog isn't optional; it's the only thing standing between you and furious Slack messages.

**Avoid version creep.** If you're on v7 and your oldest active client is on v6, delete v1 through v5. Dead code is a maintenance burden and a security risk.

## Stop Treating Your API Like a Personal Project

The moment someone else uses your API, it stops being just your code. It's infrastructure. It's someone else's problem if you break it carelessly.

Versioning isn't bureaucratic overhead — it's respect for the people who built on top of what you made. It lets you ship boldly without torching your users.

Now go add a `/v2` to something. Future you (and Carl's mystery bash script) will thank you.

---

*Already have a versioning strategy in production? Hit me up — I'd love to hear how it's holding up. And if you're still on "we'll just communicate the breaking change in Slack"... we need to talk.*
