---
title: "🕳️ BOLA: The UUID Didn't Save You"
date: "2026-08-19"
excerpt: "Everyone 'fixed' IDOR by swapping sequential IDs for UUIDs and called it a day. BOLA laughed, walked in through the nested route nobody thought to check, and left with someone else's invoices."
tags:
  - security
  - api-security
  - bola
  - idor
  - authorization
  - access-control
featured: true
---

# 🕳️ BOLA: The UUID Didn't Save You

Somewhere in 2019, a well-meaning tech lead read an OWASP writeup about IDOR (Insecure Direct Object Reference), had a small panic attack about `/api/invoices/1042`, and shipped a migration to UUIDs for every primary key in the system. Ticket closed. Security review passed. Everyone went home happy.

Except nothing was fixed. That team didn't patch an authorization bug — they patched an *enumeration* bug, and those are not the same vulnerability wearing a different hat.

## Two Different Problems, One Confused Fix

BOLA — Broken Object Level Authorization, IDOR's official OWASP API Top 10 name since 2019 — means: **the server never checked whether the caller is allowed to touch this specific object.** Enumeration means: an attacker can *guess* the ID of an object they're not supposed to see.

Sequential IDs make enumeration trivial. UUIDs make it annoyingly hard. But BOLA was never about guessing — it's about the endpoint's total lack of an ownership check once it *has* an ID, guessed or not. And attackers rarely need to guess a UUID when your own app hands it to them for free: it's sitting in a webhook payload, a shared PDF, a "look at this" Slack link, a `Referer` header, or literally the network tab of the attacker's own account from a previous action.

```
GET /api/invoices/8f14e45f-ceea-467a-9575-8b2c3a3e1a1a
Authorization: Bearer <valid-token-for-a-different-user>
```

If your handler does this:

```js
app.get('/api/invoices/:id', requireAuth, async (req, res) => {
  const invoice = await db.invoices.findById(req.params.id);
  if (!invoice) return res.status(404).end();
  res.json(invoice);
});
```

...it doesn't matter that `id` is unguessable. `requireAuth` proved the token is valid. It proved *nothing* about whether the token's owner is allowed to see invoice `8f14e45f-...`. That's BOLA, UUID and all.

## Where It Actually Hides: Nested Resources

The single-resource case above is the one everyone remembers to test. The one that survives code review is the nested route, because it *looks* like it's already protected by the parent:

```js
// "It's scoped under the order, so it must be fine... right?"
app.get('/api/orders/:orderId/invoices/:invoiceId', requireAuth, async (req, res) => {
  const invoice = await db.invoices.findById(req.params.invoiceId);
  res.json(invoice);
});
```

The route checks that `orderId` looks plausible-ish and never actually verifies that `invoiceId` belongs to `orderId`, let alone that `orderId` belongs to the caller. Swap in any invoice ID you've seen anywhere — from your own account, from a public share link, from a support ticket screenshot — and the "nested" URL structure gave you a false sense of scoping that the code never enforced. I've seen this exact shape in bulk-export endpoints, comment threads, and file-attachment routes more times than I'd like to admit reviewing.

The fix isn't clever, it's just unskippable:

```js
app.get('/api/orders/:orderId/invoices/:invoiceId', requireAuth, async (req, res) => {
  const invoice = await db.invoices.findOne({
    id: req.params.invoiceId,
    orderId: req.params.orderId,
  });
  if (!invoice) return res.status(404).end();

  const order = await db.orders.findOne({
    id: req.params.orderId,
    ownerId: req.user.id,
  });
  if (!order) return res.status(404).end();

  res.json(invoice);
});
```

Two ownership checks, not one. The invoice must belong to the order *and* the order must belong to the caller. Skip either half and you've just built a very well-organized way to leak other people's data.

## The Query You Should Be Writing Everywhere

The general pattern that kills most BOLA is scoping the *database query itself* to the authenticated user, instead of fetching by ID and hoping to remember an `if` check afterward:

```js
// Bad: fetch first, "check" second (easy to forget, easy to get wrong)
const invoice = await db.invoices.findById(id);
if (invoice.ownerId !== req.user.id) return res.status(403).end();

// Better: the ownership check is baked into what "found" even means
const invoice = await db.invoices.findOne({ id, ownerId: req.user.id });
if (!invoice) return res.status(404).end();
```

The second version can't leak data through a forgotten `if`, because there's no code path where the wrong owner's row is ever pulled into memory in the first place. On a team at Cubet, we eventually made this the required shape for any handler touching a tenant-scoped table — no bare `findById` in a route handler, full stop, enforced by a lint rule that greps for it in CI. It's a blunt tool, but blunt tools are exactly what stops a Friday-afternoon PR from reintroducing the bug that got fixed in March.

## The Test Nobody Writes

Same lesson as every access-control bug: authenticate as User A, note an object ID, then authenticate as User B and request that exact ID. If User B gets anything but a 404 or 403, you've found BOLA — and unlike a SQL injection scanner, no automated tool reliably finds this for you, because it needs two accounts and a business-logic opinion about who's allowed to see what. Write that test once per resource type and run it in CI forever. It's cheap, it's boring, and it's the only thing standing between your `/invoices/:id` route and a very awkward disclosure email.

UUIDs are fine. Keep using them, they genuinely help against casual enumeration. Just don't mistake "hard to guess" for "checked at the door" — the door still needs a bouncer, not just a longer, more confusing address.

---

Found a nested-route BOLA in the wild, or want to argue that `findById` should just be banned outright? Come tell me:

- 🐦 Twitter/X: [@kpanuragh](https://twitter.com/kpanuragh)
- 💼 LinkedIn: [kpanuragh](https://linkedin.com/in/kpanuragh)
- 🐙 GitHub: [kpanuragh](https://github.com/kpanuragh)
