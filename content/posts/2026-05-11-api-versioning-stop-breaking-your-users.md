---
title: "🗂️ API Versioning: Stop Breaking Your Users with Every Deploy"
date: 2026-05-11
excerpt: "You shipped a breaking change and now every mobile app from 2022 is on fire. Let's talk about API versioning strategies so you never have that 3am call again."
tags: ["nodejs", "express", "api", "backend", "rest"]
featured: true
---

Picture this: it's 2am, your phone is exploding with Slack notifications, and the on-call engineer is frantically DMing you. Why? Because you renamed a field in your API response from `user_name` to `username` and forgot that the iOS app from three years ago is still live, still used by thousands of people, and absolutely cannot handle that change.

API versioning is one of those topics that seems boring until the day you desperately *need* it. Let's fix that before it becomes your problem.

## Why Versioning Matters (The Brutal Truth)

Your API is a contract. When clients — mobile apps, third-party integrations, partner services — start consuming it, they build assumptions about exactly what they'll get back. When you break those assumptions without warning, you break their code.

The challenge? You can't stop evolving your API. Business requirements change. You discover a better data model. Security vulnerabilities force redesigns. Versioning is how you honor your existing contract while still moving forward.

Think of it like a restaurant menu. You can absolutely add new dishes and change the kitchen workflow, but if you suddenly stop serving the burger someone already ordered, you're going to have a very upset customer.

## Strategy 1: URL Path Versioning (The Classic)

The most common approach — just put the version in the URL:

```javascript
const express = require('express');
const app = express();

// Version 1 routes
const v1Router = express.Router();
v1Router.get('/users/:id', (req, res) => {
  // Legacy format: returns { user_name, user_email }
  res.json({ user_name: 'Alice', user_email: 'alice@example.com' });
});

// Version 2 routes
const v2Router = express.Router();
v2Router.get('/users/:id', (req, res) => {
  // New format: returns { username, email, profile }
  res.json({
    username: 'Alice',
    email: 'alice@example.com',
    profile: { avatar: 'https://...', bio: 'Engineer' }
  });
});

app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);
```

**Pros:** Dead simple. Visible in logs, browser tabs, and curl commands. Easy to document and test separately.

**Cons:** URL purists will argue it violates REST principles (the URL should identify a *resource*, not a version of it). They're technically right and also no fun at parties.

For most teams, URL versioning is the pragmatic winner. It's obvious, it works, and it doesn't require clients to send special headers.

## Strategy 2: Header-Based Versioning (The Fancy One)

Some APIs (GitHub, Stripe) use a custom header to specify the version:

```javascript
const versionMiddleware = (req, res, next) => {
  const requestedVersion = req.headers['api-version'] || 'v1';
  const supported = ['v1', 'v2'];

  if (!supported.includes(requestedVersion)) {
    return res.status(400).json({
      error: `Unsupported API version: ${requestedVersion}`,
      supported
    });
  }

  req.apiVersion = requestedVersion;
  next();
};

app.use('/api/users/:id', versionMiddleware, (req, res) => {
  if (req.apiVersion === 'v2') {
    return res.json({ username: 'Alice', email: 'alice@example.com' });
  }
  // Default to v1
  res.json({ user_name: 'Alice', user_email: 'alice@example.com' });
});
```

**Pros:** Keeps URLs clean. Works beautifully for internal microservices where you control both client and server.

**Cons:** Headers are invisible in browser URLs, harder to test casually, and easy to forget to send. "Why is my request broken?" often ends with "oh, I didn't send the version header."

## The Real Secret: Deprecation Warnings

Here's the part most tutorials skip: versioning isn't just about routing — it's about *communication*. When you're ready to retire v1, tell your clients *in the response* before you pull the plug:

```javascript
v1Router.use((req, res, next) => {
  // Add deprecation headers so clients can see warnings in their logs
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2027 00:00:00 GMT');
  res.set('Link', '</api/v2>; rel="successor-version"');
  next();
});
```

These are actual RFC-standardized headers (`Deprecation` and `Sunset`). A well-behaved HTTP client will surface these warnings so developers know they need to migrate. It's the API equivalent of a polite "hey, this door closes in six months" note instead of finding it welded shut.

## Practical Guidelines That Will Save Your Sanity

**Additive changes don't require a new version.** Adding new optional fields to a response? New optional query parameters? New endpoints entirely? These are backwards-compatible — no version bump needed. Only break a version when you're *removing* something or *changing* existing behavior.

**Default to your latest stable version** for unauthenticated requests, but be explicit in your docs about what the default is. Never silently change what the default points to.

**Set a deprecation timeline and stick to it.** "v1 will be removed in 6 months" means removing it in 6 months, not 18. Your credibility as an API provider depends on it.

**Don't version your entire API for every change.** If you added a `profile` endpoint in v2 but the `users` endpoint is unchanged, there's no reason your `users` v1 clients need to migrate. Route only what changed.

## When You Already Have No Versioning (It's Okay)

Starting from scratch with versioning is easy. Adding it to an existing unversioned API is scarier but totally doable:

Treat your current API as `v1`. Create `v2` routes only when you have an actual breaking change ready to ship. Meanwhile, add a `v1` prefix behind the scenes and redirect your unversioned endpoints there — clients notice nothing, and you now have a versioned foundation.

## The Bottom Line

API versioning is one of those things that feels like overhead until the moment it saves you. The URL path approach works for 90% of projects. Communicate deprecations clearly, ship additive changes freely, and bump the version only when you truly break something.

Your future self — the one not getting that 3am call — will thank you.

---

**What versioning strategy are you using?** Drop it in the comments or share your worst "we broke production" story. The more harrowing the better — we all learn from them.
