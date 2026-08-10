---
title: "🚨 Your API's Errors Are a Choose-Your-Own-Adventure Novel (RFC 7807 Fixes That)"
date: "2026-08-10"
excerpt: "Every service on your team invents its own error shape — {error}, {message}, {err.msg}, a stack trace in prod if you're unlucky. RFC 7807 Problem Details gives you one boring, predictable format, and boring is exactly what error handling should be."
tags: ["api-design", "http", "backend", "standards", "rest"]
featured: true
---

Open three different microservices in your company's codebase and grep for how they return a 400. I'll bet you find at least three different shapes:

```json
{ "error": "Invalid email" }
```

```json
{ "message": "Invalid email", "code": "VALIDATION_ERROR" }
```

```json
{ "success": false, "err": { "msg": "Invalid email", "field": "email" } }
```

Same failure, three incompatible contracts. Every client that talks to more than one of your services now needs a `switch` statement just to figure out *what field means "this went wrong."* That's not an API design decision, that's three teams independently reinventing a wheel that was already standardized nine years ago.

That standard is [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) — "Problem Details for HTTP APIs" — and it's one of those specs that's boring in the best possible way. It doesn't ask you to change your status codes, your routing, or your auth. It just says: when something goes wrong, shape the body like this.

## The shape

```json
{
  "type": "https://api.example.com/errors/insufficient-funds",
  "title": "Insufficient Funds",
  "status": 402,
  "detail": "Account 8842 has a balance of $12.40, which is less than the requested $50.00.",
  "instance": "/accounts/8842/withdrawals/9f2c",
  "balance": 12.40,
  "requested": 50.00
}
```

Five reserved fields, all optional, all with a specific job:

- **`type`** — a URI that identifies the *category* of problem. Doesn't need to resolve to anything real, though it's nice if it points at docs.
- **`title`** — a short, human-readable summary that's the same for every occurrence of this problem type. Not a translated string, not tied to this specific request.
- **`status`** — the same code as the HTTP status line, duplicated in the body so clients that don't inspect headers still get it.
- **`detail`** — the specific, this-particular-request explanation. This is where "Account 8842" goes.
- **`instance`** — a URI identifying this specific occurrence, useful for support tickets and log correlation.

And then — the part people miss — **you can extend it**. `balance` and `requested` above aren't in the spec; they're extension members, and that's explicitly allowed. RFC 7807 isn't trying to describe every error ever; it's giving you a stable envelope so your custom fields land somewhere predictable instead of somewhere improvised.

The content type matters too: `application/problem+json`. Clients that don't know about Problem Details still get a perfectly parseable JSON body; clients that do know can detect it via `Accept`/`Content-Type` negotiation and handle it uniformly instead of sniffing your bespoke shape.

## Wiring it into Express

The nice part is this fits as a single error-handling middleware, not a rewrite:

```js
function problemDetails(err, req, res, next) {
  const status = err.status || 500;
  const problem = {
    type: err.type || 'about:blank',
    title: err.title || 'Internal Server Error',
    status,
    detail: err.detail || err.message,
    instance: req.originalUrl,
    ...(err.extensions || {}),
  };

  res.status(status)
     .type('application/problem+json')
     .json(problem);
}

// usage in a route
app.post('/withdrawals', (req, res, next) => {
  if (account.balance < req.body.amount) {
    const err = new Error('Not enough funds');
    err.status = 402;
    err.type = 'https://api.example.com/errors/insufficient-funds';
    err.title = 'Insufficient Funds';
    err.detail = `Account ${account.id} has a balance of $${account.balance}, which is less than the requested $${req.body.amount}.`;
    err.extensions = { balance: account.balance, requested: req.body.amount };
    return next(err);
  }
  // ...
});

app.use(problemDetails);
```

One middleware, every error in the service now speaks the same dialect. New engineers don't have to learn "how do we do errors here" — they throw an error with a `status` and the middleware does the rest.

## Where it actually pays off

At Cubet, we had a fleet of internal services that predated any error-format convention — the usual story, each one grew its own shape under deadline pressure. The pain wasn't visible until we built a unified API gateway that needed to translate backend errors into consistent client-facing responses. Suddenly the gateway needed bespoke parsing logic *per upstream service* just to extract "what actually went wrong" — which defeats the entire point of a gateway. Migrating internal services to Problem Details didn't fix anything user-facing overnight, but it deleted an entire category of "why does this error look different from that error" bugs in the translation layer, and it meant new services got the contract for free instead of inventing their own.

It's also a genuinely good fit for OpenAPI: you can define one reusable `Problem` schema and reference it from every error response across every endpoint, instead of writing out five slightly-different error schemas per operation.

## The pitch, condensed

Nobody gets excited about error formats — which is exactly why standardizing them is worth doing. Your success responses probably already vary by endpoint because the *data* varies. Your error responses have no excuse to vary, because "something went wrong" is the same shape everywhere. RFC 7807 doesn't require a framework, a library, or permission from three teams — it's a five-field JSON object and the discipline to use it consistently.

If your API currently returns `{"error": "..."}` from one endpoint and a raw stack trace from another, that's an afternoon of cleanup, not a quarter-long migration. Go be boring on purpose.
