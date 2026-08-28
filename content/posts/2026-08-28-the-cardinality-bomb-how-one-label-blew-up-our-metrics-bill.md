---
title: "📊 The Cardinality Bomb: How One Label Blew Up Our Metrics Bill"
date: "2026-08-28"
excerpt: "A single well-meaning Prometheus label turned our dashboards into a slideshow and our metrics bill into a horror movie. Here's what cardinality explosions actually are, why they sneak past code review, and how to defuse them before they detonate."
tags: ["observability", "backend", "nodejs", "monitoring", "prometheus"]
featured: true
---

Somewhere in every backend engineer's career, there's a moment where a dashboard that used to load in half a second starts taking eleven. Then it starts timing out. Then someone from finance emails asking why the observability bill tripled in a month.

Welcome to the cardinality bomb — one of the quietest, most self-inflicted disasters in backend engineering. Nobody deploys it on purpose. It's just a label. A tiny, innocent, "this'll help us debug faster" label. And then it eats your metrics database alive.

## What "Cardinality" Actually Means

Every time-series metrics system — Prometheus, Datadog, InfluxDB, whatever — stores a metric as the combination of its name **and** every unique set of label values attached to it. Cardinality is the number of unique combinations.

```
http_requests_total{method="GET", status="200", route="/users"}
```

That's one time series. Add a label, and you don't add "a bit more data" — you **multiply** your series count by however many unique values that label can take.

```
http_requests_total{method="GET", status="200", route="/users", user_id="48213"}
```

Congratulations, you just went from a handful of series to potentially one per user, forever, growing every single day someone signs up. This is the trap: it looks like you're adding detail. What you're actually doing is exploding the state space your metrics backend has to index, store, and query.

## The Incident (You Know the One)

At Cubet, we once had a Node.js/Express service instrumented with `prom-client`, and someone — reasonably, in isolation — added the raw request path as a label to catch slow endpoints faster:

```js
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      path: req.originalUrl, // <- the bomb
      status_code: res.statusCode,
    });
  });
  next();
});
```

Looks harmless. Except `req.originalUrl` includes the actual resource ID: `/orders/48213`, `/orders/48214`, `/orders/48215`... Every order, every user, every cart — each one mints a brand-new time series that lives forever in the TSDB. Multiply by `method` and `status_code`, and Prometheus's in-memory index went from tens of thousands of series to several million within a couple of weeks. Query latency on Grafana dashboards crawled, `prometheus` itself started getting OOM-killed on scrape, and nobody suspected the metrics layer first — because who thinks to blame the thing that's supposed to tell you what's wrong?

## The Fix: Templates, Not Values

The rule of thumb: **labels are for things with a small, bounded set of possible values.** Route *templates*, not raw paths. HTTP methods, not query strings. Status code buckets, not exact response bodies.

```js
app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      // req.route.path is the Express *pattern*, e.g. "/orders/:id"
      path: req.route ? req.route.path : 'unmatched',
      status_code: res.statusCode,
    });
  });
  next();
});
```

`/orders/:id` is one time series no matter how many orders exist. If you genuinely need to debug a specific slow request, that's what **traces and structured logs** are for — high-cardinality data belongs in a system designed to index it per-request, not in a metrics engine designed to aggregate over time.

## A Rough Mental Model

If a label has `N` possible values and another has `M`, your series count for that metric is proportional to `N × M × (every other label's cardinality)`. Two "small" labels with 50 values each and a `user_id` label with 100,000 values doesn't give you 100,150 series — it gives you up to `50 × 50 × 100,000` = 250 million. Cardinality multiplies, it doesn't add, and that's exactly why it sneaks past a quick glance in code review: each label looks small in isolation.

## Guardrails Worth Setting Up

1. **Lint your metric names before merge.** Tools like `promtool check metrics` or a simple regex CI check catching `req.path`, `req.originalUrl`, `req.query`, `email`, `user_id` near `.labels(` calls catches most of these before they ship.
2. **Set a cardinality budget per metric** and alert on it. Prometheus exposes `prometheus_tsdb_symbol_table_size_bytes` and per-metric series counts via `count by (__name__)({__name__=~".+"})` — graph that, not just your business metrics.
3. **Push high-cardinality identifiers to traces, not metrics.** OpenTelemetry spans and structured logs are built to hold a `user_id` or `request_id`; a Prometheus label is not.
4. **Review label additions like schema migrations**, because that's effectively what they are — an irreversible, ever-growing dataset with no TTL by default.

Cardinality explosions are almost always invisible until they're catastrophic — the metrics system degrades slowly, then all at once, right when you need it most (usually during an incident, because of course it is). The fix costs you nothing more than remembering: labels describe categories, not identities.

Go check your `.labels()` calls right now. I'll wait.
