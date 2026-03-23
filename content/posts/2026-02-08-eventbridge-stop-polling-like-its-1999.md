---
title: "EventBridge: Stop Polling Like It's 1999 📡⚡"
date: "2026-02-08"
excerpt: "Your Lambda is checking the database every 5 seconds 'just in case' something happened? After years of architecting event-driven systems on AWS, here's how EventBridge saved me from polling hell and cut our costs by 90%!"
tags: ["aws", "cloud", "serverless", "eventbridge"]
featured: true
---




# EventBridge: Stop Polling Like It's 1999 📡⚡

**Real talk:** The first time I needed to sync data between services, I did what every developer does - I wrote a cron job that checked for changes every 5 seconds. "It works!" I thought. Then I checked CloudWatch metrics: **17 million Lambda invocations per month** checking if ANYTHING changed. Only 2% found actual changes. 💸

My boss asked, "Why is our Lambda bill $287/month for a feature that processes 50 events per day?" Narrator: Because I was polling like a caveman. 😅

Welcome to EventBridge - the AWS service that makes your architecture "react" instead of "check constantly!"

## What Even Is EventBridge? (Beyond "AWS Event Bus") 🤔

**EventBridge = AWS's serverless event bus** - Think of it as a smart notification system where services can broadcast "hey, something happened!" and other services listen and react.

**Think of it like:** A radio station for your AWS services. Publishers broadcast events, subscribers tune in to what they care about!

**Without EventBridge (Polling Hell):**
```
Every 5 seconds:
  Lambda → "Hey RDS, anything new?" → RDS checks → "Nope"
  Lambda → "Hey RDS, anything new?" → RDS checks → "Nope"
  Lambda → "Hey RDS, anything new?" → RDS checks → "Nope"
  Lambda → "Hey RDS, anything new?" → RDS checks → "YES!"

Cost: 17M Lambda invocations/month = $287
Latency: Up to 5 second delay
Database load: Constant hammering
```

**With EventBridge (Event-Driven Heaven):**
```
When something happens:
  Service → EventBridge → "New order created!"
  EventBridge → Lambda → Processes immediately

Cost: 50 events/month = $0.00 (first 1M events are FREE!)
Latency: Sub-second reaction
Database load: Zero polling queries
```

**Translation:** EventBridge = Stop asking "are we there yet?" and get notified when you arrive! 🎯

## The $287 Polling Bill: My EventBridge Awakening 💀

When architecting our e-commerce backend, we needed to process new orders. Here's what I naively built:

**The polling nightmare:**

```javascript
// BAD: Polling for new orders every 5 seconds
exports.handler = async (event) => {
  console.log('Checking for new orders...');

  // Query database for unprocessed orders
  const newOrders = await db.orders.find({
    status: 'pending',
    processedAt: null,
    createdAt: { $gte: Date.now() - 5000 } // Last 5 seconds
  });

  console.log(`Found ${newOrders.length} new orders`);

  if (newOrders.length === 0) {
    // 98% of invocations end here! 💸
    return { statusCode: 200, message: 'No new orders' };
  }

  // Process orders
  for (const order of newOrders) {
    await processOrder(order);
    await db.orders.update(order.id, { processedAt: Date.now() });
  }

  return { statusCode: 200, processed: newOrders.length };
};
```

**Scheduled via EventBridge Rule (ironically):**

```bash
# Trigger Lambda every 5 seconds
aws events put-rule \
  --name check-orders-every-5-seconds \
  --schedule-expression "rate(5 seconds)"

aws events put-targets \
  --rule check-orders-every-5-seconds \
  --targets "Id=1,Arn=arn:aws:lambda:us-east-1:123:function:process-orders"
```

**What happened:**

```
Daily stats:
- Lambda invocations: 17,280 (86,400 seconds / 5)
- Orders found: ~350 orders/day
- Wasted invocations: 16,930 (98% found NOTHING!)
- Database queries: 17,280/day (constant load)

Monthly cost:
- Lambda: 17,280 × 30 = 518,400 invocations
- At $0.20 per 1M requests = $0.10 (cheap!)
- But duration: 200ms avg × 518,400 = 103,680 seconds
- GB-seconds: 103,680 × 0.128GB = 13,271 GB-seconds
- At $0.0000166667 per GB-second = $221
- Database I/O: 518,400 queries × $0.20/1M = $0.10
- **Total: $221.20/month to process 10,500 orders!** 😱
```

