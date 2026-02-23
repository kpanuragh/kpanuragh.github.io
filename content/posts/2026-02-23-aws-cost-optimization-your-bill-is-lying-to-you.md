---
title: "AWS Cost Optimization: Your Bill Is Lying to You (And How to Fight Back) 💸☁️"
date: "2026-02-23"
excerpt: "I once thought our AWS bill was fine — until I actually read it. Turns out we were paying $400/month for data transfer between services in the same Availability Zone. Here's everything I learned about cutting AWS costs without breaking production."
tags: ["aws", "cloud", "serverless", "cost-optimization", "finops"]
featured: true
---

# AWS Cost Optimization: Your Bill Is Lying to You (And How to Fight Back) 💸☁️

Here's a fun game: open your AWS Cost Explorer right now and look at your top 5 cost drivers. I'll wait.

If you're like me 18 months ago, you'll see a few obvious ones (EC2, RDS, Lambda) and then some mysterious line items with names like "EC2-Other" or "VPC" or "Data Transfer" that you just... haven't investigated because the total seemed acceptable.

Those vague line items are where AWS buries the money you're quietly overpaying.

**In production, I've deployed** a serverless e-commerce backend that at peak was costing us $1,800/month when — after a focused two-week optimization sprint — we brought it down to under $700/month. Same traffic. Same features. No shortcuts that hurt reliability.

Here's everything I learned.

## The "EC2-Other" Line That Nobody Talks About 🤫

The most confusing line item on any AWS bill is `EC2-Other`. This is AWS's catch-all bucket for:

- **NAT Gateway** data processing charges
- **Elastic IP addresses** that aren't attached to running instances
- **EBS snapshots** that nobody's cleaning up
- **Data transfer** between Availability Zones

**A serverless pattern that saved us:** We were running Lambda functions in private subnets (for RDS access), which meant all outbound internet traffic routed through a NAT Gateway. Our NAT Gateway was processing **180GB/month of data** — much of it Lambda functions calling AWS APIs like S3 and SQS.

The fix? **VPC Endpoints**.

```bash
# Create a VPC endpoint for S3 (Gateway type — FREE)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-12345 \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-12345 rtb-67890

# Create VPC endpoint for SQS (Interface type — ~$7/month but saves NAT costs)
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-12345 \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-1.sqs \
  --subnet-ids subnet-12345 \
  --security-group-ids sg-12345
```

S3 VPC endpoints are **Gateway type — completely free**. Traffic between your Lambda and S3 stops flowing through NAT Gateway. Our NAT Gateway processing dropped by 70%.

**Monthly saving: ~$90**

## The Availability Zone Data Transfer Trap 🪤

Here's something AWS doesn't exactly advertise in the getting started guides: **data transfer between Availability Zones costs $0.01/GB in each direction**.

That sounds trivial until your e-commerce backend processes 500,000 orders a month and each order moves data between services sitting in different AZs.

**When architecting on AWS, I learned** this the hard way when our "VPC" line item hit $180/month. The culprit? Our RDS was in `us-east-1a`, our Lambda functions were deployed across `us-east-1a`, `us-east-1b`, and `us-east-1c` for redundancy — and every Lambda invocation in 1b or 1c paid a cross-AZ penalty to reach the database.

The fix isn't to remove redundancy. It's to be intentional:

```yaml
# SAM template: Pin Lambda to the same AZ as your RDS
# (for read-heavy non-critical functions)
PaymentProcessorFunction:
  Type: AWS::Serverless::Function
  Properties:
    VpcConfig:
      SubnetIds:
        - !Ref PrivateSubnetAZ1  # Same AZ as primary RDS
      SecurityGroupIds:
        - !Ref LambdaSecurityGroup
```

For functions where availability matters more than cost, keep multi-AZ. For batch jobs, analytics processors, and reporting functions — pin them.

**Monthly saving: ~$60**

## CloudWatch Logs: The Silent Bill Killer 📋

**When architecting on AWS, I learned** that Lambda functions log *everything* by default, and CloudWatch Logs charges for **ingestion** ($0.50/GB), **storage** ($0.03/GB/month), and **queries** ($0.005 per GB scanned in Logs Insights).

Our Lambdas were logging full request/response payloads. An order Lambda handling 5,000 orders/day with a 2KB average log payload = **10MB/day = 300MB/month per function**. Multiply by 15 Lambda functions.

