---
title: "BOLA: The API Bug That Lets Anyone Read Your Users' Data 🔓"
date: "2026-05-20"
excerpt: "Broken Object Level Authorization is the #1 API vulnerability on OWASP's list — and it's embarrassingly easy to introduce. Here's how it works, why it's so dangerous, and how to actually fix it."
tags:
  - security
  - api-security
  - bola
  - idor
  - rest-api
  - nodejs
featured: true
---

# BOLA: The API Bug That Lets Anyone Read Your Users' Data 🔓

Imagine you build a REST API. You add authentication — JWT tokens, the whole nine yards. You feel good about it. Secure. Professional.

Then someone logs in as user 42, changes the URL from `/api/orders/42` to `/api/orders/99`, and happily reads another user's entire order history.

Congratulations. You've just been hit by **BOLA** — Broken Object Level Authorization. And it's been sitting at **#1 on the OWASP API Security Top 10** for years, which tells you everything about how common it is.

---

## What Even Is BOLA?

BOLA (sometimes called IDOR — Insecure Direct Object Reference — in web-app contexts) happens when your API exposes object identifiers in requests but doesn't verify that the *currently authenticated user* is actually *allowed* to access that object.

You check **who you are**. You forget to check **whether you're allowed to touch this thing**.

The authentication middleware greenlit the request. The authorization logic for that specific resource? Never happened.

---

## A Vulnerable API in the Wild

Here's a stripped-down Express endpoint that ships straight into production more often than anyone wants to admit:

```js
// ❌ Vulnerable — no ownership check
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await db.orders.findById(req.params.orderId);

  if (!order) return res.status(404).json({ error: 'Not found' });

  res.json(order);
});
```

The `authenticate` middleware runs. Token is valid. User is logged in. Request passes.

But nobody checks whether `order.userId === req.user.id`.

An attacker just needs to enumerate IDs. If your IDs are sequential integers (and a depressing number of APIs still use them), they can dump every order in your database with a simple script:

```bash
for i in $(seq 1 10000); do
  curl -s -H "Authorization: Bearer $TOKEN" \
    https://api.yourapp.com/api/orders/$i | jq .
done
```

No SQL injection. No fancy exploits. Just arithmetic.

---

## The Fix Is Unglamorous but Non-Negotiable

Add an ownership check. Every. Single. Time.

```js
// ✅ Fixed — verify ownership before returning data
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await db.orders.findById(req.params.orderId);

  if (!order) return res.status(404).json({ error: 'Not found' });

  // The critical line everyone skips
  if (order.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json(order);
});
```

One `if` statement. That's it. The entire class of vulnerability sealed.

For admin roles, you add an exception — but the default is always deny-unless-authorized, not allow-unless-denied.

---

## Why This Keeps Happening

I've reviewed APIs at Cubet Techno Labs where BOLA showed up in multiple endpoints simultaneously. Not because the developers were careless — they were talented engineers — but because of a few structural traps:

**Trap 1: Auth middleware creates a false sense of security.** Once you see `authenticate` in the middleware chain, your brain registers "this route is protected" and moves on. Protected from *unauthenticated* users, yes. Not from authenticated users accessing each other's data.

**Trap 2: Sequential integer IDs.** Using `AUTO_INCREMENT` primary keys as your public-facing resource identifiers is handing attackers a roadmap. UUIDs don't eliminate BOLA — you still need the ownership check — but they raise the bar by making enumeration infeasible.

**Trap 3: The problem doesn't blow up in testing.** Your test suite probably hits endpoints as a single user with known IDs. Nobody writes the test case where user A tries to fetch user B's resource, gets a 200, and the test fails. That test has to be consciously added.

**Trap 4: BOLA is invisible in logs at first glance.** A 200 response to a legitimate-looking authenticated request looks fine. There's no error. No spike. Just quiet data exfiltration, potentially for months.

---

## A Practical Defense Checklist

Beyond the per-endpoint fix, here's what actually helps at scale:

1. **Query with ownership baked in, not as a filter after the fact.** Instead of fetching by ID then checking ownership, fetch by *both* ID and userId:

   ```js
   const order = await db.orders.findOne({
     where: { id: req.params.orderId, userId: req.user.id }
   });
   // If this returns null, the resource either doesn't exist
   // OR the user doesn't own it — same 404 response, no info leak
   ```

   This is cleaner, eliminates a round-trip logic step, and means the ownership check can't be accidentally omitted downstream.

2. **Write authorization-specific tests.** For every endpoint that returns user-scoped data, add a test where the requesting user ID doesn't match the resource's owner ID. Assert `403`.

3. **Consider opaque IDs at the boundary.** Use UUIDs or nanoids in your public API even if your database uses integers internally. It removes the enumeration vector — attackers can't just increment a counter.

4. **Audit with a BOLA mindset.** Go through every `GET /resource/:id` endpoint and ask: "What happens if a different valid user sends this request?" If the answer isn't a tested `403`, you have work to do.

---

## The Broader Pattern

BOLA isn't limited to GETs. A `PUT /api/profile/:userId` that lets you update any user's profile is the same bug. A `DELETE /api/posts/:postId` with no ownership check is the same bug. Anywhere you accept an object identifier and act on it without verifying the caller has permission to touch that object — same bug, different verb.

The OWASP API Security Top 10 puts this at #1 because it's endemic. Every API has object-level operations. Most developers correctly implement authentication. Fewer consistently implement per-object authorization. The gap between those two is where BOLA lives.

---

## TL;DR

- BOLA happens when your API trusts that a logged-in user can access *any* object, not just *their* objects.
- Authentication and authorization are different things. Both are required.
- The fix is an ownership check on every resource access — ideally baked into the database query itself.
- Add tests where user A tries to access user B's data and assert `403`. Without the test, the bug will come back.
- Sequential integer IDs make enumeration trivial; prefer UUIDs in your public API surface.

---

Found a BOLA in the wild recently? Or have a war story about how it got through code review? I'd genuinely love to hear it.

Find me on [GitHub](https://github.com/kpanuragh) or [X (Twitter)](https://x.com/kpanuragh) — ship secure APIs and see you in the next one.
