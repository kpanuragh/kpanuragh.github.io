---
title: "IDOR: The Vulnerability Where Changing One Number Steals Everyone's Data 🔢🕵️"
date: "2026-04-21"
excerpt: "You built an API, added authentication, and felt secure. Then someone changed /api/orders/1001 to /api/orders/1002 and read your customer's private data. Welcome to IDOR — the vulnerability hiding in plain sight!"
tags: ["security", "api", "backend", "owasp"]
featured: true
---

# IDOR: The Vulnerability Where Changing One Number Steals Everyone's Data 🔢🕵️

**Storytime:** A friend shipped a SaaS invoicing app. Authentication? ✅ HTTPS? ✅ Input validation? ✅ Felt bulletproof.

Then a beta user emailed: *"Hey... I just noticed I can see other people's invoices by changing the number in the URL."*

The endpoint was `/api/invoices/1042`. The user changed it to `/api/invoices/1043`. Boom — someone else's invoice. Names, amounts, client details. All of it. 💀

That's **IDOR** — Insecure Direct Object Reference — and it's embarrassingly simple, dangerously common, and devastatingly effective.

## What Even Is IDOR? 🤔

IDOR happens when your application uses a user-controlled identifier (an ID, a filename, a slug) to look up a resource — without checking whether the requesting user is **authorized** to access that specific resource.

The mental model is simple:

```
User is authenticated ≠ User is authorized to access THIS object
```

You correctly check "is this user logged in?" but forget to check "does this user OWN this invoice?"

**Classic IDOR in the wild:**

```
GET /api/orders/5501          → Your order ✅
GET /api/orders/5502          → Someone else's order 🚨
GET /api/profile?user_id=99   → Your profile ✅
GET /api/profile?user_id=100  → Stranger's private profile 🚨
GET /api/export/report_88.pdf → Your report ✅
GET /api/export/report_89.pdf → CEO's confidential report 🚨
```

It doesn't get more elegant (or horrifying) than that.

## The Vulnerable Code That Ships to Production 😬

Here's what IDOR looks like in a typical Express.js API — the kind of code that seems totally fine until it isn't:

```javascript
// ❌ VULNERABLE: Fetches ANY order by ID, no ownership check
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await db.query(
    'SELECT * FROM orders WHERE id = ?',
    [req.params.orderId]
  );

  if (!order) return res.status(404).json({ error: 'Not found' });

  // Authenticated? Yes. Authorized? Nobody asked!
  return res.json(order);
});
```

The `authenticate` middleware runs. The user is logged in. But the query fetches ANY order matching that ID — no check that `orders.user_id` matches the logged-in user.

The fix is one extra condition, but it's the condition developers forget 90% of the time:

```javascript
// ✅ SECURE: Only returns orders belonging to the authenticated user
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await db.query(
    'SELECT * FROM orders WHERE id = ? AND user_id = ?',
    [req.params.orderId, req.user.id]  // <-- ownership enforced at DB level
  );

  if (!order) return res.status(404).json({ error: 'Not found' });

  return res.json(order);
});
```

That `AND user_id = ?` is the entire difference between "secure API" and "privacy disaster."

Notice the returned status for unauthorized access is still `404 Not Found` — not `403 Forbidden`. Why? Because `403` tells an attacker "this exists but you can't have it." `404` tells them nothing. Small detail, big difference. 🎯

## UUIDs Don't Save You 🎲

A very common misconception: *"We use UUIDs instead of sequential IDs, so we're safe from IDOR!"*

UUIDs do make IDs harder to **enumerate** (you can't just increment `1001 → 1002`), but they don't fix IDOR. They just change the attack from enumeration to reference leakage.

If your UUID ever appears in a URL, a shared link, a webhook payload, or a log file — and you don't check ownership — it's still IDOR. An attacker who gets hold of another user's UUID (via a leaked URL, a misconfigured log, or social engineering) can still access the resource directly.

UUIDs reduce the **discoverability** of the bug. They do not fix the underlying authorization flaw.

## IDOR at Scale: The Admin Endpoint Nobody Locked Down 🏢

IDOR isn't just about sequential IDs on user-facing endpoints. Some of the nastiest variants hide in:

**Indirect references via parameters:**
```
GET /api/download?file=invoice_john_2024.pdf
→ Change to: /api/download?file=invoice_sarah_2024.pdf
```

**Hidden API endpoints with predictable paths:**
```
POST /api/admin/users/42/reset-password
→ No admin check? Any user can reset any password.
```

**GraphQL queries without field-level authorization:**
```graphql
query {
  user(id: "456") {   # whose ID is this?
    email
    creditCardLast4
    address
  }
}
```

The common thread: the application trusts the client-supplied identifier without verifying ownership or permission.

## The Authorization Check Pattern That Actually Scales 🏗️

Rather than sprinkling ownership checks across every endpoint, centralize authorization into a reusable pattern:

```javascript
// A tiny helper that enforces ownership and throws on violation
async function getOwnedResource(model, resourceId, userId) {
  const resource = await model.findOne({
    where: { id: resourceId, userId: userId }
  });

  if (!resource) {
    // Deliberately ambiguous — don't leak whether it exists
    throw new NotFoundError();
  }

  return resource;
}

// Now every endpoint is one clean call
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await getOwnedResource(Order, req.params.id, req.user.id);
  res.json(order);
});

app.delete('/api/orders/:id', authenticate, async (req, res) => {
  const order = await getOwnedResource(Order, req.params.id, req.user.id);
  await order.destroy();
  res.status(204).send();
});
```

One helper, consistent behavior, authorization enforced at the data layer — and you can't accidentally forget it because the pattern *requires* it. 🔒

## The IDOR Audit Checklist ✅

Before shipping any API endpoint, run through this:

- [ ] Does this endpoint accept a user-supplied ID or reference?
- [ ] Does the query include an ownership or permission filter alongside the ID?
- [ ] Can the ID be enumerated or guessed? (Sequential integers = higher risk)
- [ ] Does a `404` response leak resource existence to unauthorized users?
- [ ] Are file download endpoints checking ownership of the file?
- [ ] Do admin endpoints verify the calling user's role, not just authentication?
- [ ] Have you tested by switching user accounts and replaying requests?

That last one is the manual test that catches what code review misses. Log in as User A, grab a URL, log in as User B in a different browser, paste the URL. If User B can see User A's data — you've got IDOR.

## The Bottom Line 🎯

IDOR consistently ranks in the OWASP API Security Top 10 because it's not a complex exploit — it's a skipped check. You secured the front door (authentication) and left the filing cabinet unlocked (authorization).

The mindset shift: **authentication answers "who are you?" — authorization answers "are you allowed to touch THIS?"** Both questions need an answer on every single data access.

The fix is almost always a single condition added to a database query. The cost of skipping it is your customers' private data walking out the door one HTTP request at a time.

Go audit your endpoints. I'll wait. 🕵️

---

**Found an IDOR in your own codebase?** Share the "oh no" moment on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — we've all been there.

**Want to see authorization done right?** Check my [GitHub](https://github.com/kpanuragh) for API security patterns.

*P.S. — Seriously, go test your own endpoints right now. Switch accounts. Change an ID. You might be surprised what you find.* 🔢
