---
title: "AWS SQS: Stop Building Fake Queues and Use the Real Thing 📬⚡"
date: "2026-02-28"
excerpt: "I once built a 'message queue' using a DynamoDB table, a cron job, and a lot of prayers. It worked until it didn't. Then I discovered SQS and felt both relieved and deeply embarrassed. Here's everything you need to know to stop reinventing the queue."
tags: ["aws", "serverless", "sqs", "cloud"]
featured: true
---

# AWS SQS: Stop Building Fake Queues and Use the Real Thing 📬⚡

**Hot take:** If you've ever used a database table as a message queue, congratulations — you've reinvented SQS, but worse, at greater cost, with more bugs, and without dead letter queues. I speak from experience. 😬

In production, I've deployed an e-commerce backend where the original "queue" was a `jobs` table in RDS. A cron Lambda ran every 30 seconds, scanned for `status = 'pending'` rows, processed them, and updated them to `status = 'done'`. Simple! Elegant! Completely wrong!

We discovered the hard way that two Lambda instances could pick up the same job simultaneously. One customer got charged twice. The post-mortem was not fun. I found AWS SQS the next morning and the table was gone by afternoon.

## What Is SQS and Why Should You Care? 📨

SQS (Simple Queue Service) is AWS's fully managed message queuing service. You put a message in, something else reads it and processes it, done.

The magic isn't in what it does — it's in what it handles *for you*:

- **At-least-once delivery** — messages survive infrastructure failures
- **Visibility timeouts** — messages are "hidden" while being processed (no double-processing)
- **Dead Letter Queues** — failed messages go somewhere you can inspect, not nowhere
- **Unlimited scale** — from 1 message/day to millions/second, same service
- **$0.40 per million messages** — and the first million are free every month

That last point is important. SQS is almost free at normal scale.

## The Architecture That Changed Everything 🏗️

Here's the before/after of our order processing backend:

**Before (the database-queue abomination):**

```
User places order
  → HTTP request hits API Lambda
    → INSERT INTO jobs (type='process_order', payload=..., status='pending')
      → Cron Lambda runs every 30 seconds
        → SELECT * FROM jobs WHERE status='pending' LIMIT 10
          → Process each job
            → UPDATE jobs SET status='done'
              → Pray no two Lambdas ran simultaneously (they did)
```

**After (SQS + Lambda, the right way):**

```
User places order
  → HTTP request hits API Lambda
    → SQS.sendMessage({ orderId, customerId, items })
      → Lambda triggers automatically when message arrives
        → Processes order
          → Message deleted on success (auto-handled)
            → Message goes to DLQ on repeated failure
              → You get alerted, not surprised
```

**When architecting on AWS, I learned** this is the pattern. HTTP for synchronous responses to users. SQS for everything that can happen asynchronously in the background.

## Standard vs. FIFO: Pick the Right Queue 🎯

This is the first decision you'll make, and it matters.

**Standard Queue (the default):**
- Messages delivered at least once (can be delivered multiple times!)
- Order not guaranteed
- Virtually unlimited throughput
- Cost: $0.40/million messages

**FIFO Queue (First-In, First-Out):**
- Messages delivered exactly once
- Order guaranteed
- 3,000 messages/second max throughput (higher with batching)
- Cost: $0.50/million messages

**My rule of thumb:**

```
Standard:  "Process this order" (idempotency handles duplicates)
FIFO:      "Charge exactly $X, then send exactly one invoice"
```

A serverless pattern that saved us: We used Standard queues for everything that was idempotent (image resizing, analytics events, search index updates) and FIFO only for payment operations. This kept costs 20% lower and removed throughput bottlenecks during flash sales.

## Lambda + SQS: The Power Couple 💑

Setting up Lambda to consume SQS is embarrassingly simple:

```javascript
// Your Lambda handler — SQS calls this automatically
export const handler = async (event) => {
  const records = event.Records; // Array of SQS messages

  for (const record of records) {
    const body = JSON.parse(record.body);

    try {
      await processOrder(body.orderId);
      // Don't delete the message! Lambda does that automatically on success.
    } catch (err) {
      console.error(`Failed to process order ${body.orderId}:`, err);
      throw err; // Rethrow → message becomes visible again → retry
    }
  }
};
```

