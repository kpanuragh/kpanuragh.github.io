---
title: "AWS Kinesis: Stop Polling Your Database Like It's 2012 🌊⚡"
date: "2026-03-15"
excerpt: "If you're still using cron jobs or DB polling to handle real-time events, we need to have a serious talk. Kinesis Data Streams changed how I built event-driven backends — here's everything I wish I'd known earlier."
tags: ["aws", "serverless", "kinesis", "streaming", "event-driven"]
featured: true
---

# AWS Kinesis: Stop Polling Your Database Like It's 2012 🌊⚡

**Real talk:** For the first two years of my career, my "real-time" dashboard was a cron job that ran every 30 seconds and hammered the database with `SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL 30 SECONDS`.

My DBA called it "the noise machine." My boss called it "real-time." I called it "a nightmare I created."

Then I discovered AWS Kinesis. And I finally understood what real-time actually means. 😅

## What Even IS Kinesis? 🤔

Think of Kinesis Data Streams like a **river** (hence the water theme — AWS was feeling poetic).

Data flows in one direction. Multiple producers drop data in at the source. Multiple consumers can read from it downstream — independently, at their own pace — without anyone blocking each other.

**The key thing it's NOT:**
- It's not SQS (where a message is consumed and deleted)
- It's not SNS (where you push notifications to subscribers)
- It's not EventBridge (event bus for loose coupling)

**Kinesis is:** A durable, ordered, replayable stream where multiple consumers can read the SAME data at their OWN pace. That's the killer feature.

```
Producers → [Kinesis Stream] → Consumer A (Analytics)
                             → Consumer B (Real-time Dashboard)
                             → Consumer C (Fraud Detection)
                             → Consumer D (Archiving to S3)
```

One stream. Four consumers. All reading the same events. None blocking each other. **Mind blown.** 🤯

## The Problem That Made Me Switch 😤

In production, I've deployed a serverless e-commerce backend processing thousands of orders per day. Our "real-time" inventory system was... not real-time.

**The old setup:**
```
User places order
  → Lambda writes to RDS
  → Inventory cron runs every 60s
  → Reads all orders from last minute
  → Updates inventory table
  → Dashboard refreshes every 30s
  → "Real-time" latency: up to 90 seconds
```

**The actual consequences:**
- Customer sees "In Stock," places order
- Inventory cron is 70 seconds behind
- Three customers ordered the same last item
- Oversold. Angry emails. Manual refunds. 😭

A serverless pattern that saved us: Replace the cron with a Kinesis stream. Order placed → event published → inventory updated in under **2 seconds**. No more overselling.

## Setting Up a Kinesis Stream ⚙️

Here's the part everyone overthinks. It's honestly not that complicated:

```bash
# Create a stream with 2 shards
aws kinesis create-stream \
  --stream-name order-events \
  --shard-count 2

# Check it's active
aws kinesis describe-stream-summary \
  --stream-name order-events
```

**What's a shard?** Each shard handles up to **1MB/s in** and **2MB/s out**. For most apps, 1-2 shards is plenty. You can scale later.

**Cost reality check:** 2 shards × $0.015/hour × 730 hours = **~$22/month**. For a real-time stream handling millions of events? That's cheap. 💰

## Publishing Events From Lambda 📤

When architecting on AWS, I learned that the producer side should be stupid simple. Just put records on the stream and move on:

```javascript
const { KinesisClient, PutRecordCommand } = require("@aws-sdk/client-kinesis");
const kinesis = new KinesisClient({ region: "us-east-1" });

// In your order handler Lambda
async function publishOrderEvent(order) {
  const event = {
    eventType: "ORDER_PLACED",
    orderId: order.id,
    userId: order.userId,
    items: order.items,
    total: order.total,
    timestamp: new Date().toISOString()
  };

  await kinesis.send(new PutRecordCommand({
    StreamName: "order-events",
    PartitionKey: order.userId, // Same user = same shard = ordered events!
    Data: Buffer.from(JSON.stringify(event))
  }));
}
```

**The `PartitionKey` is crucial.** Records with the same partition key always go to the same shard, guaranteeing order. Use `userId` or `orderId` — whatever needs to stay in sequence.

## Consuming Events With Lambda 📥

Now the fun part. Wire Lambda directly to your Kinesis stream:

```yaml
# serverless.yml
functions:
  inventoryUpdater:
    handler: handlers/inventory.update
    events:
      - stream:
          type: kinesis
          arn: !GetAtt OrderEventsStream.Arn
          batchSize: 100
          startingPosition: LATEST
          bisectBatchOnFunctionError: true  # CRITICAL - more on this below

  fraudDetector:
    handler: handlers/fraud.detect
    events:
      - stream:
          type: kinesis
          arn: !GetAtt OrderEventsStream.Arn  # Same stream!
          batchSize: 50
          startingPosition: LATEST
```

Two Lambda functions. **Same stream**. Both get every event. Neither blocks the other.

```javascript
// handlers/inventory.js
exports.update = async (event) => {
  const records = event.Records.map(r =>
    JSON.parse(Buffer.from(r.kinesis.data, 'base64').toString())
  );

  for (const record of records) {
    if (record.eventType === 'ORDER_PLACED') {
      await decrementInventory(record.items);
    }
  }
};
```

## The Gotcha That Cost Me 3 Hours 🪤

**`bisectBatchOnFunctionError: true`** — put this in every Kinesis trigger config. Here's why.

Kinesis delivers records in **batches**. If your Lambda throws an error processing batch of 100 records, by default it retries the **entire batch** forever.

