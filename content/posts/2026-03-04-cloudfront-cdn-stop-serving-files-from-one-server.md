---
title: "CloudFront: Your Website Is Slow and It's Totally Your Fault ☁️⚡"
date: "2026-03-04"
excerpt: "I once served 10,000 users in Tokyo from a single EC2 instance in us-east-1. Every image, every CSS file, every API response — round-tripping 14,000km across the Pacific. My users were not happy. CloudFront fixed it. Let me save you the embarrassment."
tags: ["aws", "cloud", "cloudfront", "cdn", "performance"]
featured: true
---

# CloudFront: Your Website Is Slow and It's Totally Your Fault ☁️⚡

**Unpopular opinion:** Most websites are needlessly slow because the developer who built them thought geography was someone else's problem.

I was that developer. Twice.

The first time, I deployed an e-commerce backend to a single EC2 instance in `us-east-1` and called it "production." Users in Singapore were waiting 800ms just for the HTML to load. Not the images. Not the JavaScript. The *HTML*. A text file. Traveling 16,000km round-trip like it was on vacation. 🌏✈️

AWS CloudFront changed everything. Let me show you how it works and, more importantly, how to actually use it correctly.

## What CloudFront Actually Is ☁️

CloudFront is AWS's Content Delivery Network (CDN). You've probably heard "CDN" before and glazed over. Let me make it concrete.

Your server lives in one data center. Your users are everywhere. Every request has to travel from the user → your server → back to the user. The farther the distance, the slower it is. This is physics, not a bug.

CloudFront solves this by **caching your content at 450+ edge locations worldwide**. Instead of Tokyo → Virginia → Tokyo, it's Tokyo → CloudFront Tokyo → Tokyo. Same result, 90% less travel time. ⚡

```
Without CloudFront:
User in Tokyo → EC2 in us-east-1 (150ms one-way latency)
Total round trip for a cached file: 300ms+ of pure network overhead

With CloudFront:
User in Tokyo → CloudFront Tokyo edge (5ms)
Total round trip for a cached file: ~10ms

30x improvement. For FREE (well, almost).
```

**In production, I've deployed** CloudFront in front of our entire e-commerce stack — static assets, API Gateway, even the checkout flow. Page load times in Southeast Asia dropped from 3.2 seconds to 0.4 seconds. That's not optimization. That's resurrection. 🚀

## Setting Up CloudFront (The Non-Embarrassing Way) 🚀

The most common setup: CloudFront in front of an S3 bucket for static assets.

```bash
# Create a CloudFront distribution pointing to your S3 bucket
aws cloudfront create-distribution \
  --origin-domain-name mybucket.s3.amazonaws.com \
  --default-root-object index.html \
  --query 'Distribution.DomainName'
```

But here's the gotcha that bites everyone: **don't make your S3 bucket public**. Instead, use an Origin Access Control (OAC) so only CloudFront can read from S3. Your bucket stays private, CloudFront fetches from it, users get the files. No direct S3 URL leakage. 🔒

```json
{
  "Origins": {
    "Items": [{
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "OriginAccessControlId": "YOUR_OAC_ID"
    }]
  }
}
```

**When architecting on AWS, I learned:** If your S3 origin is public AND you have CloudFront, you're paying for CDN while still exposing your origin. Use OAC. Always.

## Multiple Origins: The Real Power Move 💪

Here's where CloudFront gets genuinely exciting. You don't have to pick one origin. You can route **different URL paths to different backends**.

```
/api/*          → API Gateway (Lambda backend)
/images/*       → S3 bucket (static assets)
/static/*       → S3 bucket (CSS, JS)
/*              → EC2 or Elastic Load Balancer (dynamic content)
```

This is what I use in our e-commerce backend:

```bash
# Add a second origin (API Gateway)
aws cloudfront update-distribution \
  --id YOUR_DIST_ID \
  --if-match ETAG \
  --distribution-config file://distribution-config.json
```

```json
{
  "CacheBehaviors": {
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "api-gateway-origin",
        "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
        "ViewerProtocolPolicy": "https-only",
        "AllowedMethods": {
          "Items": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
          "CachedMethods": { "Items": ["GET", "HEAD"] }
        }
      }
    ]
  }
}
```

**A serverless pattern that saved us:** API endpoints that return user-specific data → `Cache-Control: no-store`. Product catalog that changes hourly → `Cache-Control: max-age=3600`. Home page hero banner that changes monthly → `Cache-Control: max-age=2592000`. Match your TTLs to how often your data actually changes. 🎯

## Cache Invalidation: The Art of Forgetting Quickly 🗑️

You deployed new CSS. CloudFront is still serving the old CSS to users. You've been staring at this for 20 minutes.

Welcome to cache invalidation — one of the two hard problems in computer science (the other being naming things and off-by-one errors).