```yaml
# serverless.yml or SAM template
OrderProcessor:
  Type: AWS::Lambda::Function
  Events:
    SQSTrigger:
      Type: SQS
      Properties:
        Queue: !GetAtt OrderQueue.Arn
        BatchSize: 10          # Process up to 10 messages at once
        MaximumBatchingWindow: 5  # Wait up to 5s to fill batch
```

That's it. AWS handles polling, scaling Lambda concurrency, deleting processed messages, and retrying failures. You write business logic.

## Dead Letter Queues: The Feature You Didn't Know You Needed ☠️📬

This is my favourite SQS feature and the one most people set up last (or never).

A Dead Letter Queue (DLQ) is where messages go after they've failed a certain number of times. Instead of disappearing into the void or causing infinite retry loops, failed messages land in the DLQ where you can:

- Inspect them to find the bug
- Replay them after fixing the issue
- Alert on-call when things go sideways

```json
{
  "QueueName": "order-processing-queue",
  "RedrivePolicy": {
    "deadLetterTargetArn": "arn:aws:sqs:us-east-1:123:order-processing-dlq",
    "maxReceiveCount": 3
  }
}
```

**Translation:** "If a message fails 3 times, send it to the DLQ instead of retrying forever."

**In production, I've deployed** a CloudWatch alarm on DLQ message count. When it goes above 0, our on-call gets paged. Zero DLQ messages = zero silent failures. It's like a smoke detector for your async processing.

```bash
# CloudWatch alarm for DLQ (via AWS CLI)
aws cloudwatch put-metric-alarm \
  --alarm-name "OrderDLQ-NotEmpty" \
  --metric-name NumberOfMessagesSent \
  --namespace AWS/SQS \
  --dimensions Name=QueueName,Value=order-processing-dlq \
  --period 60 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123:on-call-alert
```

## Visibility Timeout: The Gotcha That Gets Everyone 🪤

This is the most common SQS mistake I see, including in my own past code.

When a consumer picks up an SQS message, the message becomes **invisible** to other consumers for a period — the **visibility timeout**. If the consumer doesn't delete the message before the timeout expires, the message becomes visible again and another consumer picks it up.

**The gotcha:** The default visibility timeout is 30 seconds. If your Lambda takes longer than 30 seconds to process a message, it will get processed twice.

**The fix:** Set visibility timeout to **6x your Lambda timeout**:

```json
{
  "VisibilityTimeout": 360,
  "MessageRetentionPeriod": 86400
}
```

If your Lambda timeout is 60s, set SQS visibility timeout to 360s. This gives Lambda time to finish before the message becomes visible again.

**Another gotcha:** Lambda's SQS trigger has its own timeout handling. If Lambda itself times out, the message goes back to the queue automatically. This is good! But it means you need idempotency — your processing code should handle the same message appearing twice.

**Idempotency pattern I use:**

```javascript
const processOrder = async (orderId) => {
  // Check if already processed
  const existing = await db.orders.findOne({ orderId, status: 'processed' });
  if (existing) {
    console.log(`Order ${orderId} already processed, skipping`);
    return; // Safe to exit, message will be deleted
  }

  // Process the order...
  await chargeCustomer(orderId);
  await reserveInventory(orderId);
  await markOrderProcessed(orderId);
};
```

## Batch Processing: 10x Throughput, Same Cost 🚀

One of the most underused SQS features is batch sending and batch receiving.

Instead of sending messages one by one:

```javascript
// Inefficient — 10 API calls
for (const item of items) {
  await sqs.sendMessage({ QueueUrl, MessageBody: JSON.stringify(item) });
}
```

Use batch send:

```javascript
// Efficient — 1 API call, same cost, 10x faster
await sqs.sendMessageBatch({
  QueueUrl,
  Entries: items.map((item, i) => ({
    Id: `msg-${i}`,
    MessageBody: JSON.stringify(item)
  }))
});
```

**A serverless pattern that saved us:** During our Black Friday sale, we had 50k orders queued in 2 minutes. Batch sending from the API Lambda kept the processing pipeline smooth. Individual sends would have hit Lambda concurrency limits and caused API timeout errors.

SQS supports batches of up to 10 messages. At $0.40/million, batching means $0.04/million — basically free.

## Cost Reality Check 💰

Let me show you what SQS actually costs for a real e-commerce backend:

