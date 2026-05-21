---
title: "🔐 Webhook HMAC Verification: Stop Accepting Requests From Strangers"
date: "2026-05-21"
excerpt: "Your webhook endpoint is wide open and you don't even know it. Here's how HMAC signatures work, why timing attacks make naive comparisons dangerous, and how to do verification correctly."
tags:
  - security
  - webhooks
  - hmac
  - cryptography
  - node.js
featured: true
---

Imagine you set up a webhook so Stripe can notify you when a payment lands. You write a handler, test it with a few events, and ship it. Life is good.

Then six months later someone discovers your `/webhook/stripe` endpoint is publicly accessible, accepts any JSON body, and immediately processes it. They craft a fake `payment_intent.succeeded` event, hit your endpoint, and your system ships an order that was never paid for.

You just got gotcha'd by trusting strangers.

This is exactly the problem HMAC signatures solve — and it's embarrassingly easy to get right once you understand what's happening.

## What Even Is HMAC?

HMAC stands for Hash-based Message Authentication Code. The idea is simple: you and the sender share a secret key. Before sending a payload, the sender computes `HMAC-SHA256(secret, payload)` and attaches the result as a header. On your end, you compute the same thing and compare. If they match, the payload genuinely came from someone who knows the secret.

It's like a wax seal on an envelope — tamper with the contents and the seal breaks.

Every major platform that offers webhooks uses this pattern. GitHub uses `X-Hub-Signature-256`. Stripe uses `Stripe-Signature`. Shopify uses `X-Shopify-Hmac-SHA256`. The header name changes; the mechanism doesn't.

## The Naive Approach (And Why It's Still Wrong)

Here's how most developers first implement webhook verification:

```js
const crypto = require('crypto');

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const secret = process.env.WEBHOOK_SECRET;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  // DON'T DO THIS
  if (signature !== expected) {
    return res.status(401).send('Invalid signature');
  }

  // process the event...
  res.sendStatus(200);
});
```

Spotted the problem? `signature !== expected` is a regular string comparison. In JavaScript (and most languages), string comparison short-circuits — it bails out at the first mismatched character.

This enables a **timing attack**. By measuring how long your server takes to reject a forged signature, an attacker can statistically infer the correct signature one character at a time. It sounds like something from a heist movie but it's a real, documented attack class.

The fix is a **constant-time comparison** that always runs for the full length of the string regardless of where it diverges:

```js
const crypto = require('crypto');

function verifyWebhookSignature(payload, signatureHeader, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload) // raw Buffer, not parsed JSON
    .digest('hex');

  const expectedHeader = `sha256=${expected}`;

  // timingSafeEqual requires equal-length Buffers
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expectedHeader);

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-hub-signature-256'] ?? '';
  const secret = process.env.WEBHOOK_SECRET;

  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).send('Signature mismatch');
  }

  const event = JSON.parse(req.body);
  // handle event...
  res.sendStatus(200);
});
```

Two things changed that matter enormously:

1. **`crypto.timingSafeEqual`** instead of `===` — eliminates the timing leak.
2. **`express.raw()`** instead of `express.json()`** — the HMAC is computed over the raw bytes of the payload, not a re-serialized JSON object. If you parse the body first, stringify it back, and then hash it, you may get a different byte sequence than what the sender hashed. Field ordering, whitespace, Unicode normalization — any of these can bite you. Always verify before parsing.

This "raw bytes first" trap catches teams at Cubet every time we onboard a new webhook integration. Someone reads the docs, implements verification, tests it in isolation, and it passes. Then they put `express.json()` before the route and suddenly half the events fail verification in staging. Fifteen minutes of head-scratching later: raw middleware, every time.

## Replay Attacks: The One HMAC Doesn't Cover

HMAC proves the payload wasn't tampered with and came from a trusted sender. It does **not** prevent someone from capturing a valid signed request and replaying it later.

Stripe handles this with a `t=` timestamp field embedded in the `Stripe-Signature` header. Their recommendation is to reject any event where the timestamp is more than five minutes old:

```js
function verifyStripeWebhook(payload, signatureHeader, secret) {
  const parts = signatureHeader.split(',').reduce((acc, part) => {
    const [key, val] = part.split('=');
    acc[key] = val;
    return acc;
  }, {});

  const timestamp = parseInt(parts.t, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestamp) > 300) {
    throw new Error('Webhook timestamp too old — possible replay attack');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  const a = Buffer.from(`sha256=${expected}`);
  const b = Buffer.from(parts.v1 ?? '');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid webhook signature');
  }
}
```

If you control both sides of a webhook (internal service-to-service), add a nonce or incrementing sequence number to the payload and reject duplicates. A Redis `SET NX` with a short TTL per nonce is enough for most workloads.

## Rotating Secrets Without Downtime

Webhook secrets need to rotate occasionally — key exposure, team offboarding, compliance requirements. The naive approach takes downtime: update the secret everywhere simultaneously.

The graceful approach: accept **two** valid secrets during a rotation window.

```js
const secrets = [process.env.WEBHOOK_SECRET_NEW, process.env.WEBHOOK_SECRET_OLD]
  .filter(Boolean);

const valid = secrets.some(secret => {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
});

if (!valid) return res.status(401).send('Unauthorized');
```

Set the new secret in your provider, deploy with both environment variables populated, then once all in-flight events drain you can remove `WEBHOOK_SECRET_OLD`.

## The Checklist

Before you ship a webhook endpoint:

- [ ] Verify the HMAC signature **before** parsing or acting on the payload
- [ ] Use constant-time comparison — `crypto.timingSafeEqual`, not `===`
- [ ] Hash the **raw request body**, not re-serialized JSON
- [ ] Validate the timestamp if the provider includes one (replay protection)
- [ ] Store secrets in environment variables, never in source control
- [ ] Plan for secret rotation from day one

None of this is glamorous. It's the kind of defensive plumbing that nobody notices until it's missing. But an open webhook endpoint that processes anything sent to it is essentially a remote code execution pathway with extra steps.

Verify your payloads. Your future self will thank you.

---

*Found a timing attack in your own code? Tell me about it — I'm on [Twitter/X](https://twitter.com/kpanuragh) and always happy to compare war stories.*
