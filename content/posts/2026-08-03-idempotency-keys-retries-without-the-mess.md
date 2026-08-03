---
title: "🔁 Idempotency Keys: Letting Clients Retry Without Charging Anyone Twice"
date: "2026-08-03"
excerpt: "The network doesn't care about your feelings. It will time out mid-request whether or not the server actually finished the job — and your API needs an answer for \"did that retry create a second order?\" that isn't a shrug."
tags: ["api-design", "backend", "distributed-systems", "node.js"]
featured: true
---

Here's a fun little nightmare: a client sends `POST /payments`, the server charges the card, writes the record, and starts sending the response back — and right at that moment, the connection dies. The client sees a timeout. It has no idea what happened. Did the payment go through? Did it fail? Is it safe to try again?

From the client's point of view, a timeout is not "no." It's "I don't know." And the only sane way to resolve "I don't know" is to retry. So the client retries. And now you might have charged the card twice, because your `POST` handler had absolutely no memory of ever having done this before.

This is not a hypothetical edge case you can shrug off with "just don't lose connections." Mobile clients drop networks constantly. Load balancers close idle connections mid-flight. Retries are not optional client-side paranoia — they're the correct response to ambiguity, and your API needs to make retries *safe* instead of just *possible*.

That's what idempotency keys are for.

## The core idea: let the client name the operation, not the request

The trick is deceptively simple: the client generates a unique key — a UUID is fine — for the *operation* it intends to perform, and sends it with every attempt of that operation, including retries.

```
POST /payments
Idempotency-Key: 8f14e45f-ceea-467e-bd3d-98a5c9c6a3a1

{ "amount": 4999, "currency": "usd", "customerId": "cus_123" }
```

The first time the server sees that key, it does the real work — charges the card, writes the row — and stores the result keyed by that UUID. Every subsequent request with the *same* key gets the *stored result* replayed back, without re-running the charge. Same key, same outcome, no matter how many times the network makes the client ask.

Note what this buys you that a plain "check if this order already exists" dedupe doesn't: it works even before the first attempt finishes. If the client's timeout fires while the charge is mid-flight, the retry doesn't need to guess whether the first one "counted" — it just presents the same key and gets whatever the server eventually decided.

## A minimal implementation

You need a table (or Redis, if you're comfortable with the persistence tradeoffs) mapping key → request fingerprint → stored response, plus a way to detect "still in progress."

```js
async function withIdempotency(key, requestBody, handler) {
  const existing = await db.idempotencyKeys.findOne({ key });

  if (existing) {
    if (existing.status === "in_progress") {
      throw new ConflictError("Request with this key is already being processed");
    }
    if (fingerprint(existing.requestBody) !== fingerprint(requestBody)) {
      throw new ConflictError("Idempotency key reused with a different request body");
    }
    return existing.response; // replay, no side effects
  }

  await db.idempotencyKeys.insert({ key, requestBody, status: "in_progress" });

  try {
    const response = await handler(requestBody);
    await db.idempotencyKeys.update({ key }, { status: "done", response });
    return response;
  } catch (err) {
    await db.idempotencyKeys.update({ key }, { status: "failed", error: String(err) });
    throw err;
  }
}
```

That fingerprint check matters more than it looks. Without it, a client could accidentally (or maliciously) reuse a key across two *different* requests, and you'd happily replay the wrong response for the wrong payload. Reject the mismatch instead of silently trusting the key.

## The concurrent-retry race you'll actually hit

There's a gap between "insert the `in_progress` row" and "the handler finishes," and if the client fires two identical retries close enough together — which happens more than you'd think, especially with aggressive client-side retry libraries — both requests can read "no existing key" before either has written one. Congratulations, you built a race condition into your race-condition fix.

The fix is a unique constraint on the key column and letting the database be the tiebreaker:

```js
try {
  await db.idempotencyKeys.insert({ key, requestBody, status: "in_progress" });
} catch (err) {
  if (isUniqueViolation(err)) {
    // someone else got here first — go read what they're doing
    return withIdempotency(key, requestBody, handler);
  }
  throw err;
}
```

Reach for `INSERT ... ON CONFLICT DO NOTHING` (Postgres) or an equivalent conditional write instead of a check-then-insert — the database's unique index is doing the real work here, your application code is just reacting to whether it won or lost.

At Cubet, we ended up wiring this into a shared middleware for every mutating endpoint on a billing service, rather than hand-rolling it per-route — it's exactly the kind of cross-cutting concern that rots the moment two engineers implement it slightly differently in two different controllers.

## Where idempotency keys don't belong

Don't put this on `GET` — it's already idempotent by definition, that's the whole point of the verb. And don't bother on operations with no real-world side effect worth deduplicating, like a search query; you're just adding storage and latency for nothing. This pattern earns its keep specifically where retrying blindly would duplicate money, inventory, emails, or anything else with a "one is different from two" property.

It's also not a substitute for making your downstream systems idempotent too — if your payment handler calls a third-party gateway, that gateway needs its *own* idempotency key (Stripe, for one, supports this natively), or you've just moved the double-charge problem one hop downstream and called it solved.

## Try it

Pick one mutating endpoint in your API that scares you a little — the one where "ran twice" means money moved or an email went out twice — and add idempotency key support to just that one. You'll be surprised how much retry logic your client code can suddenly stop being clever about, because the server finally tells the truth about what already happened.
