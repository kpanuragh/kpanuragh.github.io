---
title: "🗄️ HTTP Caching Headers: Stop Guessing, Start Controlling"
date: "2026-06-18"
excerpt: "Cache-Control, ETag, Vary, stale-while-revalidate — most backends just wing it and wonder why users still see stale data (or why nothing caches at all). Here's the mental model that finally makes it click."
tags:
  - backend
  - performance
  - caching
  - http
  - node
featured: true
---

Here's a scene that plays out in every engineering team at least once: a critical bug fix ships, CDN invalidation runs, users refresh — and half of them are still staring at the broken version. Slack lights up. The cache is blamed. Someone adds `Cache-Control: no-cache` to everything "just to be safe," and suddenly your origin server is handling 10× the traffic with zero benefit from caching at all.

Both outcomes are the same root cause: **guessing at caching headers instead of understanding them**.

HTTP caching is one of those topics where the primitives are simple but the combinations are subtle. Let me give you the mental model that finally makes it stick.

---

## The Two Axes of Caching

Every HTTP response you send is implicitly answering two questions:

1. **How long can this response be reused without asking me again?** ← freshness
2. **If the cache must revalidate, how do I tell it nothing has changed?** ← validation

Most developers only think about the first one. The second is where you unlock real performance without sacrificing correctness.

---

## `Cache-Control`: The Boss Header

`Cache-Control` is where the real decisions happen. Some directives that actually matter:

| Directive | What it means |
|---|---|
| `max-age=N` | Cache for N seconds (client + intermediaries) |
| `s-maxage=N` | Like `max-age` but only for shared caches (CDNs) |
| `private` | Only the browser can cache — CDN must not |
| `public` | Anyone can cache, including CDNs |
| `no-cache` | **Cache it**, but revalidate before every use |
| `no-store` | **Don't cache at all** — nuclear option |
| `stale-while-revalidate=N` | Serve stale for N seconds while fetching fresh in background |
| `immutable` | Content will never change at this URL — skip revalidation forever |

The classic blunder: developers see "no-cache" and think it means "don't cache." It doesn't. It means *cache but always validate*. If you want nothing cached, you want `no-store`. This confusion has caused more unnecessary origin hammering than I care to count.

A real-world example from an Express API at Cubet serving a public leaderboard that barely changes:

```js
app.get('/api/leaderboard', async (req, res) => {
  const data = await getLeaderboard();

  res.set({
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'Vary': 'Accept-Encoding',
  });

  res.json(data);
});
```

What this does: CDN serves the cached response for 60 seconds. For the next 5 minutes after expiry, it *still* serves the stale response immediately but kicks off a background revalidation. Users get near-zero latency; the data is at most 6 minutes stale. For a leaderboard, that's completely fine.

---

## ETags: The Conditional Request Handshake

`max-age` tells caches how long to trust a response. But what happens after it expires? Without ETags, the cache has to throw the response away and fetch a fresh copy, even if absolutely nothing changed on the server.

ETags solve this. The server generates a fingerprint of the response content (a hash, a version number, a `Last-Modified` timestamp). When the cache revalidates, it sends that fingerprint back:

```
GET /api/config
If-None-Match: "abc123"
```

If the content is unchanged, the server returns `304 Not Modified` with *no body* — just headers. The cache keeps its copy. You save bandwidth and response time with almost no effort.

Here's a minimal ETag implementation in Express:

```js
import { createHash } from 'crypto';

app.get('/api/config', async (req, res) => {
  const config = await getConfig();
  const body = JSON.stringify(config);
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  res.set({
    'ETag': etag,
    'Cache-Control': 'public, max-age=120',
  });

  res.json(config);
});
```

Pro tip: Express has built-in weak ETag support via `app.set('etag', 'strong')`, but it computes it on the full response body after serialization — which means it runs after you've done the work. Rolling your own on the source data lets you short-circuit before any serialization.

---

## `Vary`: The Header Nobody Reads Until It Bites Them

`Vary` tells a cache that the response varies based on some request header. The most common is `Vary: Accept-Encoding` — the compressed and uncompressed versions of a response are different and should be cached separately.

Where this gets people in trouble: `Vary: Cookie` or `Vary: Authorization`. If you accidentally set either of these on a public CDN-cached response, the CDN treats every unique cookie value as a different cache key. You've now shredded your cache hit rate to near zero.

Rule of thumb: `Vary` on `Accept-Encoding` is almost always fine. `Vary` on user-specific headers means the response is private — switch to `Cache-Control: private`.

---

## `immutable`: The Underused Secret Weapon

If you deploy assets with content-hashed filenames (e.g., `main.a3f9c2.js`), the URL itself changes whenever the content changes. This means the old URL will *never* serve different content — it's safe to cache forever.

```
Cache-Control: public, max-age=31536000, immutable
```

The `immutable` directive tells the browser: don't even bother sending a conditional request when this response expires. The URL is the freshness guarantee. This eliminates an entire round-trip for returning visitors on every page load. CDNs ignore `immutable` (they handle cache invalidation differently), but browsers respect it, and it meaningfully cuts TTFBs for repeated visits.

---

## The Decision Tree

When you're writing a response handler, ask:

1. **Should this ever be cached?** No → `no-store`. (Login endpoints, payment flows, anything with side effects.)
2. **Is it user-specific?** Yes → `private, max-age=N`. CDN won't touch it.
3. **Is it public and mostly stable?** Yes → `public, max-age=N, s-maxage=M`. Pick N for browsers, M for CDN.
4. **Can users tolerate briefly stale data?** Add `stale-while-revalidate=X`. Background refresh, instant responses.
5. **Is the URL content-addressed?** Add `immutable`.
6. **Do you want 304 support?** Add an `ETag` or `Last-Modified` header.

Most API endpoints land somewhere between case 2 and 4. The point is to *decide* rather than omit the header and let the browser or CDN guess — because their defaults are usually "cache this for a while in a way you can't easily invalidate."

---

## Stop Defaulting to No-Store

The instinct to slap `no-store` on everything to avoid cache-related bugs is understandable — it's safe, it's simple, and it solves today's problem. But it's also leaving performance on the table every time a user hits your API.

HTTP caching isn't about finding the one magic header. It's about matching the caching strategy to the freshness requirements of each resource. A rate-limited third-party lookup? Aggressive caching. A user's cart? Private, short TTL. A public product catalog? CDN-cacheable with stale-while-revalidate.

Get the mental model right and the headers follow naturally.

---

*What's the worst caching bug you've ever shipped? I've got a good one involving a `Vary: Cookie` header on a CDN-fronted asset that basically broke our entire static site for logged-in users. Some lessons stick better when they're painful.*
