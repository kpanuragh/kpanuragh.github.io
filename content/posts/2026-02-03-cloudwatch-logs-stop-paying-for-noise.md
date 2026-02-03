---
title: "CloudWatch Logs: Stop Paying AWS to Store Your Debug Statements 💸📊"
date: "2026-02-03"
excerpt: "Your CloudWatch bill is $300/month because you're logging EVERYTHING. After years of production AWS deployments, here's how I cut our logging costs by 85% without losing visibility!"
tags: ["aws", "cloud", "monitoring", "devops"]
featured: true
---

# CloudWatch Logs: Stop Paying AWS to Store Your Debug Statements 💸📊

**Real talk:** The first time I checked our AWS bill, I nearly spit out my coffee. "Why is CloudWatch costing us $287/month?!" Our Lambda functions were tiny. Our traffic was moderate. What the hell was going on?

Then I looked at the logs. Every. Single. Debug. Statement. From development. Still running. In production. At 500,000 requests per day. 🤦‍♂️

Welcome to CloudWatch Logs - the AWS service that will happily charge you $0.50/GB to store logs you'll never read!

## What Even Is CloudWatch? (Beyond "AWS Logging") ☁️

**CloudWatch = AWS's monitoring and observability service** - logs, metrics, alarms, dashboards, the works.

**Think of it like:** A security camera system for your infrastructure... except the cameras record EVERYTHING, never delete footage, and charge you by the gigabyte!

**Real usage:**
- Application logs (Lambda, EC2, ECS, etc.)
- System metrics (CPU, memory, disk)
- Custom metrics (business KPIs)
- Alarms and notifications
- Performance dashboards

**Why it's everywhere:** Every AWS service integrates with it. It's the default. It just... works!

**Why it's expensive:** CloudWatch charges for:
- Log ingestion: $0.50/GB
- Log storage: $0.03/GB/month
- Log queries: $0.005 per GB scanned
- Data retrieval: Pay to read your own logs!

**My wake-up call:** 2TB of logs per month × $0.50 = **$1,000/month** just to ingest logs! 😱

## The $287 CloudWatch Bill: My Horror Story 💀

When architecting our serverless e-commerce backend, I configured Lambda functions to log "helpful" debug information.

**What I naively logged:**

```javascript
exports.handler = async (event) => {
  console.log('=== Lambda Invocation Start ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));
  console.log('Environment variables:', process.env);

  const userId = event.pathParameters?.userId;
  console.log('Extracted userId:', userId);

  console.log('Fetching user from database...');
  const user = await db.users.findById(userId);
  console.log('User fetched:', JSON.stringify(user, null, 2));

  console.log('Fetching orders...');
  const orders = await db.orders.findByUserId(userId);
  console.log('Orders fetched:', JSON.stringify(orders, null, 2));

  console.log('Processing complete!');
  console.log('=== Lambda Invocation End ===');

  return {
    statusCode: 200,
    body: JSON.stringify({ user, orders })
  };
};
```

**Seems harmless, right?** Let's do the math:

**Per request:**
- Event object: ~2KB
- Context: ~1KB
- User object: ~1KB
- Orders array (avg 5 orders): ~5KB
- Debug statements: ~0.5KB
- **Total per request: ~9.5KB**

**At scale:**
- 500,000 requests/day
- 9.5KB × 500,000 = **4.75GB per day**
- 4.75GB × 30 days = **142.5GB per month**

**The damage:**
- Ingestion: 142.5GB × $0.50 = **$71.25**
- Storage (cumulative): 142.5GB × $0.03 × 3 months = **$12.83**
- Queries (debugging production): ~50GB scanned × $0.005 = **$0.25**
- **Total: $84.33/month** from ONE Lambda function!

Multiply by 8 Lambda functions? **$674.64/month!** 🔥💸

**The lesson:** CloudWatch doesn't care if your logs are useful. It charges by the byte!

## CloudWatch Mistake #1: Logging Like It's Free 🚨

**The problem:**

```javascript
// EXPENSIVE! This logs EVERYTHING!
console.log('Starting function execution');
console.log('Request body:', req.body);
console.log('Headers:', req.headers);
console.log('Query params:', req.query);
console.log('Database query started');
console.log('Database results:', results);
console.log('Processing item 1...');
console.log('Processing item 2...');
console.log('Processing item 3...');
// Every console.log = more money! 💸
```