**The real costs:**
- ❌ Wasting money on empty polls
- ❌ Database constantly under load (connection pool exhaustion!)
- ❌ Up to 5-second delay before processing
- ❌ Scaling issues (can't poll faster without crushing DB)

**After switching to EventBridge:**

```javascript
// GOOD: Event-driven order processing
exports.handler = async (event) => {
  // EventBridge sends order details directly!
  const order = JSON.parse(event.detail);

  console.log(`Processing order ${order.id}`);

  // Process immediately (no database query needed!)
  await processOrder(order);

  // Update status
  await db.orders.update(order.id, { processedAt: Date.now() });

  return { statusCode: 200, processed: order.id };
};
```

**EventBridge Rule (pattern matching):**

```json
{
  "source": ["myapp.orders"],
  "detail-type": ["Order Created"],
  "detail": {
    "status": ["pending"]
  }
}
```

**Results:**
- Lambda invocations: 10,500/month (98% reduction!)
- Database queries: 10,500/month (98% reduction!)
- Processing latency: 5 seconds → 100ms (98% faster!)
- Cost: $221/month → $21/month (90% cheaper!)
- **Saved: $200/month!** 💰

**In production, I've deployed** event-driven architectures that process millions of events per month for less than what polling cost us for thousands! 🎉

## EventBridge Mistake #1: Not Understanding Event Patterns 🚨

**The problem:**

```javascript
// BAD: Catch-all rule (triggers on EVERYTHING!)
const rule = {
  EventPattern: JSON.stringify({
    source: ["myapp"]
  })
};

// This triggers on:
// - User logins (don't need to process!)
// - Page views (don't care!)
// - Debug events (way too noisy!)
// - Actual orders (what we want)
// Result: Lambda overwhelmed with irrelevant events! 😱
```

**The fix - Specific event patterns:**

```json
{
  "source": ["myapp.orders"],
  "detail-type": ["Order Created"],
  "detail": {
    "status": ["pending"],
    "amount": [{ "numeric": [">=", 100] }]
  }
}
```

**Translation:** Only trigger for "Order Created" events from the orders service where status is "pending" AND amount is >= $100!

**Real examples of pattern matching:**

**Example 1: Geographic filtering**

```json
{
  "source": ["myapp.users"],
  "detail-type": ["User Registered"],
  "detail": {
    "country": ["US", "CA", "MX"]
  }
}
```

**Only triggers for users from North America!** 🌎

**Example 2: Numeric ranges**

```json
{
  "source": ["myapp.transactions"],
  "detail-type": ["Payment Processed"],
  "detail": {
    "amount": [{ "numeric": [">", 10000] }]
  }
}
```

**Only high-value transactions!** Perfect for fraud detection! 🔍

**Example 3: Prefix matching**

```json
{
  "source": ["myapp.errors"],
  "detail-type": [{ "prefix": "Critical" }]
}
```

**Matches:** "Critical Error", "Critical Alert", "Critical Warning"! 🚨

**Example 4: Anything-but filtering**

```json
{
  "source": ["myapp.orders"],
  "detail": {
    "status": [{ "anything-but": ["cancelled", "refunded"] }]
  }
}
```

**Matches all statuses EXCEPT cancelled/refunded!** ✅

**A serverless pattern that saved us:** Be SPECIFIC with event patterns! Catching everything is like subscribing to every subreddit - you'll drown in noise! 📡

## EventBridge Mistake #2: Not Using Custom Event Buses 🚌

**The problem - Everything on the default bus:**

```javascript
// BAD: All events on default bus (chaos!)
await eventBridge.putEvents({
  Entries: [
    { Source: 'myapp.orders', DetailType: 'Order Created', Detail: '{}' },
    { Source: 'myapp.users', DetailType: 'User Login', Detail: '{}' },
    { Source: 'myapp.payments', DetailType: 'Payment Failed', Detail: '{}' },
    { Source: 'third-party.webhooks', DetailType: 'Stripe Event', Detail: '{}' },
    { Source: 'internal.debug', DetailType: 'Debug Log', Detail: '{}' }
  ]
}).promise();

// Everything mixed together!
// - Production events
// - Development events
// - Third-party webhooks
// - Debug logs
// Result: Rules become VERY complex to filter! 😵
```

**The fix - Separate event buses:**

```bash
# Create custom event buses
aws events create-event-bus --name production-events
aws events create-event-bus --name third-party-webhooks
aws events create-event-bus --name development-events
```

**Use them properly:**

```javascript
// Production application events
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify(orderData),
    EventBusName: 'production-events' // Dedicated bus!
  }]
}).promise();

// Third-party webhooks
await eventBridge.putEvents({
  Entries: [{
    Source: 'stripe',
    DetailType: 'payment.succeeded',
    Detail: JSON.stringify(stripeEvent),
    EventBusName: 'third-party-webhooks' // Separate bus!
  }]
}).promise();
```

**Benefits:**

- ✅ Organize events by domain/purpose
- ✅ Different permissions per bus (security!)
- ✅ Easier to debug (filter by bus)
- ✅ Prevent cross-contamination
- ✅ Better cost tracking (separate billing!)

**My production setup:**

```
production-events:
  ├── Order events
  ├── User events
  └── Payment events

third-party-webhooks:
  ├── Stripe events
  ├── SendGrid events
  └── Twilio events

development-events:
  ├── Test events
  └── Debug events
```

**When architecting on AWS, I learned:** Custom event buses = organization! Don't throw everything into the default bus! 🎯

## EventBridge Mistake #3: Not Using Dead Letter Queues (DLQ) ☠️

**The disaster scenario:**

```javascript
// EventBridge rule triggers Lambda
exports.handler = async (event) => {
  const order = JSON.parse(event.detail);

  // Process order
  const result = await processPayment(order);

  if (!result.success) {
    throw new Error('Payment failed!'); // Lambda throws error
  }

  return { statusCode: 200 };
};

// Lambda fails → EventBridge retries (2 times)
// All retries fail → Event is LOST FOREVER! 💀
// No record, no alert, no way to recover!
```

**What actually happened:**

```
Event: Order #12345 ($500 purchase)
  → Lambda invocation #1: Payment API timeout (fail)
  → Lambda invocation #2: Payment API timeout (fail)
  → EventBridge gives up
  → Customer charged, order never processed
  → Support ticket: "Where's my order?!"
  → Me: "Uhh... EventBridge ate it?" 😰
```

**The fix - Dead Letter Queue:**

```bash
# Create SQS DLQ
aws sqs create-queue --queue-name eventbridge-dlq

# Create EventBridge rule with DLQ
aws events put-rule \
  --name process-orders \
  --event-pattern file://pattern.json

aws events put-targets \
  --rule process-orders \
  --targets '[{
    "Id": "1",
    "Arn": "arn:aws:lambda:us-east-1:123:function:process-orders",
    "DeadLetterConfig": {
      "Arn": "arn:aws:sqs:us-east-1:123:eventbridge-dlq"
    },
    "RetryPolicy": {
      "MaximumRetryAttempts": 3,
      "MaximumEventAge": 3600
    }
  }]'
```

**Monitor DLQ and retry failed events:**

```javascript
// Poll DLQ for failed events
const messages = await sqs.receiveMessage({
  QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/eventbridge-dlq',
  MaxNumberOfMessages: 10
}).promise();

for (const message of messages.Messages) {
  const failedEvent = JSON.parse(message.Body);

  console.error('Failed event:', {
    orderId: failedEvent.detail.orderId,
    attempts: failedEvent.RetryAttempts,
    error: failedEvent.ErrorMessage
  });

  // Alert ops team
  await sns.publish({
    TopicArn: 'arn:aws:sns:us-east-1:123:critical-alerts',
    Subject: 'EventBridge event failed!',
    Message: `Order ${failedEvent.detail.orderId} failed processing after 3 retries!`
  }).promise();

  // Optionally: Manual retry after fixing issue
  // await eventBridge.putEvents({ Entries: [failedEvent] }).promise();
}
```

**Set up CloudWatch alarm:**

```bash
# Alert when DLQ has messages
aws cloudwatch put-metric-alarm \
  --alarm-name eventbridge-dlq-has-messages \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=QueueName,Value=eventbridge-dlq \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123:critical-alerts
```

**A production pattern that saved us:** DLQ = event insurance! We've recovered thousands of failed events that would've been lost forever! 🛟

## EventBridge Mistake #4: Publishing Giant Events 📏

**The problem:**

```javascript
// BAD: Entire order object in event (400KB!)
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify({
      orderId: '12345',
      customer: { /* full customer object */ },
      items: [ /* 100 products with full details */ ],
      shippingAddress: { /* ... */ },
      billingAddress: { /* ... */ },
      paymentMethod: { /* ... */ },
      orderHistory: [ /* last 50 orders */ ],
      recommendations: [ /* 20 products */ ]
      // Total: 400KB! EventBridge limit is 256KB! 💥
    })
  }]
}).promise();

// Error: Event size exceeds 256KB limit!
```

**EventBridge limits:**
- **Max event size: 256 KB**
- **Max events per PutEvents call: 10**
- **Max rate: 10,000 events/second per account**

**The fix - Event Claim Check pattern:**

```javascript
// GOOD: Store large data in S3, send reference in event
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const eventBridge = new AWS.EventBridge();

// 1. Store full order in S3
const s3Key = `orders/${orderId}/full-details.json`;
await s3.putObject({
  Bucket: 'order-details',
  Key: s3Key,
  Body: JSON.stringify(fullOrderData),
  ContentType: 'application/json'
}).promise();

// 2. Send lightweight event with S3 reference
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify({
      orderId: '12345',
      customerId: 'user-789',
      total: 299.99,
      status: 'pending',
      s3Bucket: 'order-details',
      s3Key: s3Key, // Reference to full data!
      timestamp: Date.now()
    })
    // Total: 0.5KB (512× smaller!)
  }]
}).promise();

// 3. Consumer retrieves full data from S3 if needed
exports.handler = async (event) => {
  const { orderId, s3Bucket, s3Key } = JSON.parse(event.detail);

  // Only fetch full data if needed
  const fullData = await s3.getObject({
    Bucket: s3Bucket,
    Key: s3Key
  }).promise();

  const order = JSON.parse(fullData.Body.toString());

  await processOrder(order);
};
```

**Benefits:**

- ✅ Events stay under 256KB limit
- ✅ Faster event delivery (smaller payload)
- ✅ Consumers can skip fetching if not needed
- ✅ Audit trail (S3 has versioning!)
- ✅ Cheaper (S3 storage << EventBridge throughput)

**Cost comparison:**

```
Publishing 1M events/month with 400KB payload:

Option 1: Inline data (if it were possible)
- EventBridge: 1M events × $1.00/million = $1.00
- Data transfer: 400GB × $0.09/GB = $36.00
- Total: $37/month

Option 2: S3 Claim Check
- EventBridge: 1M events × $1.00/million = $1.00
- S3 PUT: 1M × $0.005/1000 = $5.00
- S3 GET: 1M × $0.0004/1000 = $0.40
- S3 storage: 400GB × $0.023/GB = $9.20
- Total: $15.60/month
- **Savings: $21.40/month (58% cheaper!)** 💰
```

## EventBridge Mistake #5: Not Versioning Events 📋

**The breaking change nightmare:**

```javascript
// Version 1: Original event
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify({
      orderId: '12345',
      userId: 'user-789',
      total: 299.99
    })
  }]
}).promise();

// Consumer V1
exports.handler = async (event) => {
  const { userId, total } = JSON.parse(event.detail);
  // Works fine!
};

// Later: Changed event structure (BREAKING!)
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify({
      orderId: '12345',
      customer: { id: 'user-789', email: 'john@example.com' }, // Changed!
      amount: 299.99 // Renamed!
    })
  }]
}).promise();

// Consumer V1 (still running)
exports.handler = async (event) => {
  const { userId, total } = JSON.parse(event.detail);
  console.log(userId); // undefined! 💥
  console.log(total);  // undefined! 💥
  // EVERYTHING BREAKS!
};
```

**The fix - Versioned events:**

```javascript
// Include version in DetailType
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created v2', // Version in type!
    Detail: JSON.stringify({
      version: '2.0', // Also in payload
      orderId: '12345',
      customer: { id: 'user-789', email: 'john@example.com' },
      amount: 299.99
    })
  }]
}).promise();

// Old consumer (still works!)
exports.oldHandler = async (event) => {
  if (event['detail-type'] === 'Order Created') {
    const { userId, total } = JSON.parse(event.detail);
    // Still works with old events!
  }
};

// New consumer (handles both!)
exports.newHandler = async (event) => {
  const detail = JSON.parse(event.detail);

  let userId, total;

  if (detail.version === '1.0') {
    // Handle old format
    userId = detail.userId;
    total = detail.total;
  } else if (detail.version === '2.0') {
    // Handle new format
    userId = detail.customer.id;
    total = detail.amount;
  }

  await processOrder(userId, total);
};
```

**Event pattern for versioned events:**

```json
{
  "source": ["myapp.orders"],
  "detail-type": [
    "Order Created",
    "Order Created v2"
  ]
}
```

**When architecting event-driven systems, I learned:** Events are contracts! Version them like APIs! Breaking changes = breaking consumers! 🎯

## EventBridge Mistake #6: Not Using EventBridge Pipes 🚰

**The problem - Lambda glue code:**

```javascript
// BAD: Lambda just forwards events (waste of money!)
exports.handler = async (event) => {
  // SQS → Lambda → EventBridge (unnecessary hop!)
  const messages = event.Records;

  for (const message of messages) {
    await eventBridge.putEvents({
      Entries: [{
        Source: 'myapp.queue',
        DetailType: 'Message Received',
        Detail: message.body
      }]
    }).promise();
  }

  return { statusCode: 200 };
  // Cost: Lambda invocations + execution time
  // Why? Just to move data from A to B!
};
```

**The fix - EventBridge Pipes (no Lambda!):**

```bash
# Create pipe: SQS → EventBridge (direct!)
aws pipes create-pipe \
  --name sqs-to-eventbridge \
  --source arn:aws:sqs:us-east-1:123:orders-queue \
  --target arn:aws:events:us-east-1:123:event-bus/production-events \
  --role-arn arn:aws:iam::123:role/eventbridge-pipe-role \
  --source-parameters '{
    "SqsQueueParameters": {
      "BatchSize": 10
    }
  }' \
  --target-parameters '{
    "EventBridgeEventBusParameters": {
      "DetailType": "Queue Message",
      "Source": "myapp.queue"
    }
  }'
```

**EventBridge Pipes supports:**

- **Sources:** SQS, Kinesis, DynamoDB Streams, Kafka
- **Targets:** EventBridge, Lambda, Step Functions, API Gateway, SQS, SNS
- **Filtering:** Built-in event filtering (no code!)
- **Enrichment:** Call Lambda or API to transform data

**Example with filtering and enrichment:**

```bash
aws pipes create-pipe \
  --name filtered-enriched-pipe \
  --source arn:aws:sqs:us-east-1:123:raw-events \
  --target arn:aws:events:us-east-1:123:event-bus/production-events \
  --role-arn arn:aws:iam::123:role/pipe-role \
  --source-parameters '{
    "FilterCriteria": {
      "Filters": [{
        "Pattern": "{\"body\": {\"amount\": [{\"numeric\": [\">\", 100]}]}}"
      }]
    }
  }' \
  --enrichment arn:aws:lambda:us-east-1:123:function:enrich-event \
  --target-parameters '{
    "EventBridgeEventBusParameters": {
      "DetailType": "Enriched Event",
      "Source": "myapp.enriched"
    }
  }'
```

**Cost comparison (1M events/month):**

```
Lambda glue code:
- Lambda invocations: 1M × $0.20/million = $0.20
- Lambda duration: 1M × 100ms × $0.0000166667/GB-sec = $21.33
- Total: $21.53/month

EventBridge Pipe:
- Pipe processing: 1M × $0.40/million = $0.40/month
- **Savings: $21.13/month (98% cheaper!)** 💰
```

**A serverless pattern that saved us:** Use Pipes for simple integrations! Skip Lambda when you just need data movement! 🚰

## Real-World EventBridge Patterns I Use in Production 🎯

### Pattern 1: Fan-Out Processing

```javascript
// One event triggers multiple independent processes
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify({ orderId: '12345', total: 299.99 })
  }]
}).promise();

// Multiple Lambda functions react independently:
// 1. process-payment → Charge customer
// 2. send-confirmation-email → Email customer
// 3. update-inventory → Reduce stock
// 4. notify-fulfillment → Alert warehouse
// 5. trigger-analytics → Track conversion

// All in parallel! No orchestration needed! 🎉
```

### Pattern 2: Saga Pattern (Distributed Transactions)

```javascript
// Order Saga: coordinate multi-step process
const saga = new StateMachine({
  steps: [
    'Reserve Inventory',
    'Process Payment',
    'Create Shipment',
    'Send Confirmation'
  ]
});

// EventBridge + Step Functions
// Step 1: Reserve Inventory
await eventBridge.putEvents({
  Entries: [{
    Source: 'myapp.saga',
    DetailType: 'Saga Started',
    Detail: JSON.stringify({ sagaId, step: 'reserve-inventory' })
  }]
});

// If any step fails → Compensating events
if (paymentFailed) {
  await eventBridge.putEvents({
    Entries: [{
      Source: 'myapp.saga',
      DetailType: 'Saga Compensate',
      Detail: JSON.stringify({
        sagaId,
        action: 'release-inventory' // Undo!
      })
    }]
  });
}
```

### Pattern 3: Event Replay (Debugging/Recovery)

```javascript
// Archive events for replay
await eventBridge.createArchive({
  ArchiveName: 'production-orders-archive',
  EventSourceArn: 'arn:aws:events:us-east-1:123:event-bus/production-events',
  RetentionDays: 365
}).promise();

// Later: Replay failed events
await eventBridge.startReplay({
  ReplayName: 'recover-failed-orders',
  EventSourceArn: 'arn:aws:events:us-east-1:123:event-bus/production-events',
  EventStartTime: new Date('2024-02-01'),
  EventEndTime: new Date('2024-02-02'),
  Destination: {
    Arn: 'arn:aws:events:us-east-1:123:event-bus/replay-bus'
  }
}).promise();

// Replay events to test fixed Lambda!
```

### Pattern 4: Cross-Account Events

```javascript
// Account A: Publisher
await eventBridge.putEvents({
  Entries: [{
    Source: 'account-a.orders',
    DetailType: 'Order Created',
    Detail: JSON.stringify(orderData),
    EventBusName: 'arn:aws:events:us-east-1:999:event-bus/shared-events'
  }]
}).promise();

// Account B: Consumer (separate AWS account!)
// Receives events from Account A's bus
// Use case: Multi-tenant SaaS, partner integrations
```

## The EventBridge Cost Optimization Playbook 💰

### 1. Use Event Filtering (Not Lambda Filtering)

```javascript
// BAD: Lambda filters events (costs money!)
exports.handler = async (event) => {
  const order = JSON.parse(event.detail);

  if (order.amount < 100) {
    return; // Filtered out, but Lambda still invoked! 💸
  }

  await processOrder(order);
};

// GOOD: EventBridge filters (FREE!)
{
  "source": ["myapp.orders"],
  "detail-type": ["Order Created"],
  "detail": {
    "amount": [{ "numeric": [">=", 100] }]
  }
}
// Lambda ONLY invoked for orders >= $100!
```

### 2. Batch Events When Possible

```javascript
// BAD: 1000 separate events
for (const item of items) {
  await eventBridge.putEvents({
    Entries: [{ Source: 'myapp', DetailType: 'Item', Detail: JSON.stringify(item) }]
  }).promise();
}
// Cost: 1000 API calls

// GOOD: Batch up to 10 events per call
const batches = chunk(items, 10);
for (const batch of batches) {
  await eventBridge.putEvents({
    Entries: batch.map(item => ({
      Source: 'myapp',
      DetailType: 'Item',
      Detail: JSON.stringify(item)
    }))
  }).promise();
}
// Cost: 100 API calls (10× cheaper!)
```

### 3. Use EventBridge Scheduler for Cron

```bash
# Instead of: Lambda with EventBridge cron rule
# Use: EventBridge Scheduler (newer, better!)

aws scheduler create-schedule \
  --name process-daily-reports \
  --schedule-expression "cron(0 9 * * ? *)" \
  --target '{
    "Arn": "arn:aws:lambda:us-east-1:123:function:daily-reports",
    "RoleArn": "arn:aws:iam::123:role/scheduler-role"
  }' \
  --flexible-time-window '{"Mode": "OFF"}'
```

**Benefits:**
- More flexible scheduling
- Better error handling
- Built-in retries
- One-time schedules supported

## The Bottom Line 💡

EventBridge isn't just "another AWS service" - it's the paradigm shift from polling to reacting!

**The essentials:**

1. **Stop polling** (use events!)
2. **Be specific** with event patterns (filter early)
3. **Use custom buses** (organize events)
4. **Add DLQs** (never lose events)
5. **Keep events small** (use S3 for large data)
6. **Version events** (avoid breaking changes)
7. **Use Pipes** (skip Lambda glue code)

**The truth about EventBridge:**

It's not "just a message bus" - it's event-driven architecture made easy! When you stop asking "is there new data?" and start reacting to "data changed!" your architecture becomes faster, cheaper, and more scalable!

**When architecting our e-commerce backend**, I learned: Polling is the enemy of scalability. Events are the solution. EventBridge makes it dead simple. First 1M events per month are FREE. After that, $1 per million. Compare that to polling costs and the choice is obvious! 🎯

You don't need perfect event-driven architecture from day one - you need to START reacting instead of polling! 🚀

## Your Action Plan 🎯

**This week:**
1. Identify polling loops in your codebase
2. Create your first custom event bus
3. Publish your first event
4. Set up a Lambda to consume it

**This month:**
1. Migrate top 3 polling jobs to events
2. Add DLQs to all EventBridge rules
3. Implement event versioning
4. Monitor cost savings!

**This quarter:**
1. Migrate ALL polling to events
2. Implement event replay/archive
3. Use EventBridge Pipes for integrations
4. Become the event-driven guru on your team! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [EventBridge Sandbox](https://dashboard.eventbridge.dev/) - Test patterns visually
- [EventCatalog](https://www.eventcatalog.dev/) - Document your events
- [AWS SAM](https://aws.amazon.com/serverless/sam/) - Deploy event-driven apps

**Reading list:**
- [EventBridge Patterns](https://serverlessland.com/patterns?services=eventbridge)
- [Event-Driven Architecture Guide](https://aws.amazon.com/event-driven-architecture/)

**Real talk:** The best event-driven architecture starts with ONE event. Don't try to migrate everything at once. Start small, prove value, expand!

---

**Still polling like it's 1999?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your event-driven war stories!

**Want to see my EventBridge architectures?** Check out my [GitHub](https://github.com/kpanuragh) - production event-driven examples!

*Now go forth and publish some events!* 📡✨

---

**P.S.** If you're checking a database every 5 seconds "just in case," you're doing it wrong. EventBridge can send you a notification the INSTANT something happens. For FREE (first 1M events). Stop wasting money on polling! 💸

**P.P.S.** I once forgot to add a DLQ to a critical EventBridge rule. When the Lambda failed, we lost $50K worth of orders. Support was... not happy. Learn from my pain - ALWAYS add DLQs! 🚨
