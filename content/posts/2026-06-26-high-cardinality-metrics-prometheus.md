---
title: "📈 High-Cardinality Metrics: Why Prometheus Is Crying and Your Cloud Bill Isn't"
date: "2026-06-26"
excerpt: "Adding a userId label to your metrics sounds harmless — until Prometheus runs out of memory. Here's what high cardinality actually means, why it kills time-series databases, and how to get useful per-user insights without nuking your infra."
tags:
  - observability
  - prometheus
  - metrics
  - backend
  - distributed-systems
featured: true
---

There's a special kind of engineering pain that starts with good intentions and ends with your monitoring stack eating 40 GB of RAM at 2 AM.

It goes like this: you're adding metrics to your API. You want to track response times. Smart. You add a `user_id` label so you can see which users are experiencing slowdowns. *Very* smart, you think. Two weeks later, Prometheus is OOM-killed, Grafana won't load, and your DevOps lead is staring at you like you personally insulted their family.

Welcome to the high-cardinality problem. Let's talk about what it is, why it hurts, and how to actually fix it.

## What "Cardinality" Actually Means

In the metrics world, **cardinality** is the number of unique time series a metric generates. A time series is uniquely identified by its metric name plus all its label key-value pairs.

A metric with no labels? One time series. Easy.

```
http_requests_total 1042
```

A metric with a `method` label? Maybe 5 time series (GET, POST, PUT, DELETE, PATCH). Still fine.

```
http_requests_total{method="GET"} 800
http_requests_total{method="POST"} 242
```

A metric with a `method` label *and* a `status_code` label? ~25 combinations. Totally manageable.

Now add a `user_id` label to a SaaS app with 50,000 active users.

```
# Don't do this
http_requests_total{method="GET", status_code="200", user_id="usr_a9f3k2"} 12
http_requests_total{method="GET", status_code="200", user_id="usr_b7m1p9"} 7
# ... × 50,000 users × 5 methods × ~10 status codes = 2,500,000 time series
```

That's 2.5 million time series. For one metric. Prometheus stores each series in memory. Your monitoring cluster just became more expensive than your actual product.

## Why Time-Series Databases Hate This

Prometheus, Thanos, VictoriaMetrics — they're all optimized for **low-cardinality, high-frequency data**. The mental model is: a handful of dimensions, lots of samples over time.

High-cardinality labels break this model in two ways:

1. **Memory explosion**: Each unique label combination = a separate time series = chunk of RAM. Prometheus keeps the last two hours of data in memory. Two million series × a few KB each = several GB, just sitting there.

2. **Query performance collapse**: Aggregations like `sum(http_requests_total) by (user_id)` have to scan every series. With millions of them, your Grafana dashboards go from "instant" to "I made coffee and it still isn't loaded."

At Cubet, we hit a version of this when a junior engineer added a `request_id` label (completely unique per request, infinite cardinality) to a latency histogram. The Prometheus instance went from 2 GB to 18 GB RAM in about 6 hours. Request IDs in metrics are the cardinal sin of observability — pun intended.

## The "I Still Need Per-User Insights" Problem

Okay, so you can't use `user_id` in Prometheus labels. But you genuinely need to know when a specific user is having a bad time. What now?

**Option 1: Use logs, not metrics**

Logs handle high-cardinality data naturally. Log the user ID, the latency, the status code — all of it. Then use a log analytics tool (Loki, Elasticsearch, CloudWatch Insights) to query per-user when you need to investigate.

```javascript
// Good: high-cardinality context goes in logs
logger.info('request completed', {
  userId: req.user.id,
  path: req.path,
  latencyMs: Date.now() - req.startTime,
  statusCode: res.statusCode,
});

// Good: aggregate metrics go in Prometheus (low-cardinality labels only)
httpRequestDuration.observe(
  { method: req.method, route: req.route.path, status_code: res.statusCode },
  latencySeconds
);
```

Logs are your per-entity debugger. Metrics are your fleet-level dashboard. They're complementary, not interchangeable.

**Option 2: Pre-aggregate at the application level**

If you need metrics bucketed by something high-cardinality (like user tier, plan type, or region), pre-aggregate before emitting:

```javascript
// Instead of labeling by userId, label by plan tier
const tier = getUserTier(req.user.id); // 'free' | 'pro' | 'enterprise'

httpRequestDuration.observe(
  { method: req.method, route: req.route.path, plan_tier: tier },
  latencySeconds
);
```

Now you have 3 cardinalities instead of 50,000. You can still answer "are enterprise users seeing higher latency than free users?" — which is usually the question you actually wanted answered.

**Option 3: Use exemplars**

This is the elegant solution that most teams haven't discovered yet. Prometheus (since 2.26) supports **exemplars** — you attach a high-cardinality value (like a trace ID or user ID) to a *specific sample* rather than making it a label. The time series stays low-cardinality; the exemplar lets you drill into individual cases.

```javascript
httpRequestDuration.observe(
  { method: req.method, status_code: res.statusCode },
  latencySeconds,
  { traceId: req.traceId } // exemplar — doesn't inflate cardinality
);
```

When you see a P99 spike in Grafana, you click on a data point, grab the trace ID from the exemplar, jump to your tracing tool (Tempo, Jaeger), and find the exact request that caused the spike. High-cardinality debugging, without the cardinality cost.

## A Useful Rule of Thumb

Before adding a label to a metric, ask yourself: **"How many unique values can this label take?"**

| Cardinality | Example | Safe? |
|---|---|---|
| < 10 | HTTP method, environment | ✅ Yes |
| 10–100 | HTTP status codes, service names | ✅ Yes |
| 100–10,000 | Country codes, product categories | ⚠️ Monitor closely |
| > 10,000 | User IDs, request IDs, IP addresses | ❌ Use logs or exemplars |

When in doubt: if it's a noun that grows with your user base, it doesn't belong in a Prometheus label.

## Detecting the Problem Before It Bites You

Most teams find out about high-cardinality metrics when Prometheus falls over. Don't be that team. Add a self-monitoring alert:

```yaml
# Alert when any metric has more than 100k active series
- alert: HighCardinalityMetric
  expr: |
    topk(10, count by (__name__)({__name__=~".+"})) > 100000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "High cardinality detected on {{ $labels.__name__ }}"
```

Also check `prometheus_tsdb_head_series` — if it's trending upward without a corresponding growth in your infrastructure, something is generating unbounded series.

## The Bottom Line

High-cardinality metrics are one of those problems that feel completely fine until they suddenly don't. The fix isn't sophisticated — it's mostly discipline about *what kind of data goes where*:

- **Metrics** for fleet-wide aggregates with bounded label sets
- **Logs** for per-entity, high-cardinality context
- **Exemplars** for bridging between the two

The observability stack is only as useful as its ability to answer questions under pressure. A Prometheus instance that's OOM-killed at midnight answers nothing.

Check your label cardinalities this week. You might find a `request_id` lurking in there, quietly plotting against you.

---

*Running Prometheus in production and want to audit your highest-cardinality metrics? Try `sort_desc(count by (__name__)({__name__=~".+"}))` in your Prometheus UI — it'll rank every metric by series count. The results are occasionally terrifying.*
