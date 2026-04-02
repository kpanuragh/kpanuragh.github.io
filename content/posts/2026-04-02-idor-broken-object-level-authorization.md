---
title: "IDOR: The Bug That Lets Anyone Read Your Private Data 🕵️"
date: "2026-04-02"
excerpt: "Insecure Direct Object Reference is the embarrassingly simple vulnerability hiding in almost every CRUD app. One wrong assumption and strangers are reading each other's invoices, DMs, and medical records."
tags: ["cybersecurity", "web-security", "owasp", "api-security"]
featured: true
---

# IDOR: The Bug That Lets Anyone Read Your Private Data 🕵️

Imagine you sign up for a new invoicing app. Your first invoice URL looks like this:

```
https://invoiceapp.com/invoices/1042
```

You're feeling curious. You change `1042` to `1041`. And there it is — some stranger's invoice, their company name, their banking details, their total revenue. All because the server forgot to ask one question: *"Should this person be allowed to see this?"*

That's **Insecure Direct Object Reference** (IDOR) — and it's one of the most common, most impactful, and frankly most embarrassing vulnerabilities you can ship. It's been on the OWASP Top 10 for years because developers keep forgetting it exists.

Let's fix that.

## What Is IDOR, Really?

IDOR happens when your app exposes a reference to an internal object — a database row, a file, a user record — and trusts the client to only request things they're allowed to see.

Spoiler: the client will not stay in its lane.

The attack surface is anywhere you have an identifier in a URL, request body, or query param:

- `/api/orders/8821`
- `/download?file=report_user_99.pdf`
- `POST /messages` with body `{ "inbox_id": 54 }`

If the server fetches that object without checking ownership, you've got an IDOR.

## The Vulnerable Code (Don't Ship This) ❌

Here's a classic Node.js/Express example that looks completely reasonable until you think about it for five seconds:

```javascript
// GET /api/invoices/:id
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.query(
    'SELECT * FROM invoices WHERE id = $1',
    [req.params.id]
  );

  if (!invoice) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(invoice);  // 💀 No ownership check!
});
```

This code authenticates the user (good!), fetches the invoice (fine!), and sends it back without ever asking whether `req.user.id` owns that invoice (catastrophic!).

Any logged-in user can enumerate every invoice in your database by looping through IDs. Depending on how old your app is and how predictable your IDs are, that could be *millions* of records.

## The Fix: Always Check Ownership ✅

```javascript
// GET /api/invoices/:id
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.query(
    'SELECT * FROM invoices WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]  // ✅ ownership baked into the query
  );

  if (!invoice) {
    // Return 404 for both "not found" and "not yours"
    // Never confirm an object exists to unauthorized users!
    return res.status(404).json({ error: 'Not found' });
  }

  res.json(invoice);
});
```

Two changes made this safe:

1. **`AND user_id = $2`** — the database won't return rows the current user doesn't own.
2. **Always return 404 (not 403)** when an object isn't accessible. Returning 403 confirms the object exists; 404 reveals nothing.

## The Sneaky Variants 🎭

IDOR doesn't always look like an integer in a URL. Watch out for these:

**Predictable GUIDs** — UUIDs aren't secret; they're just harder to enumerate. If an attacker can guess or find one UUID (from a leaked email, a shared link), they own that route.

**Indirect references in request bodies** — The most common missed case:

```json
POST /api/messages
{
  "recipient_id": 42,
  "thread_id": 99,   // <-- Does this user own thread 99?
  "body": "Hello!"
}
```

**File downloads** — `/download?filename=invoice_2024_user_55.pdf` is just IDOR with extra steps.

**Batch operations** — `DELETE /api/items` with `{ "ids": [1, 2, 3, 4, 5] }` needs to verify ownership of *every* ID, not just the first one.

## A Real-World Pattern: The Admin Endpoint Leak

Here's how IDOR escalates from "read someone's invoice" to "full account takeover":

```javascript
// ❌ Admin route that lacks authorization check
app.put('/api/users/:id/email', authenticate, async (req, res) => {
  // Developer assumed only admins would call this endpoint
  // They forgot to actually enforce it
  await db.query(
    'UPDATE users SET email = $1 WHERE id = $2',
    [req.body.email, req.params.id]
  );
  res.json({ success: true });
});
```

An attacker changes another user's email to one they control, hits "forgot password," and owns the account. This exact pattern has been found in bug bounty programs on major platforms — paying out $5,000+ per report.

The fix is the same: check that `req.params.id === req.user.id` (or that `req.user.role === 'admin'`). Never assume an endpoint is protected by obscurity.

## Your IDOR Defense Checklist 🛡️

Before every endpoint goes to production, ask yourself:

- [ ] Does this endpoint return or modify an object owned by someone?
- [ ] Is ownership verified in the **query** (not just in application logic after the fetch)?
- [ ] Do unauthorized access attempts return `404`, not `403`?
- [ ] Are IDs in request **bodies** validated, not just URL params?
- [ ] Are batch operations checking ownership on every item?
- [ ] Did I test this by logging in as User A and requesting User B's resources?

That last point is golden: **test it yourself**. Create two test accounts. Log in as one. Try to access the other's data. If you can, your users can too.

## Quick Win: Centralize Authorization Logic

Instead of sprinkling ownership checks everywhere, build a reusable helper:

```javascript
async function assertOwnership(model, id, userId) {
  const record = await db.query(
    `SELECT id FROM ${model} WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (!record) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  return true;
}

// Usage in any route
app.delete('/api/invoices/:id', authenticate, async (req, res) => {
  await assertOwnership('invoices', req.params.id, req.user.id);
  await db.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});
```

One function. Consistent behavior. No "I forgot to add the check on this one route" incidents.

## The Bottom Line

IDOR is brutally simple — both to introduce and to fix. The vulnerability comes from one mental shortcut: *"Authenticated users wouldn't request things that aren't theirs."*

They will. Bots will. Bug bounty hunters definitely will.

The fix is equally simple: **always tie your database queries to the authenticated user's identity**. Not in a middleware. Not in application code after the fetch. Right in the `WHERE` clause, where the database enforces it for you.

It's one of those bugs where five extra characters in a SQL query is the difference between a secure app and a data breach headline.

Don't be the headline.

---

**Found an IDOR in a bug bounty program?** Come talk shop on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm active in **YAS** and **InitCrew** communities where we dig into exactly this kind of stuff.

**More security deep-dives:** Check out my posts on [SSRF](/posts/2026-01-31-ssrf-when-your-server-attacks-itself), [SQL Injection](/posts/2026-01-25-sql-injection-hack-yourself-before-they-do), and [XSS](/posts/2026-01-27-xss-the-javascript-injection-nightmare).

*Stay paranoid. Check your ownership clauses.* 🔐
