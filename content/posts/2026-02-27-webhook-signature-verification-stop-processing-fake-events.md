---
title: "🪝 Webhook Signature Verification: Stop Processing Fake Events"
date: 2026-02-27
excerpt: "Your webhook endpoint is wide open and anyone can POST fake events to it. Here's how to verify signatures in Node.js/Express so only legitimate providers can trigger your code."
tags: ["nodejs", "express", "backend", "security", "webhooks", "api"]
featured: true
---

# 🪝 Webhook Signature Verification: Stop Processing Fake Events

Imagine you've built a slick payment flow. Stripe sends a webhook when a payment succeeds, your server marks the order as paid, ships the goods, maybe sends a celebratory email. Beautiful.

Now imagine a teenager in their bedroom sending a POST request to your webhook endpoint with `{ "type": "payment.succeeded", "amount": 99999 }` and your server goes "sounds legit!" and ships them a yacht.

That's the webhook nightmare. And it's more common than you'd think.

## What Even Is a Webhook?

A webhook is just an HTTP POST request that a third-party service (Stripe, GitHub, Twilio, Shopify, etc.) sends to *your* server when something interesting happens. It's like a phone call instead of you constantly calling to check "did anything happen yet?"

The problem? Anyone with an internet connection and `curl` can POST to your endpoint. Without verification, you have no way to know if that request actually came from Stripe or from a bored hacker.

## The Solution: HMAC Signatures

Every decent webhook provider solves this with **HMAC (Hash-based Message Authentication Code) signatures**. Here's the handshake:

1. When you register your webhook, the provider gives you a **secret key**
2. When they send a webhook, they hash the request body with that secret using SHA-256
3. They include the hash in a header (like `Stripe-Signature` or `X-Hub-Signature-256`)
4. You do the same hash on your end and compare — if they match, the request is legit

The magic: only someone who knows the secret key can produce the correct signature. An attacker without the key just gets a hash that won't match yours.

## Verifying Stripe Webhooks in Express

Here's where most tutorials get it wrong: **you must use the raw request body**, not the parsed JSON. Once Express parses the body into an object, the signature comparison will fail because JSON serialization isn't always deterministic.

```javascript
import express from 'express';
import crypto from 'crypto';

const app = express();

// CRITICAL: Apply raw body parser ONLY to webhook routes
// Regular routes still get JSON parsing
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json()); // for all other routes

function verifyStripeSignature(payload, sigHeader, secret) {
  const timestamp = sigHeader.split(',')
    .find(part => part.startsWith('t='))
    ?.split('=')[1];

  const signature = sigHeader.split(',')
    .find(part => part.startsWith('v1='))
    ?.split('=')[1];

  if (!timestamp || !signature) {
    throw new Error('Invalid signature header format');
  }

  // Replay attack protection: reject events older than 5 minutes
  const fiveMinutes = 5 * 60;
  if (Math.floor(Date.now() / 1000) - parseInt(timestamp) > fiveMinutes) {
    throw new Error('Webhook timestamp too old — possible replay attack');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');

  if (expectedBuffer.length !== signatureBuffer.length) {
    throw new Error('Signature length mismatch');
  }

  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error('Signature verification failed');
  }

  return true;
}

app.post('/webhook/stripe', (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    verifyStripeSignature(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const event = JSON.parse(req.body);

  switch (event.type) {
    case 'payment_intent.succeeded':
      handlePaymentSuccess(event.data.object);
      break;
    case 'customer.subscription.deleted':
      handleSubscriptionCancelled(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});
```

Two things to notice: `crypto.timingSafeEqual` instead of `===` (prevents [timing attacks](/blog/timing-attacks)), and the timestamp check to block replay attacks where an attacker captures a valid webhook and replays it later.

## A Generic Verifier for Other Providers

GitHub, Shopify, and most other providers use a simpler format — just `sha256=<hash>` in a header. Here's a reusable verifier:

```javascript
function verifyWebhookSignature(payload, signatureHeader, secret) {
  // Handle both "sha256=abc123" and plain "abc123" formats
  const receivedSig = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const receivedBuf = Buffer.from(receivedSig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');

  if (receivedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(receivedBuf, expectedBuf);
}

// GitHub webhooks
app.post('/webhook/github', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-hub-signature-256'];

  if (!verifyWebhookSignature(req.body, sig, process.env.GITHUB_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = JSON.parse(req.body);
  console.log(`GitHub event: ${req.headers['x-github-event']}`);
  // Handle the event...
  res.json({ ok: true });
});
```

This pattern works for GitHub, Shopify, Twilio, Slack — basically any provider that follows the HMAC standard.

## The Middleware Approach (For Real Projects)

Once you're handling webhooks from multiple providers, extract this into middleware:

```javascript
function webhookVerificationMiddleware(headerName, secretEnvVar) {
  return (req, res, next) => {
    const sig = req.headers[headerName];
    const secret = process.env[secretEnvVar];

    if (!sig || !secret) {
      return res.status(400).json({ error: 'Missing signature or secret config' });
    }

    if (!verifyWebhookSignature(req.body, sig, secret)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Attach parsed body for downstream handlers
    req.webhookPayload = JSON.parse(req.body);
    next();
  };
}

// Clean, composable route setup
app.post(
  '/webhook/github',
  express.raw({ type: 'application/json' }),
  webhookVerificationMiddleware('x-hub-signature-256', 'GITHUB_WEBHOOK_SECRET'),
  githubWebhookHandler
);
```

Now each route is clean, verification is consistent, and adding a new webhook provider is a one-liner.

## Common Mistakes That Will Bite You

**Using `JSON.parse` before verification** — Express's default `express.json()` parser will mangle the raw body. Put `express.raw()` *before* `express.json()` in your middleware stack, scoped to webhook routes only.

**Using `===` for comparison** — Regular string comparison leaks timing information that sophisticated attackers can exploit. Always use `crypto.timingSafeEqual`.

**Skipping timestamp validation** — A valid signature from 6 hours ago is still valid cryptographically, but an attacker could replay it. Check that timestamp.

**Storing secrets in code** — Keep `STRIPE_WEBHOOK_SECRET` in environment variables, not hardcoded. Your secret key rotation should be painless.

**Not returning 200 quickly** — Stripe and most providers will retry webhooks if you don't respond within a few seconds. Acknowledge immediately, then process asynchronously via a queue.

## Your Webhooks Are Probably Unverified Right Now

Check your codebase. Search for `req.body` in your webhook handlers and ask yourself: "did I verify the signature before touching this?" If the answer is no, you've got an endpoint that processes anything anyone sends it.

The fix takes 20 lines of code and protects you from fake payments, phantom subscription cancellations, and all sorts of creative abuse. Add it today.

Got webhook verification working (or horror stories about skipping it)? Drop them in the comments below — I especially want to hear from anyone who's had a fake webhook trigger something embarrassing in production.

---

*Enjoyed this? Check out [Cursor Pagination](/blog/cursor-pagination-stop-using-offset-killing-database) and [Express Zod Validation](/blog/express-zod-validation-stop-trusting-req-body) for more backend patterns that prevent production disasters.*