```
Orders processed: 500,000/month
Messages per order: ~5 (validate, charge, reserve, ship, notify)
Total messages: 2,500,000/month

SQS cost: 2,500,000 × $0.40/million = $1.00/month

DLQ messages (assume 0.1% failure rate): 2,500 messages = $0.001

Total SQS bill: ~$1.00/month
```

Yes, **one dollar**. For half a million orders processed reliably, with retry logic, DLQs, and zero infrastructure to manage.

Compare this to the database-queue approach:
- RDS read costs for polling: ~$5-10/month in extra queries
- On-call incidents from double-processing bugs: priceless (in the bad way)
- Engineer-hours debugging "why did this order fail silently": very much not free

## Common Mistakes That Will Ruin Your Week 🔥

**Mistake 1: Long polling is off by default**

SQS uses short polling by default — it checks a subset of servers and returns immediately, even if the queue is empty. This burns money.

```json
// Enable long polling — waits up to 20s for messages
{ "ReceiveMessageWaitTimeSeconds": 20 }
```

Long polling reduces empty receives (and costs) by 95%. Lambda triggers handle this automatically, but if you're polling manually, always enable it.

**Mistake 2: Not setting a message retention period**

Default retention is 4 days. Messages older than 4 days are silently deleted. If your DLQ fills up over the weekend and nobody looks at it, messages are gone Monday morning.

Set it to 14 days for anything important. You want enough time to debug and replay.

**Mistake 3: Lambda concurrency without SQS backpressure**

When SQS triggers Lambda, it scales Lambda concurrency aggressively. 10,000 messages in the queue = potentially hundreds of Lambda instances.

If those Lambdas all hit your RDS database, you'll saturate connection pools and crash the database. Been there.

**Fix:** Use Lambda reserved concurrency to limit SQS consumers:

```json
{
  "FunctionName": "order-processor",
  "ReservedConcurrentExecutions": 10
}
```

Or better — use [AWS RDS Proxy](https://aws.amazon.com/rds/proxy/) to handle connection pooling. (Shameless link to my previous post.)

## When to Use SQS vs. Other AWS Services 🤔

SQS isn't always the right tool. Here's my decision guide:

```
Need guaranteed ordering + exactly-once?  → SQS FIFO
High-volume event streaming (analytics)?  → Kinesis Data Streams
Pub/sub fan-out to multiple subscribers?  → SNS (or SNS → SQS)
Complex multi-step workflows?             → Step Functions
Simple decoupling of async work?          → SQS Standard ← YOU ARE HERE
```

The SNS → SQS combo (fan-out pattern) is particularly powerful. One SNS event fans out to multiple SQS queues, each processed by different services. Our "order placed" event triggers: inventory service, email service, analytics service, and fraud detection — all independently, all reliably.

## TL;DR 💡

If you're using a database table as a queue, a cron job as a trigger, or hoping two workers don't pick up the same job — please stop and use SQS.

Here's what you get:

- **At-least-once delivery** — messages don't disappear
- **No double-processing** — visibility timeouts handle this
- **Built-in retries with DLQ** — failed messages go somewhere inspectable
- **Auto-scales with Lambda** — zero infrastructure to manage
- **Basically free** — $1/month for most production workloads

**Start here:**
1. Create an SQS queue (2 minutes in the console)
2. Set up a DLQ and CloudWatch alarm on it
3. Connect it to a Lambda trigger with batch size 10
4. Stop querying your database every 30 seconds for pending jobs

Your database will thank you. Your on-call schedule will thank you. Your future self at 2 AM will definitely thank you. 🙏

---

**Got SQS questions or war stories?** I'm always up for architecture discussions on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — find me there!

**Want to see the full e-commerce serverless backend?** Check [GitHub](https://github.com/kpanuragh) for the complete setup with SQS, DLQs, and Lambda integrations!

*Now go delete that jobs table!* 📬🚀

---

**P.S.** SQS has a free tier: 1 million requests/month free, every month, forever. There is literally no reason to not use it for your side project. Start now. 🆓

**P.P.S.** If you set `MaxReceiveCount: 1` on your DLQ redrive policy, every single transient failure goes straight to the DLQ with no retry. I did this once. Don't do this. Set it to at least 3. Your Lambdas need a second chance sometimes. 😅
