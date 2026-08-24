---
title: "🧬 API Versioning That Doesn't Break Clients"
date: "2026-08-24"
excerpt: "Every API eventually needs to change shape. The trick isn't picking /v1 vs /v2 — it's designing so most changes don't need a version bump at all, and the ones that do don't detonate on someone else's Tuesday."
tags:
  - api-design
  - backend
  - rest
  - versioning
  - nodejs
  - express
featured: true
---

# 🧬 API Versioning That Doesn't Break Clients

Somewhere out there is a mobile app, frozen at version 4.2, that a user installed three years ago and never updated. It still calls your API every morning to sync. It has no idea you renamed `full_name` to `name` last spring. It will keep calling that endpoint until either the user deletes the app or your server throws a 500 into the void, and one of those outcomes is your fault.

That's the entire problem with API versioning in one paragraph: you're not just shipping code, you're shipping a contract, and someone out there is holding a copy of the contract you wrote two years ago and has no intention of re-signing it.

## The bump you didn't need

The first lesson is the cheapest one: most "breaking changes" aren't. Teams reach for `/v2` way too early because they conflate *changing* a response with *breaking* a response.

```json
// v1 response
{ "id": 42, "full_name": "Anuragh KP" }

// "v2" — but does it need to be?
{ "id": 42, "full_name": "Anuragh KP", "avatar_url": "https://..." }
```

Adding a field is not a breaking change for any client written with basic hygiene (ignore unknown fields, don't assert exact object shape). If you're bumping a major version every time someone adds a column, you've built a versioning scheme that punishes you for shipping. Save the version bump for things that are actually destructive: removing a field, renaming a field, changing a field's type, or changing status codes/semantics for an existing call.

## Where the version lives

There are really three camps, and the industry argument about which is "RESTful" mostly misses that they solve different problems.

**URL versioning** (`/v1/users`, `/v2/users`) is the crude, effective option. It's cacheable, it's visible in logs, and any junior engineer can read a stack trace and know instantly which contract broke. The cost is that it tempts you to duplicate entire route trees for one changed field.

**Header versioning** (`Accept: application/vnd.myapi.v2+json`, or a custom `X-API-Version` header) keeps URLs stable and treats versioning as content negotiation, which is arguably the "correct" REST answer. The cost is that it's invisible in browser address bars, awkward to test with a quick curl, and nearly impossible to debug when a client swears they're "definitely sending v2" and your access logs show nothing because nobody logs headers by default.

**No versioning, expand-only** is the option nobody talks about enough. You never bump anything. You only ever *add*. Fields get added, never renamed. Old fields get deprecated but keep working, sometimes for years, computed from the new source of truth under the hood.

```js
// Express handler serving both the old and new shape forever
app.get('/users/:id', async (req, res) => {
  const user = await getUser(req.params.id);
  res.json({
    id: user.id,
    // deprecated, kept for pre-2025 clients — remove after Q3 2027 per DEPR-118
    full_name: user.name,
    name: user.name,
    email: user.email,
  });
});
```

It's not elegant. It's also the strategy that keeps working when you don't control the release cadence of your clients — which, if you have a public API or a mobile app with app-store approval lag, is basically always.

At Cubet, most of our internal service-to-service APIs use expand-only by default and only reach for a real `/v2` when a field's *meaning* changes, not just its shape — because two teams disagreeing on what a shared field means is a much worse bug than an extra unused key in a JSON blob.

## The part everyone skips: telling people to leave

Versioning schemes fail not at launch but at retirement. You ship `/v2`, `/v1` quietly keeps running because turning it off feels risky, and eighteen months later you're maintaining three parallel implementations because nobody wanted to be the one to flip the switch.

This is what `Deprecation` and `Sunset` headers (RFC 8594) are for — they let you tell clients a version is dying before you actually kill it, in a machine-readable way instead of a changelog nobody reads.

```js
app.use('/v1', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Wed, 01 Apr 2027 00:00:00 GMT');
  res.set('Link', '</v2/users>; rel="successor-version"');
  next();
});
```

Well-behaved clients (and well-behaved monitoring) can alert on `Deprecation: true` long before the sunset date arrives. Poorly-behaved clients ignore it completely, which is exactly why you still need real usage metrics on the old routes — count requests per version, per API key if you have them, and don't sunset anything you can still see live traffic on. "We announced it in the docs" is not a migration plan; a dashboard showing the old version's traffic trending to zero is.

## The actual checklist

1. Default to additive changes. Most "I need v2" moments are actually "I need a new field."
2. Pick one versioning mechanism (URL is fine, header is fine) and never mix strategies across teams — the inconsistency is worse than either choice.
3. Version on *meaning* changes, not shape changes.
4. Ship `Deprecation`/`Sunset` headers the day you release the replacement, not the day before you delete the old route.
5. Measure real traffic on old versions before you touch the "delete" key. Silence in the changelog is not silence in production.

None of this is exotic engineering. It's mostly discipline about what actually counts as a promise you made to someone else's code. Go check whether your `/v1` still has traffic — you might be surprised who's still knocking.
