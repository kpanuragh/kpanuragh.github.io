---
title: "🪝 Webhooks: Stop Crossing Your Fingers and Actually Design Them"
date: "2026-06-15"
excerpt: "Webhooks look simple until your retry storm takes down a client, a replay attack sneaks past you, or out-of-order events corrupt your database. Here's how to build them like you mean it."
tags:
  - backend
  - api-design
  - webhooks
  - distributed-systems
  - node-js
featured: true
---

Webhooks are the duct tape holding half the internet together. Stripe pings you when a payment lands. GitHub fires one on every push. Your CI system nudges your Slack bot when the build goes green.

They look dead simple: make an HTTP POST, done. But "simple" is doing a lot of heavy lifting there. In practice, webhooks are a mini distributed system you're suddenly responsible for — and most implementations forget about retries, ignore security, and completely punt on ordering.

Let me show you what actually goes wrong, and how to fix it.

## The Happy Path Is a Lie

Here's the naive implementation everyone ships on a Friday afternoon:

```js
// Don't do this
app.post('/checkout', async (req, res) => {
  const order = req.body;
  await db.markOrderPaid(order.id);
  await sendConfirmationEmail(order.userId);
  res.sendStatus(200);
});
```

What could go wrong? Everything. The DB is slow, the email service is down, your handler throws, your client gets a 500. Your webhook sender retries. Now you've sent two emails and charged the card twice. Congratulations, you've invented a bug factory.

Webhooks are hard not because the protocol is complex — it's just HTTP — but because the **failure modes compound**. Network hiccups, slow handlers, duplicate deliveries, and out-of-order events all stack on top of each other.

## Pattern 1: Retry with Exponential Backoff (and Jitter)

If you're *sending* webhooks, your retry logic matters as much as the delivery itself. A naive "retry every 5 seconds" loop is how you take down a struggling consumer — they're already slow, and now you're flooding them.

Exponential backoff with jitter is the standard:

```js
async function deliverWebhook(endpoint, payload, attempt = 1) {
  const MAX_ATTEMPTS = 7;
  
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout, not forever
    });

    if (res.ok) return; // 2xx = success

    // 4xx (except 429) are NOT retriable — stop here
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      console.error(`Non-retriable error ${res.status} for ${endpoint}`);
      return;
    }

    throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) {
      await dlq.push({ endpoint, payload, error: err.message });
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s... + random jitter
    const baseDelay = Math.pow(2, attempt - 1) * 1000;
    const jitter = Math.random() * 1000;
    await sleep(baseDelay + jitter);

    return deliverWebhook(endpoint, payload, attempt + 1);
  }
}
```

Two things to notice: the **timeout** on the fetch (10 seconds is generous — some teams use 5) and the **dead-letter queue** for exhausted retries. At Cubet, we push failed deliveries to a DLQ and have a dashboard to replay them manually. Without that escape hatch, you're hunting through logs at 2 AM wondering why a client never got their payment event.

Also: **do not retry 4xx errors** (except 429 Too Many Requests). A `400 Bad Request` means your payload is malformed — retrying won't help, it'll just spam their logs.

## Pattern 2: Signature Verification — Don't Skip This

Webhooks arrive over public internet. Anyone who knows your endpoint can POST fake events to it. The fix is HMAC signatures — you sign the payload with a shared secret, and the receiver verifies it before touching the data.

Here's the sender side (Node.js):

```js
const crypto = require('crypto');

function signPayload(secret, payload) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(payload);
  const signedContent = `${timestamp}.${body}`;
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  return {
    'X-Webhook-Timestamp': timestamp,
    'X-Webhook-Signature': `sha256=${signature}`,
  };
}
```

And on the receiver side, **reject old timestamps** — this kills replay attacks where someone captures a valid webhook and fires it at you an hour later:

```js
function verifyWebhook(req, secret) {
  const signature = req.headers['x-webhook-signature'];
  const timestamp = parseInt(req.headers['x-webhook-timestamp'], 10);
  const now = Math.floor(Date.now() / 1000);

  // Reject anything older than 5 minutes
  if (Math.abs(now - timestamp) > 300) {
    throw new Error('Webhook timestamp too old — possible replay attack');
  }

  const signedContent = `${timestamp}.${req.body}`;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex');

  // Constant-time comparison — prevents timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid webhook signature');
  }
}
```

Use `crypto.timingSafeEqual` for the comparison. Regular string equality (`===`) leaks timing information that an attacker can exploit to brute-force your secret byte by byte. Yes, really.

## Pattern 3: Idempotency Keys — Because You Will Get Duplicates

Here's the uncomfortable truth: **your handler will be called more than once for the same event**. Networks are unreliable. Your endpoint might return 200 but the response gets lost in transit. The sender retries. Now you're processing the same event twice.

The fix is idempotency — process each event exactly once, even if delivered multiple times. Every webhook event should carry a unique ID (`X-Webhook-Event-Id` is common). Store it when you process the event and skip duplicates:

```js
app.post('/webhooks/payment', rawBodyMiddleware, async (req, res) => {
  verifyWebhook(req, process.env.WEBHOOK_SECRET); // verify first, always

  const eventId = req.headers['x-webhook-event-id'];
  
  // Idempotency check
  const alreadyProcessed = await redis.set(
    `webhook:processed:${eventId}`,
    '1',
    { NX: true, EX: 86400 } // NX = only set if not exists, 24h TTL
  );

  if (!alreadyProcessed) {
    return res.sendStatus(200); // Duplicate — acknowledge but skip
  }

  // Hand off to a queue — don't do real work in the webhook handler
  await queue.push({ type: 'payment.completed', data: req.body });
  res.sendStatus(200);
});
```

Notice the last pattern here: **respond 200 immediately and do the real work asynchronously**. Your webhook handler should be dumb and fast — parse, verify, idempotency check, enqueue, done. Heavy processing (database writes, emails, downstream API calls) goes into a background job. This keeps your response time under 10 seconds (most senders give up after that) and protects you from cascading failures in your own services.

## The Ordering Problem (And Why You Often Can't Solve It)

Events can arrive out of order. A `subscription.cancelled` might land before `subscription.updated`. HTTP has no ordering guarantees, and retry storms make it worse.

The honest answer: **don't depend on ordering if you can help it**. Design your event handlers to be *commutative* — the result is the same regardless of arrival order. Store the full state in each event payload (not just a delta), use "last write wins" with event timestamps, and treat each event as a snapshot rather than a mutation.

If you truly need ordering — say, for financial ledgers — you need sequence numbers per entity (not globally) and a resequencing buffer. That's a bigger architectural investment, but sometimes necessary.

## Quick Checklist Before You Ship

- [ ] Signature verification on every incoming webhook
- [ ] Timestamp check to block replay attacks (5-minute window is standard)
- [ ] Idempotency key stored before processing
- [ ] Webhook handler responds 200 immediately, real work runs async
- [ ] Retry sender uses exponential backoff + jitter
- [ ] 4xx errors are not retried
- [ ] Dead-letter queue for exhausted retries
- [ ] Event payload carries enough context to be self-contained (not just IDs)

## Ship It Right

Webhooks are deceptively simple until they aren't. The five minutes you spend adding HMAC verification and an idempotency check will save you from an incident where someone replays a $10,000 transaction or a retry loop takes your client offline.

The pattern is always the same: verify early, acknowledge fast, process asynchronously, and assume you'll get the same event twice. Build for the failure case first, and the happy path will take care of itself.

Got a gnarly webhook war story? I'd love to hear it — find me on [Twitter/X](https://x.com/kpanuragh) or drop a comment below.
