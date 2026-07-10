---
title: "❄️ Lambda Cold Starts: The Real Impact Nobody Puts in the Slide Deck"
date: "2026-07-10"
excerpt: "Everyone quotes the p50 latency for their Lambda and calls it a day. Nobody quotes the p99.9, the retry storms it causes downstream, or the line item on the bill that says provisioned concurrency. Let's talk about what cold starts actually cost."
tags:
  - aws
  - lambda
  - serverless
  - cost-engineering
  - devops
featured: true
---

Every serverless conference talk has the same slide: a beautiful bar chart showing Lambda invocation latency, p50 hovering around 20ms, looking snappy and cheap and infinitely scalable. What that slide never shows is the p99.9, the one where a request lands on a cold container, has to unzip your 180MB deployment package, boot a JVM (if you made that mistake), initialize a database connection pool, and *then* run your handler. That's not 20ms. That's 4-8 seconds, sometimes worse, and it happens exactly when your traffic is spiking — which is exactly when you can least afford it.

Cold starts aren't a rounding error. They're a tail-latency tax that compounds into retries, timeouts, and cascading failures in ways most cost dashboards never surface.

## Why "average latency looks fine" is a trap

Here's the thing about averages: they hide the shape of the distribution. If 99% of your invocations run in 20ms and 1% take 6 seconds, your average might still look like "40ms, no big deal." But that 1% isn't random — it clusters. It clusters right after a deploy. It clusters right after a scaling event. It clusters right when an upstream retry storm just doubled your concurrency and AWS is spinning up fresh execution environments to keep up.

At Cubet, we had a Lambda-backed webhook processor that looked perfectly healthy in the dashboard — p50 under 30ms, error rate near zero. Then a partner integration started retrying failed webhooks aggressively (three retries, 2-second backoff), and every retry that hit a cold start took long enough to trigger *their* timeout, which triggered *another* retry, which spun up *more* cold containers. We weren't debugging a Lambda problem anymore, we were debugging a self-inflicted DDoS caused by our own cold start tail hitting somebody else's retry logic.

## Where the time actually goes

Cold start time isn't one number, it's a pipeline, and each stage has a different lever:

1. **Init phase** — downloading and unpacking your deployment package or container image. Bigger package, slower init. This is why a 250MB Lambda zip full of unused `node_modules` is quietly expensive in ways your bill doesn't show.
2. **Runtime bootstrap** — spinning up the language runtime. This is where Java and .NET pay the heaviest tax; Node and Python are comparatively cheap; Rust and Go (via custom runtimes) are cheapest.
3. **Your init code** — anything at module scope: SDK clients, DB connections, config fetches from Parameter Store or Secrets Manager. This is the one entirely in your control, and it's the one most teams ignore.

That third one is the easiest win and the most commonly botched:

```javascript
// Bad: re-fetches secrets on every cold start, and blocks the handler
export const handler = async (event) => {
  const dbConfig = await secretsManager.getSecretValue({ SecretId: "prod/db" }).promise();
  const conn = await connect(dbConfig);
  return process(event, conn);
};

// Better: init once per execution environment, reused across warm invocations
let connPromise;
const getConn = () => {
  if (!connPromise) {
    connPromise = secretsManager
      .getSecretValue({ SecretId: "prod/db" })
      .promise()
      .then(connect);
  }
  return connPromise;
};

export const handler = async (event) => {
  const conn = await getConn();
  return process(event, conn);
};
```

Same handler, but now the expensive setup only happens once per cold start instead of once per invocation — and warm invocations skip it entirely.

## The cost trade-off nobody wants to say out loud

AWS's answer to cold starts is provisioned concurrency: pay to keep N execution environments warm at all times, and you dodge the init phase entirely. It works. It also flips your Lambda cost model from "pay per invocation" to "pay for standing capacity," which is the exact bill shape you adopted serverless to escape.

```hcl
resource "aws_lambda_provisioned_concurrency_config" "webhook_processor" {
  function_name                     = aws_lambda_function.webhook_processor.function_name
  provisioned_concurrent_executions = 5
  qualifier                         = aws_lambda_alias.live.name
}
```

Five warm environments running 24/7, whether or not traffic ever arrives, priced like a tiny fleet of always-on EC2 instances hiding inside your "serverless" bill. Nobody covers this in the pitch. The right move isn't "always use provisioned concurrency" — it's sizing it to your actual traffic shape: enough warm capacity to cover your baseline plus predictable spikes (scheduled jobs, known traffic windows), and letting on-demand concurrency absorb the unpredictable overflow. Application Auto Scaling can even schedule provisioned concurrency up before a known traffic window and back down after, so you're not paying for warm containers at 3 a.m. when nothing's happening.

## What actually moves the needle

In rough order of effort-to-impact:

- **Trim your package.** Bundle with esbuild/webpack, tree-shake, ditch the AWS SDK v2 in favor of the smaller v3 modular imports. Smaller package, faster init, every single cold start.
- **Move expensive work out of module scope only when it can't be avoided at cold start** — but never lazy-load things the handler always needs; that just moves the cost to the first invocation instead of removing it.
- **Pick your runtime for tail latency, not developer preference.** If p99.9 truly matters, a chatty Java service with a fat classpath is fighting you the whole way.
- **Provisioned concurrency for known hot paths, on-demand for everything else.** Not a blanket policy — a per-function decision based on actual invocation patterns from CloudWatch.
- **Measure the tail, not the average.** If your dashboards only show p50, you are flying blind on exactly the metric that causes incidents.

Cold starts are the tax you pay for not managing servers. That's a fair trade for a lot of workloads — but only if you actually measure the tail, understand where the milliseconds go, and make a deliberate call about how much you're willing to pay to make them disappear. "It looked fine in the average" is not a postmortem anyone wants to write.

Go pull up your Lambda dashboards, switch every latency graph from average to p99, and see what's actually been hiding back there.
