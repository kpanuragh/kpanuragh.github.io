---
title: "🎯 Designing SLIs That Don't Lie To You"
date: "2026-08-07"
excerpt: "Everyone can define an SLO once someone hands them a good SLI. Almost nobody talks about how to build the SLI itself — and a bad one will confidently tell you everything's fine while your users are furious."
tags:
  - observability
  - sre
  - monitoring
  - backend
featured: true
---

Ask any team if they have SLOs and most will say yes. Ask them to show you the SLI underneath it — the actual measurement the SLO is a target *for* — and the conversation gets a lot quieter. That's the part nobody teaches. Picking "99.9%" is easy. Picking what "success" even means, precisely enough that a computer can count it correctly, is where SLO programs quietly go wrong.

I've seen dashboards that were green for six months straight while support tickets piled up. The uptime check was hitting `/health`, which pinged nothing but the process itself. The database connection pool had been exhausted the entire time. The SLI wasn't wrong, exactly — it just wasn't measuring anything a user would recognize as "working."

## An SLI Is a Claim, Not a Metric

The distinction that matters: a metric is anything you can measure. An SLI is a metric you're willing to stake a promise on. That means it needs a precise, boring, unambiguous definition of what counts as a "good" event, because that definition is what everyone downstream — alerting, error budgets, exec dashboards — inherits without re-checking your work.

The two dominant shapes:

- **Request-based SLIs** — of all the requests that happened, what fraction were good? This is the natural fit for APIs: `good_requests / valid_requests`.
- **Window-based SLIs** — of all the time windows (say, one-minute buckets), what fraction were "good enough"? This fits batch jobs, pipelines, and anything without a clean per-request boundary — did this minute's ingestion lag stay under threshold, yes or no.

Teams default to request-based because it's what the tooling assumes, then wonder why their nightly ETL job's "SLO" is meaningless. A pipeline that runs once and takes 40 minutes doesn't have "requests" — it has one long window, and your SLI needs to reflect that unit, not force-fit an HTTP mental model onto it.

```python
# Request-based: fine for APIs, meaningless for a batch job
sli = good_requests / valid_requests

# Window-based: fits a job that has no per-request boundary
def window_is_good(window):
    return window.lag_seconds < 300 and window.records_failed == 0

sli = sum(window_is_good(w) for w in windows) / len(windows)
```

## The Percentile Trap

The single most common bug in hand-rolled SLIs: averaging percentiles across instances or time buckets as if they were regular numbers. p95 latency of 200ms on host A and 200ms on host B does not average to a fleet-wide p95 of 200ms — percentiles don't compose that way, and taking `avg(p95_a, p95_b, p95_c)` will silently understate your actual tail latency, sometimes by a lot.

```promql
# Wrong: averaging pre-computed percentiles across instances
avg(histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])))

# Right: aggregate the raw histogram buckets first, then take the quantile once
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)
```

The fix is to aggregate the underlying histogram buckets across the fleet first, and compute the percentile exactly once, on the combined distribution. It's a one-line change in PromQL and it changes the number you get. If your SLI is "p95 latency under 300ms," and it's built the wrong way, you can be failing your real users while the dashboard insists you're comfortably within budget.

## Pick the SLI at the Boundary the User Actually Crosses

The other recurring mistake is measuring success where it's *convenient* to measure instead of where the user experiences it. A load balancer 200 doesn't mean the request succeeded — it might mean your API returned a 200 with an empty payload because a downstream dependency silently degraded. At Cubet, we had an SLI on a search endpoint that only checked HTTP status code; a caching bug started returning `200 { "results": [] }` for every query for about four hours before anyone noticed, because from the SLI's point of view, every single request was a success.

The rewrite checked something closer to the actual contract:

```javascript
function isGoodSearchResponse(res, body) {
  if (res.status >= 500) return false;
  if (res.status === 200 && body.results === undefined) return false;
  if (latencyMs(res) > 800) return false;
  return true;
}
```

Not glamorous, but it measures what the caller actually needed, not just whether the server managed to send bytes back.

## A Small, Practical Checklist

Before you wire an SLI into anything that pages a human:

- Does "good" match what the user would call good, not just what's cheap to check?
- If it's a percentile, are you aggregating raw distributions before computing it — never averaging pre-computed percentiles?
- Does the measurement boundary sit as close to the real client as you can reasonably get (synthetic checks from inside your own VPC lie more than you'd think)?
- Is the unit (request vs. window) actually the right shape for this workload?

None of this is exotic engineering. It's mostly just refusing to let "the health check is green" stand in for "the thing works," and being suspicious of any metric that got easy specifically because it was easy to compute rather than because it was true.

Go pull up one SLI you actually trust the least, and ask what it would take for it to lie to you without anyone noticing. If you can answer that in under a minute, you've probably already found next quarter's first fix.
