---
title: "🔭 Stop Logging Everything: When to Reach for Metrics, Logs, or Traces"
date: 2026-06-12
excerpt: "Drowning in logs but still blind in production? Metrics, logs, and traces each answer a different question — learn which tool fits which problem before your on-call rotation breaks you."
tags: [observability, metrics, logging, distributed-tracing, backend, opentelemetry, node-js]
featured: true
---

You've got Elasticsearch ingesting 50 GB of logs a day. Your dashboards show a graph of "errors per minute." Your Datadog bill makes the CFO cry. And yet — when production breaks at 2 AM, you're still doing `grep | grep | grep | grep` like it's 2009.

The problem isn't that you're not collecting enough data. It's that you're using the wrong *kind* of data for the wrong *kind* of question.

Metrics, logs, and traces are not interchangeable. They are three different tools that answer three fundamentally different questions. Mix them up and you'll be over-paying, under-observing, and cursing at dashboards that look informative but tell you nothing.

Let me fix that.

---

## The Three Questions

Here's the mental model that finally clicked for me after spending way too long on an incident where we had 40 GB of logs and still couldn't figure out why checkout was slow:

- **Metrics** answer: *Is something wrong?*
- **Logs** answer: *What specifically happened?*
- **Traces** answer: *Why did it happen (and where)?*

They work together. You use metrics to *detect*, logs to *investigate*, and traces to *diagnose*. The mistake most teams make is using logs for all three, which is like using a hammer to tighten a screw, open a bottle of wine, and paint a wall. Technically possible. Practically exhausting.

---

## Metrics: Your Early Warning System

Metrics are numerical measurements sampled over time — request rates, error rates, CPU usage, queue depth, p99 latency. They're cheap to store (you're aggregating, not archiving raw events), cheap to query, and great for dashboards and alerts.

The rule of thumb: if you find yourself writing `SELECT COUNT(*) WHERE status = 500 GROUP BY time` against your log store every 30 seconds to power an alert, you should be emitting that as a metric instead.

```js
// With the OpenTelemetry SDK
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('checkout-service');
const checkoutCounter = meter.createCounter('checkout.attempts', {
  description: 'Number of checkout attempts',
});
const checkoutErrors = meter.createCounter('checkout.errors');
const checkoutDuration = meter.createHistogram('checkout.duration_ms');

async function handleCheckout(req, res) {
  const start = Date.now();
  checkoutCounter.add(1, { region: req.headers['x-region'] });

  try {
    await processCheckout(req.body);
    res.json({ ok: true });
  } catch (err) {
    checkoutErrors.add(1, { error_type: err.constructor.name });
    throw err;
  } finally {
    checkoutDuration.record(Date.now() - start);
  }
}
```

That histogram feeds your p99 dashboard. Those counters trigger your PagerDuty alert. You're not storing "user 4921 tried to checkout at 14:32:07.443 UTC" — you're storing "17 checkouts happened in the last minute, 2 failed." Tiny, fast, queryable.

**Reach for metrics when:** you need trends, rates, percentages, or aggregations. Alerting, SLO burn-rate calculations, capacity planning.

**Don't reach for metrics when:** you need to know *which specific request* failed and why.

---

## Logs: Your Event Ledger

Logs are the receipts. They record that *this specific thing happened* at *this specific time* with *this specific context*. Unlike metrics, they preserve the raw detail — the user ID, the request payload shape, the stack trace, the correlation ID.

The trap is treating logs as a stream-of-consciousness diary. Unstructured log lines like `"Error processing order for user"` are worse than useless — they're noise that trains your brain to ignore the log window. Go structured, always.

```js
import pino from 'pino';

const log = pino({
  level: process.env.LOG_LEVEL || 'info',
});

async function processPayment(orderId, userId, amount) {
  log.info({ orderId, userId, amount }, 'payment.started');

  try {
    const result = await chargeGateway(orderId, amount);
    log.info({ orderId, userId, gatewayTxId: result.txId }, 'payment.succeeded');
    return result;
  } catch (err) {
    // Log the WHY, not just "error occurred"
    log.error({
      orderId,
      userId,
      errorCode: err.code,
      gatewayResponse: err.response?.status,
    }, 'payment.failed');
    throw err;
  }
}
```

Structured JSON logs mean your log aggregator (Loki, CloudWatch, Datadog Logs) can index `orderId` as a field, and you can do `filter orderId = "ord_9921"` in milliseconds instead of grep-scanning 40 GB of text.

**Reach for logs when:** you need the narrative of a specific event — what data was involved, what code path ran, what external call returned. Debugging, auditing, compliance.

**Don't reach for logs when:** you need to spot a trend across thousands of requests. Log cardinality is expensive; that's what metrics are for.

---

## Traces: Your Request Genealogy

Distributed traces are where things get magical — and where most teams give up too early. A trace follows a single request as it hops across services, recording the duration of every span (database call, HTTP request, queue publish) along the way.

At Cubet, we had a Node.js API that would occasionally spike to 8-second responses. Metrics showed p99 latency going red. Logs showed no errors. The trace showed a Redis `SMEMBERS` call taking 6.8 seconds on one specific key that had grown to 120,000 members. Without the trace, we'd have been guessing for hours.

```js
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('order-service');

async function fulfillOrder(orderId) {
  return tracer.startActiveSpan('order.fulfill', async (span) => {
    span.setAttribute('order.id', orderId);

    try {
      const inventory = await tracer.startActiveSpan('inventory.check', async (s) => {
        const result = await checkInventory(orderId);
        s.setAttribute('items.count', result.length);
        s.end();
        return result;
      });

      await notifyWarehouse(orderId, inventory);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
```

This trace, sent to Jaeger or Tempo, gives you a waterfall view: which service called which, how long each hop took, where the bottleneck lives.

**Reach for traces when:** you're debugging latency, tracing failures across service boundaries, or asking "why does this request take 3 seconds when the happy path should be 200ms?"

**Don't reach for traces when:** you just need to know if error rates are elevated. That's a metric.

---

## The Decision Flowchart (Keep It Simple)

```
Something went wrong in production
│
├─ Do I know *what* went wrong? → No → Check metrics dashboards first
│
├─ I know *what* (e.g., payment errors spiked at 14:32) → Search logs for that window
│
└─ I know *what* and *when* but not *where* in the stack → Pull the trace for a failed request
```

You almost always move top-to-bottom. Metrics alert you. Logs give you the event. Traces show you the path.

---

## The Practical Takeaway

You don't need to choose one. You need all three, but you need to stop misusing them:

- Stop logging per-request metrics — emit a counter instead.
- Stop trying to reconstruct request flows from logs — instrument a trace.
- Stop writing string-concatenated log messages — log structured JSON.

OpenTelemetry has a single SDK that handles all three signals with one instrumentation pass. If you're not using it yet, that's your weekend project.

Your on-call rotation will thank you. Your Elasticsearch bill might not — but that's a different blog post.

---

*What's your current observability stack? Are you still on "logs only" or have you made the jump to traces? Drop a comment or find me on [Twitter/X](https://x.com/anuragh27crony).*
