---
title: "CloudFront CDN: Stop Making Your Users in Mumbai Download From Oregon ☁️🚀"
date: "2026-02-25"
excerpt: "Your images are fast. In Virginia. Users in Singapore are crying. Let me tell you how CloudFront fixed our e-commerce app and why cache invalidation is still the hardest problem in computer science."
tags: ["aws", "cloud", "cloudfront", "cdn", "performance"]
featured: true
---

# CloudFront CDN: Stop Making Your Users in Mumbai Download From Oregon ☁️🚀

**True story:** We launched our e-commerce platform, backend humming on AWS, feeling invincible. Then a user from Singapore reported that our product images took 8 seconds to load.

I checked the server. Perfectly healthy. Checked the logs. Requests coming in fine. Then I realized: our assets were sitting in `us-east-1`, and this poor user's browser was literally reaching across the Pacific Ocean every single time. 🌊

That's when I learned that **geography is a latency issue, not a feelings issue.**

Welcome to CloudFront - AWS's CDN that puts your content physically closer to your users. And no, "just use S3" is not the same thing. I learned that the expensive way.

## What CloudFront Actually Does (Not the Marketing Version) 🌐

Your S3 bucket lives in one region. Your users live everywhere. Without a CDN:

```
User in Tokyo → request → us-east-1 server → response → User in Tokyo
Round trip: ~180ms per asset × 50 assets = 9 seconds of sadness 😢
```

With CloudFront:

```
User in Tokyo → Edge Location in Tokyo → cached response
Round trip: ~5ms per asset × 50 assets = 250ms of joy 🎉
```

CloudFront has **450+ edge locations worldwide**. When you configure it, AWS literally caches your content at data centers close to your users. The first request goes to your origin (S3, EC2, ALB). Every subsequent request? Served from the nearest edge.

**In production, I've deployed** CloudFront in front of our entire asset pipeline. Our Singapore users went from 8-second loads to sub-second. The client thought we upgraded the servers. We just moved the files closer to them! 😄

## Setting It Up (The Minimal Viable Config) ⚙️

The basic setup takes 5 minutes:

```bash
# Create a CloudFront distribution pointing to your S3 bucket
aws cloudfront create-distribution \
  --origin-domain-name my-bucket.s3.amazonaws.com \
  --default-root-object index.html
```

But the REAL config you want (via the console or CDK):

```json
{
  "Origins": [{
    "DomainName": "my-store-assets.s3.amazonaws.com",
    "S3OriginConfig": {
      "OriginAccessIdentity": "origin-access-identity/cloudfront/ABCDEF"
    }
  }],
  "DefaultCacheBehavior": {
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true
  },
  "PriceClass": "PriceClass_100"
}
```

That `PriceClass_100`? I'll get to it. It saved us money and nobody noticed. 💰

## The Cache-Control Header That Changed Everything ⚡

When architecting on AWS, I learned that **CloudFront is only as smart as your Cache-Control headers.** Ship the wrong ones, and you'll be crying about stale content for weeks.

**The pattern that saved us on our product catalog:**

```
Static assets (images, CSS, JS with hash in filename):
Cache-Control: public, max-age=31536000, immutable
# 1 year cache. Why? Because the filename CHANGES when content changes!
# product-image-a3f9d2.jpg → product-image-bb1c4e.jpg

Dynamic API responses:
Cache-Control: no-cache, no-store
# Never cache these. Ever.

HTML pages:
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
# 1 hour fresh, 24 hours stale-while-revalidating
```

**What I got wrong at first:** I set `max-age=86400` on HTML files without versioned filenames. Deployed a CSS fix. Users were still seeing the broken version the next day. 😭

**The rule:** Hash your asset filenames at build time. Then cache aggressively. No filename hash? No long-term caching. This is non-negotiable.

## Cache Invalidation: The Famously Hard Problem 💥

Phil Karlton famously said: *"There are only two hard things in Computer Science: cache invalidation and naming things."*

