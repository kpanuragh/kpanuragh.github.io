---
title: "AWS SNS: Stop Building Your Own Notification System (I Say This Having Built One) 📢⚡"
date: "2026-03-05"
excerpt: "I once built a notification system using cron jobs, a custom email queue, separate SMS API calls, and a Slack webhook I 'temporarily' hardcoded. It worked great until an order confirmation email arrived 4 hours late and a customer's SMS went to someone else. AWS SNS exists. I should have used it."
tags: ["\\\"aws\\\"", "\\\"serverless\\\"", "\\\"sns\\\"", "\\\"cloud\\\""]
featured: "true"
---

# AWS SNS: Stop Building Your Own Notification System (I Say This Having Built One) 📢⚡

**True story:** My first e-commerce backend had four separate notification paths — one for email (SES directly), one for SMS (Twilio, hardcoded in a helper file that absolutely had credentials in it), one for push notifications (Firebase, different helper file, also credentials), and a Slack webhook that was "just for internal alerts" and somehow ended up texting customers' shipping updates.

It was not great.

Then I discovered AWS SNS. Then I was embarrassed. Then I spent a weekend refactoring. Then I never built a custom notification system again.

## What Is SNS and Why Does It Matter? 📣

SNS (Simple Notification Service) is AWS's fully managed pub/sub messaging service. The idea is simple: you publish a message to a **topic**, and every **subscriber** to that topic receives it.

But here's the powerful bit — subscribers can be:

- **Lambda functions** (process the event in your backend)
- **SQS queues** (buffer it for async processing)
- **HTTP/HTTPS endpoints** (webhook to any external service)
- **Email addresses** (literally just send an email)
- **SMS numbers** (text message, directly)
- **Mobile push notifications** (iOS, Android, via Firebase or APNs)

One publish. Many destinations. Zero custom routing code.

**When architecting on AWS, I learned** this is the fundamental shift: instead of your order service knowing about your email service, your inventory service, and your fraud detection service — your order service just says "an order was placed" and everyone who cares gets notified.

## The Fan-Out Pattern That Changed Everything 🌀

The most powerful SNS pattern is **fan-out**: one event triggers many independent actions, all in parallel.

**Our "order placed" flow, before SNS:**

```
Order Lambda:
  → call EmailService.sendConfirmation(order)   // 2s
  → call InventoryService.reserve(items)         // 500ms
  → call FraudService.checkOrder(order)          // 1.5s
  → call AnalyticsService.trackOrder(order)      // 300ms
  → call SlackWebhook.notifyTeam(order)          // 100ms (when it worked)

Total: ~4.4 seconds. Fully sequential. One failure → customer sees 500 error.
```

**After SNS fan-out:**

```
Order Lambda:
  → SNS.publish("order-placed", { orderId, customerId, items })  // ~10ms

SNS fans out simultaneously to:
  → SQS queue → Email Lambda (confirmation)
  → SQS queue → Inventory Lambda (reservation)
  → SQS queue → Fraud Lambda (checks)
  → SQS queue → Analytics Lambda (tracking)
  → Slack webhook (team notification)

Total Lambda response time: ~10ms. Failures are isolated. Order confirmed instantly.
```

**A serverless pattern that saved us:** When our fraud detection service had a 3-minute outage during Black Friday, customers kept checking out normally. Orders were queued in SQS. Fraud checks ran when the service came back. With our old sequential approach, every order during that 3 minutes would have failed.

## Setting It Up: Embarrassingly Simple 🛠️

Creating an SNS topic and publishing:

```javascript
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({ region: "us-east-1" });

// Publish a message to your topic
await sns.send(new PublishCommand({
  TopicArn: "arn:aws:sns:us-east-1:123456789:order-events",
  Subject: "Order Placed",
  Message: JSON.stringify({
    eventType: "ORDER_PLACED",
    orderId: "ord_abc123",
    customerId: "usr_xyz789",
    totalAmount: 129.99,
    items: [{ sku: "WIDGET-1", qty: 2 }]
  })
}));
```

