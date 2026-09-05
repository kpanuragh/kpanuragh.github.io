---
title: "⚡ Circuit Breakers: Teaching Your Code When to Give Up (So You Don't Have To)"
date: 2026-09-05
excerpt: "One slow downstream dependency can take your entire system down with it — unless something in the middle knows when to stop trying. Here's how circuit breakers actually work, and the timeout tuning mistake that nearly took our whole platform out."
tags: ["devops", "reliability", "resilience", "microservices", "sre"]
featured: true
---

Somewhere in your architecture right now, there's a service calling another service, blissfully assuming that call will come back in a reasonable amount of time. It usually does. And then one day the downstream service gets slow — not down, just *slow* — and every caller piles up waiting on a response that's taking three seconds instead of thirty milliseconds. Threads block. Connection pools exhaust. The retry logic, trying to be helpful, fires off *more* requests at the already-struggling service. Congratulations, you've just turned a minor blip in one component into a full outage of everything upstream of it.

This is the cascading failure, and it's one of the most common ways healthy systems die. The fix isn't "make the downstream service faster" — sometimes you can't. The fix is teaching your callers to stop calling once it's clear things have gone sideways. That's a circuit breaker.

## The electrical metaphor, actually explained

Circuit breakers in software borrow the name for a reason. A real circuit breaker trips when current spikes, physically disconnecting the circuit before your wiring catches fire. It doesn't try to be clever about it — too much current, cut it off, protect the house.

A software circuit breaker does the same thing for a dependency call. It wraps requests to a downstream service and tracks failures. Once failures cross a threshold, the breaker "trips" (opens), and for a cooldown period it stops sending requests entirely — failing fast instead of waiting on a timeout. After the cooldown, it lets a trickle of requests through to test the water. If they succeed, it closes again. If they don't, it stays open.

Three states, and they map cleanly onto the metaphor:

- **Closed** — normal operation, requests flow through, failures are counted.
- **Open** — the circuit is tripped, requests fail immediately without even attempting the call.
- **Half-open** — a probe state, letting a small number of requests through to check if the dependency has recovered.

The magic isn't the pattern itself — it's what it buys you. Failing fast in milliseconds instead of hanging for a 30-second timeout means your threads free up, your queues drain, and the failure stays contained to the one feature that actually depends on the broken thing, instead of starving everything else on the box.

## A minimal implementation

You don't need a heavyweight library to get the idea across. Here's a stripped-down breaker in TypeScript, the kind of thing you'd wrap around an outbound HTTP client:

```typescript
type State = "closed" | "open" | "half-open";

class CircuitBreaker {
  private state: State = "closed";
  private failures = 0;
  private nextAttempt = 0;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() < this.nextAttempt) {
        throw new Error("circuit open: failing fast");
      }
      this.state = "half-open";
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
    this.failures = 0;
    this.state = "closed";
  }

  private onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "open";
      this.nextAttempt = Date.now() + this.cooldownMs;
    }
  }
}
```

That's genuinely most of it. In production you'd want sliding-window failure counting instead of a raw counter (so five failures spread across an hour don't trip it the same way five failures in ten seconds do), and you'd emit metrics on every state transition — but the state machine above is the whole idea.

## The timeout mistake that got us

At Cubet, we rolled out a breaker around an internal pricing service that occasionally got slow under load. It worked exactly as designed — until it didn't, and the reason was almost funny in hindsight. We'd set the breaker's failure threshold correctly, but the *timeout* on the underlying HTTP call was still 15 seconds, a value copy-pasted from a completely different integration years earlier. So instead of failing fast, every request that eventually counted as a "failure" first sat there for 15 seconds burning a thread. The breaker still tripped eventually, but by the time it did, the damage — thread pool exhaustion — had already happened. The breaker was correct; the timeout feeding it information was the actual bottleneck.

The lesson: a circuit breaker is only as fast as the slowest thing it's waiting on to call a failure a failure. Pair every breaker with an aggressive, deliberately-chosen timeout — usually far shorter than your instinct says, something closer to your p99 latency plus a small buffer, not a generic "give it 15 seconds to be safe" value.

```yaml
# what we changed — not the breaker, the timeout budget feeding it
pricing-service:
  connectTimeoutMs: 200
  requestTimeoutMs: 800   # was 15000
  breaker:
    failureThreshold: 5
    cooldownMs: 20000
```

## Where breakers earn their keep — and where they don't

Circuit breakers shine on synchronous calls to dependencies that can degrade gracefully without them — a recommendations widget, a "similar items" panel, anything you can hide or fall back on. They're less useful (and sometimes actively harmful) wrapped around a call that's genuinely load-bearing for the request — tripping the breaker there doesn't protect anything, it just turns a slow response into a guaranteed failure. For those, you want load shedding or graceful degradation with a real fallback value, not a hard stop.

If you're running anything with more than one hop between services, you probably have at least one dependency that's a single slow response away from taking the rest of the system down with it. Go find it. Wrap it. Set the timeout to something honest. Your on-call rotation will thank you at 3am.
