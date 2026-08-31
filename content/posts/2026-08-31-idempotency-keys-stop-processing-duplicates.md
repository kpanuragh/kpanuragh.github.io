---
title: "Idempotency Keys: How to Stop Your API From Double-Charging People 💳🔁"
date: "2026-08-31"
excerpt: "Your client retried a POST because the network hiccuped. Now there are two charges, two emails, and one furious customer. Idempotency keys are the boring fix that makes retries safe instead of terrifying."
tags: ["api-design", "backend", "distributed-systems", "reliability", "http"]
featured: true
---

Here's a scenario that should make any backend engineer's stomach drop: a mobile app calls `POST /payments`, the request succeeds on the server, but the response times out somewhere over a flaky cell network before it reaches the client. The client, doing exactly what retry logic is supposed to do, fires the request again. Congratulations, you've just charged someone twice for a coffee subscription, and now you get to explain to support why "but the server said 200 OK the first time" isn't a great customer-facing answer.

This isn't a hypothetical edge case — it's Tuesday. Networks drop packets, load balancers time out, clients retry on principle. The question was never "will duplicate requests happen," it was "what does your API do when they do." If the answer is "processes them twice," you have a bug wearing a trench coat and calling itself a feature.

## The core idea: let the client name the operation

An idempotency key is just a unique identifier — usually a UUID — that the client generates once per *logical* operation and sends along with the request. The server's job is to remember which keys it has already seen and, if a request comes in with a key it recognizes, return the original result instead of doing the work again.

```http
POST /payments HTTP/1.1
Idempotency-Key: 7c9e6a3f-9e1b-4f4a-9a4e-8f1e3d2c5b6a
Content-Type: application/json

{ "amount": 4900, "currency": "usd", "customer": "cus_18f2" }
```

The key insight (pun fully intended) is that the *client* owns the retry boundary, not the server. The server can't tell whether two identical POSTs are "the same logical request retried" or "the user genuinely wants to buy two coffees." Only the client knows that intent, so the client has to hand over a stable identifier that survives across retries of the same attempt.

## What "remembering" actually looks like

The naive version of this is a `UNIQUE` constraint on the idempotency key column and a try/catch around the insert. That gets you partway, but it falls apart the moment two retries race each other before the first one finishes — which, ironically, is exactly when retries are most likely to happen, because the first request is still "hanging."

A more honest implementation tracks the *state* of the key, not just its existence:

```javascript
async function handleIdempotentRequest(key, requestBody, handler) {
  const existing = await db.idempotencyKeys.findOne({ key });

  if (existing) {
    if (existing.status === 'processing') {
      // Someone else (or a retry) is already working on this.
      throw new ConflictError('Request with this key is already in progress');
    }
    if (existing.requestHash !== hash(requestBody)) {
      // Same key, different payload — that's a client bug, not a retry.
      throw new BadRequestError('Idempotency-Key reused with a different request body');
    }
    return existing.response; // Replay the original result. No side effects, guaranteed.
  }

  await db.idempotencyKeys.insertOne({
    key,
    status: 'processing',
    requestHash: hash(requestBody),
    createdAt: new Date(),
  });

  const response = await handler(requestBody);

  await db.idempotencyKeys.updateOne(
    { key },
    { $set: { status: 'completed', response, completedAt: new Date() } }
  );

  return response;
}
```

Three things matter here that a lot of first-pass implementations miss:

1. **Hash the request body too.** A key is only meaningful for a specific payload. If a client reuses a key with different data, that's not a retry, that's a bug you want to surface loudly rather than silently accept.
2. **A `processing` state, not just `completed`.** Without it, two near-simultaneous retries both see "no existing key" and both barrel through to the handler — the exact race the whole mechanism exists to prevent.
3. **Store the response, not just a boolean.** The whole point is that the *second* request gets the *same answer* the first one got — same payment ID, same status code — not a generic "already done, trust me."

At Cubet, we added this pattern to an internal billing service after a batch job's retry logic managed to create three duplicate invoices for the same customer in a single afternoon. The fix wasn't clever — it was exactly the table above, backed by a Postgres unique index on `key` to catch the race at the database layer as a last line of defense, since application-level checks can still lose a race under enough concurrency.

## The details that separate "works in the demo" from "works at 3am"

**Scope keys per resource type or endpoint.** A UUID is unique, but if you store idempotency keys in one global table without namespacing, a key accidentally reused across `/payments` and `/refunds` (unlikely, but not impossible with buggy client code) causes very confusing cross-contamination. Prefix or scope by endpoint.

**Expire keys — don't keep them forever.** Stripe expires idempotency keys after 24 hours. You don't need permanent storage for something whose entire purpose is smoothing over retries that happen within seconds or minutes of the original request. A TTL index or a nightly cleanup job keeps the table from becoming a second, uncapped copy of your requests table.

**Idempotency keys are not the same as PUT-style idempotency.** `PUT /users/42` is idempotent because sending it five times produces the same end state. An idempotency key is about making a *non-idempotent* operation (like "charge a card," which has side effects each time) safe to retry, by turning "do this again" into "tell me what happened last time." Don't confuse the HTTP method's natural idempotency with this pattern — you need this most on `POST`.

**Return the same status code on replay.** If the original request returned `201 Created`, the replay should too — not `200 OK` with a note buried in the body. Clients that branch on status codes (most of them) will misbehave otherwise.

## Where this actually pays off

You don't need this on every endpoint — `GET /users/42` doesn't care how many times you ask. It matters wherever a retried request could create a side effect the client didn't intend to duplicate: payments, order creation, sending notifications, provisioning infrastructure, anything with a real-world or billing consequence attached to "this happened."

If your API has a `POST` endpoint that moves money, sends an email, or spins up a resource, and it doesn't accept an idempotency key yet, that's worth an hour of your afternoon. The alternative is debugging a "duplicate charge" ticket at a time of your choosing (never a good time), instead of designing around it now while you're calm and caffeinated.