```python
# Before: Logging everything
def handler(event, context):
    logger.info(f"Event received: {json.dumps(event)}")  # Full payload every time
    # ... process ...
    logger.info(f"Response: {json.dumps(response)}")     # Full response too

# After: Structured, minimal logging
def handler(event, context):
    logger.info("order.process.start", extra={
        "orderId": event.get("orderId"),
        "source": event.get("source")
        # NOT the full payload
    })
    # ... process ...
    logger.info("order.process.complete", extra={
        "orderId": order_id,
        "status": "success"
    })
```

Then set log retention. Logs without retention policies live **forever** and you pay forever:

```bash
# Set 7-day retention on all Lambda log groups
aws logs describe-log-groups --query 'logGroups[?retentionInDays==`null`].logGroupName' \
  --output text | tr '\t' '\n' | while read group; do
  aws logs put-retention-policy \
    --log-group-name "$group" \
    --retention-in-days 7
  echo "Set 7-day retention on $group"
done
```

**A serverless pattern that saved us:** Use log levels properly. `DEBUG` logs only in dev. `INFO` for key business events in prod. `ERROR` for actual errors. Not `INFO` for every function invocation.

**Monthly saving: ~$70**

## Lambda: You're Probably Over-Provisioning Memory 🧠

Lambda pricing is based on **GB-seconds**: memory allocated × duration. The gotcha is that "more memory = faster execution" — up to a point — because Lambda allocates CPU proportionally to memory.

**In production, I've deployed** Lambda functions at the default 128MB that were running in 3,000ms. After profiling:

```bash
# AWS Lambda Power Tuning — open source tool to find optimal memory
# https://github.com/alexcasalboni/aws-lambda-power-tuning
# Runs your function at different memory sizes and finds the sweet spot

# Cost-optimal result for our order processor:
# 128MB: 3,200ms average = 0.41 GB-seconds
# 512MB: 890ms average  = 0.45 GB-seconds  (faster but costs more)
# 256MB: 1,100ms average = 0.28 GB-seconds ← sweet spot
```

Going from 128MB to 256MB **cut duration by 66%** — and cost by 30% — because the function had just enough CPU to stop thrashing.

Then there are the over-provisioned functions. Reporting Lambdas sitting at 3,008MB because "it's memory-intensive" but actually running in 200ms using 180MB. That's 16x the necessary memory allocation.

**Set your memory based on actual profiling, not vibes.**

```python
# Add this to your Lambda handler during testing
import tracemalloc
tracemalloc.start()

def handler(event, context):
    # ... your code ...
    current, peak = tracemalloc.get_traced_memory()
    logger.info(f"Peak memory usage: {peak / 1024 / 1024:.1f} MB")
```

**Monthly saving: ~$80 across 15 functions**

## RDS: Stop Paying for Idle Database Hours ⏰

If you have dev or staging RDS instances running 24/7, you're probably paying for 168 hours per week of database time when your team is actually working maybe 50 hours.

```bash
# Stop RDS instances on a schedule using Lambda + EventBridge
# Start at 8 AM on weekdays, stop at 8 PM

# EventBridge rule to stop RDS at 8 PM weekdays
aws events put-rule \
  --name "StopDevRDS" \
  --schedule-expression "cron(0 20 ? * MON-FRI *)" \
  --state ENABLED

# Lambda function to stop instances tagged with Environment=dev
import boto3

def handler(event, context):
    rds = boto3.client('rds')
    instances = rds.describe_db_instances()

    for instance in instances['DBInstances']:
        tags = {t['Key']: t['Value'] for t in
                rds.list_tags_for_resource(
                    ResourceName=instance['DBInstanceArn']
                )['TagList']}

        if tags.get('Environment') == 'dev':
            rds.stop_db_instance(
                DBInstanceIdentifier=instance['DBInstanceIdentifier']
            )
```

**When architecting on AWS, I learned:** Tag every resource from day one. `Environment=dev`, `Environment=staging`, `Environment=prod`. Without tags you can't automate anything and you can't understand your bill.

**Monthly saving: ~$120 (stopping 3 dev RDS instances 14h/day)**

## S3: The Storage That Quietly Grows Forever 📦

S3 at $0.023/GB seems cheap until you have a product image bucket that nobody ever cleanups and now holds 800GB of images for products discontinued in 2023.