He was right. And CloudFront makes it real.

When you push new content, CloudFront's edge caches don't know. They'll happily serve your old, broken homepage until the TTL expires.

**The nuclear option:**
```bash
# Invalidate everything (costs money and takes time!)
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths "/*"
```

**My production approach instead:**

A serverless pattern that saved us: **versioned asset filenames + a minimal invalidation strategy**.

```bash
# Only invalidate what actually changed
aws cloudfront create-invalidation \
  --distribution-id E1234567890 \
  --paths "/index.html" "/sitemap.xml"
# Images/CSS/JS never need invalidation - filenames change!
```

**The gotcha:** CloudFront charges $0.005 per invalidation path (after 1,000 free per month). Invalidating `/*` on every deploy will eat your free tier fast. Versioned filenames + selective invalidation = $0 in invalidation costs for us. 🤑

## PriceClass: The Hidden Cost Lever 💰

CloudFront has three pricing tiers:

| PriceClass | Edge Locations | Monthly Cost (typical) |
|---|---|---|
| All | 450+ everywhere | $$$ |
| 200 | Excl. expensive regions | $$ |
| 100 | US, Canada, Europe only | $ |

**Our mistake:** We defaulted to `PriceClass_All` because "more is better, right?"

Then I looked at our analytics. 85% of users were in US/Europe/India. We were paying premium prices to cache content in South America and Australia for the remaining 15% - who could wait 200ms instead of 10ms.

Switched to `PriceClass_100`. Bill dropped 40%. The 15% of users? Still way faster than before CloudFront. Nobody noticed. Nobody complained. I bought coffee with the savings. ☕

**Cost rule of thumb:** Match PriceClass to where 80%+ of your users actually live.

## The Security Config You Must Enable 🔐

CloudFront isn't just a CDN - it's your first line of defense if you wire it up right.

**Block direct S3 access (OAC):**

```json
{
  "Origins": [{
    "OriginAccessControlId": "your-oac-id"
  }]
}
```

```json
// S3 bucket policy - only CloudFront can read
{
  "Effect": "Allow",
  "Principal": {
    "Service": "cloudfront.amazonaws.com"
  },
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-bucket/*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::123456789:distribution/ABCDEF"
    }
  }
}
```

**Why this matters:** Without it, users can bypass CloudFront and hit your S3 bucket directly. That means bypassing your WAF rules, your geo-restrictions, and your signed URL enforcement. In production, I've seen this exploited to enumerate private product data. Lock it down.

Also, enable **HTTPS redirect** and **HSTS headers** in your response headers policy. Free security, free credibility.

## Lambda@Edge: When CDN Isn't Enough 🧠

Sometimes you need logic at the edge. CloudFront lets you attach Lambda functions that run in edge locations.

**A real use case from our stack:** A/B testing without latency.

```javascript
// Lambda@Edge viewer-request function
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;

  // Route 20% of users to new checkout flow
  const userId = headers['x-user-id']?.[0]?.value || '';
  const variant = parseInt(userId.slice(-1), 16) < 3 ? 'b' : 'a';

  // Rewrite URL at the edge - zero latency A/B testing
  if (variant === 'b' && request.uri.startsWith('/checkout')) {
    request.uri = request.uri.replace('/checkout', '/checkout-v2');
  }

  return request;
};
```

**A serverless pattern that saved us:** Running this at the edge means the A/B routing decision happens in ~1ms, before the request even leaves the nearest data center. No cold starts. No round trips. Just fast.

**Gotcha:** Lambda@Edge has limits. Max 1MB code size. Max 5 seconds execution. Can't use environment variables (store config in SSM and fetch it). Can't access VPC resources. Know the constraints before you start.

## The Mistakes I Made (So You Don't Have To) 🪤

### Mistake #1: Caching API Responses by Accident

I attached CloudFront to our ALB, which sat in front of both our static site AND our API. Didn't configure separate cache behaviors.

```
/api/* → Should NOT be cached
/* → Should be cached
```