Subscribing a Lambda to the topic (SAM/CloudFormation):

```yaml
OrderProcessor:
  Type: AWS::Serverless::Function
  Properties:
    Handler: src/handlers/processOrder.handler
    Events:
      OrderPlaced:
        Type: SNS
        Properties:
          Topic: !Ref OrderEventsTopic
```

That's it. SNS will invoke your Lambda every time someone publishes to the topic. No polling. No SQS visibility timeouts to configure (though adding SQS between SNS and Lambda is best practice — more on that below).

## Message Filtering: The Feature Nobody Uses 🎯

This is my favourite SNS feature and the one I didn't discover until embarrassingly late.

By default, all subscribers get all messages. But what if your email service only cares about `ORDER_PLACED`, not `ORDER_SHIPPED` or `REFUND_ISSUED`?

**Without filtering:**

```javascript
// In your email Lambda:
export const handler = async (event) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
  if (message.eventType !== "ORDER_PLACED") return; // Ignore and exit early
  await sendConfirmationEmail(message);
};
```

You're invoking Lambda, paying for compute, and throwing it away 60% of the time.

**With SNS message filtering:**

```json
// Subscription filter policy — set on the subscriber, not the publisher
{
  "eventType": ["ORDER_PLACED"]
}
```

SNS only delivers `ORDER_PLACED` messages to this subscriber. Other events never trigger the Lambda. You pay for zero unnecessary invocations.

**In production, I've deployed** this for a 5-service backend: order service, return service, analytics service, fraud service, email service — each with its own filter policy. Total SNS topics: 2 (order events, payment events). Total filter policies: 8. Result: each service only processes events it cares about, costs dropped ~40% versus the "invoke everything, check inside" approach.

## SNS → SQS: Add Durability to Your Fan-Out ⛑️

A pure SNS → Lambda setup has a gotcha: if your Lambda is throttled or has a deployment error when SNS fires, the message is gone. SNS retries a few times, but it's not unlimited.

The production pattern is **SNS → SQS → Lambda**:

```
SNS Topic
  ├── SQS Queue (EmailService)    → Lambda (email Lambda with DLQ)
  ├── SQS Queue (Inventory)       → Lambda (inventory Lambda with DLQ)
  └── SQS Queue (Analytics)       → Lambda (analytics Lambda with DLQ)
```

This gives you:
- **SNS durability** (published once, fans out to all queues atomically)
- **SQS buffering** (messages survive Lambda throttling or cold starts)
- **DLQ support** (failed messages go somewhere inspectable)
- **Backpressure control** (reserve Lambda concurrency per queue)

**When architecting on AWS, I learned** this is the non-negotiable production pattern for anything important. SNS alone for Lambda invocations is fine for side projects. SNS + SQS + Lambda for systems handling money or customer data.

## Multi-Channel Notifications: One Topic, Five Channels 📱

Here's where SNS gets truly impressive. The same topic can fan-out to completely different delivery mechanisms:

```
"payment-failed" SNS Topic
  ├── Email subscriber     → customer gets email: "Your payment failed"
  ├── SMS subscriber       → customer gets text: "Payment issue - please update card"
  ├── Lambda subscriber    → backend updates order status to PAYMENT_FAILED
  ├── SQS subscriber       → retry queue attempts charge again in 1 hour
  └── HTTPS subscriber     → webhook to Stripe dashboard for reconciliation
```

**Cost reality for SMS:** SNS SMS is $0.00645 per message to US numbers. Twilio charges $0.0079 per message. That's ~20% cheaper, and you're already using AWS. No separate account, no separate secrets, no separate billing dashboard.

**Email via SNS:** Free for up to 1,000 email endpoint notifications/month, then $2 per 100,000. For transactional notifications to your own services (not customer emails), this is effectively free. For customer emails, still use SES — SNS email subscriptions require humans to confirm subscriptions, which is not ideal for automated order confirmations.

## Cost Breakdown: Almost Free 💰

