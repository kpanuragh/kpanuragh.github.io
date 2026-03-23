---
title: "🪝 Node.js Webhooks: Stop Polling, Let Them Call You"
date: "2026-03-06"
excerpt: "Webhooks are the backbone of modern integrations — but most devs get them wrong. Learn how to receive, verify, and process webhooks in Node.js without losing your mind (or your data)."
tags: ["\"nodejs\"", "\"express\"", "\"backend\"", "\"webhooks\"", "\"api\""]
featured: "true"
---

# 🪝 Node.js Webhooks: Stop Polling, Let Them Call You

Polling is the desperate ex of web development. Every few seconds: *"Any new data? How about now? Now? Now?"* It's inefficient, expensive, and frankly embarrassing.

Webhooks are the mature alternative. Instead of you constantly asking, the other service *calls you* when something happens. Stripe fires a webhook when a payment lands. GitHub fires one when someone pushes code. It's event-driven communication — and once you nail the pattern, you'll wonder how you ever lived without it.

Let's build a rock-solid webhook handler in Node.js.

---

## The Basic Setup (Don't Skip This Part)

The most critical — and most overlooked — thing about webhooks: **you must use `express.raw()` for the body, not `express.json()`**, at least for routes that need signature verification.

Here's why: signature verification is computed against the *raw request bytes*. If Express parses the JSON first, it re-serializes it slightly differently, and your HMAC check fails. Every. Single. Time.

```js
import express from 'express';
import crypto from 'crypto';

const app = express();

// Global JSON parser for normal routes
app.use(express.json());

// Webhook route gets the RAW body instead
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);
```

The order matters. Mount `express.raw()` *before* your global `express.json()` would touch it, scoped only to the webhook path.

---

## Verifying the Signature (The Part That Keeps You Safe)

Anyone on the internet can POST to your webhook endpoint. A mischievous actor could replay old events, inject fake payment confirmations, or flood you with garbage. Signature verification is your defense.

Most providers (Stripe, GitHub, Shopify) send an `X-*-Signature` header containing an HMAC of the payload. You recompute it using your webhook secret and compare. If they match, the payload is authentic.

```js
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function verifyStripeSignature(rawBody, signatureHeader) {
  // Stripe's header looks like: t=1614556800,v1=abc123...
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(part => part.split('='))
  );

  const timestamp = parts['t'];
  const receivedSig = parts['v1'];

  // Replay attack protection: reject events older than 5 minutes
  const tolerance = 5 * 60; // seconds
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > tolerance) {
    throw new Error('Webhook timestamp too old — possible replay attack');
  }

  // Recompute the expected signature
  const payload = `${timestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  // Timing-safe comparison (don't use === here!)
  const expected = Buffer.from(expectedSig, 'hex');
  const received = Buffer.from(receivedSig, 'hex');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error('Invalid webhook signature');
  }
}
```

Notice `crypto.timingSafeEqual` instead of `===`. String comparison in JavaScript short-circuits on the first mismatched character, leaking timing information that clever attackers can exploit. `timingSafeEqual` always takes the same time regardless of where the mismatch is. It's a small detail with outsized importance.

---

## Processing Events Without Blocking the Response

Here's a trap a lot of devs fall into: doing heavy work inside the webhook handler before responding.

Webhook providers are impatient. Stripe expects a `200 OK` within **30 seconds**. GitHub within **10 seconds**. If you're slow — maybe you're sending emails, triggering reports, or chaining API calls — you'll time out, the provider will retry, and now you're processing the same event multiple times.

The pattern: **acknowledge fast, process async**.

```js
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  try {
    verifyStripeSignature(req.body, sig);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const event = JSON.parse(req.body);

  // Acknowledge immediately — don't make Stripe wait
  res.status(200).json({ received: true });

  // Process asynchronously AFTER responding
  setImmediate(() => processWebhookEvent(event));
}

async function processWebhookEvent(event) {
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await fulfillOrder(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await downgradeAccount(event.data.object.customer);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Log the error for your monitoring system to catch
    console.error(`Failed to process event ${event.id}:`, err);
    // In production, push to a dead-letter queue for retry
  }
}
```

For production systems, swap `setImmediate` for a proper job queue (BullMQ, SQS, etc.) so events survive server restarts and can be retried with backoff.

---

## Idempotency: Handle Duplicate Deliveries Like a Pro

Webhook providers *will* retry. Network hiccups, your server restarting, a brief 500 — they'll send the same event again. If your `fulfillOrder` charges a customer twice, you're going to have a very bad day.

The fix is idempotency: track which event IDs you've already processed.

```js
const processedEvents = new Set(); // Use Redis in production

async function processWebhookEvent(event) {
  if (processedEvents.has(event.id)) {
    console.log(`Skipping duplicate event: ${event.id}`);
    return;
  }

  // Mark as processed before doing the work
  // (prevents race conditions with concurrent deliveries)
  processedEvents.add(event.id);

  try {
    await handleEvent(event);
  } catch (err) {
    // If processing failed, remove from the set so it can be retried
    processedEvents.delete(event.id);
    throw err;
  }
}
```

In production, replace the `Set` with a Redis `SETNX` or a database unique constraint on `event_id`. The `Set` is fine for understanding the concept; it evaporates on restart.

---

## The Webhook Checklist

Before you ship a webhook endpoint, run through this:

- **Raw body** for signature verification (not parsed JSON)
- **Signature verified** using HMAC with `timingSafeEqual`
- **Timestamp checked** to block replay attacks
- **200 returned immediately**, heavy processing deferred
- **Idempotency** — duplicate events are safely ignored
- **Structured logging** on every event received (you'll thank yourself at 2am)
- **Dead-letter queue** for events that fail processing

Webhooks are deceptively simple on the surface — "just POST to a URL" — but the details matter enormously. Get the verification and idempotency right, and you'll have an integration that's both reliable and secure.

Now stop polling and let the world come to you. 🎯

---

**Building webhook integrations?** Drop your setup in the comments — what providers are you integrating with, and what gotchas did you hit?
