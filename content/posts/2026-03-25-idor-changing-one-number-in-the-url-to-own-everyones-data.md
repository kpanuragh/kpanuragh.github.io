---
title: "IDOR: How Changing One Number in a URL Can Expose Everyone's Data 🔢💀"
date: "2026-03-25"
excerpt: "You built a REST API, you're feeling great. Then a hacker changes /api/orders/1001 to /api/orders/1002 and reads someone else's order. Congrats, you just shipped an IDOR vulnerability — the bug that launched a thousand data breaches."
tags: ["cybersecurity", "web-security", "owasp", "api-security", "authorization"]
featured: true
---

# IDOR: How Changing One Number in a URL Can Expose Everyone's Data 🔢💀

Picture this: You just shipped your new e-commerce API. Users can view their orders at `/api/orders/1042`. Feels clean, feels RESTful, feels *professional*.

Then some curious user opens DevTools, changes `1042` to `1043`, and suddenly they're reading someone else's order history. Full name, address, what they bought, how much they paid.

You've just discovered **Insecure Direct Object Reference** — IDOR for short — and it's in the #1 OWASP Top 10 category (Broken Access Control) for a reason.

## What IS IDOR, Exactly? 🤔

IDOR happens when your application uses user-supplied input to directly access objects — database records, files, user accounts — **without checking if the requester is actually authorized to access that object**.

The "direct object reference" part means you're exposing internal IDs (database primary keys, filenames, account numbers) directly in your API. The "insecure" part means you're trusting users not to tamper with those IDs.

Spoiler: users tamper with those IDs.

**Classic IDOR patterns:**
- `/api/invoices/5521` — change the ID, read someone else's invoice
- `/download?file=report_user_42.pdf` — change the user ID in the filename
- `POST /api/users/99/settings` — modify another user's settings
- `/api/admin/users/delete/7` — delete a user you have no rights to delete

It's embarrassingly simple. No fancy exploits. No memory corruption. Just... incrementing a number.

## The Bug in the Wild 🌍

Here's what vulnerable code looks like in the real world:

```javascript
// ❌ VULNERABLE: No authorization check
app.get('/api/orders/:orderId', async (req, res) => {
  const order = await Order.findById(req.params.orderId);

  if (!order) {
    return res.status(404).json({ error: 'Not found' });
  }

  // We check if the order EXISTS, but NOT if it belongs to THIS user
  return res.json(order);
});
```

This code fetches the order, confirms it exists, and hands it right over. The developer added authentication middleware — the user IS logged in — but they forgot that authentication (who are you?) is not the same as authorization (are you *allowed* to see this?).

An attacker just loops through IDs:

```bash
# Attacker's script — run this in a loop and collect everyone's data
for i in $(seq 1000 2000); do
  curl -s -H "Authorization: Bearer ATTACKER_TOKEN" \
    https://yourapp.com/api/orders/$i
done
```

Three minutes later, they have a thousand customers' order history. That's a GDPR nightmare and potentially a lawsuit waiting to happen.

## The Fix: Always Check Ownership 🛡️

The fix is conceptually simple — always verify the resource belongs to the authenticated user:

```javascript
// ✅ SECURE: Always tie the query to the authenticated user
app.get('/api/orders/:orderId', authenticate, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    userId: req.user.id  // The magic line — scope to THIS user only
  });

  if (!order) {
    // Return 404, not 403 — don't reveal whether the order exists
    return res.status(404).json({ error: 'Not found' });
  }

  return res.json(order);
});
```

That one extra condition (`userId: req.user.id`) means the query only returns results that belong to the logged-in user. An attacker can try a million IDs — they'll get 404 every single time.

**Why return 404 instead of 403?** If you return 403 ("Forbidden"), you're confirming the resource *exists* but the attacker can't see it. That itself is information leakage. Return 404 and keep them guessing.

## Laravel Example: The Policy Pattern 🏗️

If you're using Laravel, Policies are the elegant solution to IDOR:

```php
// app/Policies/OrderPolicy.php
class OrderPolicy
{
    public function view(User $user, Order $order): bool
    {
        // Only allow if this order belongs to the authenticated user
        return $user->id === $order->user_id;
    }
}

// app/Http/Controllers/OrderController.php
public function show(Order $order): JsonResponse
{
    // authorize() throws 403 if the policy returns false
    $this->authorize('view', $order);

    return response()->json($order);
}
```

Laravel's route model binding fetches the `Order` automatically. Then `authorize()` runs your policy. If the order doesn't belong to the user, they get a 403 and you sleep soundly at night.

The beauty of this pattern: you define authorization logic *once* in the Policy, and reuse it across controllers, middleware, Blade templates — everywhere.

## The Sneaky Variants 🥷

Basic IDOR is the tip of the iceberg. Here are the variants that catch developers off-guard:

**Horizontal IDOR** — User A accesses User B's data (same privilege level). The classic case above.

**Vertical IDOR** — Regular user accesses admin-level data. Even worse.

```
GET /api/admin/users  # Regular user hits an admin endpoint that forgot auth checks
```

**IDOR via Indirect References** — The ID is hidden in a request body or header, not the URL.

```
POST /api/messages/send
{ "recipientId": 42, "fromId": 999 }  // Attacker sets fromId to someone else's account
```

**Mass Assignment IDOR** — You can modify fields you shouldn't be able to touch.

```
PATCH /api/profile
{ "name": "Alice", "role": "admin" }  // Oops, did we just let users promote themselves?
```

Always use explicit allowlists for what fields users can update. Never blindly accept all input.

## Testing for IDOR Yourself 🧪

Before hackers find it, find it yourself:

1. **Use two accounts**: Create two test accounts. Perform an action with Account A. Capture the request. Replay it using Account B's session token. If B can access A's resource — you have an IDOR.

2. **Spider your IDs**: Look for any numeric or predictable identifiers in your URLs, request bodies, and response payloads.

3. **Try the obvious mutations**: If you see `/api/resource/42`, try `41`, `43`, `1`, `0`, `-1`, and `99999`.

4. **Check indirect references**: Search your code for places where user-supplied IDs are used in database queries without a corresponding ownership check.

```bash
# Grep your codebase for potentially vulnerable patterns
grep -rn "findById\|find(req.params\|findOne({ _id" --include="*.js"
```

If you see `findById(req.params.something)` without a `userId` filter in the same query, that's a red flag.

## The Checklist ✅

Before you ship:

- [ ] Every query that fetches user-owned data filters by the authenticated user's ID
- [ ] Authorization is checked at the data layer, not just the route level
- [ ] Sensitive endpoints return 404 (not 403) for unauthorized resource access
- [ ] Mass assignment is protected with explicit field allowlists
- [ ] You've tested with two separate accounts in your staging environment
- [ ] Admin endpoints have explicit role checks, not just authentication

## The Harsh Reality Check 😬

IDOR is the #1 most-reported vulnerability in bug bounty programs. **Not** because it's sophisticated — but because developers consistently confuse authentication with authorization.

Authentication = "Are you logged in?"
Authorization = "Are you allowed to touch THIS specific thing?"

You need both. Every time. On every endpoint. No exceptions.

The good news: once you internalize this mental model, you'll start writing secure-by-default code automatically. It becomes muscle memory. And the next time you write `findById(req.params.id)`, a little alarm will go off in your head saying *"but whose ID is this and should THEY have access?"*

That alarm is what separates a secure developer from a data breach waiting to happen.

---

**Found an IDOR in the wild or have authorization war stories?** Let's talk on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I genuinely love discussing how these vulnerabilities slip through code review.

**Want to see how I handle authorization in real projects?** Check out my [GitHub](https://github.com/kpanuragh) for production-ready examples. 🔐

*Now go audit your endpoints. One missing ownership check is one data breach away.* 🔍✨