**The nuclear option (don't overuse this):**
```bash
# Invalidate everything — costs money, takes ~60 seconds
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

**The smart option (what I actually do):**

Don't invalidate. Use **cache-busting file names** instead.

```
Bad:  /static/app.css          → cached forever, hard to update
Good: /static/app.abc123ef.css → content hash in filename
```

Your build tool (Vite, Webpack, etc.) does this automatically. When the file changes, the hash changes, the URL changes, CloudFront fetches the new file. Zero invalidation needed. Zero delay. Zero cost. 🎉

**Cost reality check:** Each invalidation path costs $0.005 after the first 1,000 free paths per month. Running `/*` invalidation on every deploy adds up fast if you're deploying 20 times a day. Use content hashing. Your AWS bill will thank you.

## Lambda@Edge: Running Code at the Edge 🌐

This is where things get genuinely wild. Lambda@Edge lets you run JavaScript at CloudFront's edge locations — before the request hits your origin.

**Real use case: A/B testing without origin traffic:**
```javascript
// CloudFront viewer-request function
function handler(event) {
  const request = event.request;
  const cookie = request.cookies['ab-variant'];

  if (!cookie) {
    // Randomly assign variant, set cookie
    const variant = Math.random() < 0.5 ? 'A' : 'B';
    request.headers['x-ab-variant'] = { value: variant };
  }

  return request;
}
```

**Real use case: Blocking bad actors at the edge (before paying Lambda costs):**
```javascript
function handler(event) {
  const request = event.request;
  const ip = event.viewer.ip;

  // Block known bad IPs before they hit your origin at all
  const blocklist = ['1.2.3.4', '5.6.7.8'];
  if (blocklist.includes(ip)) {
    return {
      statusCode: 403,
      statusDescription: 'Forbidden',
    };
  }

  return request;
}
```

**When architecting on AWS, I learned:** Lambda@Edge runs at the edge for free up to 10 million requests/month. Using it to block scrapers and bad bots reduced our origin Lambda invocations by ~18% — which on a high-traffic e-commerce site means hundreds of dollars saved per month. Block the junk before it ever reaches your backend. 🛡️

## The Common Gotchas That Will Ruin Your Day 🪤

**Gotcha #1: HTTPS redirect is not on by default**

New CloudFront distribution? HTTP requests are allowed by default. Your users will hit your site over plain HTTP unless you explicitly set `ViewerProtocolPolicy: redirect-to-https`. I've seen production e-commerce checkouts running over HTTP because someone forgot this. 😱

```bash
aws cloudfront update-distribution \
  --distribution-config '{"ViewerProtocolPolicy": "redirect-to-https"}'
```

**Gotcha #2: Your cache is caching errors**

CloudFront caches 5xx errors by default for 5 seconds. You deploy bad code, it throws 500 errors, CloudFront serves those 500 errors from cache for 5 seconds even after you roll back. Set your error caching TTL explicitly:

```json
{
  "CustomErrorResponses": {
    "Items": [{
      "ErrorCode": 500,
      "ErrorCachingMinTTL": 0
    }]
  }
}
```

Zero error caching. Let every request reach your origin until you fix the problem. Your users won't be stuck with cached errors.

**Gotcha #3: Forgetting to compress**

CloudFront can gzip/Brotli compress responses automatically. If you're not enabling this, you're serving uncompressed HTML, CSS, and JSON to every user. Enable it:

```json
{
  "Compress": true
}
```

A typical JSON API response that's 8KB uncompressed becomes 1.5KB compressed. That's a 5x reduction in data transfer costs and 5x faster downloads. On 10M requests/month, this matters.

## Real Cost Numbers 💰

Here's what CloudFront actually costs for a medium-traffic e-commerce site:

```
Our numbers (Southeast Asia + Europe traffic):
  Data transfer out: 500GB/month × $0.085/GB = $42.50
  HTTP requests:     50M/month × $0.0090/10K = $45.00
  Lambda@Edge:       2M requests × $0.60/1M  = $1.20
  Invalidations:     ~0 (we use content hashing)

  Total CloudFront:  ~$89/month

Before CloudFront:
  Extra EC2 capacity to handle global latency:     $180/month
  CDN for static assets (3rd party):               $65/month
  Bounce rate from slow SEA users (lost revenue):  priceless

  Total "before":    $245/month + customer churn
```

CloudFront costs less than the alternative and makes your product better. That's a rare combination in AWS. 💡

## TL;DR: CloudFront Survival Guide 🎯

**Existing AWS posts covered:** Lambda cold starts, VPC, IAM, Step Functions, EventBridge, EC2 Auto Scaling, API Gateway, DynamoDB, S3 security, CloudWatch, Cognito, Terraform, SQS, ElastiCache. **This one:** CloudFront CDN.

1. **Use Origin Access Control** — keep S3 private, let only CloudFront in
2. **Multiple origins per distribution** — route `/api/*` to Lambda, `/static/*` to S3
3. **Content hash filenames** — never invalidate the whole cache again
4. **Enable compression** — `"Compress": true`. One line. 5x bandwidth savings.
5. **Force HTTPS** — `redirect-to-https`. Non-negotiable.
6. **Set error caching to 0** — don't cache your 500 errors
7. **Lambda@Edge for edge logic** — block bad actors before they cost you Lambda invocations

CloudFront is the single highest-ROI service I've added to our stack. One afternoon of setup. Permanent performance improvement everywhere in the world.

Your users in Tokyo shouldn't be suffering because your server is in Virginia. Fix it. ☁️

---

**Still serving static files from a single EC2?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got the latency graphs and AWS bills to prove CloudFront pays for itself inside month one.

**Want to see the full multi-origin setup?** Check out my [GitHub](https://github.com/kpanuragh) for real CloudFront distribution configs from production e-commerce backends!

*Now go put a CDN in front of that server before a user in Singapore files a bug report.* ⚡

---

**P.S.** The Tokyo users from my early e-commerce days? After adding CloudFront, our Southeast Asia conversion rate increased by 23%. Turns out people buy things faster when the website isn't slow. Who knew. 🚀