One bad record = infinite retry loop = your entire stream blocked. 😱

With `bisectBatchOnFunctionError: true`, it splits the failing batch in half and retries each half separately. Keeps narrowing down until it finds the single bad record, then moves on.

**The day I learned this:** Our fraud detector hit a malformed record at 2 AM. Without bisect, the entire order stream would have been stuck. With bisect, it isolated the bad record, logged it to a dead-letter queue, and kept rolling.

Always add this. Always.

```yaml
# Also set a destination for failed records
destinationConfig:
  onFailure:
    type: sqs
    arn: !GetAtt OrderEventsDeadLetterQueue.Arn
```

## Kinesis vs SQS vs EventBridge: The Real Answer 🥊

The question I get asked most. Here's my honest breakdown:

| Use Case | Use This |
|----------|---------|
| Multiple consumers need the SAME events | **Kinesis** |
| Order matters (user A's events in sequence) | **Kinesis** |
| Need to replay past events (debugging!) | **Kinesis** |
| One consumer, message processed and done | **SQS** |
| Fan-out to different services (loose coupling) | **EventBridge** |
| Real-time analytics / clickstream | **Kinesis** |

**When I built our e-commerce backend:**
- Order events → **Kinesis** (inventory, fraud, analytics, archiving all need them)
- Email notifications → **SQS** (just one consumer, processed and done)
- Service-to-service decoupling → **EventBridge**

They're not competitors. They're tools for different jobs. 🛠️

## The Replay Superpower 🔄

Here's the Kinesis feature that made my team love me:

Kinesis retains data for **24 hours by default** (up to 7 days with extended retention). That means when something goes wrong, you can **replay events from the past**.

```bash
# Get the shard iterator for 2 hours ago
aws kinesis get-shard-iterator \
  --stream-name order-events \
  --shard-id shardId-000000000000 \
  --shard-iterator-type AT_TIMESTAMP \
  --timestamp "2026-03-15T10:00:00Z"
```

**Real scenario:** Our inventory Lambda had a bug that miscalculated stock levels for 3 hours. After fixing the bug, I replayed the Kinesis stream from before the bug window. Inventory recalculated correctly. No manual DB fixes. No data loss.

Try doing THAT with SQS. Hint: you can't. Once SQS messages are consumed, they're gone forever.

## Cost Optimization Tips 💸

**Don't pay for what you don't need:**

1. **Start with 1 shard.** You can scale up anytime. 1 shard = 1MB/s in = handles ~1000 small events/second.

2. **Enable Enhanced Fan-Out only if needed.** Standard consumers share 2MB/s per shard. Enhanced Fan-Out gives each consumer 2MB/s dedicated — but costs extra ($0.015/shard-hour extra). Only worth it if you have 5+ consumers competing.

3. **Compress your records.** JSON is verbose. Gzip your payloads before putting them on the stream. Our payload sizes dropped by 70%.

```javascript
const zlib = require('zlib');

const compressed = zlib.gzipSync(JSON.stringify(event));

await kinesis.send(new PutRecordCommand({
  StreamName: "order-events",
  PartitionKey: order.userId,
  Data: compressed  // 70% smaller!
}));
```

4. **Use PutRecords (batch) instead of PutRecord.** Single API call for up to 500 records. Dramatically reduces API costs at scale.

## Common Mistakes I Made So You Don't Have To 🤦

**Mistake #1: Using Kinesis for simple task queues.**
If one Lambda processes an event and nobody else needs it → SQS is cheaper and simpler. Kinesis shines when multiple consumers need the same stream.

**Mistake #2: Tiny shard count, massive records.**
Each record can be up to 1MB. If your records are 900KB average and you have 1 shard (1MB/s), you're limited to ~1 record/second. Either shrink the records or add shards.

**Mistake #3: Ignoring sequence numbers.**
Kinesis records include sequence numbers. For exactly-once processing, track which sequence numbers you've processed in DynamoDB. Kinesis guarantees at-least-once delivery — duplicates can happen on Lambda retry.

**Mistake #4: Not testing with extended retention.**
The replay feature is useless if your consumers crash on old record formats. Add version fields to every event schema from day one.

## TL;DR — Is Kinesis Worth It? ✅

For our e-commerce backend, absolutely yes:

- **Real-time inventory:** 90-second lag → 2-second lag
- **Debugging:** Can replay any event from the last 7 days
- **Multiple consumers:** 4 Lambda functions reading same stream without coordination
- **Cost:** ~$25/month for a stream handling 500K+ events/day

**When to reach for Kinesis:**
- You have multiple consumers needing the same event data
- Event ordering matters
- You want the ability to replay historical data
- You're building real-time analytics or dashboards

**When NOT to bother:**
- Simple job queue with one consumer (use SQS)
- One-off service triggers (use EventBridge)
- Low volume, infrequent events (overkill)

The moment I stopped treating everything like a database problem and started thinking in streams, my architectures got simpler, faster, and more resilient.

Stop polling. Start streaming. Your DBA will send you a thank-you note. 🌊

---

**Built something cool with Kinesis?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love swapping real-time architecture war stories!

**More AWS deep-dives on my [GitHub](https://github.com/kpanuragh).** I regularly push serverless experiments and architecture patterns.

*Now go build something that's actually real-time!* ⚡🚀

---

**P.S.** Kinesis Firehose is the "lazy cousin" of Kinesis Data Streams — it automatically delivers data to S3/Redshift/OpenSearch without writing consumer code. If you just want to archive events to S3, skip Data Streams and go straight to Firehose. You're welcome. 😏
