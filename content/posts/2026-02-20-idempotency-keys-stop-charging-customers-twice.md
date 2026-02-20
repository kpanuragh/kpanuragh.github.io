---
title: "Idempotency Keys: Stop Accidentally Charging Customers Twice 💳🔑"
date: "2026-02-20"
excerpt: "Our retry logic was doing its job perfectly. It retried a payment request. Twice. Successfully. One customer, two charges, one very angry support ticket. Idempotency keys were the two-line fix I wish I'd shipped on day one."
tags: ["architecture", "scalability", "system-design", "api-design", "distributed-systems"]
featured: true
---

# Idempotency Keys: Stop Accidentally Charging Customers Twice 💳🔑

**The most expensive mistake I've made as a Technical Lead** didn't come from a security breach or a bad deploy. It came from code doing exactly what it was designed to do.

Retry logic. Working perfectly. Retrying a timed-out payment request. The first attempt had actually succeeded — network just didn't deliver the response in time. The retry went through too. Customer charged twice. She noticed immediately. Support ticket, refund, apology email, and a team postmortem where I had to explain why "add retry logic to the payment service" was listed in the sprint as a reliability improvement.

The fix? Two lines of code and a concept I should have learned before I wrote my first API.

## What is Idempotency? 🤔

An operation is **idempotent** if performing it multiple times produces the same result as performing it once.

```
Idempotent:     DELETE /orders/123  (order is gone whether you do it 1x or 100x)
NOT Idempotent: POST /payments      (each request creates a NEW charge 💀)
```

The problem: networks lie. Requests time out. Load balancers drop connections. Mobile users lose signal mid-checkout. Your retry logic - which you absolutely need - will fire again. The server might have already processed the first request successfully and just failed to return a response.

```
What retries look like without idempotency:

Client → POST /payments → [network hiccup] → timeout
Client → POST /payments (retry #1) → 200 OK  ✅ (charge #1)
Client → POST /payments (retry #2) → 200 OK  ✅ (charge #2 💀)

What retries look like WITH idempotency:

Client → POST /payments {idempotency-key: "abc123"} → timeout
Client → POST /payments {idempotency-key: "abc123"} (retry) → 200 OK ✅
                         same key! → Server returns SAME response from first attempt
                                   → Zero duplicate charges
```

Same key = same result. Always. No matter how many times you retry.

## The Idempotency Key Pattern 🔑

The pattern is dead simple:

1. Client generates a **unique key** per logical operation (not per HTTP request)
2. Client sends it as a header with every request (and every retry)
3. Server stores the result keyed by that ID
4. On duplicate request: server returns the stored result, skips all processing

```
┌─────────────┐          ┌─────────────────────────────┐
│   Client    │          │           Server             │
│             │          │                              │
│ key="uuid1" │─────────▶│ Check: key "uuid1" exists?  │
│ POST /pay   │          │   No → Process payment       │
│             │          │      → Store result + key    │
│             │◀─────────│   → Return 200 + result     │
│   [timeout] │          │                              │
│             │          │                              │
│ key="uuid1" │─────────▶│ Check: key "uuid1" exists?  │
│ POST /pay   │          │   YES → Return STORED result │
│ (retry)     │◀─────────│   → SKIP payment entirely   │
│             │          │                              │
└─────────────┘          └─────────────────────────────┘
```

The payment runs once. The client gets a consistent response. Nobody gets charged twice.

## Implementing Idempotency in Node.js 🛠️

**Step 1: The idempotency middleware**

```javascript
// middleware/idempotency.js
const crypto = require('crypto');

async function idempotencyMiddleware(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  // Only enforce on state-changing requests
  if (!idempotencyKey || req.method === 'GET') {
    return next();
  }

  // Validate key format (UUIDs are standard)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    return res.status(400).json({
      error: 'Invalid idempotency key format. Use UUID v4.'
    });
  }

  // Scope to user + key (prevent key reuse across users)
  const scopedKey = `idempotency:${req.user.id}:${idempotencyKey}`;

  try {
    // Check for existing result
    const cached = await redis.get(scopedKey);

    if (cached) {
      const { statusCode, body } = JSON.parse(cached);
      console.log(`Idempotent replay: ${scopedKey}`);
      return res.status(statusCode).json(body);
    }

    // Mark as in-progress to prevent concurrent duplicate processing
    const acquired = await redis.set(scopedKey + ':lock', '1', 'NX', 'EX', 30);
    if (!acquired) {
      return res.status(409).json({
        error: 'Request is already being processed. Retry in a moment.'
      });
    }

    // Intercept the response to cache it
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only cache successful and known-failure responses
      if (res.statusCode < 500) {
        await redis.set(
          scopedKey,
          JSON.stringify({ statusCode: res.statusCode, body }),
          'EX', 86400  // Keep for 24 hours
        );
      }

      await redis.del(scopedKey + ':lock');
      return originalJson(body);
    };

    next();

  } catch (err) {
    console.error('Idempotency middleware error:', err.message);
    // Fail open - let the request through (better than blocking payments)
    next();
  }
}

module.exports = { idempotencyMiddleware };
```

