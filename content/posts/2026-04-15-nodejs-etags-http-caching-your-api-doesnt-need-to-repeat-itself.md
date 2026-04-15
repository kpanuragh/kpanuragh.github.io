---
title: "🏷️ Node.js ETags: The HTTP Caching Trick That Makes Your API Feel Telepathic"
date: 2026-04-15
excerpt: "Your API is re-sending the same data over and over — like a waiter reading the menu out loud every time you visit. ETags and Cache-Control let Node.js say 'you've already got this' and skip the whole trip. Here's how to set it up in Express in about 10 lines."
tags: ["nodejs", "express", "performance", "http", "caching", "backend"]
featured: true
---

Imagine you call your favorite pizza place and ask "what's on the menu?" They read you the whole thing. You call back an hour later. They read it again. Same menu. Word for word. Every. Single. Time.

That's basically what most APIs do. A client requests `/api/products`. The server hits the database, serializes 200 items into JSON, and ships 40KB across the wire — even if absolutely nothing changed since the last request two seconds ago.

ETags and HTTP caching headers are how you make your server say "hey, you already have this — nothing changed." The client gets a `304 Not Modified` response with zero body, and everyone goes home happy.

## What Even Is an ETag?

An **ETag** (Entity Tag) is a fingerprint for your response. It's just a hash — a short string that uniquely represents the *content* of what you're returning. When the response changes, the ETag changes. When nothing changes, the ETag stays the same.

The flow looks like this:

1. Client requests `/api/products`
2. Server responds with `200 OK`, the data, and an `ETag: "abc123"` header
3. Client caches the response and stores the ETag
4. Client requests `/api/products` again, sending `If-None-Match: "abc123"`
5. Server computes the current ETag — it's still `"abc123"` — and responds `304 Not Modified` with **no body**
6. Client uses its cached copy

Round trip still happens, but you skip serializing and sending the payload. For large responses or slow connections, this is a meaningful win.

## Setting Up ETags in Express

Express actually has ETag support baked in for `res.send()`, but it only works for string/buffer responses — not for streaming or manual JSON. For full control, let's do it explicitly:

```js
const express = require('express');
const crypto = require('crypto');

const app = express();

function generateETag(data) {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
}

app.get('/api/products', async (req, res) => {
  const products = await db.getProducts(); // your DB call
  const etag = `"${generateETag(products)}"`;

  // Check if client already has this version
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // No body needed!
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, no-cache'); // must revalidate
  res.json(products);
});
```

The quotes around the ETag value are required by the HTTP spec. Don't skip them — some clients will reject bare ETags.

The `Cache-Control: private, no-cache` combo is your best friend for API responses. It tells the browser: "you can cache this locally, but always check with the server before using it." That's exactly what ETags are for — the check is cheap (just an ETag comparison), and the server only sends fresh data when something actually changed.

## Cache-Control: The Other Half of the Story

ETags handle *conditional* caching. `Cache-Control` handles *unconditional* caching — telling clients how long they can reuse a response without asking at all.

Different situations call for different directives:

```js
// For static-ish data (product catalog, config): cache for 5 minutes, no server round-trip needed
res.setHeader('Cache-Control', 'public, max-age=300');

// For user-specific data (profile, cart): private cache, always revalidate
res.setHeader('Cache-Control', 'private, no-cache');

// For sensitive data (auth tokens, payment info): no caching anywhere, ever
res.setHeader('Cache-Control', 'no-store');

// For CDN-friendly public content: CDN caches for 1 hour, clients for 5 min
res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
```

The difference between `no-cache` and `no-store` trips people up constantly. `no-cache` means "cache it but ask me before using it" (good for ETags). `no-store` means "don't cache this anywhere, ever" (good for bank statements and medical records). They're not synonyms.

## A Middleware to Rule Them All

If you're doing this across multiple routes, extract it into middleware so you're not copy-pasting the ETag logic everywhere:

```js
const crypto = require('crypto');

function etagMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    const etag = `"${crypto
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex')}"`;

    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    return originalJson(data);
  };

  next();
}

// Apply globally or per-router
app.use('/api', etagMiddleware);
```

Now every route that calls `res.json()` automatically gets ETag support. Zero changes to your route handlers.

## When ETags Actually Help (and When They Don't)

ETags shine when:
- **Clients poll frequently** — dashboards, mobile apps refreshing on a timer, React Query with short `staleTime`
- **Responses are large** — product catalogs, user lists, config dumps
- **Data changes infrequently** — reference data, settings, CMS content

ETags don't help much when:
- **Every request is different** — search results with unique queries, real-time data feeds
- **Responses are tiny** — the ETag header overhead isn't worth it for 50-byte responses
- **Data changes on every request** — random/personalized content

One gotcha: if you're running multiple Node.js instances behind a load balancer, make sure your ETag generation is deterministic. `JSON.stringify` object key order can vary between processes (though in practice, Node.js is consistent). If you hit flapping ETags in production, sort your object keys before hashing.

## The Result: Fewer Bytes, Happier Users

Slap ETags on your frequently-polled endpoints and watch your network tab light up with `304 Not Modified` responses. Your database stops taking the same queries over and over. Your bandwidth bill quietly shrinks. And that mobile user on a flaky 4G connection stops watching a spinner every time they pull-to-refresh.

Your API is already doing the work to fetch the data — ETag support is just 10 lines of code to avoid *sending* it when you don't have to.

Try adding `etagMiddleware` to one of your busier read endpoints today. Open DevTools, watch the responses flip from `200` to `304`, and feel unreasonably proud of yourself.

---

**Shipping APIs in Node.js?** Try wiring ETags onto your most-polled endpoints and see what drops in your response sizes. The HTTP caching model is surprisingly underused in API land — and your clients will thank you for it.
