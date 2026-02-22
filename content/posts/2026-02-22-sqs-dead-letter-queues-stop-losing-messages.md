---
title: "AWS SQS Dead Letter Queues: Stop Losing Messages at 3 AM 💀📬"
date: "2026-02-22"
excerpt: "I once lost 40,000 order events because a Lambda bug silently ate messages until the queue was empty. SQS Dead Letter Queues would have saved me. Don't be me."
tags: ["aws", "serverless", "sqs", "cloud"]
featured: true
---

# AWS SQS Dead Letter Queues: Stop Losing Messages at 3 AM 💀📬

**Storytime:** Eighteen months into our serverless e-commerce backend, we deployed a "minor" update to our order processing Lambda. One line changed. One integer field that we started parsing as a string. The Lambda threw an exception, SQS retried the message, Lambda threw again, SQS gave up and... silently discarded the message.

40,000 messages. Gone. Orders never processed. No alert. No error page. Just confused customers emailing support asking where their orders were.

That was the week I got religion about Dead Letter Queues.

## What Is SQS, Actually? 📬

Amazon SQS is a fully managed message queue. When your services need to communicate asynchronously — and they should, for anything non-trivial — SQS sits in the middle as a buffer:

```
[Order Service]  →  [SQS Queue]  →  [Processing Lambda]
```

The beauty: Order Service doesn't wait for Processing Lambda to finish. It drops the message and moves on. Decoupled. Fast. Resilient.

**The catch nobody warns you about:** SQS has a `maxReceiveCount`. After a message fails that many times, SQS either drops it or routes it to... nowhere, if you haven't configured a Dead Letter Queue. Default behavior: your message just disappears. No log. No alert. It's gone.

## What's a Dead Letter Queue? ☠️

A Dead Letter Queue (DLQ) is just another SQS queue. When a message fails `maxReceiveCount` times, instead of being dropped into the void, it gets sent to your DLQ.

```
[SQS Queue]  →  [Lambda]  →  ❌ fails
                  ↓ retry
             [Lambda]  →  ❌ fails
                  ↓ retry
             [Lambda]  →  ❌ fails (maxReceiveCount hit)
                  ↓
             [Dead Letter Queue]  ←  message survives here
```

Now the message is preserved. You can inspect it, fix the bug, and replay it. This is the difference between a bad afternoon and a catastrophic data loss incident.

## Setting It Up ⚙️

**Step 1: Create the DLQ first**

```yaml
# CloudFormation
OrderProcessingDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: order-processing-dlq
    MessageRetentionPeriod: 1209600  # 14 days (maximum)
```

Retention period matters. 14 days gives you time to notice the problem, fix it, and replay messages before they expire.

**Step 2: Attach it to your main queue**

```yaml
OrderProcessingQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: order-processing
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt OrderProcessingDLQ.Arn
      maxReceiveCount: 3  # Fail 3 times → DLQ
```

`maxReceiveCount: 3` means Lambda gets 3 shots at the message. Three failures and it moves to the DLQ. Don't set this too high — if the bug isn't transient, retrying 20 times just delays the inevitable while blocking queue processing.

**When architecting on AWS, I learned:** `maxReceiveCount: 3` is my default for idempotent Lambdas. For Lambdas doing external API calls (payment processors, email providers), I use `5` to account for transient network failures.

## The CloudWatch Alarm You Must Set 🚨

Creating the DLQ is step one. Alerting when messages land in it is the actual point.

```yaml
DLQDepthAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: order-processing-dlq-not-empty
    AlarmDescription: "Messages in DLQ - investigate immediately"
    MetricName: ApproximateNumberOfMessagesVisible
    Namespace: AWS/SQS
    Dimensions:
      - Name: QueueName
        Value: order-processing-dlq
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 1
    Threshold: 0
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref OnCallSNSTopic
    TreatMissingData: notBreaching
```

DLQ depth > 0 = immediate alert. This is non-negotiable. **A serverless pattern that saved us** countless times: every SQS queue in production has a corresponding DLQ, and every DLQ has this alarm.

## FIFO vs. Standard: Don't Choose Wrong 🔀

SQS has two flavors and choosing the wrong one will wreck your day:

| | Standard Queue | FIFO Queue |
|---|---|---|
| Throughput | Unlimited | 3,000 msg/sec (or 300 with batching) |
| Ordering | Best-effort | Guaranteed |
| Delivery | At-least-once | Exactly-once |
| Use case | Most things | Order-sensitive workflows |
| Cost | Cheaper | ~10x more expensive |

**In production, I've deployed** both and the rule I follow: Standard Queue unless you have a specific reason for ordering. "But what if messages arrive out of order?" is the wrong question — design your consumers to be idempotent instead. It's cheaper and scales better.

**When you genuinely need FIFO:** Payment state transitions (authorized → captured → refunded — order matters), inventory reservations (reserve before deduct — race conditions are bad), anything where processing message B before message A produces incorrect state.

## Visibility Timeout: The Gotcha That Burns Everyone 🕐