**The fix - Log levels:**

```javascript
// Use a logging library with log levels
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info', // Only log 'info' and above
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});

exports.handler = async (event) => {
  // DEBUG: Only logs if LOG_LEVEL=debug
  logger.debug('Event received', { event });

  // INFO: Useful operational info
  logger.info('Processing order', {
    userId: event.userId,
    orderId: event.orderId
  });

  try {
    const result = await processOrder(event);

    // INFO: Success metrics
    logger.info('Order processed successfully', {
      orderId: result.id,
      total: result.total,
      duration: Date.now() - startTime
    });

    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    // ERROR: Only log errors (the stuff you actually need!)
    logger.error('Order processing failed', {
      error: error.message,
      stack: error.stack,
      orderId: event.orderId
    });

    throw error;
  }
};
```

**Production config:**
```bash
# Environment variable
LOG_LEVEL=info  # Don't log debug statements in production!
```

**Results:**
- Development: `LOG_LEVEL=debug` (see everything)
- Production: `LOG_LEVEL=info` (only important stuff)
- **Log volume: 9.5KB → 1.2KB per request (87% reduction!)**
- **Cost: $84.33 → $11.03 per month per function!** 🎉

## CloudWatch Mistake #2: Never Expiring Old Logs 📅

**The problem:** CloudWatch keeps logs FOREVER by default!

```bash
# Check log size
aws logs describe-log-groups --query 'logGroups[*].[logGroupName,storedBytes]' --output table

# Output:
# /aws/lambda/api-function    50GB  (logs from 2 years ago!)
# /aws/lambda/worker          120GB (most are irrelevant!)
```

**Every month:**
- 170GB stored × $0.03 = **$5.10 just for old logs**
- After 12 months: **$61.20/year** for data you'll NEVER read!

**The solution - Retention policies:**

```bash
# Set retention to 7 days for most logs
aws logs put-retention-policy \
  --log-group-name /aws/lambda/api-function \
  --retention-in-days 7

# Critical logs: Keep for 30 days
aws logs put-retention-policy \
  --log-group-name /aws/lambda/payment-processor \
  --retention-in-days 30

# Compliance/audit logs: 1 year
aws logs put-retention-policy \
  --log-group-name /aws/lambda/audit-trail \
  --retention-in-days 365
```

**Set it in Terraform:**

```hcl
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = 7  # Auto-delete after 7 days!

  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
```

**Or Serverless Framework:**

```yaml
# serverless.yml
provider:
  logRetentionInDays: 7  # All functions: 7 day retention!

functions:
  criticalFunction:
    handler: critical.handler
    logRetentionInDays: 30  # Override for specific function
```

**In production, I've deployed** hundreds of Lambda functions. My retention policy:
- **Dev/test:** 3 days (who cares?)
- **Production APIs:** 7 days (debug recent issues)
- **Payment/critical:** 30 days (compliance)
- **Audit logs:** 1 year (required by law)

**Savings from retention policies alone: $48/month!** 💰

## CloudWatch Mistake #3: Not Using Structured Logging 📊

**The problem - Unstructured logs:**

```javascript
// BAD: Just string concatenation
console.log('User ' + userId + ' ordered ' + productId + ' quantity: ' + quantity);
console.log('Payment failed: ' + error.message);

// CloudWatch Logs Insights query:
// fields @timestamp, @message
// | filter @message like /User 12345/
// | parse @message "User * ordered * quantity: *" as user, product, qty
// Hard to parse! Expensive to query! 😭
```

**The solution - Structured JSON logging:**

```javascript
// GOOD: Structured JSON
logger.info('Order placed', {
  userId: '12345',
  productId: 'abc-123',
  quantity: 2,
  total: 59.99,
  paymentMethod: 'credit_card'
});

logger.error('Payment failed', {
  userId: '12345',
  orderId: 'order-789',
  error: error.message,
  errorCode: error.code,
  paymentProvider: 'stripe'
});

// CloudWatch Logs Insights query (FAST & CHEAP):
// fields @timestamp, userId, productId, quantity
// | filter userId = "12345"
// | filter error.code = "INSUFFICIENT_FUNDS"
// Easy to query! Costs less! ✅
```