```
Monthly order volume: 50,000 orders
Events per order: 4 (placed, confirmed, shipped, delivered)
Total publishes: 200,000

SNS publishes: 200,000 × $0.50/million = $0.10/month
SQS deliveries: 200,000 × 5 subscribers × $0.40/million = $0.40/month
SMS (if used): 5,000 messages × $0.00645 = $32.25/month
Lambda invocations: covered by Lambda free tier

Total SNS + SQS + delivery: ~$0.50/month (excluding SMS)
```

**What I paid before SNS:** A Twilio account ($30/month minimum), a custom SMTP server on EC2 ($12/month for t3.micro), and a "notification orchestrator" Lambda that ran every minute checking a DynamoDB table for pending notifications. That DynamoDB scanning cost more than SNS does now.

## Gotchas That Will Ruin Your Afternoon 🔥

**Gotcha 1: Message size limit is 256KB**

SNS messages have a hard 256KB limit. If you're trying to pass a full product catalog in a single event — don't. Pass IDs, not payloads. Let subscribers fetch what they need.

**Gotcha 2: SNS doesn't guarantee delivery order**

SNS is an eventually consistent pub/sub system. Messages from the same publisher can arrive at subscribers in different orders. If order matters, you need FIFO SQS queues (and SNS FIFO topics, which exist but have throughput limits).

**Gotcha 3: Filter policies must be on the subscriber, not the topic**

This confused me for longer than I'd like to admit. You can't set "only route ORDER_PLACED messages" on the topic itself. You set filter policies on each subscription. The topic doesn't care — it delivers to all subscribers and they filter.

**Gotcha 4: Raw message delivery vs. wrapped messages**

By default, SNS wraps your message in a JSON envelope with metadata. If your Lambda or SQS consumer expects your raw JSON:

```json
// Subscription setting
{ "RawMessageDelivery": "true" }
```

Without this, your consumer receives the SNS envelope JSON, not your message. When my Lambda was logging `[object Object]` instead of the order data, this was why.

## When to Use SNS vs. Other Options 🤔

```
One publisher, one consumer?             → SQS directly (skip SNS)
One event, many independent consumers?  → SNS fan-out → SQS queues
Complex conditional routing logic?       → EventBridge (more powerful filters)
Ordered processing, exactly-once?        → SQS FIFO (SNS FIFO for fan-out)
External webhooks to third parties?      → SNS HTTPS subscriptions ← underrated
```

The SNS vs. EventBridge question comes up constantly. EventBridge has more powerful content-based routing, schema registry, and 100+ native AWS service sources. SNS is simpler, cheaper, and more than sufficient for 90% of notification use cases. When I have more than 3-4 different event types with complex routing rules, I switch to EventBridge. For straightforward fan-out? SNS every time.

## TL;DR 💡

If you're calling your email service, SMS service, analytics service, and fraud service sequentially from the same Lambda — stop. Your Lambda is doing too much, your latency is the sum of everything, and one service failure breaks everything else.

Publish one SNS message. Let everyone who cares subscribe.

**Start here:**
1. Create an SNS topic (2 minutes in the console)
2. Add SQS subscriptions for each consumer service
3. Set filter policies so each service only gets events it needs
4. Delete the 400-line "NotificationOrchestrator" class you've been maintaining

Your services will be decoupled, your Lambdas will be faster, and your 3 AM pages will decrease significantly.

And for the love of everything, stop hardcoding credentials in Slack webhook helpers. You know who you are. 🙏

---

**Got SNS questions or fan-out architecture discussions?** I'm on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk AWS architecture.

**Want to see the full serverless fan-out setup?** Check [GitHub](https://github.com/kpanuragh) for the complete SNS + SQS + Lambda IaC templates!

*Now go decouple those services!* 📢🚀

---

**P.S.** SNS has a free tier: 1 million publishes/month free, 1,000 email deliveries/month free, 100 SMS messages/month free (US). Your side project notification system costs literally zero dollars. Use it. 🆓

**P.P.S.** If you ever subscribe your personal email to an SNS topic while testing and then forget to unsubscribe, you will receive 47,000 test notification emails over the following three days. Not that this happened to me. Definitely set up a proper test email address. 😅