**Lifecycle policies are free to create and they will save you money automatically:**

```json
{
  "Rules": [
    {
      "ID": "TransitionOldLogs",
      "Status": "Enabled",
      "Filter": {"Prefix": "logs/"},
      "Transitions": [
        {
          "Days": 30,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 90,
          "StorageClass": "GLACIER_IR"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

**Storage class costs for 100GB/month:**
- S3 Standard: **$2.30**
- S3 Standard-IA (infrequent access): **$1.25**
- S3 Glacier Instant Retrieval: **$0.40**

Logs older than 30 days? Nobody's accessing them in real-time. Move them to IA automatically.

**Also check:** incomplete multipart uploads. If your upload code crashes halfway through, S3 keeps the partial upload forever. Add a lifecycle rule to clean these up:

```json
{
  "Rules": [{
    "ID": "CleanupIncompleteUploads",
    "Status": "Enabled",
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
  }]
}
```

**Monthly saving: ~$45**

## The Optimization Checklist I Run Every Quarter 📋

**When architecting on AWS, I learned** that cost optimization isn't a one-time sprint — AWS releases new services, usage patterns change, and costs creep up. I run this quarterly:

**Every Quarter:**
- [ ] Review Cost Explorer by service — any surprises?
- [ ] Check EC2-Other breakdown — NAT Gateway, cross-AZ transfer
- [ ] Audit CloudWatch Log Groups without retention policies
- [ ] Profile Lambda memory vs actual usage (AWS Lambda Power Tuning)
- [ ] Check for unattached EBS volumes (`aws ec2 describe-volumes --filters Name=status,Values=available`)
- [ ] Check for unused Elastic IPs (`aws ec2 describe-addresses --filters Name=association-id,Values=None`)
- [ ] Review RDS instance sizes vs actual CPU/memory metrics
- [ ] S3 storage class distribution — anything that should be in IA/Glacier?

**Unattached EBS volumes and unused Elastic IPs are pure waste. They're easy to find and easy to delete.**

## Real Numbers: Before and After 📊

Here's what our optimization sprint actually looked like:

```
Before (monthly):
  EC2 (incl NAT Gateway): $420
  RDS:                     $380
  Lambda:                  $160
  CloudWatch:              $145
  S3:                      $220
  Data Transfer:           $180
  Other:                   $295
  Total:                   $1,800

After (monthly):
  EC2 (incl NAT Gateway): $180  (-$240, VPC endpoints + right-sizing)
  RDS:                     $210  (-$170, scheduled stop for dev/staging)
  Lambda:                  $95   (-$65, memory optimization)
  CloudWatch:              $40   (-$105, retention policies + reduced logging)
  S3:                      $130  (-$90, lifecycle policies)
  Data Transfer:           $70   (-$110, cross-AZ optimization)
  Other:                   $195  (-$100, removed orphaned resources)
  Total:                   $920  (-$880 = 49% reduction)
```

Same traffic. Same features. Two weeks of focused work.

## TL;DR 💸

Your AWS bill has six common money drains:

1. **NAT Gateway** processing costs — fix with VPC Endpoints (S3 is free!)
2. **Cross-AZ data transfer** — pin non-critical services to the same AZ as your data
3. **CloudWatch Logs** without retention policies — they store forever, you pay forever
4. **Lambda memory** not profiled — default settings are rarely optimal
5. **Dev/staging RDS** running 24/7 — schedule them to stop nights and weekends
6. **S3 without lifecycle policies** — move old data to cheaper storage classes automatically

**The real gotcha:** None of these show up as obvious overspending. They're each a few dollars here, a few there — until you add them up and realize you've been donating a car payment to AWS every month.

Open Cost Explorer. Click on every mysterious line item. Question every charge you don't understand. AWS is happy to keep billing you for resources you forgot about. 💸

---

**Cut your own AWS bill recently?** I'd love to hear what your biggest savings were on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — especially if you found something weird in your EC2-Other breakdown. The stories are always wild.

**Want the full optimization scripts** I use for quarterly reviews? Check [GitHub](https://github.com/kpanuragh) — including the Lambda Power Tuning automation and the RDS start/stop scheduler.

*Go check your bill. Something in there is definitely charging you for something you forgot about.* 💸☁️