**Step 2: Apply to your payment routes**

```javascript
// routes/payments.js
const { idempotencyMiddleware } = require('../middleware/idempotency');

router.post('/payments',
  authenticate,
  idempotencyMiddleware,  // 👈 The magic line
  async (req, res) => {
    const { amount, currency, paymentMethodId, orderId } = req.body;

    // This now only runs ONCE per idempotency key
    const charge = await stripe.charges.create({
      amount,
      currency,
      payment_method: paymentMethodId,
      confirm: true,
      idempotencyKey: req.headers['idempotency-key'],  // Pass to Stripe too!
    });

    await db('orders').where({ id: orderId }).update({ status: 'paid' });

    return res.status(200).json({
      success: true,
      chargeId: charge.id,
      amount: charge.amount
    });
  }
);
```

**Step 3: Client generates the key correctly**

```javascript
// client-side payment logic
import { v4 as uuidv4 } from 'uuid';

async function checkout(cart, paymentMethod) {
  // Generate ONCE before any attempt
  const idempotencyKey = uuidv4();

  const makePaymentRequest = async () => {
    return fetch('/api/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'Idempotency-Key': idempotencyKey,  // SAME key on every retry
      },
      body: JSON.stringify({
        amount: cart.total,
        currency: 'USD',
        paymentMethodId: paymentMethod.id,
        orderId: cart.orderId,
      }),
    });
  };

  // Retry with exponential backoff, but SAME idempotency key
  let attempt = 0;
  while (attempt < 3) {
    try {
      const response = await makePaymentRequest();

      if (response.ok) return await response.json();
      if (response.status >= 400 && response.status < 500) {
        // Client errors (400, 401, 422): don't retry, it won't help
        throw new Error(await response.text());
      }

      // 5xx: retry with same key
      attempt++;
      await sleep(Math.pow(2, attempt) * 1000);  // 2s, 4s, 8s

    } catch (networkError) {
      attempt++;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  throw new Error('Payment failed after retries');
}
```

## The Laravel Implementation 🐘

```php
// app/Http/Middleware/IdempotencyMiddleware.php
class IdempotencyMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->header('Idempotency-Key');

        if (!$key || $request->isMethod('GET')) {
            return $next($request);
        }

        // Scope to user to prevent cross-user key reuse
        $scopedKey = "idempotency:{$request->user()->id}:{$key}";

        // Return cached response if it exists
        if ($cached = Cache::get($scopedKey)) {
            return response()->json(
                $cached['body'],
                $cached['status_code']
            );
        }

        // Lock to prevent race conditions
        $lock = Cache::lock("{$scopedKey}:lock", 30);

        if (!$lock->get()) {
            return response()->json(
                ['error' => 'Request already in progress'],
                409
            );
        }

        try {
            $response = $next($request);

            // Cache successful and client-error responses
            if ($response->getStatusCode() < 500) {
                Cache::put($scopedKey, [
                    'status_code' => $response->getStatusCode(),
                    'body'        => json_decode($response->getContent(), true),
                ], now()->addDay());
            }

            return $response;

        } finally {
            $lock->release();
        }
    }
}

// Register in api.php
Route::post('/payments', PaymentController::class)
    ->middleware(['auth:sanctum', 'idempotency']);
```

## Pass the Key Downstream Too 🔗

**A scalability lesson that cost us:** We implemented idempotency at our API layer but forgot to pass the key to Stripe. Our idempotency cache got wiped during a Redis incident. Requests retried. Stripe didn't know they were retries. Duplicate charges again.

Most payment providers support idempotency natively. Use it:

```javascript
// Stripe - pass your key through
await stripe.paymentIntents.create(
  { amount, currency },
  { idempotencyKey: req.headers['idempotency-key'] }
);

// Stripe will deduplicate on their end too.
// Two-layer protection. Belt AND suspenders.
```

```
Your API Layer (Redis cache)
      ↓
Payment Provider (Stripe/Braintree - their idempotency)
      ↓
Your Database Transaction
```

All three layers. Because networks can fail at any of them.

## The Trade-offs Nobody Tells You ⚖️

| | No Idempotency | With Idempotency |
|---|---|---|
| Retry safety | ❌ Duplicates possible | ✅ Safe to retry |
| Implementation cost | None | Redis + middleware |
| Response consistency | Varies | Identical replays |
| Debugging retries | Hard (look like new requests) | Easy (same key logged) |
| Storage cost | $0 | Small (keys expire) |
| Race condition risk | N/A | Need locking |

**The key expiry question:** How long do you keep idempotency records? Stripe uses 24 hours. That's a good default. You want to cover:
- Client retry windows (usually minutes to hours)
- Mobile apps that retry after regaining connectivity
- User clicking "Pay" twice on a slow connection

You don't need to keep them forever. 24 hours covers virtually every real retry scenario.

