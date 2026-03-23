---
title: "AWS SQS Dead Letter Queues: When Your Messages Ghost You 👻📨"
date: "2026-03-22"
excerpt: "Your SQS queue has 47,000 messages stuck in a loop, retrying forever, and you have no idea why. After running serverless e-commerce backends on AWS, here's everything I wish I'd known about SQS, visibility timeouts, and the DLQ that saves your sanity!"
tags: ["\\\"aws\\\"", "\\\"serverless\\\"", "\\\"sqs\\\"", "\\\"cloud\\\""]
featured: "true"
---

# AWS SQS Dead Letter Queues: When Your Messages Ghost You 👻📨

**Real talk:** Six months into production, I opened the AWS console at 2 AM to find 47,000 messages stuck in my SQS queue. Same messages. Retrying. Every 30 seconds. For six hours. Eating Lambda invocations like a broken arcade machine eating quarters. 🎰

I had no alert. No logging. No clue what was failing. Just a queue full of zombie messages and a Lambda bill that made me want to cry.

That night I learned SQS the *hard way*. You get to learn it the easy way. You're welcome!

## What Even Is SQS? (Beyond "Message Queue") 🤔

Think of SQS like a to-do list for your backend:

```
User places order → Drop message in SQS queue → Lambda processes it
```

**Why not just call Lambda directly?** Because direct calls are fragile:

- Lambda times out? Message lost forever. 💀
- Lambda errors? No retry. Data gone.
- Traffic spike? Your DB gets hammered all at once.

SQS acts as a buffer. Messages wait patiently. Lambda processes at its own pace. Everyone's happy. Until they're not.

**In production, I've deployed** SQS queues handling 500K+ messages/day for an e-commerce checkout system. Properly configured, they're bulletproof. Misconfigured? They'll haunt you.

## The Visibility Timeout Trap 🕐

This is the gotcha that bit me at 2 AM. Here's what happens when you don't understand it:

```
1. Lambda picks up a message
2. SQS hides the message for [visibility timeout] seconds
3. If Lambda finishes → message deleted ✅
4. If Lambda takes LONGER than timeout → message becomes visible again
5. Another Lambda picks it up → DUPLICATE PROCESSING 😱
6. Repeat forever...
```

**My original (terrible) setup:**

```javascript
// Visibility timeout: 30 seconds (AWS default)
// Lambda timeout: 3 minutes ← THE BUG!

exports.handler = async (event) => {
  for (const record of event.Records) {
    await processOrder(record.body) // Takes 2 minutes on complex orders
    // After 30 seconds: SQS thinks Lambda died!
    // Message goes back to queue
    // Another Lambda picks it up
    // You now process the same order twice 🎉 (not a good 🎉)
  }
}
```

**The fix - always set visibility timeout > Lambda timeout:**

```javascript
// SQS visibility timeout: 6 minutes (6× Lambda timeout is the AWS recommendation)
// Lambda timeout: 1 minute

// In your CloudFormation/CDK/Terraform:
// VisibilityTimeout: 360 (6 minutes)
// Lambda timeout: 60 seconds
```

**The rule I follow now:** `Visibility Timeout = Lambda Timeout × 6`. Never less.

**A serverless pattern that saved us:** If your Lambda does batch processing, set visibility timeout to `(max batch processing time) × 6`. Not your average time. Your *worst case* time. 🎯

## Dead Letter Queues: Your Safety Net 🥅

A Dead Letter Queue (DLQ) is where messages go when they fail too many times. It's like the penalty box in hockey — the message goes there when it keeps causing trouble.

**Without a DLQ:**

```
Message fails → Retried → Fails → Retried → Fails → Retried forever
Cost: ∞ Lambda invocations, ∞ time, you = very sad
```

**With a DLQ:**

```
Message fails 3× → Moved to DLQ → You get alerted → You investigate → You fix it
Cost: 3 Lambda invocations, 1 Slack ping, you = informed engineer
```

