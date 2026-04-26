---
title: "🪝 Webhooks in Express: How to Handle the Internet Yelling at Your Server"
date: 2026-04-26
excerpt: "Webhooks sound simple — just an HTTP POST, right? Wrong. Without signature verification, idempotency, and proper retry handling, you're one duplicate event away from charging a customer twice. Let's fix that."
tags: ["nodejs", "express", "webhooks", "backend", "api"]
featured: true
---

# 🪝 Webhooks in Express: How to Handle the Internet Yelling at Your Server

Webhooks are the internet's version of someone banging on your door and shouting "something happened!" You have to answer fast, figure out if it's actually your neighbor and not a stranger, and make sure you don't accidentally do the same thing twice just because they knocked twice.

Simple in theory. A chaos factory in practice.

Let's talk about how to handle webhooks properly in Express — with signature verification, fast responses, and idempotency — so your server doesn't end up charging customers twice or processing ghost events at 3am.

---

## Why Webhooks Go Wrong (A Horror Story)

Picture this: you're integrating Stripe payments. A customer pays. Stripe sends a `payment_intent.succeeded` event to your webhook endpoint. Your server takes 8 seconds to process it (database writes, emails, the whole pipeline). Stripe, seeing no response within its timeout window, retries. Now you've processed the payment twice. The customer gets two "Welcome!" emails and you've granted them two subscriptions.

This is not hypothetical. This happens. Constantly.

The root causes are almost always the same:
1. **No signature verification** — you accept events from anyone
2. **Slow handlers** — you do work inside the webhook handler itself
3. **No idempotency** — you process the same event twice without noticing

Let's solve all three.

---

## Step 1: Verify the Signature First

Every serious webhook provider (Stripe, GitHub, Twilio) signs their payloads with a secret. If you're not checking that signature, you're accepting HTTP POSTs from literally anyone on the internet claiming to be Stripe.

Here's how Stripe's signature verification works in Express:

```javascript
import express from 'express';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// CRITICAL: Use express.raw() here, NOT express.json()
// Stripe signs the raw body bytes — parsing to JSON first breaks verification
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Signature is valid — now we can trust the payload
  res.status(200).json({ received: true });

  // Enqueue for async processing (more on this below)
  processWebhookAsync(event);
});
```

The `express.raw()` part is the classic gotcha. If you've set up `express.json()` globally and wonder why signature verification keeps failing — that's your culprit. The raw bytes get parsed into an object, the bytes change, the signature no longer matches. Always use raw body middleware for webhook endpoints.

---

## Step 2: Respond Fast, Process Later

Webhook providers have timeouts, usually 5–30 seconds. Your handler should respond with a `200 OK` almost immediately, then do the actual work asynchronously. Think of it like answering the door, saying "got it!", and then actually reading the package label after closing the door.

Here's the pattern using an in-memory queue (swap for BullMQ/Redis in production):

```javascript
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL);
const webhookQueue = new Queue('webhooks', { connection });

// Webhook handler — responds in milliseconds
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Respond immediately — don't make Stripe wait
  res.status(200).json({ received: true });

  // Push to queue with the event ID as the job ID for deduplication
  await webhookQueue.add('stripe-event', event, {
    jobId: event.id, // BullMQ deduplicates by jobId — free idempotency!
  });
});

// Separate worker — does the real work at its own pace
const worker = new Worker('webhooks', async (job) => {
  const event = job.data;

  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}, { connection });
```

The `jobId: event.id` trick is doing a lot of heavy lifting here. BullMQ won't add a job if a job with that ID already exists in the queue. Stripe retrying the same event? Same event ID, same job ID, no duplicate processing. That's your idempotency handled without writing a single extra line of deduplication logic.

---

## Step 3: Handle the Edge Cases That Will Bite You

**Events can arrive out of order.** A `payment_intent.payment_failed` event might arrive *after* a `payment_intent.succeeded` if there was a network delay. Always check the event's `created` timestamp before mutating state, and consider storing the last-processed timestamp per resource in your database.

**Your worker will crash sometimes.** That's why queues exist — BullMQ retries failed jobs with exponential backoff by default. Make sure your handlers are idempotent (safe to run twice), not just your queue insertion.

**Log everything.** Store raw webhook payloads in a `webhook_events` table with the event ID, type, status, and received timestamp. When a customer says "I paid but nothing happened," you want to see exactly what arrived, when, and whether it was processed.

```javascript
// Before processing, log the raw event
await db.query(
  `INSERT INTO webhook_events (event_id, event_type, payload, status)
   VALUES ($1, $2, $3, 'received')
   ON CONFLICT (event_id) DO NOTHING`,
  [event.id, event.type, JSON.stringify(event)]
);
```

That `ON CONFLICT DO NOTHING` is a database-level idempotency guard. Belt *and* suspenders.

---

## The Pattern in 30 Seconds

1. **Verify the signature** before touching the payload — use raw body middleware
2. **Respond 200 immediately** — don't do work inside the handler
3. **Queue the event** with the provider's event ID as the job ID
4. **Process asynchronously** in a worker with retry support
5. **Log raw events** to a database table for auditability

Webhooks aren't complicated, but they're unforgiving when you cut corners. Get the signature check wrong and you're accepting spoofed events. Process synchronously and you'll hit timeouts. Skip idempotency and you'll have very confused (and very angry) customers.

Handle it right, and your webhook endpoint becomes a rock-solid, self-healing pipeline that laughs at retries and network blips.

---

Now go check your existing webhook handlers. I'll wait. 😬

If you found one without signature verification, close that tab, fix it first, then come back. Some bugs are embarrassing; some are "customer data was just tampered with" — and that one's the second kind.

Have a webhook war story? I want to hear it. Drop it in the comments or find me on GitHub — the horror stories are always better when they're someone else's production incident.
