---
title: "Circuit Breakers: Stop Letting One Broken Service Take Down Your Whole Stack ⚡"
date: "2026-05-30"
excerpt: "Your payment service goes down, and thirty seconds later your entire platform is on fire. Circuit breakers are the reliability pattern that stops one bad dependency from becoming everyone's problem — here's how to actually use them."
tags:
  - reliability
  - microservices
  - devops
  - resilience
  - platform-engineering
featured: true
---

It's 2 AM. Your payment processor is having a bad night. Network timeouts, 503s, the whole circus. But here's the thing — your checkout service didn't fail gracefully. It *waited*. For 30 seconds per request, thread pool exhausted, connection queue backed up, and now your product listing page is also dead because it shares the same thread pool. Your user profile service? Gone. Your recommendation engine? Collateral damage.

One downstream dependency took your entire platform down. 

This is called a **cascading failure**, and it's embarrassingly common. The fix has a name borrowed from electrical engineering: the **circuit breaker pattern**.

## What a Circuit Breaker Actually Is

An electrical circuit breaker trips when current exceeds a safe threshold, cutting power before your wiring melts. A software circuit breaker does the same thing — it monitors calls to a downstream service and, when failures cross a threshold, it *stops making those calls* and returns a fast failure instead.

Three states:

- **Closed**: Normal operation. Calls go through, failures are counted.
- **Open**: Too many failures. Calls are rejected immediately without hitting the downstream service.
- **Half-Open**: After a cooldown period, a probe request is allowed through. Success → back to Closed. Failure → back to Open.

The key insight: **a fast failure is better than a slow one**. If your payment service is down, telling the user immediately ("payment temporarily unavailable, try again in a moment") is infinitely better than hanging their browser for 30 seconds before timing out.

## The Problem Without Circuit Breakers

Here's what naive timeout-only code looks like in Node.js:

```typescript
async function chargeCard(amount: number, token: string) {
  // 30s timeout feels "safe"... until every thread is stuck here
  const response = await fetch('https://payments.internal/charge', {
    method: 'POST',
    body: JSON.stringify({ amount, token }),
    signal: AbortSignal.timeout(30_000),
  });
  return response.json();
}
```

When the payment service degrades to 10s response times, your thread pool fills up. Requests stack. Memory climbs. The `/health` endpoint starts timing out. Your load balancer marks the instance unhealthy and kills it. Then the next instance gets the same traffic, same fate. You're watching dominos fall in your APM dashboard at 2 AM.

## A Circuit Breaker in Practice

Here's a minimal implementation that I've adapted for use in production at Cubet — clean enough to reason about, pragmatic enough to actually deploy:

```typescript
type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold: number = 5,
    private readonly cooldownMs: number = 60_000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit open: dependency unavailable');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}

// Usage
const paymentBreaker = new CircuitBreaker(5, 60_000);

async function chargeCard(amount: number, token: string) {
  return paymentBreaker.call(async () => {
    const response = await fetch('https://payments.internal/charge', {
      method: 'POST',
      body: JSON.stringify({ amount, token }),
      signal: AbortSignal.timeout(5_000), // shorter timeout — fail fast
    });
    if (!response.ok) throw new Error(`Payment failed: ${response.status}`);
    return response.json();
  });
}
```

Now when the payment service degrades, after 5 failures the circuit opens. Subsequent requests fail *immediately* with a clean error instead of burning threads on 5-second timeouts. Your checkout service stays responsive. Your unrelated services don't catch fire.

## Fallback Strategies Matter More Than the Breaker Itself

The circuit breaker is just the tripwire. What you *do* when the circuit opens is the real engineering decision:

**Degrade gracefully.** Payment down? Show "temporarily unavailable, your cart is saved" instead of a 500. Recommendation engine down? Serve popular items from cache. Notification service down? Queue the email for later delivery.

**Use a fallback cache.** For read-heavy operations, serve stale data when the source is unreachable. A product catalog from 5 minutes ago is better than a 504.

```typescript
async function getProductCatalog() {
  try {
    return await catalogBreaker.call(() => fetchLiveCatalog());
  } catch {
    // circuit open — serve cached version
    const cached = await redis.get('catalog:fallback');
    if (cached) return JSON.parse(cached);
    throw new Error('Catalog unavailable');
  }
}
```

**Never silently swallow failures.** Whatever your fallback does, emit a metric. `circuit_breaker_open{service="payments"}` should be firing alerts. An open circuit is not a success state — it's a warning that something upstream needs attention.

## What To Tune (And What Not To Obsess Over)

The two knobs that matter:

**Failure threshold** — how many failures before the circuit opens. Too low and you get false positives from transient blips. Too high and you waste time on a clearly-dead service. For most internal services, 5 consecutive failures or a 50% error rate over a 10-second window is a reasonable starting point.

**Cooldown period** — how long the circuit stays open before attempting recovery. Match this to your dependency's typical recovery time. If your database restarts in ~30 seconds, a 60-second cooldown means you're not hammering it the moment it comes back up.

Don't overthink the failure counting strategy initially. Sliding window by volume beats simple consecutive-failure counting for high-traffic services, but consecutive-failure logic is easier to reason about and debug. Ship the simple version first.

## Service Mesh vs. Application-Level Breakers

If you're running Kubernetes with Istio or Linkerd, you get circuit breaking at the infrastructure layer for free — no application code needed. This is the right long-term answer for polyglot microservice environments.

```yaml
# Istio DestinationRule — circuit breaker at the mesh level
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: payments-circuit-breaker
spec:
  host: payments-service
  trafficPolicy:
    outlierDetection:
      consecutiveGatewayErrors: 5
      interval: 30s
      baseEjectionTime: 60s
      maxEjectionPercent: 100
```

Outlier detection in Istio ejects unhealthy instances from the load balancing pool — effectively an open circuit at the instance level. The tradeoff: mesh-level breakers don't give you application-aware fallback logic. You still want application-level handling for meaningful degraded states.

At Cubet, we run Istio for infrastructure-level protection and keep thin application-level circuit wrappers around the dependencies where fallback behavior matters most. Belt *and* suspenders.

## The Lesson You Learn the Hard Way

Distributed systems fail in partial, unpredictable ways. The database doesn't go down cleanly — it gets *slow*. The third-party API doesn't return 503 — it accepts connections and then never responds. Timeouts alone don't protect you from this; they just control how long you bleed.

Circuit breakers change your failure mode from "everything is slow and eventually dies" to "this specific thing is unavailable, everything else is fine." That's a fundamentally more recoverable situation.

The code is simple. The infrastructure config is three lines of YAML. The reason most teams don't have it is that nobody writes it until after the 2 AM incident teaches them exactly why it matters.

Write it before the incident. Sleep better. Your on-call rotation will thank you.

---

**What's your go-to resilience pattern for dependency failures?** Sharing approaches in the comments — especially curious if anyone's built something interesting on top of Istio's outlier detection.
