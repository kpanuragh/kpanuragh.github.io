---
title: "IDOR: The Vulnerability That Lets Anyone Read Your Private Files 🔓👀"
date: "2026-03-27"
excerpt: "You built a file download endpoint, added authentication, and shipped it. Congrats — you still got hacked. IDOR (Insecure Direct Object Reference) is the embarrassingly simple bug that's #1 in bug bounty reports and #1 in developer blind spots."
tags: ["security", "backend", "api", "webdev"]
featured: true
---

# IDOR: The Vulnerability That Lets Anyone Read Your Private Files 🔓👀

**Pop quiz:** Your API endpoint looks like this:

```
GET /api/invoices/1042
Authorization: Bearer <valid-token>
```

Is it secure? You require a valid JWT. You check `isLoggedIn()`. You return 200 OK only for authenticated users.

**Answer:** Probably not. Because I just changed `1042` to `1043` and got someone else's invoice. 🎉 (For me. Not for you.)

Welcome to **IDOR — Insecure Direct Object Reference** — the vulnerability that consistently tops bug bounty leaderboards, yet is completely invisible to developers until it's too late.

## What Is IDOR, Exactly? 🤔

IDOR happens when your app uses a user-supplied value (an ID, filename, order number) to look up an object **without verifying the requester actually owns it.**

Authentication says: *"Is this person logged in?"*
Authorization says: *"Does this person own THIS specific thing?"*

IDOR is an **authorization failure**. You checked the first question and forgot the second.

**The classic example:**

```javascript
// Bad: "You're logged in, so here's whatever ID you asked for"
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});
```

The `authenticate` middleware confirms the user has a valid session. But nothing checks whether `order.userId === req.user.id`. Any logged-in user can enumerate every order in your database.

## How Real Is This? 🌍

**Very.** IDOR consistently ranks in OWASP's Top 10 under "Broken Access Control" — which has been the #1 web vulnerability category since 2021.

Bug bounty programs love IDOR reports because they're:
- Easy to find (just change a number)
- High severity (direct data leakage)
- Fast to reproduce (no special tools needed)

Real incidents caused by IDOR-style bugs include leaked medical records, exposed financial statements, and unauthorized access to private messages — all from attackers just incrementing integers in URLs.

If a hacker can guess your user IDs are sequential integers starting at 1, your entire database is a for-loop away from being exfiltrated.

## The Fix: Always Scope Queries to the Authenticated User 🔒

The core rule is dead simple: **never trust a client-supplied ID without confirming ownership.**

```javascript
// Good: Scope every query to the authenticated user
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    userId: req.user.id  // ← This line is the entire fix
  });

  if (!order) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(order);
});
```

Notice we return **404, not 403**. Returning 403 confirms the resource exists and the user just doesn't have access — which is information an attacker can use. 404 gives nothing away.

In Laravel, the same pattern:

```php
// Bad
public function show(Invoice $invoice)
{
    return response()->json($invoice); // Any user can view any invoice!
}

// Good
public function show(Invoice $invoice)
{
    // Gate check — throws 403 if user doesn't own this invoice
    $this->authorize('view', $invoice);
    return response()->json($invoice);
}

// Or with query scoping
public function show(string $id)
{
    $invoice = Invoice::where('id', $id)
        ->where('user_id', auth()->id())  // Ownership check built in
        ->firstOrFail();                  // 404 if not found or not owned

    return response()->json($invoice);
}
```

## Don't Use Sequential IDs in Public URLs 🎲

Even with ownership checks, sequential integer IDs in URLs leak information. An attacker can tell how many orders you've ever processed (order ID 50,000 means ~50k total orders). They can probe for IDs that belong to other users in case your ownership checks have gaps.

The fix: use **UUIDs** or **ULIDs** as your public-facing identifiers.

```sql
-- Bad: Guessable, enumerable
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,  -- 1, 2, 3, 4...
    ...
);

-- Good: Random, unguessable
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Or use ULID for sortability: '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    ...
);
```

UUID v4 gives you ~5.3 × 10²² possible values. An attacker brute-forcing random UUIDs will die of old age before finding a valid one. Pair that with proper ownership checks and you've got defense in depth.

## IDOR Beyond the Database: Files, Tokens, and More 📁

IDOR isn't limited to database IDs. Any direct reference to an object can be vulnerable:

**File downloads:**
```javascript
// Bad: User controls the filename directly
app.get('/download', authenticate, (req, res) => {
  const filePath = path.join('/uploads', req.query.file);
  res.sendFile(filePath);
  // Attack: ?file=../../etc/passwd (path traversal + IDOR combo!)
});

// Good: Look up via database record owned by user
app.get('/download/:fileId', authenticate, async (req, res) => {
  const file = await UserFile.findOne({
    id: req.params.fileId,
    ownerId: req.user.id
  });
  if (!file) return res.status(404).send();
  res.sendFile(path.join('/uploads', file.storedName)); // Internal name, not user-controlled
});
```

**Password reset tokens, email confirmation links, session IDs** — anything with a predictable or user-supplied reference is a potential IDOR surface.

## The Security Checklist ✅

Before every API endpoint ships, run through this:

- [ ] Does the endpoint accept any ID or identifier from the client?
- [ ] Does the query include an ownership condition (e.g., `WHERE user_id = :currentUser`)?
- [ ] Does a 404 (not 403) get returned when access is denied?
- [ ] Are public-facing IDs UUIDs rather than sequential integers?
- [ ] For file access, is the path resolved server-side from a trusted record?
- [ ] Have you tested by logging in as User A and requesting User B's resources?

That last one is the fastest manual test you can run. Open two browser tabs with two different accounts and swap IDs between them. If it works, you've found an IDOR.

## The Mindset Shift That Fixes Everything 🧠

Here's the mental model that prevents IDOR before it happens:

> **Authentication answers "who are you?"
> Authorization answers "what are you allowed to do?"
> IDOR happens when you answer the first and skip the second.**

Every time you write a query that accepts a user-supplied identifier, ask yourself: "If I hand this ID to the database, could it return someone else's data?" If yes, add the ownership condition. Always.

It's not a complex fix. It's one `AND user_id = ?` clause. The reason IDOR is so prevalent isn't that it's technically hard to prevent — it's that developers forget to ask the question.

Ask the question.

---

**Found an IDOR in the wild?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love a good bug story.

**Want to see secure API patterns?** Check out my [GitHub](https://github.com/kpanuragh) for real-world examples.

*P.S. — Go check your file download endpoints right now. I'll wait. Seriously.* 👀

*P.P.S. — If you're using sequential integer IDs in public URLs, migrate to UUIDs. Your future self will thank you.* 🎲