## When Idempotency Isn't Enough 🚨

**Mistake #1: Using the same key for different operations**

```javascript
// ❌ BAD: Reusing a key for a different request
const key = localStorage.getItem('lastPaymentKey') || uuidv4();

// The stored result from a different order will be returned!
// Customer gets "success" for an order they didn't place this time.
```

```javascript
// ✅ GOOD: Key per logical operation
const key = `order-${orderId}-payment-${uuidv4()}`;
// Or just always generate fresh UUIDs and never reuse
```

**Mistake #2: Caching 5xx errors**

```javascript
// ❌ BAD: Caching server errors
if (res.statusCode < 600) {  // This includes 500s!
  await redis.set(scopedKey, ...);
}

// Next retry gets "Internal Server Error" from cache forever.
// The real error is fixed, but cached response haunts users.

// ✅ GOOD: Only cache 2xx and 4xx
if (res.statusCode < 500) { ... }
```

**Mistake #3: No idempotency key on the client**

```javascript
// ❌ BAD: Key generated per HTTP request (not per operation)
async function retry() {
  return fetch('/api/payments', {
    headers: {
      'Idempotency-Key': uuidv4(),  // New key every call!
    }
  });
}
// The server sees three DIFFERENT keys. Three payments. 💀
```

**As a Technical Lead, I've learned:** Every POST/PUT/DELETE endpoint that touches money, inventory, or state that matters should require an idempotency key. Make it mandatory. Return 400 if it's missing. The 5 minutes of client-side implementation is worth infinitely less than one support ticket for a double-charge.

## Real-world ASCII Timeline: What Idempotency Saves You 🕐

```
Without idempotency:

t=0s    Client POSTs /payments
t=2.9s  Server processes payment ✅
t=3.0s  Client timeout fires (waited 3s)
t=3.0s  Client retries POST /payments
t=5.9s  Server processes payment again ✅ (second charge 💸)
t=6.0s  Both responses arrive (client takes first one)
t=6.0s  Customer charged twice. Support ticket incoming.

With idempotency (same timeline):

t=0s    Client POSTs /payments {key: "abc123"}
t=2.9s  Server processes payment ✅ → stores result under "abc123"
t=3.0s  Client timeout fires
t=3.0s  Client retries POST /payments {key: "abc123"}  ← same key!
t=3.0s  Server: "I've seen abc123 before" → returns stored result
t=3.1s  Client gets response ✅
t=3.1s  One charge. One happy customer. Zero support tickets.
```

## When Designing Our E-Commerce Backend... 🏪

We implemented idempotency keys for:
- **All payment endpoints** (non-negotiable)
- **Order creation** (prevent duplicate orders from double-clicks)
- **Inventory deductions** (don't undersell stock twice)
- **Refund processing** (double refunds are worse than no refunds)
- **Notification sends** (don't email "Your order shipped" seven times)

We skipped idempotency for:
- Read endpoints (GET requests are naturally idempotent)
- Analytics events (losing one is fine, duplicates are fine too)
- Audit log appends (we want every retry logged)

## TL;DR 💡

**Idempotency keys** are the pattern that makes your API safe to retry without producing duplicate side effects.

**Your checklist:**
1. Generate a unique UUID **per logical operation** on the client, not per HTTP request
2. Send the same key on every retry for that operation
3. Server checks cache before processing - return stored result on hit
4. Cache 2xx and 4xx responses, never cache 5xx
5. Scope keys to `userId + key` (prevent cross-user key reuse)
6. Use locking (Redis NX) to prevent race conditions on concurrent duplicates
7. Pass the key to downstream providers (Stripe, etc.) - they support it
8. Expire keys after 24 hours

**The rule I shipped after the double-charge incident:** Any endpoint that creates, modifies, or deletes something real (money, orders, inventory) must accept and enforce idempotency keys. No exceptions.

**When designing our e-commerce backend**, this became a non-negotiable API design standard. Every payment-related endpoint is idempotent. Our retry logic fires freely. Customers pay exactly once, no matter what the network does.

Two lines of middleware. Zero duplicate charges. Worth it. ✅

---

**Had a double-charge incident?** You're in good company - tell me about it on [LinkedIn](https://www.linkedin.com/in/anuraghkp). The best war stories come from payment bugs.

**Want the full idempotency middleware for production?** It's on [GitHub](https://github.com/kpanuragh) — tested on a backend that handles real money.

*Go make your APIs idempotent. Before your retry logic does it for you.* 💳🔑

---

**P.S.** The double-charge I mentioned? We caught it in the same day and refunded immediately. But the postmortem was brutal. "Add idempotency keys" was the first item in the action plan. It's been on our API design checklist ever since. Some lessons are only learned once.

**P.P.S.** If you're thinking "we don't have retries, so we don't need this" — you have retries. Your mobile clients have retries. Your browser has retries. Your load balancer has retries. The question is whether they're explicit in your code or implicit in your infrastructure. Either way, your API needs to handle them. 🎯
