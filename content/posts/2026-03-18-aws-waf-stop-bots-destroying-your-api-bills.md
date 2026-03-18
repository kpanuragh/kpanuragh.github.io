---
title: "AWS WAF: Stop Bots From Torching Your Lambda Bills 🔥🤖"
date: "2026-03-18"
excerpt: "Your API is getting hammered by bots and you're paying Lambda's invoice for every single scraper hit. AWS WAF is the bouncer your serverless app desperately needs!"
tags: ["aws", "cloud", "serverless", "security", "waf"]
featured: true
---

# AWS WAF: Stop Bots From Torching Your Lambda Bills 🔥🤖

**Let me paint you a nightmare scenario:**

It's 2 AM. You're peacefully asleep. Somewhere in Eastern Europe, a bot farm discovers your public API. By 6 AM, you've handled **11 million requests**. By the time you get your AWS bill — $847. For one night. Of bots. Doing nothing useful.

I have lived this. Not the proudest moment of my career. ☠️

That's when I finally got serious about **AWS WAF** (Web Application Firewall), and honestly, it's one of the best $5/month decisions I've ever made.

## What Is AWS WAF, Actually? 🛡️

Think of it as a bouncer at the door of your API Gateway or CloudFront distribution.

Every request that comes in gets checked against a set of rules:

```
Request arrives
  → WAF evaluates: Is this a bot? SQL injection? Known bad IP?
  → ALLOW or BLOCK (before it even hits your Lambda)
  → Lambda never invokes for blocked requests
  → You don't pay for Lambda execution on junk traffic!
```

**The key insight:** Lambda charges per invocation. Every scraper hit, every credential stuffing attempt, every OWASP attack pattern — all of those invoke your Lambda. WAF cuts them off at the gate.

## The Attack That Made Me Finally Add WAF 💸

In production, I've deployed a serverless e-commerce backend where product catalog endpoints were public. No auth needed — just browse the catalog, right?

Here's what happened without WAF:

```
Normal day: ~50,000 requests → $4.20 Lambda cost
Bot attack day: ~11,000,000 requests → $847 Lambda cost

Difference: $842.80 for literally nothing
```

The bots were scraping product prices every 5 minutes. Our catalog. For competitor intelligence. On our bill.

After WAF: bot requests dropped **99.3%**. Monthly Lambda costs went from ~$130/month to ~$18/month. WAF costs me $23/month. Net savings: **$89/month**. WAF pays for itself and then some! 🎯

## Setting Up WAF: The Minimum Viable Bouncer 🚪

### Step 1: Create a Web ACL

```bash
# Create the WAF Web ACL
aws wafv2 create-web-acl \
  --name "my-api-protection" \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://waf-rules.json \
  --visibility-config SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName=MyApiWAF \
  --region us-east-1
```

### Step 2: The Rules That Actually Matter

```json
// waf-rules.json - Start with these three
[
  {
    "Name": "AWSManagedRulesCommonRuleSet",
    "Priority": 1,
    "OverrideAction": { "None": {} },
    "Statement": {
      "ManagedRuleGroupStatement": {
        "VendorName": "AWS",
        "Name": "AWSManagedRulesCommonRuleSet"
      }
    },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "CommonRules"
    }
  },
  {
    "Name": "RateLimitRule",
    "Priority": 0,
    "Action": { "Block": {} },
    "Statement": {
      "RateBasedStatement": {
        "Limit": 2000,
        "AggregateKeyType": "IP"
      }
    },
    "VisibilityConfig": {
      "SampledRequestsEnabled": true,
      "CloudWatchMetricsEnabled": true,
      "MetricName": "RateLimit"
    }
  }
]
```

**What this does:**
- Blocks SQL injection, XSS, and common OWASP attacks automatically
- Limits any single IP to 2,000 requests per 5 minutes (legit users never hit this)

### Step 3: Attach to API Gateway

```bash
# Get your API Gateway ARN first
aws apigateway get-rest-apis

# Associate WAF with your API stage
aws wafv2 associate-web-acl \
  --web-acl-arn arn:aws:wafv2:us-east-1:123456789:regional/webacl/my-api-protection/abc123 \
  --resource-arn arn:aws:apigateway:us-east-1::/restapis/YOUR_API_ID/stages/prod
```

