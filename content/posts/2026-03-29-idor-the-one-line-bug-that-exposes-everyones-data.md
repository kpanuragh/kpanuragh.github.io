---
title: "IDOR: The One-Line Bug That Exposes Everyone's Data 🔓👀"
date: "2026-03-29"
excerpt: "You built an API, added authentication, and felt secure. Then a hacker changed one number in the URL and read every user's private data. IDOR is embarrassingly simple, devastatingly common, and entirely preventable — here's how."
tags: ["security", "api", "backend", "owasp"]
featured: true
---

# IDOR: The One-Line Bug That Exposes Everyone's Data 🔓👀

**Story time:** A developer at a mid-sized SaaS company built a beautiful REST API. Auth tokens? ✅ HTTPS? ✅ Passwords hashed? ✅ Rate limiting? ✅

A security researcher signed up for a free trial, grabbed their invoice URL from the dashboard:

```
GET /api/invoices/10482
```

Changed `10482` to `10481`. Got someone else's invoice. Changed it to `1`. Got the CEO's invoice from 2019. Reported it. The company had exposed **10,000+ customer invoices** for two years. 💀

That's **Insecure Direct Object Reference** — OWASP's perennial top-10 guest, and possibly the most embarrassing vulnerability in web development.

## What Is IDOR, Exactly? 🤔

IDOR happens when your app exposes internal object identifiers (database IDs, filenames, UUIDs) directly in URLs or request bodies — and then fails to verify that the *requesting user actually owns that object*.

The attack is trivial:

1. User logs in as themselves
2. Sees a URL like `/api/orders/5523`
3. Tries `/api/orders/5522`
4. Gets someone else's order
5. Loops through IDs 1–999999
6. Downloads your entire database 🎉 (for them, not you)

No special tools. No advanced hacking skills. Just arithmetic. 🔢

## The Vulnerable Code (Stop Writing This) 🚫

Here's the classic mistake — an Express.js route that trusts the ID parameter blindly:

```javascript
// ❌ VULNERABLE: No ownership check!
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return res.status(404).json({ error: 'Not found' });
  }

  // 🚨 We verified the user is logged in...
  // 🚨 But we never checked it's THEIR invoice!
  return res.json(invoice);
});
```

The `authenticate` middleware confirms the user is *logged in*. It does absolutely nothing to confirm this invoice *belongs to them*. Attacker logs in with their own account, then browses everyone else's data.

Same mistake in Laravel:

```php
// ❌ VULNERABLE: Route model binding without ownership check
Route::get('/invoices/{invoice}', function (Invoice $invoice) {
    // Laravel auto-fetches the invoice — but for ANYONE who's logged in!
    return response()->json($invoice);
})->middleware('auth');
```

This pattern is everywhere. It's the default way beginners write CRUD. And it's catastrophically insecure.

## The Fix: Always Check Ownership 🔐

The rule is simple: **every data-access operation must verify the requesting user owns (or is authorized to access) that resource**.

```javascript
// ✅ SECURE: Ownership check included
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    userId: req.user.id,  // 👈 The magic line
  });

  if (!invoice) {
    // Return 404, not 403 — don't confirm the invoice exists
    return res.status(404).json({ error: 'Not found' });
  }

  return res.json(invoice);
});
```

By scoping the database query to `userId: req.user.id`, user A literally *cannot* retrieve user B's invoice — the query returns null, same as if it didn't exist.

The Laravel equivalent with policy-based authorization:

```php
// ✅ SECURE: Laravel policy handles ownership
Route::get('/invoices/{invoice}', function (Invoice $invoice) {
    // InvoicePolicy@view checks: $invoice->user_id === auth()->id()
    $this->authorize('view', $invoice);
    return response()->json($invoice);
})->middleware('auth');

// InvoicePolicy.php
public function view(User $user, Invoice $invoice): bool
{
    return $user->id === $invoice->user_id;
}
```

Laravel's `authorize()` throws a 403 automatically if the policy fails. Clean, centralized, and hard to accidentally skip. 🎯

## The Subtle Variants That Still Bite Senior Devs 😬

IDOR isn't just sequential integer IDs. Here are the sneaky versions:

**1. GUIDs don't save you.** UUIDs are hard to guess, but if your API returns them in list endpoints, attackers collect them and use them directly. "Unguessable" ≠ "authorized".

**2. Indirect references in request bodies:**

```json
// ❌ Never trust user-supplied owner IDs
POST /api/messages
{
  "content": "Hello!",
  "recipientId": 42,
  "senderId": 9999   // 👈 Attacker sets this to someone else's ID
}
```

Always derive `senderId` from `req.user.id` on the server. Never accept it from the client.

**3. Batch/bulk endpoints:**

```javascript
// ❌ "Delete these invoices" — but whose invoices?
DELETE /api/invoices
{ "ids": [1, 2, 3, 50000, 99999] }

// ✅ Scope the batch operation to the requesting user
await Invoice.deleteMany({
  _id: { $in: req.body.ids },
  userId: req.user.id,  // Only deletes invoices they own
});
```

**4. File downloads:**

```
GET /api/files/download?name=report_2026_userXYZ.pdf
```

Changing the filename parameter to another user's report is IDOR. Always verify file ownership before streaming.

## Testing Your Own API for IDOR 🕵️

Before a bug bounty hunter does it, test yourself:

1. **Create two test accounts** (user A and user B)
2. **With user A**, create a resource (order, message, file, invoice)
3. **Note the ID** in the response or URL
4. **Switch to user B's token**
5. **Request user A's resource** using that ID
6. **If you get it** — you have an IDOR. Fix it. 🔧

Automate this in your test suite:

```javascript
describe('Invoice ownership', () => {
  it('should not allow user B to read user A invoice', async () => {
    const invoiceA = await createInvoiceForUserA();

    const response = await request(app)
      .get(`/api/invoices/${invoiceA.id}`)
      .set('Authorization', `Bearer ${userBToken}`);  // 👈 Wrong user!

    expect(response.status).toBe(404);  // Not 200!
  });
});
```

This test should be in every CRUD API's test suite. If it's not there, it's probably not being checked. 😬

## Real-World Hall of Shame 🏆

IDOR has hit some big names:

- **Facebook (2012):** IDOR let anyone delete any photo. Reported via bug bounty.
- **Uber (2016):** IDOR in driver API exposed trip history for all drivers.
- **Instagram (2019):** IDOR in Stories API exposed private story viewers.
- **Peloton (2021):** Unauthenticated IDOR exposed workout data for all 4 million users — even private accounts.

These aren't obscure startups. These are engineering teams with hundreds of developers. IDOR is *that* easy to miss and *that* common.

## The Security Checklist 🛡️

For every API endpoint that fetches or modifies data:

- [ ] Is the user authenticated? (AuthN)
- [ ] Does the user *own* or have *explicit permission* for this resource? (AuthZ)
- [ ] Am I scoping DB queries to the current user, not trusting client-supplied IDs?
- [ ] Are bulk operations also scoped per-user?
- [ ] Do I return 404 (not 403) for unauthorized resources to avoid leaking existence?
- [ ] Have I written a cross-user ownership test for this endpoint?

Authentication and Authorization are different things. Most developers implement AuthN (login) correctly. IDOR is an AuthZ (permissions) failure. Keep them both in mind on every single route you write. 🔒

---

**Got an IDOR story of your own?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — war stories welcome!

**Want to see authorization done right?** Browse my projects on [GitHub](https://github.com/kpanuragh).

*P.S. — Right now, go find the sketchiest ID-based endpoint in your API and write a cross-user test for it. I'll bet you a coffee it's vulnerable.* ☕🔐
