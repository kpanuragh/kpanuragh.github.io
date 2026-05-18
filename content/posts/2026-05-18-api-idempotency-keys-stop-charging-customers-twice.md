---
title: "🔑 Idempotency Keys: Stop Charging Your Customers Twice"
date: "2026-05-18"
excerpt: "Network blips, retried requests, and impatient users clicking 'Pay' three times — here's how idempotency keys keep your API from turning a hiccup into a billing nightmare."
tags:
  - backend
  - api-design
  - node
  - databases
  - distributed-systems
featured: true
---

Picture this: a user clicks "Pay Now." The request hits your server, the charge goes through, but the response packet gets swallowed somewhere between your server and their browser. Their app times out, shows an error, and the user — naturally — clicks "Pay Now" again.

You just charged them twice. Congratulations.

This isn't a hypothetical. It's the most predictable bug in distributed systems, and the fix has a name: **idempotency keys**.

---

## What "Idempotent" Actually Means

An operation is idempotent if doing it multiple times produces the same result as doing it once. `GET /users/42` is idempotent — ask a hundred times, you get the same user. `POST /payments` is emphatically *not* — ask a hundred times, you bill a hundred times.

The trick is making your non-idempotent operations behave like idempotent ones, by giving each *intent* a unique identity. That identity is the idempotency key.

The pattern is dead simple:

1. Client generates a unique key before sending the request (a UUID works perfectly).
2. Client sends that key in a header, e.g. `Idempotency-Key: <uuid>`.
3. Server stores the key + result when it first processes the request.
4. On any retry with the same key, the server returns the stored result without reprocessing.

One intent. One outcome. No matter how many retries.

---

## Building It: The Core Logic

Here's a minimal Express implementation backed by Redis. The idea scales to any stack, but Redis's atomic `SET NX` (set if not exists) makes the concurrency story clean.

```js
const express = require('express');
const redis = require('redis');
const { randomUUID } = require('crypto');

const app = express();
const client = redis.createClient();
app.use(express.json());

const IDEMPOTENCY_TTL = 60 * 60 * 24; // 24 hours

async function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next(); // optional: enforce it on payment routes

  const cacheKey = `idempotency:${key}`;

  // Try to "claim" this key atomically
  const claimed = await client.set(cacheKey, 'PENDING', {
    NX: true,          // only set if key doesn't exist
    EX: IDEMPOTENCY_TTL,
  });

  if (!claimed) {
    // Key already exists — return cached response or 409 if still processing
    const stored = await client.get(cacheKey);
    if (stored === 'PENDING') {
      return res.status(409).json({ error: 'Request in progress. Retry shortly.' });
    }
    return res.status(200).json(JSON.parse(stored));
  }

  // Capture the response so we can cache it
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    await client.set(cacheKey, JSON.stringify(body), { EX: IDEMPOTENCY_TTL });
    return originalJson(body);
  };

  next();
}

app.post('/payments', idempotencyMiddleware, async (req, res) => {
  // ... actual charge logic ...
  const charge = await processPayment(req.body);
  res.json({ id: charge.id, status: 'success', amount: charge.amount });
});
```

The `NX` flag is load-bearing. Two simultaneous retries race to set the key — only one wins, the other gets a `409` and backs off. No duplicate charges, no locks, no saga pattern required for this specific problem.

---

## The Key Generation Contract

Here's where I've seen teams trip up at Cubet when we first rolled this out across a payment microservice: **key generation is the client's responsibility, not the server's**.

This feels backwards — don't servers generate IDs? — but it's intentional. The client needs to generate the key *before* the first attempt and reuse it across all retries for that same operation. If the server generated the key, a retry would just generate a new one and defeat the purpose entirely.

A solid client-side flow looks like this:

```js
async function createPaymentWithRetry(payload, maxRetries = 3) {
  // Generated ONCE for this payment intent, before the first try
  const idempotencyKey = randomUUID();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,  // same key every time
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) return await response.json();

      // 409 = still processing, wait and retry
      if (response.status === 409) {
        await sleep(500 * attempt);
        continue;
      }

      // 4xx (not 409) = don't retry, the request itself is bad
      throw new Error(`Payment failed: ${response.status}`);

    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(1000 * attempt); // exponential-ish backoff
    }
  }
}
```

Two rules to communicate to every client team:
- **New key per new intent.** Don't reuse a key from a failed payment to try a different card — that's a new payment intent.
- **Same key per retry.** If the network drops after the server responds, the retry should use the same key to get the cached response back.

---

## What to Store and For How Long

The idempotency cache should hold the full response body, the HTTP status code, and any side-effect identifiers (like the charge ID). If a client retries and gets a cached `200`, they should be unable to distinguish it from a live response.

TTL is a judgment call. Stripe uses 24 hours. That's usually the right window — long enough to survive a flaky mobile client retrying for an hour, short enough that your Redis cluster doesn't balloon. For anything financial, I'd argue against going below 12 hours.

One nuance: **don't** cache `5xx` responses. A server error during payment probably means the charge *didn't* complete. Caching that `500` means a legitimate retry gets blocked. Let server errors fall through so the client can retry against a fresh attempt.

---

## Beyond Payments

Idempotency keys belong anywhere your API mutates state in a way that can't be trivially undone:

- **Email / SMS sends** — users retry form submissions; they don't want three "Welcome!" emails.
- **Order creation** — double-submit on a slow connection shouldn't mean two orders.
- **Inventory deductions** — especially important when downstream systems are involved.
- **Webhook dispatchers** — if your service sends webhooks and your delivery pipeline retries, the downstream endpoint needs to handle duplicate delivery. Passing an idempotency key in the webhook payload lets the receiver deduplicate.

The pattern costs almost nothing — one Redis key per request, 24 hours of storage. The alternative costs you customer trust.

---

## The Lesson Nobody Teaches Early Enough

Networks are unreliable. Clients retry. Servers crash mid-request. These aren't edge cases — they're the normal operating conditions of any system with more than a handful of users.

Idempotency keys are the API design equivalent of wearing a seatbelt: you don't need it most of the time, and when you do need it, you *really* need it.

If your API handles money, inventory, or anything else with real-world consequences, add idempotency key support before you ship. Your future self — and your customers — will thank you.

---

What's the worst "double submit" bug you've had to debug? Drop it in the comments — I collect these stories like trading cards.
