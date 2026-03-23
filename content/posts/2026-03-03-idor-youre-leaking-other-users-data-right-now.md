---
title: "IDOR: You're Probably Leaking Other Users' Data Right Now 🕵️🔓"
date: "2026-03-03"
excerpt: "Insecure Direct Object References — the bug so simple it's embarrassing, yet so common it's in the OWASP Top 10. I once found my own app serving every user's private invoices to anyone who guessed a URL. Let me save you that call with your CEO."
tags: ["\\\"security\\\"", "\\\"api\\\"", "\\\"owasp\\\"", "\\\"backend\\\""]
featured: "true"
---

# IDOR: You're Probably Leaking Other Users' Data Right Now 🕵️🔓

**Story time:** It was a quiet Tuesday afternoon. I was doing a routine audit of a Laravel API I'd built for a client's invoicing platform. Out of curiosity, I changed the URL from `/api/invoices/1042` to `/api/invoices/1041`.

The API returned a different user's invoice. Full name. Company. Amount owed. Tax ID.

I tried `/api/invoices/1`. That was from 2019. Also returned. No errors. No warnings. Just data — wide open, like a convenience store with no door.

**I had shipped an IDOR vulnerability to production.** 😱

The call with the CEO was not fun. Let me save you from having that same conversation.

## What Even Is IDOR? 🤔

**IDOR (Insecure Direct Object Reference)** = When your app lets users access objects (records, files, accounts) just by knowing their ID — without checking if they're *allowed* to.

It sounds deceptively simple. That's why it's been on the OWASP Top 10 for over a decade and *still* shows up in nearly every bug bounty program.

The attack flow looks like this:

```
Normal user request:  GET /api/orders/5001  → Returns MY order ✅
Attacker tweaks ID:   GET /api/orders/5000  → Returns YOUR order 💀
Attacker keeps going: GET /api/orders/4999  → Returns another user's order 💀
```

No hacking required. No SQL injection. No XSS. Just... changing a number in a URL. Kids do this by accident. Hackers do it with a script that loops through thousands of IDs.

## The Code That Launched a Thousand Data Breaches 💣

Here's the pattern I see constantly — the "it just works" controller:

```php
// ❌ THE VULNERABLE VERSION
// routes/api.php
Route::get('/invoices/{id}', [InvoiceController::class, 'show']);

// app/Http/Controllers/InvoiceController.php
public function show(int $id)
{
    // Finds the invoice... for ANYONE who knows the ID
    $invoice = Invoice::findOrFail($id);

    return response()->json($invoice);
}
```

This passes every test you'll ever write:
- Does it return the invoice? ✅
- Does it 404 when the invoice doesn't exist? ✅
- Does it check WHO is asking? ❌ (You never wrote that test!)

The authorization check is missing. One line of missing logic. And now every invoice in your database is public knowledge to anyone with a browser and curiosity.

## The Fix: Always Scope to the Authenticated User 🔐

The solution is embarrassingly simple once you see it:

```php
// ✅ THE SECURE VERSION
public function show(int $id)
{
    // Scope the query to THE CURRENT USER'S records only
    $invoice = Invoice::where('user_id', auth()->id())
                      ->findOrFail($id);

    return response()->json($invoice);
}
```

Now if an attacker tries `/api/invoices/1041`, they get a 404 — because that record doesn't exist *for their user account*. They can't enumerate other users' data because the query is scoped to them.

**In Laravel, you can make this bulletproof with policies:**

```php
// app/Policies/InvoicePolicy.php
public function view(User $user, Invoice $invoice): bool
{
    return $user->id === $invoice->user_id;
}

// app/Http/Controllers/InvoiceController.php
public function show(Invoice $invoice)
{
    // One line — throws 403 if they don't own it
    $this->authorize('view', $invoice);

    return response()->json($invoice);
}
```

Policy-based authorization keeps the authorization logic in one place, tested, and reusable across controllers. When an auditor asks "how do you handle authorization?", you have a clean answer instead of "uh, we check... somewhere... probably."

## IDOR Hides in Unexpected Places 🎭

The invoice example is obvious once you see it. But IDOR shows up in sneaky ways that trip up experienced developers:

**File downloads:**
```
GET /api/export/report_7823.pdf
```
Is that PDF scoped to the current user, or just sitting in S3 with a guessable filename?

**Bulk operations:**
```json
POST /api/orders/batch-cancel
{ "ids": [1001, 1002, 1003] }
```
Does your batch endpoint verify that the current user owns ALL of those IDs — or just some?

**"Hidden" internal IDs in responses:**
```json
{
  "order_id": 5001,
  "user_id": 42,         // ← attacker notes this
  "account_id": 108,     // ← and this
  "subscription_id": 77  // ← and this too
}
```
Every ID you expose is a potential IDOR surface. Now the attacker knows to try `/api/users/42`, `/api/accounts/108`, `/api/subscriptions/77`.

**The nuclear option for paranoid devs:** Use UUIDs instead of sequential integers. `GET /api/invoices/a3f1c8b2-7e4d-4f9a-b612-3c5a9d1e08f7` is significantly harder to enumerate than `/api/invoices/1042`. It's not a substitute for authorization checks — but it removes the "script kiddie guessing numbers" attack entirely.

## Test Your Own App RIGHT NOW 🧪

Here's a quick self-audit you can do in 10 minutes:

1. Log in as **User A**, perform an action (create an order, upload a file, view a profile)
2. Note the ID in the URL or API response
3. Log in as **User B** (use incognito mode)
4. Try to access User A's resource using that ID
5. Did you get the data? **You have an IDOR.** Did you get a 403? **You're good.** 🎉

Automated tools like [Burp Suite](https://portswigger.net) can do this at scale across your entire API — highly recommended before shipping anything to production.

## The Authorization Mindset Shift 🧠

The root cause of IDOR isn't laziness — it's a mental model problem. Developers think in terms of *authentication* ("Is this user logged in?") but forget *authorization* ("Is this user allowed to access THIS specific resource?").

The mantra to internalize:

> **Authentication = who are you?**
> **Authorization = what are YOU allowed to do?**

Every single endpoint that touches user data needs both questions answered. Not just "is there a valid JWT?" but "does this JWT belong to the user who owns this record?"

Add this to your code review checklist. Add it to your PR template. Tattoo it on your wrist if necessary. The bug is trivial to fix, humiliating to ship, and catastrophic when a security researcher finds it in a bug bounty report addressed to your CEO. 🙃

---

**Shipped an IDOR before? (We've all been there.)** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — war stories welcome, judgment-free zone.

**Want to see authorization done right in Laravel?** My [GitHub](https://github.com/kpanuragh) has real-world policy examples that have survived production audits.

*P.S. — Go change those sequential integer IDs to UUIDs. Do it now. I'll be here.* 🔢➡️🔐

*P.P.S. — If your API returns `user_id`, `account_id`, AND `subscription_id` in a single response, an attacker just made a shopping list. Maybe audit those endpoints first.* 😅