**Setting it up:**

```javascript
// AWS CDK (my preferred approach)
import { Queue } from 'aws-cdk-lib/aws-sqs'

// Create the DLQ first
const deadLetterQueue = new Queue(this, 'OrdersDLQ', {
  queueName: 'orders-dlq',
  retentionPeriod: Duration.days(14), // Keep failed messages for 2 weeks
})

// Main queue with DLQ configured
const ordersQueue = new Queue(this, 'OrdersQueue', {
  queueName: 'orders',
  visibilityTimeout: Duration.seconds(360),
  deadLetterQueue: {
    queue: deadLetterQueue,
    maxReceiveCount: 3, // Move to DLQ after 3 failures
  },
})
```

**The `maxReceiveCount` sweet spot:**

```
maxReceiveCount: 1  → Too aggressive! Transient errors go to DLQ immediately
maxReceiveCount: 3  → Good for most cases
maxReceiveCount: 10 → Use for flaky external APIs that need more retries
maxReceiveCount: ∞  → You have no DLQ, congrats on the 2 AM wake-up call
```

## Alerting on Your DLQ (The Part Everyone Skips) 🚨

A DLQ with no alert is like a smoke alarm with no battery. Feels safe. Isn't.

```javascript
// CloudWatch alarm on DLQ depth
import { Alarm, Metric } from 'aws-cdk-lib/aws-cloudwatch'
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions'

new Alarm(this, 'DLQAlarm', {
  alarmName: 'Orders-DLQ-HasMessages',
  metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible(),
  threshold: 1,
  evaluationPeriods: 1,
  alarmDescription: 'Messages landed in DLQ - investigate immediately!',
})
// Hook this to SNS → Slack/PagerDuty and sleep soundly 😴
```

**When architecting on AWS, I learned:** The DLQ alarm is not optional. It's the first thing I set up now, before writing a single line of Lambda code. If you're not alerted when things fail, you don't have a queue — you have a black hole.

## Common SQS Gotchas I've Survived 💥

### Gotcha #1: Partial Batch Failures

```javascript
// BAD: If ONE message fails, ALL 10 get retried
exports.handler = async (event) => {
  for (const record of event.Records) {
    await processOrder(record.body) // One fails → whole batch retried 10 times
  }
}

// GOOD: Report partial failures (Lambda feature since 2021!)
exports.handler = async (event) => {
  const failures = []

  for (const record of event.Records) {
    try {
      await processOrder(record.body)
    } catch (error) {
      console.error(`Failed: ${record.messageId}`, error)
      failures.push({ itemIdentifier: record.messageId })
    }
  }

  // Only failed messages get retried. Others are deleted. 🎯
  return { batchItemFailures: failures }
}
```

**Enable this in your Lambda event source mapping:**

```bash
aws lambda update-event-source-mapping \
  --uuid <your-event-source-mapping-id> \
  --function-response-types ReportBatchItemFailures
```

**My production results:** Reduced unnecessary Lambda retries by 80% on a queue that occasionally got malformed messages.

### Gotcha #2: Forgetting About Message Deduplication

SQS Standard queues deliver messages **at least once**. Emphasis on "at least." Your Lambda *will* process the same message twice sometimes.

```javascript
// BAD: Not idempotent
exports.handler = async (event) => {
  const order = JSON.parse(event.Records[0].body)
  await chargeCustomer(order.customerId, order.amount)
  // Customer charged twice if message delivered twice! 😱
}

// GOOD: Idempotent with deduplication check
exports.handler = async (event) => {
  const order = JSON.parse(event.Records[0].body)
  const messageId = event.Records[0].messageId

  // Check if already processed
  const alreadyProcessed = await dynamodb.get({
    TableName: 'ProcessedMessages',
    Key: { messageId }
  }).promise()

  if (alreadyProcessed.Item) {
    console.log(`Already processed: ${messageId}, skipping`)
    return // Exit cleanly, message will be deleted
  }

  await chargeCustomer(order.customerId, order.amount)

  // Mark as processed (with TTL so table doesn't grow forever!)
  await dynamodb.put({
    TableName: 'ProcessedMessages',
    Item: {
      messageId,
      processedAt: Date.now(),
      expiresAt: Math.floor(Date.now() / 1000) + 86400 // 24h TTL
    }
  }).promise()
}
```