**Why this matters:**

**Unstructured query:**
```sql
-- Scans ENTIRE log stream (expensive!)
fields @timestamp, @message
| filter @message like /payment failed/
| parse @message "User * payment failed: *" as user, error
```

**Structured query:**
```sql
-- Uses indexed fields (fast & cheap!)
fields @timestamp, userId, error.code
| filter error.code = "PAYMENT_FAILED"
| stats count() by userId
```

**Real impact:**
- Query time: 45s → 2s
- Data scanned: 10GB → 500MB (95% reduction!)
- Query cost: $0.05 → $0.0025 per query

**A serverless pattern that saved us:** Always log JSON. Always include context. Make every field queryable!

## CloudWatch Mistake #4: Not Sampling High-Volume Logs 📉

**The problem:**

```javascript
// This Lambda runs 100,000 times per hour
exports.handler = async (event) => {
  console.log('Health check received'); // 100K logs/hour!
  return { statusCode: 200, body: 'OK' };
};
```

**Do you REALLY need 100,000 "health check received" logs per hour?** Hell no!

**The solution - Sampling:**

```javascript
// Only log 1% of successful health checks
exports.handler = async (event) => {
  const shouldLog = Math.random() < 0.01; // 1% sample rate

  if (shouldLog || event.debug) {
    console.log('Health check received', {
      timestamp: Date.now(),
      source: event.source
    });
  }

  return { statusCode: 200, body: 'OK' };
};
```

**Even better - Smart sampling:**

```javascript
let requestCount = 0;

exports.handler = async (event) => {
  requestCount++;

  // Log every 100th request
  if (requestCount % 100 === 0) {
    console.log('Health check sample', {
      totalRequests: requestCount,
      timestamp: Date.now()
    });
  }

  return { statusCode: 200, body: 'OK' };
};
```

**Advanced - Always log errors, sample success:**

```javascript
exports.handler = async (event) => {
  try {
    const result = await processRequest(event);

    // Only log 5% of successful requests
    if (Math.random() < 0.05) {
      logger.info('Request succeeded (sampled)', {
        requestId: event.requestId,
        duration: result.duration
      });
    }

    return { statusCode: 200, body: result };
  } catch (error) {
    // ALWAYS log errors (100% sampling)
    logger.error('Request failed', {
      requestId: event.requestId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
};
```

**Savings:**
- 100,000 health checks/hour × 24 hours × 30 days = 72M logs/month
- At 1KB each: 72GB/month × $0.50 = **$36/month**
- With 1% sampling: 720MB/month × $0.50 = **$0.36/month**
- **Saved: $35.64/month per high-volume function!** 🎯

## CloudWatch Mistake #5: Not Exporting to S3 🪣

**The problem:** CloudWatch charges $0.03/GB/month for storage. S3 charges $0.023/GB/month (and can be WAY cheaper with lifecycle policies!)

**The solution - Export old logs to S3:**

```bash
# Export logs to S3 (one-time or scheduled)
aws logs create-export-task \
  --log-group-name /aws/lambda/api-function \
  --from $(date -d '30 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination s3-bucket-name \
  --destination-prefix cloudwatch-logs/
```

**Automate with Lambda (monthly export):**

```javascript
const AWS = require('aws-sdk');
const logs = new AWS.CloudWatchLogs();

exports.handler = async () => {
  const logGroups = [
    '/aws/lambda/api-function',
    '/aws/lambda/worker',
    '/aws/lambda/processor'
  ];

  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const now = Date.now();

  for (const logGroup of logGroups) {
    await logs.createExportTask({
      logGroupName: logGroup,
      from: thirtyDaysAgo,
      to: now,
      destination: 'my-log-archive-bucket',
      destinationPrefix: `cloudwatch-exports/${logGroup}/`
    }).promise();

    console.log(`Exported ${logGroup} to S3`);
  }
};
```

**Then apply S3 lifecycle policy:**