This one is subtle and I've watched it trip up senior engineers.

When Lambda picks up a message, SQS hides it from other consumers for the **visibility timeout** period. If Lambda finishes before the timeout, the message is deleted. If Lambda doesn't finish, the message becomes visible again and gets reprocessed.

**The classic mistake:**

```
Visibility timeout: 30 seconds
Lambda timeout: 60 seconds
```

Lambda times out at 60s. SQS made the message visible again at 30s. Another Lambda picked it up. Now two Lambdas are processing the same order. Duplicate order. Angry customer charged twice.

**The fix:**

```yaml
OrderProcessingQueue:
  Type: AWS::SQS::Queue
  Properties:
    VisibilityTimeout: 180  # 3× your Lambda timeout
```

**A serverless pattern that saved us:** Set visibility timeout to 6× your Lambda timeout. 6× sounds excessive but Lambda can have initialization overhead, especially with provisioned concurrency scaling. Be generous or face duplicate processing.

## Replaying DLQ Messages After You Fix the Bug 🔄

You fixed the bug. 300 messages are sitting in the DLQ. Now what?

```bash
# Built-in SQS DLQ redrive (the modern way)
aws sqs start-message-move-task \
  --source-arn arn:aws:sqs:us-east-1:123456789:order-processing-dlq \
  --destination-arn arn:aws:sqs:us-east-1:123456789:order-processing \
  --max-number-of-messages-per-second 10  # Throttle to avoid Lambda concurrency spike
```

The `max-number-of-messages-per-second` parameter is key. Replaying 5,000 messages instantly will spike your Lambda concurrency. Throttle the replay and let it drain gradually.

**When architecting on AWS, I learned:** Test your DLQ replay procedure *before* you need it. I've seen teams discover their IAM permissions blocked the redrive operation at the worst possible time. Run a fire drill. Move a test message to the DLQ. Replay it. Confirm it processes correctly.

## Cost Reality Check 💰

SQS pricing is genuinely negligible for most applications:

- **First 1M requests/month:** Free
- **After that:** $0.40 per million requests (Standard), $0.50 per million (FIFO)

**My production numbers:**

```
E-commerce backend: ~12M SQS messages/month
  order-processing queue:   5M messages
  inventory-updates queue:  4M messages
  notification queue:       3M messages

Monthly SQS cost: ~$4.40
Monthly value of not losing order messages: 💰💰💰
```

The DLQ itself is just another queue — same pricing. The CloudWatch alarm costs essentially nothing. The visibility timeout is free to configure.

SQS is one of the cheapest reliability improvements you can make to a serverless architecture.

## Common Pitfalls Quick Reference 🪤

| Mistake | What Happens | Fix |
|---|---|---|
| No DLQ configured | Failed messages silently disappear | Always configure DLQ on every queue |
| No alarm on DLQ | You never know messages are failing | CloudWatch alarm on DLQ depth > 0 |
| Visibility timeout < Lambda timeout | Duplicate message processing | Set visibility timeout to 6× Lambda timeout |
| maxReceiveCount too high | Bug messages retry forever, clog queue | Use 3-5; high retry counts rarely help |
| Forgetting DLQ retention | Messages expire before you replay them | Always set 14-day retention on DLQs |
| Replaying DLQ without throttling | Lambda concurrency spike, throttles | Use `max-number-of-messages-per-second` |

## TL;DR 💀

**Without a DLQ:** Message fails → SQS retries → message disappears → you find out from customers.

**With a DLQ + alarm:** Message fails → SQS retries → message goes to DLQ → alert fires → you fix bug → replay messages → nobody loses data.

**Your DLQ checklist:**
1. Every SQS queue gets a DLQ (no exceptions)
2. DLQ retention: 14 days
3. `maxReceiveCount`: 3-5 (not 20)
4. Visibility timeout: 6× your Lambda timeout
5. CloudWatch alarm on DLQ depth > 0
6. Test your replay procedure before production needs it
7. Choose FIFO only when ordering is genuinely required

**In production, I've deployed** SQS + DLQ patterns across 15+ queues in our e-commerce backend. After that 40,000 lost order incident, I added DLQ configuration as a PR checklist item. Every new queue. Every time. Non-negotiable.

Zero lost messages since. Zero. That's the whole point.

---

**Got a DLQ war story?** I'd love to hear it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — message queue incidents are the best kind of "I survived this" stories. 😄

**More production serverless patterns?** Check [GitHub](https://github.com/kpanuragh) for real-world SQS, EventBridge, and Lambda examples from a production e-commerce backend.

*Go configure those DLQs. Before your messages disappear into the void and take your customers with them.* 💀📬

---

**P.S.** SQS also has **message groups** (FIFO only), **message attributes** for metadata filtering, and **long polling** to reduce empty receive calls (and costs). Long polling alone — setting `WaitTimeSeconds: 20` on your Lambda event source mapping — can cut your SQS API calls by 95% if your queue has bursty traffic. That $4.40/month bill I mentioned? It was $38 before I turned on long polling. The math is not subtle. 📉