**Alternatively:** Use SQS FIFO queues with `MessageDeduplicationId` — they guarantee exactly-once delivery within a 5-minute window. They cost 10× more, but for payment processing? Worth every penny.

### Gotcha #3: Sending Too Much Data in the Message

**SQS message limit: 256 KB.** Yes, really.

```javascript
// BAD: Trying to stuff an entire order with 500 line items into SQS
await sqs.sendMessage({
  QueueUrl: ordersQueue,
  MessageBody: JSON.stringify(hugeOrder) // 900KB → REJECTED 💀
}).promise()

// GOOD: S3 reference pattern
const orderKey = `orders/${orderId}.json`
await s3.putObject({
  Bucket: 'order-data',
  Key: orderKey,
  Body: JSON.stringify(hugeOrder)
}).promise()

await sqs.sendMessage({
  QueueUrl: ordersQueue,
  MessageBody: JSON.stringify({ orderId, s3Key: orderKey }) // Just 100 bytes ✅
}).promise()

// Lambda reads the full order from S3
exports.handler = async (event) => {
  const { orderId, s3Key } = JSON.parse(event.Records[0].body)
  const order = await s3.getObject({ Bucket: 'order-data', Key: s3Key }).promise()
  await processOrder(JSON.parse(order.Body))
}
```

**A serverless pattern that saved us:** This S3 + SQS combination is called the "Claim Check Pattern." I use it for anything over 50KB. Keeps queues fast and cheap.

## SQS vs SNS vs EventBridge: When to Use What ⚡

I've been asked this in every single architecture review I've been part of:

```
SQS (Queue):
✅ Background job processing (send email, resize image)
✅ Rate limiting (Lambda processes at controlled pace)
✅ You need guaranteed delivery with retries
❌ Multiple consumers need the SAME message

SNS (Pub/Sub):
✅ Fan-out (one event → multiple queues/endpoints)
✅ Notify multiple systems simultaneously
✅ SMS/email notifications
❌ You need retry logic and DLQ

EventBridge (Event Bus):
✅ Complex event routing rules
✅ Cross-account event delivery
✅ SaaS integration (Shopify, Stripe webhooks)
❌ High-throughput, low-latency queuing

The combo I use for e-commerce:
User places order → SNS topic → SQS queues for each service
  ├── inventory-queue (reserve stock)
  ├── payments-queue (charge customer)
  └── notifications-queue (send confirmation email)
```

## The Cost Reality 💰

SQS is almost criminally cheap — until you're doing it wrong.

```
SQS Standard pricing:
- First 1 million requests/month: FREE
- After that: $0.40 per million requests

My e-commerce backend (500K messages/day):
- Messages: 15M/month = $5.60/month
- Lambda processing: $8/month
- DLQ storage (usually empty!): $0
- Total: ~$14/month for reliable async processing
```

**Where costs sneak up:**

```
❌ Polling Lambda with short timeout (each empty receive = 1 request)
✅ Use Long Polling (WaitTimeSeconds: 20) — reduces API calls by 95%!

❌ Processing messages one at a time (10K messages = 10K Lambda invocations)
✅ Use batch size 10 (10K messages = 1K Lambda invocations)
```

**Setting long polling in CDK:**

