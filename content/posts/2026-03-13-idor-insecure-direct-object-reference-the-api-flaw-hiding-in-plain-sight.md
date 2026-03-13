---
title: "IDOR: The API Flaw Hiding in Plain Sight 🕵️‍♂️🔓"
date: "2026-03-13"
excerpt: "You built a beautiful REST API, authenticated every endpoint, and even wrote tests. But did you check whether user A can read user B's data just by changing a number in the URL? That's IDOR — the vulnerability that's embarrassingly easy to exploit and embarrassingly easy to miss."
tags: ["security", "api", "web-security", "owasp"]
featured: true
---

# IDOR: The API Flaw Hiding in Plain Sight 🕵️‍♂️🔓

Let me paint you a picture.

You're using a shiny new fintech app. You notice your invoice URL looks like this:

```
https://api.coolfintech.com/invoices/10482
```

Curiosity strikes. You change `10482` to `10481`. Boom — someone else's invoice loads. Their name, address, bank details, everything.

Congratulations, you just discovered an **IDOR vulnerability** — and you didn't even need a hacking tool. Just a keyboard and a suspicious mind.

This is **Insecure Direct Object Reference** (IDOR), ranked in the OWASP API Security Top 10 as one of the most widespread and damaging flaws in modern applications. And the truly painful part? It takes about 30 seconds to accidentally introduce, and months to notice if you're not actively looking.

## What Even Is IDOR? 🤔

IDOR happens when your application exposes a reference to an internal resource — a database ID, a filename, a UUID — and trusts the user to only access resources that belong to them. Without actually *checking* that.

That's it. That's the whole bug. The authentication works fine. The endpoints are protected. But the **authorization** — "does this *specific user* have access to this *specific resource*?" — is missing.

**Authentication:** "Are you logged in?" ✅
**Authorization:** "Is this yours?" ❌ (the forgotten sibling)

It's like a hotel that checks you have a room key, but every key opens every door. You're authenticated. Just not authorized. 🏨🔑

## A Vulnerable API (Don't Ship This) 🚫

Here's a classic Node.js/Express endpoint that looks totally fine at first glance:

```javascript
// ❌ VULNERABLE: No ownership check!
app.get('/api/orders/:orderId', authenticateUser, async (req, res) => {
  const order = await Order.findById(req.params.orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // ⚠️ We verified the user is logged in (authenticateUser middleware),
  // but we NEVER checked if this order belongs to them!
  return res.json(order);
});
```

A logged-in attacker can enumerate every order in your system by iterating `orderId`. Sequential integer IDs make this trivially scriptable:

```bash
# Attacker's "exploit" — it's just a for loop 😬
for i in $(seq 1 10000); do
  curl -H "Authorization: Bearer ATTACKER_TOKEN" \
    https://api.yourapp.com/api/orders/$i
done
```

That's not hacking. That's a for loop. And it will harvest every order in your database.

## The Fix: Always Check Ownership 🛡️

The fix is exactly one line of logic — but you have to remember to apply it *everywhere*:

```javascript
// ✅ SAFE: Ownership is enforced server-side
app.get('/api/orders/:orderId', authenticateUser, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    userId: req.user.id  // 👈 This is the entire fix
  });

  if (!order) {
    // Return 404 whether it doesn't exist OR belongs to someone else
    // Never reveal "this exists but isn't yours" — that leaks info!
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(order);
});
```

By including `userId: req.user.id` in the query, the database only returns the order if it belongs to the authenticated user. No ownership? No record returned. Simple, effective, and nearly impossible to bypass.

**Pro tip:** Return `404` instead of `403` when something exists but doesn't belong to the user. A `403` tells attackers "this record exists, keep probing." A `404` tells them nothing useful. 🤫

## The Sneakier Variants (Yes, There Are More) 😈

Simple sequential IDs are obvious. But IDOR hides in subtler places too:

**File downloads via user-controlled paths:**
```
GET /api/exports/download?file=report_user_42.pdf
# Attacker tries: report_user_43.pdf, report_user_1.pdf
```

**Updating other users' data:**
```
PATCH /api/profile
{ "userId": 9999, "email": "attacker@evil.com" }
# If the server uses the body's userId instead of the token's userId...
```