```json
{
  "Rules": [{
    "Id": "ArchiveOldLogs",
    "Status": "Enabled",
    "Transitions": [
      {
        "Days": 90,
        "StorageClass": "GLACIER"
      }
    ],
    "Expiration": {
      "Days": 365
    }
  }]
}
```

**Cost comparison (100GB of logs):**

**CloudWatch only:**
- 100GB × $0.03/month = **$3/month**
- After 12 months: **$36/year**

**CloudWatch + S3 export:**
- CloudWatch (7 days): 1.6GB × $0.03 = **$0.05/month**
- S3 Standard (30 days): 7GB × $0.023 = **$0.16/month**
- S3 Glacier (60 days): 14GB × $0.004 = **$0.06/month**
- Auto-delete after 90 days
- **Total: $0.27/month**
- After 12 months: **$3.24/year** (91% cheaper!) 🎉

**When architecting on AWS, I learned:** Keep recent logs in CloudWatch (fast queries), archive to S3 (cheap storage)!

## CloudWatch Mistake #6: Not Using Metric Filters (Free Metrics!) 📈

**The problem:** You're paying for custom CloudWatch Metrics ($0.30 per metric/month) when you could extract them from logs FOR FREE!

**Metric Filters = Parse logs to create metrics (no extra code needed!)**

**Example - Track errors without custom metrics:**

```bash
# Create metric filter from error logs
aws logs put-metric-filter \
  --log-group-name /aws/lambda/api-function \
  --filter-name ErrorCount \
  --filter-pattern '[time, request_id, level=ERROR*, ...]' \
  --metric-transformations \
    metricName=Errors,\
    metricNamespace=MyApp,\
    metricValue=1
```

**Now you have an "Errors" metric visible in CloudWatch Metrics!** No code changes! No custom metric costs!

**Track response times from logs:**

```javascript
// Just log the duration
logger.info('Request completed', {
  requestId: event.requestId,
  duration: 234 // milliseconds
});
```

```bash
# Extract duration as metric
aws logs put-metric-filter \
  --log-group-name /aws/lambda/api-function \
  --filter-name ResponseTime \
  --filter-pattern '{ $.duration = * }' \
  --metric-transformations \
    metricName=ResponseTime,\
    metricNamespace=MyApp,\
    metricValue='$.duration',\
    metricUnit=Milliseconds
```

**Track business metrics from logs:**

```javascript
// Log revenue
logger.info('Payment successful', {
  orderId: event.orderId,
  revenue: 99.99
});
```

```bash
# Track total revenue as metric
aws logs put-metric-filter \
  --log-group-name /aws/lambda/payment \
  --filter-name Revenue \
  --filter-pattern '{ $.revenue = * }' \
  --metric-transformations \
    metricName=Revenue,\
    metricNamespace=MyApp,\
    metricValue='$.revenue'
```

**Savings:**
- Custom CloudWatch Metrics: 20 metrics × $0.30 = **$6/month**
- Metric Filters from existing logs: **$0/month** (already paying for logs!)
- **Saved: $6/month!** 💰

## CloudWatch Mistake #7: Not Using CloudWatch Logs Insights 🔍

**Old way (painful):**

```bash
# Download logs locally
aws logs tail /aws/lambda/api-function --since 1h > logs.txt

# Search with grep
grep "ERROR" logs.txt
grep "user-12345" logs.txt

# Manual analysis 😭
```

**New way - Logs Insights (built-in SQL-like queries):**

```sql
-- Find all errors in last hour
fields @timestamp, @message, error
| filter level = "ERROR"
| sort @timestamp desc
| limit 100
```

```sql
-- Top 10 slowest requests
fields @timestamp, duration, userId, endpoint
| filter duration > 1000
| sort duration desc
| limit 10
```

```sql
-- Count errors by error code
fields @timestamp, error.code
| filter level = "ERROR"
| stats count() by error.code
| sort count desc
```

```sql
-- Track user journey
fields @timestamp, userId, action
| filter userId = "12345"
| sort @timestamp asc
```

**Why Logs Insights is amazing:**
- ✅ No downloading logs locally
- ✅ Query across multiple log groups
- ✅ Visualize results (charts!)
- ✅ Save common queries
- ✅ Fast parallel execution

**Cost:** $0.005 per GB scanned (cheap if you use filters!)

