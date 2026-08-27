---
title: "🧭 Cache-Control: The Header Everyone Copy-Pastes and Nobody Reads"
date: "2026-08-27"
excerpt: "no-cache doesn't mean don't cache. no-store isn't the stronger version of no-cache. And stale-while-revalidate is quietly the best directive nobody uses. Time to actually understand the header you've been Stack-Overflow-copying for years."
tags: ["http", "performance", "caching", "backend", "web-performance"]
featured: true
---

Ask ten backend engineers what `Cache-Control: no-cache` does and at least six will say "it disables caching." It does not. It is, in fact, one of the most confidently misused headers in HTTP, and the confusion isn't your fault — the naming is actively hostile.

Most of us learned Cache-Control the way we learn regex: copy a working example from a previous project, paste it into the new one, never think about it again. That works fine right up until you're debugging why a logged-in user's dashboard got served to a different logged-in user from a shared cache, or why your "aggressive caching" config is somehow making the app feel slower. Let's actually understand the thing.

## no-cache vs no-store: the naming crime of HTTP

This is where 90% of the confusion lives.

- **`no-store`** — means what you think "no-cache" means. Never save this response anywhere, full stop. Use it for anything sensitive: auth tokens, payment forms, personal data you don't want sitting in a shared proxy's disk cache.
- **`no-cache`** — the response *can* be stored, it just can't be *used* without revalidating with the origin first. It's "cache it, but ask me before you serve it again." Functionally it forces a round trip on every request, but that round trip can be cheap — a `304 Not Modified` with no body, if you've paired it with an [ETag](/blog/etags-the-http-header-your-api-forgot-it-had) or `Last-Modified`.

```
Cache-Control: no-store                  # never persist this, anywhere
Cache-Control: no-cache                  # persist it, but revalidate every time
Cache-Control: max-age=3600              # use it for an hour, no questions asked
Cache-Control: no-cache, max-age=3600    # nonsensical combo — pick one strategy
```

If you actually want "don't cache this at all," you want `no-store`. If someone told you to add `no-cache` to stop stale data, what they actually wanted, half the time, was `max-age=0, must-revalidate` — which forces revalidation but still lets the cache *keep* the old copy as a fallback candidate instead of discarding it outright.

## private vs public: who's allowed to hold the copy

This one trips people up because it sounds like an access-control decision when it's really a "which cache layer" decision:

- **`public`** — any cache can store this, including shared ones: a CDN edge node, a corporate proxy, your ISP's transparent cache. Fine for static assets, product catalogs, marketing pages.
- **`private`** — only the end user's own browser cache may store it. Shared infrastructure must not. This is the one you want for anything personalized — a dashboard, an account page, search results scoped to a logged-in user.

The bug this prevents is not hypothetical. Mark a per-user API response `public` (or, more commonly, just forget to mark it `private` and let a CDN's default kick in) and you can end up with User B's browser being served User A's cached response straight from an edge node, because the CDN had no idea the payload was personal. I've seen a misconfigured `public, max-age=300` on a "my orders" endpoint get root-caused only after someone screenshotted somebody else's order history. Nothing was hacked — the cache was just doing exactly what the header told it to do.

```js
// static, shared, safe for anyone to see
res.set('Cache-Control', 'public, max-age=86400, immutable');

// per-user, must never leave the browser's own cache
res.set('Cache-Control', 'private, max-age=60, must-revalidate');
```

## The directive nobody uses: stale-while-revalidate

Most teams treat caching as binary: fresh (serve instantly) or stale (block and refetch). `stale-while-revalidate` breaks that binary in a genuinely clever way — serve the stale copy *immediately*, then quietly refetch in the background and update the cache for next time.

```
Cache-Control: max-age=60, stale-while-revalidate=3600
```

Read that as: this is fresh for 60 seconds. After that, for up to an hour, keep serving the stale copy instantly while asynchronously refetching a fresh one in the background. Only after that hour do you fall back to blocking on origin.

At Cubet we put this on a pricing endpoint that a storefront called on every page load. Prices changed maybe twice a day but the endpoint was on the critical path for first paint. Straight `max-age` meant a fast page for 60 seconds and a slow one for everyone after. Adding `stale-while-revalidate=3600` meant almost nobody ever waited on that request again — they got last-minute-old pricing instantly, and the cache healed itself in the background. The one time it mattered (a flash sale price change) users saw the new price within a second or two of the background refresh, which was a completely acceptable trade for "the endpoint is now invisible to page load time."

## Vary: the header that quietly breaks your cache

`Vary` tells caches which request headers change the response — and it's the thing that silently sabotages caching setups that otherwise look correct.

```
Cache-Control: public, max-age=3600
Vary: Accept-Encoding, Authorization
```

Forget to send `Vary: Authorization` on a personalized response and a shared cache might serve one user's response to another — same bug as the `private`/`public` mistake above, different mechanism. But go too far the other way — `Vary: User-Agent` is a classic offender — and you fragment your cache into thousands of near-identical entries, one per browser string, tanking your hit rate for no real benefit. Only vary on headers that genuinely change the response body.

## Try this on one endpoint

Pick your chattiest, least-personalized GET endpoint and set `stale-while-revalidate` on it — it's the highest ROI-to-effort directive in this whole header. Then pick your most personalized endpoint and confirm it says `private`, not just "doesn't say public." Those two five-minute changes will do more for perceived latency and data-leak risk than most caching infrastructure you could buy.