Result: User A placed an order. User B refreshed the orders page and saw User A's order. 😱

**Fix:**
```json
{
  "CacheBehaviors": [{
    "PathPattern": "/api/*",
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    // "CachingDisabled" policy - zero caching
  }]
}
```

Always add explicit `PathPattern` rules for your API routes. Always. No exceptions.

### Mistake #2: Not Enabling Compression

CloudFront can gzip/brotli compress responses on the fly. I didn't enable it for 6 months.

```json
{
  "DefaultCacheBehavior": {
    "Compress": true  // This one line. I missed this for 6 months. 🤦
  }
}
```

Enabling it reduced our average page transfer size by 70%. Faster loads, less bandwidth cost. One boolean. Six months of wasted bandwidth.

### Mistake #3: Forgetting About Cache Behavior Order

CloudFront evaluates `CacheBehaviors` in order, first match wins.

```
Bad order:
  /* → cached (matches everything!)
  /api/* → not cached (never reached!)

Good order:
  /api/* → not cached (checked first)
  /* → cached (fallback)
```

More specific paths first. Always. I spent an hour debugging why API caching wasn't disabled before I realized my rule order was backwards.

## Real Cost Numbers from Production 💸

Our e-commerce platform stats (before/after CloudFront):

| Metric | Before | After |
|---|---|---|
| Avg page load (Asia) | 6.8s | 0.9s |
| S3 transfer cost/month | $180 | $22 |
| CloudFront cost/month | $0 | $38 |
| Total | $180 | $60 |
| Net savings | - | **$120/month** |

**The math:** S3 charges $0.09/GB for data transfer. CloudFront charges $0.0085/GB (10x cheaper for transfers to end users!) PLUS you serve 99% from cache, so origin requests plummet.

**When I architected our CDN layer**, I expected it to cost more. It actually saved us money while making the site dramatically faster. If that's not a win, I don't know what is.

## The CloudFront + S3 Checklist ✅

Before you go live, verify:

1. **OAC configured** - S3 bucket only accessible via CloudFront
2. **HTTPS redirect** enabled (`ViewerProtocolPolicy: redirect-to-https`)
3. **Compression** enabled (`Compress: true`)
4. **Cache behaviors** split by path (`/api/*` uncached, `/*` cached)
5. **Cache-Control headers** set correctly on your origin
6. **Asset filenames hashed** at build time
7. **PriceClass** matched to your actual user geography
8. **Custom error pages** configured (return your branded 404, not AWS's ugly one)

## TL;DR 💡

CloudFront is one of those AWS services where you wonder why you waited so long. It:

- **Cuts latency** by serving content from 450+ edge locations
- **Reduces costs** because CloudFront transfer is 10x cheaper than S3 direct
- **Adds security** by hiding your origin and enabling WAF
- **Scales automatically** to any traffic spike you can throw at it

The hard parts? Cache invalidation (version your filenames), cache behavior ordering (specific before generic), and not accidentally caching your API (always add `/api/*` rules explicitly).

**In production, I've deployed** CloudFront on everything from static marketing sites to high-traffic e-commerce platforms. It's never been the bottleneck. It's always been the fix.

Stop making your users cross oceans for your JavaScript bundle. Put it on CloudFront. Your users - and your AWS bill - will thank you. 🌍⚡

---

**Got a CloudFront war story?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I especially want to hear about cache invalidation disasters. Misery loves company!

**Curious about my full serverless architecture?** Check out [GitHub](https://github.com/kpanuragh) for real examples.

*Go forth and cache everything (except your API). ☁️🔥*

---

**P.S.** CloudFront distributions take 15-20 minutes to deploy globally. That's 15-20 minutes where you refresh the console compulsively and accomplish nothing else. Plan accordingly. 😅

**P.P.S.** If you accidentally enable caching on your checkout API and charge customers twice, that's a bad day. Been there. Set up `CachingDisabled` behavior policies BEFORE you go live. You've been warned! 🚨