**Pro tip - Optimize queries:**

```sql
-- EXPENSIVE: Scans ALL logs
fields @timestamp, @message
| filter @message like /ERROR/

-- CHEAP: Uses structured fields + time filter
fields @timestamp, error
| filter level = "ERROR"
| filter @timestamp > ago(1h)  -- Only scan last hour!
```

**In production, I've learned:** Logs Insights replaced 80% of my custom dashboards and saved hours of debugging time!

## The CloudWatch Cost Optimization Playbook 💰

Here's how I reduced our CloudWatch bill from $287/month to $43/month (85% reduction!):

### 1. Audit Current Costs

```bash
# Find biggest log groups
aws logs describe-log-groups \
  --query 'reverse(sort_by(logGroups, &storedBytes))[*].[logGroupName, storedBytes]' \
  --output table

# Output:
# /aws/lambda/api          85GB  <- Target this first!
# /aws/lambda/worker       42GB
# /aws/lambda/processor    12GB
```

### 2. Set Retention Policies Everywhere

```bash
# Bulk update all log groups
for log_group in $(aws logs describe-log-groups --query 'logGroups[*].logGroupName' --output text); do
  aws logs put-retention-policy \
    --log-group-name $log_group \
    --retention-in-days 7
  echo "Set retention for $log_group"
done
```

**Instant savings: $48/month!**

### 3. Switch to Structured Logging

```javascript
// Before (unstructured)
console.log('User ' + userId + ' action: ' + action);

// After (structured)
logger.info('User action', { userId, action });
```

**Smaller logs, faster queries, lower costs!**

### 4. Implement Log Sampling

```javascript
// High-volume endpoints: Sample success, log all errors
const SAMPLE_RATE = 0.01; // 1%

if (isError || Math.random() < SAMPLE_RATE) {
  logger.info('Request processed', { ... });
}
```

**Volume reduction: 87%!**

### 5. Export to S3 + Glacier

```bash
# Monthly cron: Export old logs to S3
aws logs create-export-task \
  --log-group-name /aws/lambda/api \
  --from $(date -d '7 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination my-log-archive
```

**Storage costs: $3/month → $0.27/month!**

### 6. Use Metric Filters Instead of Custom Metrics

```bash
# Extract metrics from logs (free!)
aws logs put-metric-filter \
  --log-group-name /aws/lambda/api \
  --filter-name Errors \
  --filter-pattern '{ $.level = "ERROR" }' \
  --metric-transformations \
    metricName=Errors,metricNamespace=MyApp,metricValue=1
```

**Saved: $6/month on custom metrics!**

### 7. Delete Unused Log Groups

```bash
# Find log groups with no recent data
aws logs describe-log-groups \
  --query 'logGroups[?lastEventTime < `'$(date -d '90 days ago' +%s)'000`].logGroupName' \
  --output text

# Delete them
for log_group in $(aws logs describe-log-groups --query 'logGroups[?lastEventTime < `'$(date -d '90 days ago' +%s)'000`].logGroupName' --output text); do
  aws logs delete-log-group --log-group-name $log_group
  echo "Deleted $log_group"
done
```

**Total Monthly Savings: $244 (85% reduction!)** 🎉

## CloudWatch Alternatives (When It's TOO Expensive) 🔄

**When CloudWatch becomes prohibitively expensive:**

### Option 1: Ship Logs to Elasticsearch/OpenSearch

```javascript
const { Client } = require('@elastic/elasticsearch');
const client = new Client({ node: process.env.ELASTICSEARCH_URL });

exports.handler = async (event) => {
  try {
    const result = await processRequest(event);

    // Ship to Elasticsearch instead of CloudWatch
    await client.index({
      index: 'api-logs',
      body: {
        timestamp: new Date(),
        level: 'info',
        message: 'Request processed',
        userId: event.userId,
        duration: result.duration
      }
    });

    return result;
  } catch (error) {
    // Still log errors to CloudWatch (insurance!)
    console.error('Error:', error);
    throw error;
  }
};
```

**Cost comparison (1TB/month):**
- CloudWatch: $500 ingestion + $30 storage = **$530/month**
- Self-hosted Elasticsearch: EC2 (~$100) + EBS (~$50) = **$150/month**
- **Savings: $380/month!**

