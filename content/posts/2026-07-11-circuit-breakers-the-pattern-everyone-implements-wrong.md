---
title: "⚡ Circuit Breakers: The Pattern Everyone Implements Wrong"
date: "2026-07-11"
excerpt: "Everyone name-drops the circuit breaker pattern in system design interviews. Far fewer have actually tuned one that survives contact with production. Here's what the tutorials skip: half-open state thrash, per-dependency breakers, and why a breaker with no fallback is just a fancier 500."
tags: ["reliability", "devops", "microservices", "resilience", "sre"]
featured: true
---

Ask any engineer to explain the circuit breaker pattern and they'll nod knowingly and say "closed, open, half-open" like they just recited a magic spell. Ask them to show you a breaker they've actually tuned in production, one that survived a real incident instead of just living in a slide deck, and the room gets quiet.

That gap is the whole problem. Circuit breakers are one of the most name-dropped, least-understood patterns in distributed systems. Everyone knows the states. Almost nobody has thought about what happens in the seconds after the breaker trips, which is exactly when it matters most.

## The three states, and the one nobody tunes

Quick refresher, because we need the vocabulary:

- **Closed** — requests flow normally. The breaker counts failures.
- **Open** — failure threshold exceeded. Requests fail fast without even hitting the downstream service.
- **Half-open** — after a cooldown, the breaker lets a trickle of requests through to test if the dependency recovered.

Everyone gets closed and open right. It's half-open where implementations quietly fall apart. Let one request through and it's slow but not quite a failure? Ten requests through and eight succeed? Should the breaker re-open on the first failure, or does it need a fresh streak? Most off-the-shelf libraries pick a default (often: one probe request, binary pass/fail) and most teams never revisit it.

That default is why breakers "flap" — snapping open, half-open, open, half-open, every few seconds — during a partial recovery. Your downstream service is coming back online, warming caches, JIT-compiling, whatever, and it's succeeding on request 1 and timing out on request 2. A single-probe half-open state treats that like a coin flip and your breaker spends the next ten minutes doing absolutely nothing useful.

## Fix: require a streak, not a single probe

```yaml
# resilience4j-style config, but the idea applies to any breaker library
circuitbreaker:
  instances:
    inventory-service:
      slidingWindowSize: 20
      failureRateThreshold: 50
      waitDurationInOpenState: 15s
      permittedNumberOfCallsInHalfOpenState: 5   # not 1
      minimumNumberOfCalls: 10
```

Five probe calls in half-open, not one. If 3 out of 5 succeed, close it. If not, back to open for another cooldown. This single change — going from a 1-request probe to a small window — is the difference between a breaker that stabilizes a recovering service and one that just adds jitter to your incident timeline.

## The mistake that actually matters: one breaker to rule them all

Here's the one I see constantly, including in a service I inherited at Cubet a while back: a single HTTP client wrapped in a single circuit breaker, shared across every downstream call it makes. Payments API, inventory API, and a third-party shipping-rate lookup, all behind one breaker instance.

The shipping-rate API — a genuinely flaky third party with a habit of timing out on Fridays — trips the shared breaker. Now payments calls are failing fast too, even though the payments API is perfectly healthy. You've turned one dependency's bad day into an outage for two others that had nothing to do with it.

The fix is almost embarrassingly simple: **one breaker per dependency, not per client.** If you're calling three downstream services, you need three breakers with independently tuned thresholds, because a flaky third-party shipping API and your own payments service do not deserve the same failure tolerance.

```java
// wrong: shared breaker across unrelated dependencies
CircuitBreaker sharedBreaker = registry.circuitBreaker("http-client");

// right: one breaker per actual failure domain
CircuitBreaker paymentsBreaker  = registry.circuitBreaker("payments-api");
CircuitBreaker inventoryBreaker = registry.circuitBreaker("inventory-api");
CircuitBreaker shippingBreaker  = registry.circuitBreaker("shipping-rate-api");
```

It's more boilerplate. It is also the entire point of the pattern — isolating failure domains from each other. A breaker that shares fate across unrelated services isn't isolating anything.

## A breaker with no fallback is a fancier 500

This is the part that turns "we added resilience" into a lie you tell yourself. Tripping a breaker so requests fail fast is strictly better than letting them time out slowly and pile up — that part is real, you protect your thread pool and your latency percentiles. But fast-failing to the *user* with no fallback behavior is not resilience. It's the same 500 error, just delivered a little quicker.

The breaker's job is to buy you the time and stability to serve a fallback: a cached shipping estimate, a "standard shipping, exact cost calculated at checkout" message, a stale-but-labeled inventory count. If your `onOpen` handler just rethrows, you've built infrastructure for a problem you never actually solved — you've just made the failure cheaper to produce.

```java
CircuitBreaker breaker = registry.circuitBreaker("shipping-rate-api");
Supplier<ShippingRate> decorated = CircuitBreaker
    .decorateSupplier(breaker, () -> shippingClient.getRate(order));

ShippingRate rate = Try.ofSupplier(decorated)
    .recover(CallNotPermittedException.class, e -> ShippingRate.cachedEstimate(order))
    .get();
```

That `.recover()` line is doing the actual resilience work. The breaker just decides when to reach for it instead of waiting on a hung connection first.

## Watch for the retry-plus-breaker combo, too

One more trap: pairing a circuit breaker with a naive retry policy without thinking about ordering. If your retry wrapper sits *outside* the breaker and retries on `CallNotPermittedException`, you've built a tight loop that hammers your own breaker the instant it opens — which, ironically, can keep it from ever getting to a clean half-open probe. Retries belong inside the breaker's protection, tuned separately, or you end up fighting your own resilience layer.

## Try this on your own service

Pick one downstream dependency you're currently wrapping in a shared or generic client. Ask three questions: does it have its own breaker, does half-open require more than one successful probe, and does tripping it actually serve a fallback or just fail faster? If the honest answer to any of those is no, you don't have a circuit breaker — you have a very elaborate way of saying "no" quickly. Fix one of those three this week; it's a smaller change than it sounds and it's the difference between a breaker that helps during an incident and one that's just decoration in your dependency graph.