That's it. Five minutes. Your API now has a bouncer. 🎉

## The Managed Rule Groups: Don't Be a Hero 🦸

AWS offers pre-built rule sets. **Use them.** Don't write your own regex patterns. You will miss things.

The ones I run in every production deployment:

| Rule Group | What It Blocks | Monthly Cost |
|---|---|---|
| `AWSManagedRulesCommonRuleSet` | OWASP Top 10, SQL injection, XSS | $1/million requests |
| `AWSManagedRulesKnownBadInputsRuleSet` | Log4j, Spring4Shell, known exploits | $1/million requests |
| `AWSManagedRulesBotControlRuleSet` | Scrapers, crawlers, headless browsers | $10/million requests |
| `AWSManagedRulesAmazonIpReputationList` | AWS-tracked malicious IPs | $1/million requests |

**When architecting on AWS, I learned:** Start with CommonRuleSet and RateLimit. Add BotControl only if you're getting hammered. Bot Control is pricier but worth it for public APIs.

## Rate Limiting: The Cheapest Bot Defense 💡

Before you even touch managed rules, rate limiting alone kills 80% of dumb bot traffic:

```json
{
  "Name": "AggressiveRateLimit",
  "Priority": 0,
  "Action": { "Block": {} },
  "Statement": {
    "RateBasedStatement": {
      "Limit": 500,
      "AggregateKeyType": "IP",
      "ScopeDownStatement": {
        "ByteMatchStatement": {
          "FieldToMatch": { "UriPath": {} },
          "PositionalConstraint": "STARTS_WITH",
          "SearchString": "/api/products",
          "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
        }
      }
    }
  }
}
```

This rule says: any single IP hitting `/api/products` more than 500 times in 5 minutes gets blocked. Real users browse 10-20 products. Scrapers hit 10,000+.

**A serverless pattern that saved us:** Rate limiting per endpoint, not globally. Your checkout endpoint needs stricter limits than your blog feed! 🎯

## WAF Gotchas I Hit in Production 🪤

### Gotcha #1: Count Mode First, Then Block

**Never** enable a new rule in Block mode immediately.

```json
// BAD: You'll block legitimate traffic you didn't expect
{
  "Action": { "Block": {} }
}

// GOOD: Watch what would be blocked for 24 hours first
{
  "Action": { "Count": {} }
}
```

I once blocked an entire region's worth of mobile users because a managed rule flagged a common user-agent string. Count mode for 48 hours, then switch to Block. Every time. No exceptions.

### Gotcha #2: WAF Doesn't Protect Lambda Function URLs (Yet)

If you moved to Lambda Function URLs to save on API Gateway costs (smart!), WAF can't attach to them directly. Your options:

1. Put CloudFront in front → attach WAF to CloudFront (works great, small extra cost)
2. Stay on API Gateway for public endpoints (worth it for WAF support)
3. Implement rate limiting inside Lambda itself (worse, but free)

In production, I've deployed CloudFront + WAF + Lambda Function URLs. It's the best of all worlds — cheap execution, CDN caching, AND bot protection.

### Gotcha #3: The False Positive Spiral

Managed rules are aggressive. You WILL get false positives.

**Common culprits:**
- Mobile SDKs with weird user-agents → triggers BotControl
- Form fields that look like SQL → triggers CommonRuleSet
- Large JSON payloads → sometimes triggers size constraints

```bash
# Check what WAF is actually blocking
aws wafv2 get-sampled-requests \
  --web-acl-arn YOUR_ARN \
  --rule-metric-name CommonRules \
  --scope REGIONAL \
  --time-window StartTime=2026-03-18T00:00:00,EndTime=2026-03-18T23:59:59 \
  --max-items 100
```

Read the sampled requests before you go full Block mode. I cannot stress this enough.

### Gotcha #4: WAF Logging Costs Real Money

WAF can log every single request to CloudWatch Logs or S3. Don't enable full logging on a high-traffic API without thinking.

**My setup:**
```bash
# Log only BLOCKED requests (the ones you care about)
aws wafv2 put-logging-configuration \
  --logging-configuration '{
    "ResourceArn": "YOUR_WAF_ARN",
    "LogDestinationConfigs": ["arn:aws:s3:::my-waf-logs"],
    "LoggingFilter": {
      "DefaultBehavior": "DROP",
      "Filters": [{
        "Behavior": "KEEP",
        "Conditions": [{
          "ActionCondition": { "Action": "BLOCK" }
        }],
        "Requirement": "MEETS_ANY"
      }]
    }
  }'
```