```javascript
new EventSourceMapping(this, 'OrdersMapping', {
  target: orderProcessorLambda,
  eventSourceArn: ordersQueue.queueArn,
  batchSize: 10,           // Process 10 messages per Lambda
  maxBatchingWindow: Duration.seconds(5), // Wait up to 5s to fill the batch
})
// On the queue itself, set receiveMessageWaitTime: Duration.seconds(20)
```

**My result:** Cut SQS API costs by 92% by switching from short polling + batch size 1 to long polling + batch size 10. Same throughput, 12× fewer Lambda invocations.

## Debugging Stuck Queues Without Losing Your Mind 🔍

When you find 47,000 messages in your queue (not that this ever happened to me), here's the playbook:

**Step 1: Check what's in the DLQ**

```bash
# Peek at failed messages without deleting them
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789/orders-dlq \
  --max-number-of-messages 10 \
  --visibility-timeout 0 \
  | jq '.Messages[].Body' | head -5
```

**Step 2: Check Lambda error logs**

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-processor \
  --start-time $(date -d '1 hour ago' +%s000) \
  --filter-pattern ERROR \
  --query 'events[*].message'
```

**Step 3: Redrive from DLQ back to main queue (once you've fixed the bug!)**

```bash
# AWS Console has a built-in "Start DLQ redrive" button now 🎉
# Or via CLI:
aws sqs start-message-move-task \
  --source-arn arn:aws:sqs:us-east-1:123456789:orders-dlq \
  --destination-arn arn:aws:sqs:us-east-1:123456789:orders
```

**DO NOT redrive without fixing the bug first.** I may have learned this the hard way. Twice.

## The SQS Checklist I Run for Every New Queue ✅

Before I deploy any new queue to production:

1. ☑️ **Visibility timeout** ≥ 6× Lambda timeout
2. ☑️ **DLQ configured** with `maxReceiveCount: 3`
3. ☑️ **DLQ alarm** → fires when any message lands in DLQ
4. ☑️ **Long polling** enabled (`WaitTimeSeconds: 20`)
5. ☑️ **Batch size** ≥ 5 (don't process 1 message at a time!)
6. ☑️ **Partial batch failure** reporting enabled
7. ☑️ **Idempotency** logic in Lambda handler
8. ☑️ **Message size** < 256KB (use S3 Claim Check if bigger)
9. ☑️ **Retention period** set (default 4 days is usually fine)
10. ☑️ **Encrypt at rest** with KMS (for anything sensitive)

Zero of those were checked when I deployed my first SQS queue. Now all 10 are non-negotiable.

## The Bottom Line 💡

SQS is one of the most reliable services AWS offers — and one of the easiest to misconfigure in ways that silently destroy your backend.

**The essentials:**

- Set your visibility timeout properly or prepare for duplicate processing
- A DLQ without an alarm is worse than no DLQ (false sense of security)
- Enable partial batch failure reporting — it's free and saves retries
- Long polling + batching cuts costs dramatically
- Every handler needs idempotency unless you enjoy double-charging customers

**In production, I've deployed** SQS queues that have processed millions of orders over years without a single lost message. The secret isn't some exotic pattern — it's just following the checklist above and treating your DLQ like the canary it is.

SQS doesn't fail. Your configuration fails. Set it up right once and it'll outlast every other component in your stack. 🏆

---

**Got SQS horror stories?** I know you have at least one. Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I collect these like trading cards!

**Want to see production SQS patterns?** Check out my [GitHub](https://github.com/kpanuragh) for real event-driven architecture examples.

*Now go set up that DLQ alarm. Right now. Before you finish reading this sentence.* 👻

---

**P.S.** The 47,000 messages? A malformed JSON payload from a third-party webhook. The fix was three lines of code. The time to diagnose without a DLQ? Six hours. Set. Up. Your. DLQ.

**P.P.S.** SQS FIFO queues preserve order and deduplicate. They also cost 10× more and have lower throughput. Only use them when order genuinely matters — like financial transactions. For "send a welcome email," standard queue is fine! 💸
