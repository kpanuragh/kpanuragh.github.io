---
title: "🥶 Lambda Cold Starts: Stop Pretending They Don't Matter"
date: "2026-06-12"
excerpt: "Cold starts aren't just a benchmark footnote — they're real latency spikes that hit your users at the worst moments. Here's what actually causes them, how to measure them honestly, and the mitigation strategies worth reaching for."
tags:
  - serverless
  - aws-lambda
  - cloud-cost
  - performance
  - devops
featured: true
---

Lambda cold starts are the serverless equivalent of that one colleague who takes 45 seconds to respond to a Slack message — perfectly fine most of the time, until it's a customer on the phone and everyone's watching the spinner.

I've seen teams dismiss cold starts with "our p50 looks fine" and then get paged at 2 AM because the checkout flow just added four seconds of latency for a spike of new users. The p50 was fine. The p99 was not. Let's talk about what's actually happening and what you can do about it that isn't "just keep the function warm with a cron job."

## What a Cold Start Actually Is

When Lambda needs to run your function and there's no warm execution environment sitting idle, it has to:

1. Provision a microVM (Firecracker, under the hood)
2. Download and mount your deployment package
3. Start the language runtime (JVM, Python interpreter, Node.js, etc.)
4. Run your initialization code — the stuff outside the handler

That last point is where most teams leave performance on the table. Everything at module level runs during init, not during handler execution. If you're connecting to a database, loading a large config file, or initializing an SDK client at the top of your file — that's all cold start cost.

Here's a typical Node.js Lambda that's quietly making cold starts worse:

```javascript
// Runs at init time — every cold start pays this cost
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SecretsManagerClient } from "@aws-sdk/client-secretsmanager";
import { loadConfig } from "./config"; // reads 3 files from disk

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });
const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION });
const config = loadConfig(); // synchronous file I/O at import time

export const handler = async (event) => {
  // actual work here
};
```

Every import of a heavyweight SDK, every synchronous I/O call, every eager initialization adds to your cold start. And with Lambda's billing granularity, you're not even paying for this time — but your users are feeling it.

## The Numbers People Don't Show You

Average cold start by runtime (rough ballpark, varies by memory and package size):

| Runtime | Typical Cold Start |
|---|---|
| Python 3.12 | 200–400ms |
| Node.js 20 | 250–500ms |
| Java 21 (no SnapStart) | 2,000–8,000ms |
| Java 21 (SnapStart enabled) | 200–500ms |
| Go (custom runtime) | 50–150ms |
| .NET 8 | 500–1,500ms |

Java without SnapStart is genuinely painful for user-facing workloads. We were using a Java Lambda for a payment callback processor at Cubet — not user-facing, but SLA-bound — and cold starts were blowing through our SLO about twice a week during deployment windows when all environments recycled simultaneously.

The fix wasn't provisioned concurrency (expensive) or switching runtimes (rewrite). It was enabling SnapStart and restructuring initialization code. Cold starts dropped from ~6 seconds to ~400ms. Same code, same functionality.

## Actually Measuring Cold Starts

CloudWatch gives you duration metrics but doesn't separate cold from warm invocations by default. You need to either:

**Option 1: Lambda Insights** — Enable Enhanced Monitoring and filter on the `init_duration` metric. This is the cleanest approach.

**Option 2: Log-based detection** — Lambda logs a REPORT line after every invocation. Cold starts include an `Init Duration` field:

```
REPORT RequestId: abc-123 Duration: 245.67 ms Billed Duration: 246 ms
Memory Size: 512 MB Max Memory Used: 89 MB Init Duration: 4821.34 ms
```

You can run a CloudWatch Insights query to find your real cold start rate:

```sql
fields @timestamp, @duration, @initDuration
| filter ispresent(@initDuration)
| stats 
    count() as coldStarts,
    avg(@initDuration) as avgColdStart,
    pct(@initDuration, 99) as p99ColdStart
| sort @timestamp desc
```

The `ispresent(@initDuration)` filter is the key — it only matches cold start invocations. Run this before and after any optimization work. If your dashboard doesn't show `@initDuration` separately, you're flying blind.

## Mitigations Worth Considering (and One That Isn't)

### Provisioned Concurrency — Use Sparingly

Provisioned concurrency keeps N execution environments warm, eliminating cold starts for that capacity. But it's expensive: you pay for those environments whether they're handling traffic or not. It makes sense for:

- Functions on the critical user path (login, checkout)
- Predictable traffic patterns where you can auto-scale provisioned concurrency on a schedule
- Java functions where cold starts are measured in seconds, not milliseconds

It does **not** make sense as a blanket "fix cold starts everywhere" tool. I've seen teams burn $800/month keeping 10 concurrent environments warm for a function that handles 50 requests/day.

### Keep-Warm Cron Pings — Don't Bother

You've seen this pattern: an EventBridge rule that pings your Lambda every 5 minutes to keep it warm. It's clever until you realize:

- Lambda scales horizontally — pinging one instance doesn't warm the others
- AWS can still recycle environments even with recent invocations
- You're adding complexity to fight something that provisioned concurrency handles properly

Save yourself the false confidence.

### Lazy Initialization — Do This First

Before reaching for provisioned concurrency, restructure your init code:

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Create client once but defer any I/O
let dynamo: DynamoDBClient | null = null;
let config: Config | null = null;

function getClient() {
  if (!dynamo) {
    dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
  }
  return dynamo;
}

async function getConfig() {
  if (!config) {
    config = await loadConfigFromParameterStore(); // async, lazy
  }
  return config;
}

export const handler = async (event) => {
  const client = getClient();       // fast — just returns existing instance
  const cfg = await getConfig();    // warm invocations: returns cached value
  // actual work
};
```

Warm invocations return cached values instantly. Cold start still pays the initialization cost on first use, but you've moved it out of the critical import path. Combine this with reducing your deployment package size (tree-shake, avoid bundling unused SDK clients) and you can often cut cold starts by 30–50% before spending a dollar on provisioned concurrency.

### Lambda SnapStart (Java)

If you're on Java and suffering 5–8 second cold starts, enable SnapStart. AWS takes a snapshot of your initialized execution environment and restores from it. The main caveat: your init code can't hold state that breaks when restored from a snapshot (open network connections, randomness seeded at init time). The [Lambda SnapStart docs](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html) list the gotchas.

## The Cost Angle

Here's what's easy to miss: cold starts are a cost lever, not just a latency concern. Functions with high cold start rates waste billed duration on initialization. If your p99 cold start is 4 seconds and you're paying for that billed duration, that's real money on high-volume functions.

Calculate your cold start tax: `(cold start count × avg init duration ms) / 1000 × GB-seconds rate`. On a busy function, this can be a surprisingly large percentage of your Lambda bill.

## The Honest Answer

Cold starts are a genuine tradeoff of the serverless model. You get scale-to-zero and no idle cost — in exchange, you sometimes make your users wait. The mistake is pretending the tradeoff doesn't exist or papering over it with keep-warm pings.

Measure your actual cold start rate and p99 init duration. Optimize your init code and package size first. Apply provisioned concurrency surgically to the functions that actually hurt users. For Java, enable SnapStart and stop suffering.

The functions that matter most to your users deserve the same performance engineering attention you'd give any other part of the stack.

---

*Checked your Lambda cold start rate recently? The CloudWatch Insights query above takes two minutes to run. You might be surprised what's lurking in your p99.*