**Mass assignment leading to IDOR:**
```javascript
// ❌ Trusting user input to set the owner
const record = await Record.create(req.body);
// Attacker sends: { "content": "...", "userId": 1 }
// They just created a record owned by user 1!

// ✅ Always set sensitive fields from the authenticated session
const record = await Record.create({
  content: req.body.content,
  userId: req.user.id  // Never trust this from the client!
});
```

**The IDOR family is large.** Anywhere you take an identifier from user input and use it to fetch or modify data, you have a potential IDOR.

## How to Think About Authorization (The Right Mental Model) 🧠

The fix isn't just adding a `userId` check here and there. It's building an **authorization mindset** from the start.

Ask these questions for every single endpoint:

```
□ Who is making this request? (Authentication)
□ What resource are they requesting? (Input)
□ Does this resource belong to them? (Authorization!)
□ Do they have the right *role* to perform this action? (RBAC)
□ Am I leaking existence of resources they shouldn't know about?
```

In Laravel, this maps beautifully to **Policies**:

```php
// UserInvoicePolicy.php
public function view(User $user, Invoice $invoice): bool
{
    return $user->id === $invoice->user_id;
}

// InvoiceController.php
public function show(Invoice $invoice): JsonResponse
{
    // One line — enforces ownership automatically via Gate/Policy
    $this->authorize('view', $invoice);

    return response()->json($invoice);
}
```

Route model binding + policies = IDOR protection baked in. The framework handles the lookup AND the authorization check. Beautiful. 🎯

## Real-World Impact: This Is Not Theoretical 💥

IDOR has been found in some of the biggest platforms on the planet:

- **Facebook (2015):** IDOR allowed deleting any photo album on the platform. Rewarded $12,500 in bug bounty.
- **Instagram:** IDOR let attackers view private posts of any account.
- **Shopify:** Multiple IDOR bugs over the years in their merchant/admin APIs.
- **Healthcare apps:** Patient records accessible by changing a number in the URL. Real damage, real lives affected.

And countless smaller companies quietly patching these without disclosure, hoping nobody noticed. (They usually did.)

**The stat that should keep you up at night:** According to HackerOne's annual report, IDOR/Broken Object Level Authorization is consistently the #1 or #2 highest-paying bug bounty category. Why? Because it's *everywhere*, and the impact is always critical — data of real users, leaking or being modified by someone who should never have touched it.

## Your IDOR Audit Checklist ✅

Go through your API right now and ask:

```markdown
□ Every GET endpoint: can a user fetch another user's resource by ID?
□ Every PATCH/PUT/DELETE: does it verify ownership before modifying?
□ Every file download: is the path/filename validated against ownership?
□ Are you using sequential integers? (UUIDs don't prevent IDOR, but they slow brute-force)
□ Does your ORM/framework have built-in scope/policy helpers you're not using?
□ Are you returning 403 when you should return 404?
□ Is your test suite actually testing cross-user access? (Write one NOW!)
```

The most valuable test you can write:

```javascript
it('should not return another user\'s order', async () => {
  const userA = await createUser();
  const userB = await createUser();
  const order = await createOrder({ userId: userA.id });

  const response = await request(app)
    .get(`/api/orders/${order.id}`)
    .set('Authorization', `Bearer ${userB.token}`);

  expect(response.status).toBe(404); // NOT 200!
});
```

If this test passes, you're safe. If it was never written, you might not be. 🎯

## The Bottom Line 💡

IDOR is the vulnerability that punishes the assumption that "authenticated = authorized." Your authentication layer is fine. Your data is exposed anyway.

The good news: the fix is genuinely simple once you *know* to look for it. Always scope queries to the authenticated user. Use framework authorization features (policies, gates, scopes). Write cross-user tests. Never trust client-provided owner IDs.

The bad news: it's easy to forget when you're shipping fast, especially under deadline pressure when "the auth middleware is already there, what else do we need?"

**What else you need is one more question:** *Is this theirs?*

Ask it every time. Your users' data depends on it. 🔐

---

**Found this useful?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I share security deep-dives and developer tips regularly.

**Got an IDOR story to share?** Drop it on my [GitHub](https://github.com/kpanuragh) or reach out — the community learns best from real examples!

*Now go write that cross-user test. Seriously. I'll wait.* ⏳🔒✨

---

**P.S.** UUIDs instead of sequential integers reduce the *discoverability* of IDOR but absolutely do not fix it. An attacker with access to one UUID (e.g., from a shared link or API response) can still exploit IDOR. Always enforce ownership. UUIDs are a speed bump, not a wall.
