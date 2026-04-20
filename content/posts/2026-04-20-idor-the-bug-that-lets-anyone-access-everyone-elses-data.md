---
title: "IDOR: The Bug That Lets Anyone Access Everyone Else's Data 🕵️🔓"
date: "2026-04-20"
excerpt: "You built an API, added auth, deployed to production. Feels secure, right? Then someone changes one number in the URL and reads every user's private data. Welcome to IDOR — the vulnerability that's embarrassingly simple and devastatingly common."
tags: ["security", "api", "backend", "webdev"]
featured: true
---




# IDOR: The Bug That Lets Anyone Access Everyone Else's Data 🕵️🔓

**Picture this:** A user logs into your app, opens DevTools, changes `/api/orders/1042` to `/api/orders/1043` in the network tab, and suddenly they're reading someone else's order history, home address, and credit card last four digits.

No SQL injection. No XSS. No fancy exploit kit. Just... changing a number.

That's **IDOR — Insecure Direct Object Reference** — and it consistently lands in the OWASP Top 10 because developers keep shipping it. Including me, embarrassingly enough. Let me tell you that story. 😅

## What Even Is IDOR? 🤔

IDOR happens when your app exposes a direct reference to an internal object (a database ID, a filename, a UUID) and doesn't verify the *requesting user* actually owns that object.

The classic pattern:

```
GET /api/invoices/5821        → Returns YOUR invoice ✅
GET /api/invoices/5822        → Returns SOMEONE ELSE'S invoice 💀
```

Your authentication middleware checked "is this user logged in?" and answered yes. But nobody asked the follow-up question: **"Does this user have permission to access object #5822?"**

That gap — auth without authorization — is the entire vulnerability.

## My Personal Hall of Shame 😳

I was building an e-commerce API. The `/api/user/orders` endpoint returned the logged-in user's orders. Proper auth, tokens, the works. Proud of myself.

Then a friend said: "Hey, can I test your app?"

Three minutes later:

> "Your GET `/api/orders/{id}` endpoint doesn't check ownership. I can see every order ever placed. Also your order IDs are sequential so I just looped from 1 to 10,000 in a script."

I had *authentication* (prove who you are) but zero *authorization* (prove you're allowed to do this). Rookie mistake, painful lesson. 🫠

## The Fix Is One Check — But You Have to Remember It ✅

The vulnerable code looks innocent:

```javascript
// Express.js — VULNERABLE 💀
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) return res.status(404).json({ error: 'Not found' });

  res.json(order); // Returns order to ANYONE who's logged in!
});
```

The fix is one extra line — but it's the line that matters:

```javascript
// Express.js — SECURE ✅
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) return res.status(404).json({ error: 'Not found' });

  // THE CRITICAL CHECK — does this order belong to the requesting user?
  if (order.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(order);
});
```

Return `403 Forbidden`, not `401 Unauthorized`. The user IS authenticated — they just don't have permission. The distinction matters for clients and security scanners alike.

## IDOR Goes Beyond Sequential IDs 🎯

Developers often think "I'll use UUIDs, so it's not guessable!" That's security through obscurity, not actual security.

```
GET /api/documents/a3f8c2d1-9b4e-4f7a-8c3d-1e2f3a4b5c6d
```

A UUID is hard to *guess* — but if the app returns it to the user in one response, they can use it in another. Or share it. Or leak it in a log. Unguessable ≠ unpresentable.

**Real IDOR attack patterns:**

```
# Pattern 1: Sequential IDs (classic)
/api/users/1042/profile → change to /api/users/1041/profile

# Pattern 2: UUIDs from prior responses
/api/files/a3f8c2d1-... → ID harvested from another endpoint

# Pattern 3: Indirect references
/api/export?report=annual_revenue_2025  → change filename

# Pattern 4: Mass assignment
PATCH /api/users/me  { "role": "admin" }  → changes your own role
```

Pattern 4 — mass assignment — is IDOR's evil twin. Your ORM helpfully updates whatever fields the client sends, including ones they shouldn't touch.

```javascript
// VULNERABLE — mass assignment 💀
app.patch('/api/users/me', authenticate, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user.id,
    req.body,   // ← Updates ALL fields the client sends, including "role"!
    { new: true }
  );
  res.json(user);
});

// SECURE — explicit allowlist ✅
app.patch('/api/users/me', authenticate, async (req, res) => {
  const { name, email, bio } = req.body; // Only allow safe fields
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { name, email, bio },
    { new: true }
  );
  res.json(user);
});
```

## Build Authorization Into Your Data Layer 🏗️

The most bulletproof approach: don't even fetch data the user can't access. Scope every query to the authenticated user's context so unauthorized records never exist in your response layer.

```javascript
// Instead of: fetch then check ownership
const order = await Order.findById(id);
if (order.userId !== req.user.id) return forbidden();

// Prefer: fetch WITH ownership as a query filter
const order = await Order.findOne({
  _id: id,
  userId: req.user.id   // ← Can't return data that doesn't belong to this user
});
if (!order) return res.status(404).json({ error: 'Not found' });
// Note: Returns 404, not 403 — never confirm the resource exists to unauthorized users
```

Returning `404` instead of `403` for unauthorized resources prevents attackers from confirming which IDs exist (object enumeration). The user knows only that *they* can't find it — not that it belongs to someone else.

## A Quick IDOR Audit Checklist 📋

Before shipping any endpoint that takes an object ID, run through these:

- [ ] **Ownership check** — does this object belong to `req.user.id`?
- [ ] **Role check** — does this user's role grant access to this resource?
- [ ] **Scope query** — am I querying with `userId` in the filter, not just in a post-fetch check?
- [ ] **Mass assignment** — am I only allowing safe fields via an explicit allowlist?
- [ ] **Indirect references** — does any filename, report name, or path parameter reference another user's data?
- [ ] **Enumeration** — do I return `404` (not `403`) for unauthorized resources?

This takes 2 minutes per endpoint. A bug bounty hunter takes 30 seconds to find what you missed.

## The Real Cost of Skipping This 💸

IDOR isn't just theoretical. Real breaches that burned real companies:

- **Optus (2022):** 9.8 million customer records exposed via predictable API IDs. $140M+ in damages.
- **Peloton (2021):** Private user profile data (age, weight, workout history) accessible by anyone — no auth required at all.
- **Parler (2021):** Sequential post IDs allowed bulk scraping of 99% of all public posts before deletion.

These aren't exotic zero-days. They're `GET /resource/:id` without an ownership check.

## The Bottom Line 🎯

IDOR is proof that **authentication is not authorization**. Checking "are you logged in?" is table stakes. Checking "are you allowed to touch *this specific thing*?" is the actual work.

The fix isn't hard — it's one database filter, one comparison, one `403`. What's hard is *remembering to do it on every single endpoint*, under deadline pressure, when you're three coffees deep at midnight.

Build a habit: every time you write a route that accepts an object ID, ask yourself "what stops User A from passing User B's ID here?" If the answer is "nothing," fix it before you commit.

Your future self — and your users — will thank you. 🔒

---

**Working on API security?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — let's trade war stories about the bugs we shipped before we knew better.

**Want to see real-world secure API patterns?** Check my [GitHub](https://github.com/kpanuragh) — authorization checks included, no extra charge.

*P.S. — Go audit your endpoints right now. Seriously. I'll wait. Find anything scary? That's a good Friday afternoon.* 🔍

*P.P.S. — If your order IDs are sequential integers and you haven't checked ownership... you already know what to do.* 😬
