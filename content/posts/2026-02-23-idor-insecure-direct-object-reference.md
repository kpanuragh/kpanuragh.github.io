---
title: "IDOR: The Bug That Lets Anyone Read Your Private Data (And It's Everywhere) 🔓🕵️"
date: "2026-02-23"
excerpt: "Change one number in a URL and suddenly you're reading someone else's medical records. IDOR is embarrassingly simple, devastatingly common, and pays out big on bug bounties. Let's break it down."
tags: ["cybersecurity", "owasp", "api-security", "idor", "bug-bounty"]
featured: true
---

# IDOR: The Bug That Lets Anyone Read Your Private Data (And It's Everywhere) 🔓🕵️

Let me tell you about the laziest hack I've ever seen succeed.

A developer builds an API endpoint: `GET /api/invoices/1042`. The user calls it and gets their invoice. Beautiful. Simple. Clean.

Now an attacker changes `1042` to `1041`. Gets someone else's invoice. Changes it to `1040`. Another invoice. Loops from 1 to 100,000 and downloads every invoice in the system.

No SQLi. No XSS. No fancy exploits. Just... incrementing a number. Welcome to **IDOR** - the vulnerability so simple it's almost insulting. 🤦‍♂️

## What Is IDOR? 🤔

**IDOR = Insecure Direct Object Reference**

It happens when your application uses a user-supplied value (like an ID in a URL or request body) to access a resource, **without checking if the current user is actually allowed to access it**.

The "object" can be:
- A database record ID: `/api/users/42`
- A filename: `/invoices/invoice_march_2024.pdf`
- A transaction reference: `/payments?ref=TXN_89123`
- Literally anything you can guess or enumerate

**The root cause is dead simple:** The server knows WHO you are (authentication ✅) but forgets to check if you're allowed to see THIS specific thing (authorization ❌).

Security people call this a broken access control issue — OWASP has it sitting at **#1 in the Top 10**. Not #5. Not #3. **Number freaking one.** 🏆💀

## The Attack Is Embarrassingly Easy 🎯

Here's a real scenario. User logs in, gets their profile:

```
GET /api/v1/users/9183/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...

HTTP/1.1 200 OK
[{"id": 501, "total": "$49.99", "items": [...]}, ...]
```

Now the attacker just... tries another user's ID:

```
GET /api/v1/users/9182/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...   <-- still THEIR own token!

HTTP/1.1 200 OK     <-- should be 403, isn't
[{"id": 499, "total": "$1,299.99", "items": [...]}, ...]
```

Same valid token. Different user's data. Zero resistance.

This is why IDOR is so dangerous — there's **no malicious payload** to detect. No weird characters. No suspicious patterns. Just a valid authenticated request with a different number. WAFs see nothing. Logs look normal. It flies completely under the radar.

## The Vulnerable Code 😬

Here's what the broken endpoint looks like in Laravel (a pattern I've seen in production more times than I'd like):

```php
// VULNERABLE - Do NOT write this
Route::get('/api/users/{userId}/documents/{docId}', function ($userId, $docId) {
    // Developer thinks: "userId is in the URL, so this is scoped to them"
    // Reality: nothing is actually checked
    $doc = Document::where('user_id', $userId)
                   ->where('id', $docId)
                   ->firstOrFail();

    return response()->json($doc);
})->middleware('auth:sanctum');
```

Spot the problem? The code checks that a document belongs to `$userId`, but **never verifies that `$userId` matches the currently authenticated user**. An attacker just passes someone else's `userId` and `docId` in the URL, and the query happily fetches it.

The developer felt safe because "there's a `user_id` check." But that check is user-controlled input. Oops. 😬

## The Fix: Always Scope to the Auth'd User 🛡️

The golden rule of IDOR prevention: **never trust the client to tell you who they are — you already know from the session/token**.

