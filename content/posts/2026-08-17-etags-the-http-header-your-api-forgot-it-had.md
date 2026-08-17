---
title: "🏷️ ETags: The HTTP Header Your API Forgot It Had"
date: "2026-08-17"
excerpt: "Your API probably re-sends the same JSON blob a thousand times a day to clients who already have it. ETags fix that — and they quietly solve lost-update race conditions too. Here's how to actually wire them up."
tags: ["api-design", "http", "backend", "performance", "nodejs"]
featured: true
---

Quick test: does your API send a `Cache-Control` header? Probably. Does it send an `ETag`? Be honest.

Most backend engineers know ETags exist the way they know their car has a tire pressure sensor — vaguely, theoretically, until something goes wrong. Which is a shame, because ETags solve two completely different problems at once: wasted bandwidth from clients re-fetching data they already have, and the "oops, I just overwrote your edit" race condition that shows up the moment two people click Save at the same time.

Let's fix that gap.

## The bandwidth problem

Say `GET /api/products/42` returns a 40KB JSON payload. A client fetches it, renders it, and fetches it again 30 seconds later because your frontend polls. Nothing changed. You just paid to serialize, compress, and ship 40KB of nothing.

An ETag is a hash (or version stamp) of the resource. The server sends it once:

```js
app.get('/api/products/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);
  const etag = `"${hashObject(product)}"`; // e.g. sha1 of the JSON

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // Not Modified — body omitted
  }

  res.set('ETag', etag);
  res.json(product);
});
```

The client, if it's a browser or any half-decent HTTP client, remembers the ETag and sends it back as `If-None-Match` on the next request. If nothing changed, the server replies `304 Not Modified` with an empty body — no serialization, no bytes over the wire, just a status code. It's the HTTP equivalent of saying "nope, same as before" instead of mailing someone the same newspaper twice.

At Cubet, we retrofitted this onto a catalog API that a mobile app polled every 15 seconds for stock updates. Most of those polls returned identical data. Adding ETags cut response payload volume on that endpoint by something like 80% during off-peak hours — the client was still asking, but the server stopped bothering to answer with the full body.

## The "who overwrote my edit" problem

This is the part people miss entirely: ETags aren't just a caching header, they're also the standard mechanism for optimistic concurrency control on writes.

Picture two admins editing the same product page. Alice loads it, Bob loads it a minute later, Bob saves a price change, then Alice — still looking at her stale copy — saves her edit and silently wipes out Bob's price change. Classic lost update. No error, no warning, just data quietly gone.

Fix: require the client to send back the ETag it last saw, and reject the write if the resource has moved on:

```js
app.put('/api/products/:id', async (req, res) => {
  const current = await db.products.findById(req.params.id);
  const currentEtag = `"${hashObject(current)}"`;

  const clientEtag = req.headers['if-match'];
  if (clientEtag && clientEtag !== currentEtag) {
    return res.status(412).json({
      error: 'precondition_failed',
      message: 'This product was modified by someone else. Refresh and retry.',
    });
  }

  const updated = await db.products.update(req.params.id, req.body);
  res.set('ETag', `"${hashObject(updated)}"`);
  res.json(updated);
});
```

`412 Precondition Failed` is the correct status here — not `409 Conflict` (that's for the request itself being logically inconsistent with server state, like a duplicate resource), and definitely not `400`. The client's job on a 412 is simple: re-fetch, show the user what changed, let them decide whether to reapply their edit.

This is the same problem database people solve with a `version` column and `WHERE version = ?` on the UPDATE — ETags just move that pattern into the HTTP layer so every client, not just your ORM, gets it for free.

## Weak vs strong — pick on purpose

ETags come in two flavors and mixing them up causes subtle bugs:

- **Strong** (`"abc123"`) — byte-for-byte identical. Safe for range requests, safe for concurrency checks.
- **Weak** (`W/"abc123"`) — semantically equivalent, might differ in whitespace or field ordering. Fine for caching, **not safe** for `If-Match` writes, because "close enough" is exactly what you don't want when deciding whether to accept an overwrite.

If you're hashing a full serialized JSON body for a GET response, weak is usually fine and cheaper to compute (skip fields like `lastAccessedAt` that change without meaning anything). If you're using the ETag as a concurrency token on writes, generate it from something that actually reflects the write-relevant state — often just the row's `updated_at` timestamp or a monotonic `version` integer is more honest than hashing the whole payload.

```js
// cheap, honest, good for concurrency control
const etag = `"${product.version}"`;

// more precise, good for read-side caching
const etag = `"${crypto.createHash('sha1').update(JSON.stringify(product)).digest('hex')}"`;
```

## Where this bites you in practice

- **Load balancers and CDNs stripping headers.** If `ETag` or `If-None-Match` vanish somewhere in your infra, you'll get silent full-body responses forever and wonder why the "optimization" did nothing. Check with `curl -i` against the edge, not just localhost.
- **Non-deterministic serialization.** If your JSON key order isn't stable, two logically-identical objects hash differently and your ETag never matches, defeating the whole point. Sort keys before hashing, or hash a canonical subset of fields.
- **Forgetting 304 has no body.** Some frameworks will happily let you call `res.json(data)` after already sending a 304 status, which either throws or silently sends a body a 304 isn't supposed to have. Return early.

## Try it this week

Pick one read-heavy, rarely-changing endpoint in your API — a catalog, a config blob, a user profile — and add ETag support. Then pick one write endpoint where two people plausibly edit the same thing, and add `If-Match` checking. You'll ship less data and lose fewer edits, and it's maybe 20 lines of code. Not bad for a header most people forget exists.
