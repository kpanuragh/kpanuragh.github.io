---
title: "🪂 Graceful Degradation: Stop Failing Completely When You Can Fail Partly"
date: "2026-06-06"
excerpt: "Your recommendation engine is down. Does that mean your homepage should return 503? No — it means you serve popular items from cache and move on. Graceful degradation is the difference between a bad day and a catastrophe."
tags:
  - reliability
  - platform-engineering
  - devops
  - kubernetes
  - resilience
featured: true
---

# 🪂 Graceful Degradation: Stop Failing Completely When You Can Fail Partly

Here's a scenario from a project I worked on at Cubet: our product recommendation service went down during a sale event. The API gateway was configured to proxy calls directly to it. The recommendations widget on the homepage threw a 503. The 503 propagated to the page render. The whole homepage returned a 503. Traffic spiked. Everybody got a 503.

The recommendations service was down. The *rest of the application* — the catalog, the cart, checkout, everything — was perfectly healthy.

We had built a system that failed 100% when 5% of it broke.

That's the opposite of graceful degradation.

---

## What Graceful Degradation Actually Means

Graceful degradation is not "handle errors nicely." It's a design principle: **your system should remain partially useful when components fail**, rather than becoming completely useless.

The mental model: think of your application as a set of tiers.

- **Tier 0 — Core function**: The thing users absolutely must be able to do. (Complete a purchase. Read a document. Send a message.)
- **Tier 1 — Enhanced experience**: Things that improve the experience. (Personalized recommendations. Live counters. Social proof.)
- **Tier 2 — Nice-to-have**: Things most users don't notice until they're gone. (Related articles. "Others viewed" widgets. Non-critical analytics.)

When Tier 2 dies, Tier 0 and Tier 1 should not notice. When Tier 1 falters, Tier 0 soldiers on. The system degrades — but it keeps working.

---

## Pattern 1: The Static Fallback

The simplest pattern and the one teams most often skip.

Every non-critical API call should have a **fallback value** — something to return when the dependency is unavailable. The fallback doesn't have to be smart. It just has to be safe.

```typescript
async function getRecommendations(userId: string): Promise<Product[]> {
  try {
    const res = await fetch(`${RECO_SERVICE}/recommendations/${userId}`, {
      signal: AbortSignal.timeout(300), // don't wait forever
    });
    if (!res.ok) throw new Error(`reco service: ${res.status}`);
    return await res.json();
  } catch (err) {
    logger.warn({ err }, 'recommendation service unavailable, using fallback');
    return POPULAR_ITEMS_CACHE; // pre-fetched hourly, always available
  }
}
```

The `POPULAR_ITEMS_CACHE` is refreshed by a background job every hour from the database. It's stale. It doesn't know anything about the user. But it shows *something* instead of a broken widget, and that's enough for the page to render.

Three rules for static fallbacks:
1. The fallback must **never** call the failed dependency (obviously).
2. The fallback should be **pre-computed**, not computed at failure time.
3. Log every fallback hit — so you can tell when your fallback becomes the default.

---

## Pattern 2: Feature Shedding with Flags

Some features should just disappear when their backing service is down, instead of showing broken UI or erroring out. Feature flags give you a kill switch.

We use LaunchDarkly at Cubet for this, but the concept works with any flag system — even a Redis key.

```yaml
# kubernetes configmap updated by your on-call runbook
apiVersion: v1
kind: ConfigMap
metadata:
  name: feature-flags
data:
  ENABLE_LIVE_INVENTORY: "false"   # flip to false when inventory service is degraded
  ENABLE_PERSONALIZATION: "true"
  ENABLE_SOCIAL_PROOF: "false"     # reviews service is flaky, disable on high traffic
```

Your app reads these at startup (or live, if you hot-reload). When `ENABLE_LIVE_INVENTORY` is false, the inventory widget is simply not rendered — no error, no spinner, no confusion. The page loads fine. Users don't know what they're missing.

This is especially powerful during incidents: your on-call engineer can disable a broken feature in 30 seconds without a deploy.

The trick is doing this *before* an incident. Map every non-critical feature to a flag. Give your on-call team the playbook to flip them. If you wait until an outage to add the flag, you'll be doing a deploy at 2am, which is its own disaster.

---

## Pattern 3: Timeout Budgets and Partial Responses

A classic mistake: your page makes 8 API calls. One of them takes 30 seconds to time out. The entire page takes 30 seconds to load — or times out entirely.

The fix is **timeout budgets**: each component gets a slice of the total allowed latency, and if it doesn't deliver within that slice, you move on without it.

```go
func buildPageData(ctx context.Context, userID string) PageData {
    ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
    defer cancel()

    var wg sync.WaitGroup
    result := PageData{}

    wg.Add(1)
    go func() {
        defer wg.Done()
        // core — must succeed
        result.Catalog, _ = catalog.Get(ctx, userID)
    }()

    wg.Add(1)
    go func() {
        defer wg.Done()
        // enhanced — best effort
        tctx, tcancel := context.WithTimeout(ctx, 300*time.Millisecond)
        defer tcancel()
        result.Recommendations, _ = reco.Get(tctx, userID)
        // if reco is nil, template renders without the widget
    }()

    wg.Wait()
    return result
}
```

The total budget is 2 seconds. Recommendations get 300ms of that. If the recommendation service is slow, it gets dropped from the response. The page renders without personalization. The user gets their page in 2 seconds instead of not at all.

This is different from a circuit breaker (which stops calling a failing service entirely). Timeout budgets work even for services that are slow but not fully down — and slow is often worse than down.

---

## What Good Degradation Looks Like in Practice

After that sale-event incident, we rebuilt the recommendations integration at Cubet with all three patterns:

1. Static fallback to the popular-items cache when the service returns non-2xx.
2. A feature flag `ENABLE_RECOMMENDATIONS` that on-call can flip during incidents.
3. A 250ms timeout budget — miss the budget, render without the widget.

The next time the recommendations service had an incident, the homepage didn't notice. Traffic kept flowing. The incident was invisible to users.

Monitoring still fired (because the fallback hit rate spiked), but it was a P3 ticket that the team handled in business hours — not a 2am war room.

---

## The Uncomfortable Truth

Graceful degradation requires you to **design failure modes explicitly**, and most teams skip this step. When you're building a feature, it's easy to focus on the happy path. Thinking about what happens when your dependency is down feels like pessimism.

It's not pessimism. It's the difference between a system that handles reality and one that falls apart the moment reality shows up.

Map your features to tiers. Write fallbacks before you need them. Add kill switches. Set timeout budgets.

Your system *will* have partial failures. The question is whether they'll be partial problems or total catastrophes.

---

## Quick Checklist

- [ ] Every non-critical dependency has a fallback value
- [ ] Feature flags exist for Tier 1 and Tier 2 features
- [ ] All external calls have timeouts (not just "it'll time out eventually")
- [ ] Fallback usage is logged and alerted on
- [ ] On-call runbook documents which flags to flip for each known dependency
- [ ] Timeout budgets are set per-component, not just globally

Pick one feature in your app today and ask: *what happens to this page if this API is down?* If the answer is "the whole page breaks," you have work to do.