```php
// SECURE - Do this instead
Route::get('/api/documents/{docId}', function (Request $request, $docId) {
    // Get the currently authenticated user from the token
    // NOT from user-supplied input in the URL
    $user = $request->user();

    // Scope the query to THIS user only
    $doc = Document::where('user_id', $user->id)  // <-- from auth, not URL
                   ->where('id', $docId)
                   ->firstOrFail(); // Returns 404 if it doesn't belong to them

    return response()->json($doc);
})->middleware('auth:sanctum');
```

Key changes:
- `$userId` parameter removed from the URL entirely — why should the client tell us who they are?
- `user_id` check now uses `$request->user()->id` — from the server-side session
- If the doc doesn't belong to this user, they get a 404 (or 403 — your choice)

**Bonus:** The URL is now cleaner too. `/api/documents/501` instead of `/api/users/9183/documents/501`. Everyone wins.

## Beyond Sequential IDs: The UUIDs Debate 🎲

"Just use UUIDs instead of sequential integers!" — a common suggestion that's... partially right.

```php
// UUID makes guessing harder, but NOT impossible to exploit
GET /api/invoices/a3f1c2d8-e4b5-4f9a-8c7d-1234567890ab
```

UUIDs do help — they're practically unguessable by brute force. But they're **not a security control**, they're security through obscurity. Problems:
- UUIDs often leak through logs, emails, API responses
- If an attacker gets one valid UUID from any source, they can use it
- "Obscure" is not the same as "protected"

Use UUIDs for other reasons (distributed systems, no sequential leakage in user counts). But **always enforce authorization checks regardless of ID format**.

## IDOR in the Wild: Bug Bounty Gold 💰

IDOR is consistently one of the **highest-paid bug bounty categories**. Here's why hunters love it:

- A ride-share company paid $10,000+ for an IDOR that exposed passenger trip history
- A healthcare platform paid $15,000 for an IDOR on patient medical records
- Multiple fintech apps have paid $5,000–$25,000 for IDOR on financial data

The bounties are high because the business impact is severe: **data breaches, GDPR violations, regulatory fines, and reputation destruction**.

If you're learning bug bounty hunting, IDOR should be in your first five techniques. Start with: find any endpoint that returns user-specific data, grab someone else's ID (use a second test account you own), try to access their data with your credentials.

## The Authorization Checklist ✅

Every time you build an endpoint that fetches user-specific data, run through this:

- [ ] **Does the current user own this resource?** Verify against `$request->user()->id`, not URL parameters
- [ ] **Does the current user have a role/permission that allows this access?** Check roles for admin/shared resources
- [ ] **Are all endpoints covered?** Not just GET — also PUT, PATCH, DELETE, and POST
- [ ] **Is the authorization check at every layer?** Not just the controller, but service layer too
- [ ] **Does 403 vs 404 matter?** Returning 404 for unauthorized access hides the existence of the resource (prevents enumeration). Intentional choice!
- [ ] **Have you tested with a second account?** Manual testing is the only way to catch this reliably

The most dangerous IDOR bugs are often on the **less obvious endpoints**: batch operations, background jobs triggered via API, export/download endpoints, webhooks. Test everything, not just the obvious CRUD routes.

## The Bottom Line 🎯

IDOR is the vulnerability equivalent of leaving every door in your house unlocked because "you need a key to get into the building." Authentication at the front door doesn't replace authorization on every room inside.

The fix is a mindset shift: **stop trusting the client to scope requests to the right user**. Your auth middleware already knows who's logged in. Use that. Never take the user's word for which data belongs to them.

Two lines of code can close a vulnerability that could expose your entire user database. That's a pretty good trade. 🔐

## Resources Worth Bookmarking 📚

- [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- [PortSwigger IDOR Labs](https://portswigger.net/web-security/access-control/idor) — hands-on practice
- [HackerOne Disclosure Reports](https://hackerone.com/hacktivity) — real IDOR bugs in the wild

---

**Spotted an IDOR in the wild (through responsible disclosure)?** I'd love to hear about it! Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I geek out over access control war stories.

**Exploring security vulnerabilities in your own apps?** Peep the [GitHub](https://github.com/kpanuragh) for security-focused projects and code examples. 🛡️

*Now go audit your API endpoints. You might be surprised what you find.* 🕵️‍♂️
