---
title: "IDOR: The \"Just Change the Number\" Hack That's Ruining Apps 🔢💀"
date: "2026-02-20"
excerpt: "Changing ?invoice_id=1001 to ?invoice_id=1002 and suddenly seeing someone else's bank details? That's IDOR — the embarrassingly simple vulnerability that's OWASP's #1 security risk and still breaks production apps every single day."
tags: ["security", "owasp", "api-security", "broken-access-control"]
featured: true
---

# IDOR: The "Just Change the Number" Hack That's Ruining Apps 🔢💀

Let me paint you a picture.

You've just logged into your bank's web portal to download invoice #1001. You notice the URL:

```
https://bankapp.com/api/invoices/1001
```

Just out of curiosity — *completely innocently* — you change `1001` to `1002`. And there it is: someone else's full banking statement, complete with their name, address, and account number. 😱

Congratulations, you just found an **IDOR vulnerability**. You didn't need a fancy exploit, a Python script, or even a VPN. You just... changed a number.

This is **Insecure Direct Object Reference** — and it's the #1 vulnerability category in the [OWASP Top 10](https://owasp.org/Top10/) under **Broken Access Control**. It's also shockingly common. Facebook paid out $500,000 for one. Uber got hit. Instagram exposed private photos this way. And I guarantee apps you've built in the past 12 months have at least one instance of it lurking in the codebase. 🫥

Let's fix that.

## What Exactly IS IDOR? 🤔

IDOR happens when your app exposes a direct reference to an internal object — a database row, file, or resource — and trusts the client to only ask for things they're allowed to see.

The critical mistake: **the server checks if you're logged in, but forgets to check if you own what you're asking for.**

```
Authentication ✅  "Is this user logged in?"
Authorization  ❌  "Does this user OWN this resource?"
```

It sounds obvious. It's horrifyingly easy to forget when you're shipping fast.

## The Classic Vulnerable Pattern 💣

Here's a typical REST API endpoint that's vulnerable:

```php
// Laravel - The vulnerable version
Route::get('/invoices/{id}', function ($id) {
    // ✅ Authenticated via middleware? Great!
    // ❌ But we never check if auth()->user() OWNS this invoice!
    $invoice = Invoice::findOrFail($id);
    return response()->json($invoice);
});
```

And the equally broken Node.js version:

```javascript
// Express - Also vulnerable
app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
    // Auth middleware ran... but we never verify ownership!
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Not found' });

    // 😱 Returns ANY order if the user is authenticated!
    res.json(order);
});
```

An attacker just loops through IDs with a script:

```python
import requests

# "Let me just... enumerate all your users' orders"
for order_id in range(1000, 9999):
    r = requests.get(
        f"https://target.com/api/orders/{order_id}",
        headers={"Authorization": "Bearer <my_valid_token>"}
    )
    if r.status_code == 200:
        print(f"[+] Found order {order_id}: {r.json()}")
```

In under a minute, they've exfiltrated your entire database. Ouch. 💸

## IDOR Comes in Many Flavours 🍦

**Numeric ID in URL** — the classic:
```
GET /api/users/4521/profile
GET /api/documents/88
```

**Predictable filename** — just as bad:
```
GET /uploads/user_invoices/invoice_4521.pdf
```

**Hidden form field** — users *can* see it:
```html
<input type="hidden" name="account_id" value="4521">
```

**API parameter** — easy to miss:
```
POST /api/transfer
{ "from_account": "4521", "to": "attacker", "amount": 9999 }
```

**Object reference in JWT payload** — sneaky:
```json
{ "user_id": 4521, "role": "user" }
// Attacker modifies to: { "user_id": 1, "role": "admin" }
```

If you control the reference and the server trusts it without checking ownership — it's IDOR.

## The Fix: Always Scope Queries to the Current User 🔒

The golden rule: **never look up a resource by ID alone — always filter by the authenticated user.**

```php
// Laravel - The SAFE version

// ❌ DANGEROUS: Fetches ANY invoice
$invoice = Invoice::findOrFail($id);

// ✅ SAFE: Scopes to current user — attacker gets 404, not data
$invoice = Invoice::where('id', $id)
    ->where('user_id', auth()->id())
    ->firstOrFail();
```

Same fix in Node.js / Mongoose:

```javascript
// ✅ SAFE Express + Mongoose pattern
app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
    const order = await Order.findOne({
        _id: req.params.orderId,
        userId: req.user.id  // 👈 This one line prevents the attack
    });

    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json(order);
});
```

That extra `.where('user_id', auth()->id())` clause is the entire defense. One line. The attacker gets a 404 whether the resource doesn't exist OR doesn't belong to them — and they can't tell the difference.

**Pro tip:** Return `404 Not Found` rather than `403 Forbidden` when authorization fails on a resource. Why? Telling an attacker "this exists but you can't have it" is still giving them information. 🕵️

## Real-World Impact (This Hurts to Read) 😬

- **Facebook (2015):** IDOR let anyone delete any video. $500K bug bounty.
- **Instagram (2019):** Exposed private archived stories via predictable media IDs.
- **Uber (2016):** Drivers' GPS locations accessible by manipulating `driver_id` in API calls.
- **US Department of Defense (2017):** Pentagon bug bounty found IDOR in a `.mil` system exposing PII.

None of these required a zero-day exploit. Each one was a developer who forgot to check ownership.

## The Structural Fix: Policies & Middleware 🏛️

One-off ownership checks are fine, but the REAL solution is making authorization impossible to forget.

**Laravel Policies** (the right way to do it):

```php
// app/Policies/InvoicePolicy.php
class InvoicePolicy
{
    public function view(User $user, Invoice $invoice): bool
    {
        return $user->id === $invoice->user_id;
    }
}

// In your controller — clean, enforced, unforgettable
public function show(Invoice $invoice)
{
    $this->authorize('view', $invoice);  // Throws 403 if not authorized
    return new InvoiceResource($invoice);
}
```

**Express middleware** for API routes:

```javascript
// middleware/owned-resource.js
const assertOwnership = (model, foreignKey = 'userId') => async (req, res, next) => {
    const resource = await model.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Not found' });

    if (String(resource[foreignKey]) !== String(req.user.id)) {
        return res.status(404).json({ error: 'Not found' });  // Not 403!
    }

    req.resource = resource;
    next();
};

// Usage - ownership is now enforced at the route level
app.get('/api/orders/:id',
    authenticateToken,
    assertOwnership(Order),
    (req, res) => res.json(req.resource)
);
```

Now authorization is structural — new endpoints get it automatically, and forgetting it requires active effort.

## Quick IDOR Audit Checklist ✅

Before your next deploy, run through this:

```markdown
□ Every endpoint that accepts an ID — does it scope to auth()->user()?
□ File upload/download routes — are filenames unpredictable (UUIDs)?
□ Bulk operations (export, delete) — do they filter by ownership?
□ Hidden form fields — are they re-validated server-side?
□ Admin vs. user resources — is role-based access enforced?
□ Indirect references — e.g. "get order by order_number" still needs ownership check!
□ Returning 404 (not 403) when auth fails on a private resource?
```

**One quick win:** Replace sequential integer IDs with UUIDs in public-facing URLs. `invoice/a3f8-2c1d...` is far harder to enumerate than `invoice/1001`. It's not a *fix* (you still need ownership checks), but it raises the bar considerably.

## The Bottom Line 💡

IDOR is the vulnerability that makes security engineers cry because it's so preventable. You write the authentication logic (the hard part), then skip the authorization logic (three extra words in a query) and hand attackers a skeleton key to your database.

**Authentication** = Who are you?
**Authorization** = What are YOU allowed to touch?

Both. Always. No exceptions.

The next time you write `Model::findOrFail($id)`, your brain should immediately scream: *"WHO is allowed to find this? Am I scoping to the current user?"*

One extra `.where()` clause. That's the difference between a secure app and a $500K bug bounty payout — except you're on the wrong side of that equation.

Go audit your routes. Right now. I'll wait. 👀

---

**Found an IDOR in the wild (ethically)?** I'd love to hear about it — connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your responsible disclosure story!

**Want to see more secure coding patterns?** Check out my [GitHub](https://github.com/kpanuragh) for examples of properly scoped API endpoints.

*Now go add that `.where('user_id', auth()->id())` you forgot.* 🔒

---

**P.S.** If your app uses sequential integer IDs in public URLs and you haven't audited ownership checks: please stop reading and go do that. I'm serious. This is the one vulnerability where the fix is genuinely one line of code. 🙏
