---
title: "IDOR: The Bug That Lets You Read Everyone Else's Inbox 📂🔓"
date: "2026-04-06"
excerpt: "You change one number in a URL and suddenly you're looking at a stranger's medical records. That's IDOR — the embarrassingly simple bug that keeps breaking apps everywhere. Let's fix it."
tags: ["cybersecurity", "web-security", "owasp", "api-security", "idor"]
featured: true
---




# IDOR: The Bug That Lets You Read Everyone Else's Inbox 📂🔓

Picture this: You're browsing your favourite SaaS app, looking at your invoice at `/invoices/1042`. Feeling curious, you change the URL to `/invoices/1041`. And there it is — someone else's invoice, complete with their name, address, and billing details. No hacking tools. No special knowledge. Just one tap on the keyboard.

Congratulations, you just discovered **IDOR** — one of the most common, most impactful, and most embarrassingly avoidable vulnerabilities in web development.

## What Is IDOR? 🤔

**Insecure Direct Object Reference** (IDOR) happens when your app uses a user-controllable value (like an ID in a URL or request body) to access an object directly — without first checking whether the requesting user is *actually allowed to see that object*.

The OWASP Top 10 calls this **Broken Access Control**, which climbed to the #1 spot in 2021 for good reason. It's everywhere.

The attacker's thought process is beautifully simple:

```
https://app.example.com/api/orders/5823   ← my order
https://app.example.com/api/orders/5822   ← wait, whose order is this?
https://app.example.com/api/orders/5821   ← jackpot 👀
```

No brute force required. No special tools. Just curiosity and arithmetic.

## The Vulnerable Code (Don't Ship This) 🚨

Here's a classic IDOR in a Node.js/Express API:

```javascript
// ❌ VULNERABLE - The developer "trusts" the ID in the URL
app.get('/api/orders/:orderId', authenticateUser, async (req, res) => {
  const order = await Order.findById(req.params.orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Oops: we never checked if this order belongs to req.user!
  return res.json(order);
});
```

The `authenticateUser` middleware correctly verifies the JWT and populates `req.user`. But then the route handler never asks the critical question: **"Does `req.user` own this order?"**

The result: any logged-in user can enumerate every order in the database.

## The Fix: Always Scope Queries to the Authenticated User ✅

The fix is almost insultingly simple — always filter database queries by the authenticated user's identity:

```javascript
// ✅ SECURE - Scope the query to the current user
app.get('/api/orders/:orderId', authenticateUser, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    userId: req.user.id  // 👈 The magic line
  });

  if (!order) {
    // Return 404 even if the order EXISTS but belongs to someone else
    // Don't leak "that ID exists but isn't yours" — that's info too!
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(order);
});
```

One extra condition in your query. That's it. The order either belongs to the user or it simply doesn't exist from their perspective.

## IDOR in the Wild: Real Patterns That Break Apps 🌍

IDOR doesn't just live in URLs. It hides in sneaky places:

**In request bodies:**
```json
POST /api/messages
{ "recipientId": 42, "senderId": 99, "body": "..." }
```
If the API trusts the `senderId` from the client rather than taking it from the auth token, an attacker can spoof messages from any user.

**In file downloads:**
```
GET /api/documents/download?fileId=abc123
```
Predictable or enumerable file IDs let attackers download documents they never uploaded.

**In GraphQL:**
```graphql
query {
  user(id: "usr_other_person") {
    email
    phoneNumber
    privateNotes
  }
}
```
GraphQL APIs are a hotbed for IDOR because developers often focus on authentication and forget per-field authorization.

## A Layered Defence Strategy 🛡️

A single check at the query level is good. A layered approach is better.

```javascript
// Middleware: attach a helper to every request
app.use(authenticateUser, (req, res, next) => {
  req.can = {
    accessOrder: (order) => order.userId.toString() === req.user.id,
    accessDocument: (doc) => doc.ownerId.toString() === req.user.id,
  };
  next();
});

// Route: use the helper
app.get('/api/orders/:id', authenticateUser, async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order || !req.can.accessOrder(order)) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(order);
});
```

This pattern keeps your authorization logic in one place, makes it easy to test, and makes it impossible to accidentally forget. If `req.can.accessOrder` doesn't return `true`, the order simply doesn't exist.

## Bonus: UUIDs Aren't a Security Fix 🎲

A common misconception: *"We use random UUIDs for IDs, so IDOR isn't possible."*

Wrong. UUIDs slow down enumeration but don't eliminate the vulnerability. If the UUID leaks anywhere (logs, emails, shared links), an attacker can use it. Authorization checks are still mandatory. UUIDs are a defense-in-depth measure, not a replacement for proper access control.

## The Audit Checklist ✅

Before your next deploy, run through these:

- [ ] Every API endpoint that fetches a resource by ID also filters by the authenticated user's identity
- [ ] File downloads are scoped to the requesting user
- [ ] "Admin-only" endpoints have explicit role checks, not just authentication
- [ ] Error responses return `404` (not `403`) when a resource exists but the user doesn't own it — avoid leaking existence
- [ ] Automated tests cover "User A cannot access User B's data" scenarios
- [ ] GraphQL resolvers have field-level authorization, not just query-level

## The Mindset Shift 🧠

The real fix for IDOR isn't a library or a framework feature — it's a mindset.

Every time you write a query like `findById(req.params.id)`, stop and ask yourself: **"Have I verified ownership?"** Burn that habit into muscle memory and IDOR becomes nearly impossible to accidentally introduce.

Authentication answers *"Who are you?"*. Authorization answers *"Are you allowed to do THIS?"*. Never confuse the two.

---

**Found an IDOR in a bug bounty program? Building something with proper access control?** I'd love to hear about it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — these stories are endlessly educational.

**Check out more security-focused code** on my [GitHub](https://github.com/kpanuragh) where I share patterns for building safer APIs. 🔐

*Now go audit your `findById` calls. You might surprise yourself.* 👀