Log all requests → $$$. Log only blocked → $. You want the second one.

## The Cost Breakdown (Because AWS Billing Is A Sport) 💰

**WAF Pricing:**
- Web ACL: $5/month
- Each rule: $1/month
- Requests: $0.60 per million (REGIONAL) or $0.60 per million (CloudFront)
- Bot Control: $10 per million requests evaluated

**My production API (500k requests/day):**

| Component | Monthly Cost |
|---|---|
| Web ACL | $5.00 |
| 3 rule groups | $3.00 |
| 15M requests × $0.60 | $9.00 |
| **Total WAF** | **$17.00** |
| Lambda savings (blocking 40% junk traffic) | -$55.00 |
| **Net gain** | **+$38.00/month** |

WAF costs me money but **saves me more money**. That's the calculation you need to do.

## Setting Billing Alerts (Do This Now) 🚨

Before anything else, set up a WAF budget alert:

```bash
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget '{
    "BudgetName": "WAF-Monthly",
    "BudgetLimit": { "Amount": "50", "Unit": "USD" },
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {
      "Service": ["AWS WAF"]
    }
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80
    },
    "Subscribers": [{
      "SubscriptionType": "EMAIL",
      "Address": "you@yourcompany.com"
    }]
  }]'
```

If WAF suddenly costs $200, either you're under a massive attack (good — it's blocking!) or Bot Control is evaluating more traffic than expected (check your rules).

## The "Should I Use WAF?" Decision Tree 🌳

**Yes, use WAF if:**
- ✅ Your API is publicly accessible (no auth on all endpoints)
- ✅ You're on Lambda + API Gateway (pay per invocation = bot traffic = direct cost)
- ✅ You handle payments, user data, or anything sensitive
- ✅ You're getting more than 1M requests/month

**Maybe skip WAF if:**
- ⚠️ Internal API only (no public traffic)
- ⚠️ Very low traffic (<100k requests/month) — rate limiting in your app might be enough
- ⚠️ Already behind another WAF (Cloudflare, etc.)

**In production, I've deployed** WAF on every public-facing API Gateway. Even tiny ones. The $5/month Web ACL base cost is cheaper than a single bot attack morning.

## Quick Start Checklist ✅

Here's what I do for every new production deployment:

1. **Create Web ACL** (5 min)
2. **Add Rate Limit rule** — 2,000 req/5min/IP (2 min)
3. **Add CommonRuleSet in COUNT mode** (2 min)
4. **Wait 48 hours**, check sampled requests
5. **Switch to BLOCK mode** if no false positives
6. **Add IP Reputation list** — free money (2 min)
7. **Set up billing alert** (5 min)
8. **Done.** Sleep without bot nightmares! 😴

Total setup time: ~15 minutes. Time it saves: countless $800 surprise bills.

## The Bottom Line 💡

AWS WAF is not sexy. Nobody brags at conferences about their WAF configuration. But when your serverless app gets hit by bots at 2 AM, WAF is the difference between "minor incident" and "I have to explain this bill to my CTO."

**The truth about serverless security:**

Every unprotected Lambda invocation is a line on your AWS bill. Bots don't care. Scrapers don't care. Attackers definitely don't care. WAF is the cheapest insurance policy in AWS.

**A serverless pattern that saved us:** CloudFront → WAF → API Gateway → Lambda. Every public API. No exceptions. Your future self will thank you when the bot farmers come knocking.

---

**Got a WAF false positive horror story?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got a collection of "that rule blocked what?!" moments.

**Want to see how I structure WAF rules for e-commerce?** Check out my [GitHub](https://github.com/kpanuragh) for infrastructure templates!

*Now go protect your APIs before the bots find you!* 🛡️🤖

---

**P.S.** If you're reading this because you just got a surprise AWS bill — first, breathe. Second, enable WAF. Third, set billing alerts so this never happens again. Been there. Survived. You will too! 💪

**P.P.S.** The bot that triggered my $847 bill was probably some startup's price comparison scraper. I hope their VC pitch went terribly. 😤
