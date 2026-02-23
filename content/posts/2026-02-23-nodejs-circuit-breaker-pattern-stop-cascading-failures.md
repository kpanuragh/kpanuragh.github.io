---
title: "🔌 Circuit Breakers in Node.js: Stop Letting One Bad Service Crash Your Entire App"
date: "2026-02-23"
excerpt: "One flaky microservice shouldn't bring down your whole platform. The circuit breaker pattern is your safety net — here's how to implement it in Node.js and finally build resilient APIs."
tags: ["nodejs", "backend", "microservices", "resilience", "patterns", "express"]
featured: true
---

# 🔌 Circuit Breakers in Node.js: Stop Letting One Bad Service Crash Your Entire App

Picture this: it's 2am, your on-call phone buzzes, and your entire platform is down. You dig in, only to discover... the payment service was slow. Not down — just *slow*. Your order service kept calling it. Those calls queued up. Threads got exhausted. Memory ballooned. And now everything is on fire.

This is a **cascading failure**, and it's one of the most common ways distributed systems die. The good news? It's almost entirely preventable with a humble pattern borrowed from electrical engineering: the **circuit breaker**.

## What Is a Circuit Breaker? (The Analogy That Actually Clicks)

In your home's electrical panel, circuit breakers exist to protect you. If too much current flows through a wire — say, because your ancient microwave and hair dryer are running simultaneously — the breaker *trips*. Power cuts off. You're annoyed, sure, but your house doesn't burn down.

Software circuit breakers work the same way. When a downstream service starts failing repeatedly, the circuit "opens" and your code *stops trying to call it*. Requests fail fast with a clear error instead of waiting 30 seconds only to time out. Your service stays healthy. You sleep better.

A circuit breaker has three states:

- **Closed** — Everything is fine. Calls go through normally.
- **Open** — Too many failures. Calls are immediately rejected without even trying.
- **Half-Open** — After a cooldown period, the breaker lets one probe request through. If it succeeds, it closes again. If not, it stays open.

## Building a Circuit Breaker in Node.js

You can reach for a library like `opossum`, but understanding the internals is worth it. Here's a minimal implementation:

```javascript
class CircuitBreaker {
  constructor(fn, options = {}) {
    this.fn = fn;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = Date.now();

    this.threshold = options.threshold ?? 5;       // failures before opening
    this.cooldown = options.cooldown ?? 10_000;    // ms to wait before half-open
    this.halfOpenSuccesses = options.halfOpenSuccesses ?? 2; // to close again
  }

  async call(...args) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new Error('Circuit breaker OPEN — fast failing');
      }
      // Cooldown elapsed, try half-open
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await this.fn(...args);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccesses) {
        console.log('Circuit breaker CLOSED — service recovered');
        this.state = 'CLOSED';
      }
    }
  }

  onFailure() {
    this.failureCount++;
    if (
      this.state === 'HALF_OPEN' ||
      this.failureCount >= this.threshold
    ) {
      this.state = 'OPEN';
      this.nextAttemptAt = Date.now() + this.cooldown;
      console.warn(`Circuit breaker OPEN — will retry at ${new Date(this.nextAttemptAt).toISOString()}`);
    }
  }
}
```

This is ~50 lines and covers all three states. No magic, no surprises.

## Wiring It Into Your Express App

Let's say you're calling a payment microservice. Without protection:

```javascript
// The naive approach — one slow service = your whole app grinds to a halt
app.post('/orders', async (req, res) => {
  const payment = await paymentService.charge(req.body); // 🤞 hope this works
  res.json({ success: true, payment });
});
```

With a circuit breaker:

```javascript
import axios from 'axios';

// Wrap the risky call
const chargePayment = (body) =>
  axios.post('https://payments.internal/charge', body, { timeout: 3000 })
    .then(r => r.data);

const paymentBreaker = new CircuitBreaker(chargePayment, {
  threshold: 5,
  cooldown: 15_000,
});

app.post('/orders', async (req, res) => {
  try {
    const payment = await paymentBreaker.call(req.body);
    res.json({ success: true, payment });
  } catch (err) {
    if (err.message.includes('Circuit breaker OPEN')) {
      // Fail gracefully — maybe queue the order for retry
      res.status(503).json({
        error: 'Payment service temporarily unavailable. Your order has been queued.',
      });
    } else {
      res.status(500).json({ error: 'Payment failed' });
    }
  }
});
```

The key difference: when the payment service is struggling, your order service returns a `503` in *milliseconds* instead of hanging for 30 seconds. Your users get a clear message. Your server stays alive.

## The `opossum` Library (When You Want Battle-Tested)

For production, `opossum` is the Node.js ecosystem's go-to:

```bash
npm install opossum
```

```javascript
import CircuitBreaker from 'opossum';

const breaker = new CircuitBreaker(chargePayment, {
  timeout: 3000,         // if the call takes longer, it's a failure
  errorThresholdPercentage: 50,  // open when 50% of requests fail
  resetTimeout: 30_000,  // wait 30s before trying half-open
});

breaker.on('open', () => console.warn('🔴 Circuit breaker opened'));
breaker.on('halfOpen', () => console.info('🟡 Circuit breaker half-open'));
breaker.on('close', () => console.info('🟢 Circuit breaker closed'));

// It even has built-in fallback support
breaker.fallback(() => ({ queued: true, message: 'Payment queued for retry' }));

app.post('/orders', async (req, res) => {
  const payment = await breaker.fire(req.body);
  res.json({ success: true, payment });
});
```

`opossum` adds metrics, events, health endpoints, and a fallback mechanism out of the box. It also integrates with Prometheus if you're into observability (and you should be).

## Three Things to Get Right

**1. Set timeouts aggressively.** A circuit breaker without a timeout is like a smoke detector with no battery. If your circuit breaker waits 60 seconds before counting a failure, you'll still drain your thread pool. Set timeouts to 2–5 seconds for most service calls.

**2. Use per-service breakers, not one global one.** Your payment service and your notification service failing should be independent events. Don't let a flaky email sender open a breaker that blocks payments.

**3. Expose the breaker state in your health check.** If your `/health` endpoint shows all services green while three circuit breakers are open, your ops team is flying blind. Report breaker state so your load balancer and dashboards know the truth.

## When NOT to Use Circuit Breakers

Circuit breakers are for *remote calls* — HTTP, gRPC, database queries, anything that involves a network. They're not for internal business logic errors, input validation failures, or anything that isn't an infrastructure problem. Wrapping your `calculateTax()` function in a circuit breaker is just adding noise.

## The Bigger Picture: Resilience Is a Feature

Most developers treat resilience as an afterthought — something you add after the 2am incident. But a circuit breaker takes maybe an hour to add properly and can mean the difference between "the payment service was slow" and "our entire platform was down for 4 hours."

Distributed systems will fail. External services will hiccup. The question is whether your app degrades gracefully or collapses catastrophically.

Build the circuit breaker. Your future self — groggy and staring at a pager alert — will thank you.

---

**What's your go-to resilience pattern?** Timeouts, retries, bulkheads, or circuit breakers? Drop it in the comments or find me on X — I genuinely want to hear how you're keeping your services alive at 2am.