### Option 2: Datadog / New Relic (Premium Features)

**When you need:**
- Advanced APM (Application Performance Monitoring)
- Better dashboards
- Cross-service tracing
- More powerful queries

**Cost:** Higher than CloudWatch, but worth it for visibility!

### Option 3: Grafana Loki (Cheap Logs)

**Loki = "Like Prometheus, but for logs"**

```yaml
# docker-compose.yml
version: '3'
services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log
    command: -config.file=/etc/promtail/config.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
```

**Cost:** Nearly free (self-hosted!)

**My production setup:**
- **Errors/critical logs:** CloudWatch (easy AWS integration)
- **Debug logs:** Loki (cheap!)
- **APM/traces:** Datadog (premium features)

**Mix and match based on value vs. cost!** 🎯

## The CloudWatch Monitoring Checklist 🛡️

Before going to production:

- [ ] **Set log retention policies** (7 days for most logs)
- [ ] **Use structured JSON logging** (queryable fields)
- [ ] **Set log levels** (INFO in prod, DEBUG in dev)
- [ ] **Implement sampling** (for high-volume logs)
- [ ] **Create metric filters** (extract metrics from logs)
- [ ] **Set up alarms** (get notified of errors)
- [ ] **Export old logs to S3** (archive cheaply)
- [ ] **Delete unused log groups** (clean up!)
- [ ] **Use Logs Insights** (query don't download)
- [ ] **Monitor CloudWatch costs** (set billing alerts!)

## The Bottom Line 💡

CloudWatch is powerful - but it will drain your wallet if you're not careful!

**The essentials:**
1. **Log strategically** (not everything, just what matters)
2. **Set retention policies** (don't pay for old logs)
3. **Use structured logging** (JSON, queryable fields)
4. **Sample high-volume logs** (health checks, etc.)
5. **Export to S3** (archive cheaply)
6. **Use metric filters** (free metrics from logs)

**The truth about CloudWatch:**

It's not "too expensive" - it's "expensive when misconfigured!" With the right setup, it's actually cheap and incredibly useful!

**When architecting our e-commerce backend**, I learned this: CloudWatch costs scale with log volume. Reduce volume, reduce costs. Use retention policies from day one. Sample aggressively. And for the love of all that is holy, NEVER log entire request/response bodies in production! 🙏

You don't need perfect logging from day one - you need SMART logging that balances visibility with cost! 🚀

## Your Action Plan 🎯

**This week:**
1. Check your CloudWatch bill (prepare to be shocked!)
2. Set retention policies on all log groups
3. Switch to structured JSON logging
4. Implement log sampling for high-volume endpoints

**This month:**
1. Export old logs to S3
2. Create metric filters for key metrics
3. Set up Logs Insights saved queries
4. Delete unused log groups

**This quarter:**
1. Optimize log volume (target 50% reduction)
2. Automate monthly S3 exports
3. Build monitoring dashboards with Logs Insights
4. Become the CloudWatch cost optimization guru! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [CloudWatch Logs Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html) - Query language reference
- [winston](https://github.com/winstonjs/winston) - Structured logging for Node.js
- [Grafana Loki](https://grafana.com/oss/loki/) - Cheap log aggregation

**Reading list:**
- [CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/) - Know what you're paying for!
- [AWS Observability Best Practices](https://aws-observability.github.io/observability-best-practices/)

**Real talk:** The best logging strategy is visible when you need it, invisible in your AWS bill!

---

**Paying too much for CloudWatch?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your cost optimization wins!

**Want to see my logging configs?** Check out my [GitHub](https://github.com/kpanuragh) - I've got real production examples!

*Now go forth and log responsibly!* 📊💰

---

**P.S.** If you've never checked your CloudWatch costs, do that RIGHT NOW. I'll wait. Seriously. You might discover you're paying $300/month to store debug statements from 2 years ago! 😱

**P.P.S.** I once forgot to set retention policies on a Lambda function. After 6 months, we had 180GB of logs costing $5.40/month in storage PLUS the initial $90 ingestion cost. All for a function that ran once per day. Learn from my pain - SET RETENTION POLICIES! 🚨💸
