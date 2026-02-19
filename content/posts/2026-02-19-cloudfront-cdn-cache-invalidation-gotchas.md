---
title: "AWS CloudFront: The CDN That Can Save You Thousands (Or Cost You Thousands) ☁️⚡"
date: "2026-02-19"
excerpt: "CloudFront is the best CDN on the planet when configured right. And an expensive, confusing mess when configured wrong. I've done both. Let me save you from the expensive part."
tags: ["aws", "cloud", "serverless", "cloudfront", "cdn"]
featured: true
---

# AWS CloudFront: The CDN That Can Save You Thousands (Or Cost You Thousands) ☁️⚡

**Picture this:** It's Black Friday. Your e-commerce site goes viral. Every product image, every API call, every checkout page is hammering your origin servers. Your EC2 instances are crying. Your RDS is begging for mercy. Your AWS bill is heading somewhere you don't want to look.

Then you enable CloudFront and suddenly... it's fine. Half your traffic never even reaches your servers.

That's the dream. I've lived it. I've also lived the nightmare where CloudFront was misconfigured and I was paying for cache misses on every single request while also paying for origin bandwidth. Both are real. Let's make sure you get the dream version.

## What CloudFront Actually Does ☁️

AWS CloudFront is a Content Delivery Network (CDN) with 450+ edge locations globally. When a user in Mumbai requests your product image stored in an S3 bucket in us-east-1, without CloudFront they're doing a round trip across the Atlantic. With CloudFront? They hit the nearest edge in Mumbai.

```
Without CloudFront:
User (Mumbai) ──────────────────────────→ S3 (Virginia) 😬 ~200ms

With CloudFront:
User (Mumbai) → CloudFront Edge (Mumbai) → Cache Hit! ⚡ ~5ms
                                          → Cache Miss → S3 (Virginia) → Cache stored
```

**In production, I've deployed** CloudFront in front of:
- S3 static assets (product images, CSS, JS)
- Our REST API via API Gateway
- Our Laravel app running on EC2
- Even our payment checkout page

The speed difference is immediately visible. Users notice sub-200ms response times. They don't notice 800ms. Your conversion rate notices the difference.

## The Three Things CloudFront Fronts 🎯

**1. S3 Buckets (most common)**

```
User → CloudFront → S3 Bucket (private!)
```

Your S3 bucket stays private. CloudFront is the only one with access. No more accidental public buckets.

**2. API Gateway / Lambda**

```
User → CloudFront → API Gateway → Lambda
```

Cache API responses at the edge. A product catalog endpoint that returns the same data 10,000 times per minute? Cache it. Your Lambda bill just dropped 90%.

**3. EC2 / Load Balancer**

```
User → CloudFront → ALB → EC2 instances
```

Static assets served from cache. Dynamic requests pass through. DDoS protection included.

## Setting Up CloudFront Right ✅

The minimum viable setup I use for every new project:

```yaml
# CloudFormation template (simplified)
CloudFrontDistribution:
  Type: AWS::CloudFront::Distribution
  Properties:
    DistributionConfig:
      Origins:
        - DomainName: !Sub "${AssetsBucket}.s3.amazonaws.com"
          Id: S3Origin
          S3OriginConfig:
            OriginAccessIdentity: !Sub "origin-access-identity/cloudfront/${OAI}"
      DefaultCacheBehavior:
        TargetOriginId: S3Origin
        ViewerProtocolPolicy: redirect-to-https  # Always HTTPS!
        CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6"  # CachingOptimized
        Compress: true  # Enable gzip/brotli compression
      PriceClass: PriceClass_100  # US/Europe/Asia only (cheapest)
      Enabled: true
```

**When architecting on AWS, I learned:** `PriceClass_100` vs `PriceClass_All` is not obvious. `PriceClass_All` uses ALL 450+ edge locations globally. `PriceClass_100` uses the cheapest regions (US, Europe, Asia Pacific). For most apps, `PriceClass_100` covers 90%+ of your users for 50% of the cost.

## Cache Policies: The Part Everyone Gets Wrong 🙈

This is where I see the most mistakes. CloudFront has three built-in cache policies:

| Policy | TTL | Use Case |
|---|---|---|
| `CachingOptimized` | 24 hours | Static files (images, CSS, JS) |
| `CachingDisabled` | 0 (no cache) | Dynamic API responses |
| `CachingOptimizedForUncompressedObjects` | 24 hours | Already-compressed files |

**The mistake I made early on:** I used `CachingDisabled` on everything because I was scared of serving stale data. Result? CloudFront became an expensive reverse proxy that added latency instead of reducing it. Every request still hit origin. I was paying for CloudFront AND full origin costs.

**The fix:** Cache aggressively. Use versioned file names for assets:

```
# Bad: users might get stale CSS
https://cdn.example.com/app.css

# Good: cache forever, new deploy = new filename
https://cdn.example.com/app.abc123.css
```

**A serverless pattern that saved us:** Hash-based filenames for all static assets. Vite, Webpack, and most modern bundlers do this automatically. Set `max-age=31536000` (1 year) on these files. Cache them forever. Your S3 costs for bandwidth drop to near zero.

## Cache Invalidation: The $0.005 Gotcha 💸

Everyone knows cache invalidation is hard. What nobody tells you is it's also not free on CloudFront.

**The pricing:**
- First 1,000 invalidation paths per month: **Free**
- After that: **$0.005 per path**

That sounds cheap. It's not if you're invalidating `/*` (wildcard) on every deploy.

**The trap I fell into:**

```bash
# STOP doing this on every deploy
aws cloudfront create-invalidation \
  --distribution-id ABCDEF123456 \
  --paths "/*"
```

`/*` counts as ONE path. $0.005 once. Fine for occasional deploys.

But when we had a CI/CD pipeline doing 50 deploys a day in staging? Invalidating `/*` 50 times? That's 50 paths... but it forced CloudFront to re-fetch everything from origin 50 times across all edge locations. The latency hit was massive.

**The right approach:**

```bash
# Only invalidate what actually changed
aws cloudfront create-invalidation \
  --distribution-id ABCDEF123456 \
  --paths "/products/*" "/api/catalog"
```

Or better: use versioned filenames and stop invalidating entirely.

## CloudFront Functions vs Lambda@Edge: Pick Wisely ⚡

CloudFront lets you run code at the edge. Two options:

**CloudFront Functions** (new, fast, cheap):
- Runs in <1ms
- JavaScript only
- $0.10 per million invocations
- Great for: URL rewrites, header manipulation, auth token validation

**Lambda@Edge** (powerful, slower, expensive):
- Runs in 5-10ms+
- Node.js or Python
- $0.60 per million + Lambda pricing
- Great for: Complex auth, A/B testing, personalization

**In production, I've deployed** CloudFront Functions for simple redirects:

```javascript
// CloudFront Function: Redirect /old-path to /new-path
function handler(event) {
  var request = event.request;

  if (request.uri.startsWith('/old-products')) {
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: {
        location: { value: request.uri.replace('/old-products', '/products') }
      }
    };
  }

  return request;
}
```

Runs at the edge. Zero Lambda cold starts. 5 billion invocations/month for $500 (vs Lambda@Edge which would cost ~$3,000 for the same volume).

**When architecting on AWS, I learned:** If you're thinking Lambda@Edge, first ask: can a CloudFront Function do this? Usually it can.

## The Security Setup You Need 🔒

**Origin Access Control (OAC)** - Don't use Origin Access Identity (OAI) anymore. AWS deprecated it. Use OAC:

```yaml
S3BucketPolicy:
  Type: AWS::S3::BucketPolicy
  Properties:
    Bucket: !Ref AssetsBucket
    PolicyDocument:
      Statement:
        - Effect: Allow
          Principal:
            Service: cloudfront.amazonaws.com
          Action: s3:GetObject
          Resource: !Sub "${AssetsBucket.Arn}/*"
          Condition:
            StringEquals:
              AWS:SourceArn: !Sub "arn:aws:cloudfront::${AWS::AccountId}:distribution/${CloudFrontDistribution}"
```

Your S3 bucket is now completely private. Only CloudFront can read it. No accidental public exposure.

**SSL/TLS:** CloudFront includes a free SSL certificate via AWS Certificate Manager for custom domains. No excuse for HTTP.

## Cost Optimization That Actually Works 💰

**My real numbers from production (e-commerce site, ~2M requests/month):**

| Cost Item | Before CloudFront | After CloudFront |
|---|---|---|
| S3 bandwidth | $180/month | $12/month |
| EC2 bandwidth | $340/month | $45/month |
| CloudFront cost | $0 | $28/month |
| **Total** | **$520/month** | **$85/month** |

CloudFront paid for itself 15x over.

**The tricks:**

1. **Free tier:** First 1TB of data out per month is free. Small sites pay nothing.
2. **Compress everything:** Enable `Compress: true`. Gzip/Brotli reduces payload size 60-80%. Less bandwidth = less cost.
3. **Right-size your TTL:** Don't cache API responses for 24 hours (staleness), but don't cache for 0 seconds either. Product catalogs? 5 minutes is fine. User-specific data? Don't cache at all.
4. **WAF integration:** AWS WAF in front of CloudFront blocks bad bots before they touch your origin. Bad bots represented 30% of our traffic. 30% savings on origin costs just from blocking them.

## Common Pitfalls to Avoid 🪤

**Pitfall #1: Caching authenticated requests**

If your API returns different data based on the user's JWT, and you cache at CloudFront, user A gets user B's data. A security nightmare.

Fix: Either don't cache authenticated endpoints, or use CloudFront's cache key to vary by `Authorization` header (expensive - unique cache per user, defeats the purpose).

**Pitfall #2: Not setting up custom error pages**

```yaml
CustomErrorResponses:
  - ErrorCode: 404
    ResponseCode: 404
    ResponsePagePath: /404.html
    ErrorCachingMinTTL: 300
  - ErrorCode: 500
    ResponseCode: 500
    ResponsePagePath: /50x.html
    ErrorCachingMinTTL: 10  # Short TTL for server errors
```

Without this, CloudFront serves AWS's generic error page. Your users deserve better than an AWS XML error response.

**Pitfall #3: Forgetting to set the correct Cache-Control headers at origin**

CloudFront respects your origin's `Cache-Control` headers by default. If your S3 objects have no Cache-Control header, CloudFront uses a default TTL (usually 24 hours for static, 0 for dynamic). Set explicit headers:

```bash
aws s3 cp ./dist/assets/ s3://my-bucket/assets/ \
  --recursive \
  --cache-control "max-age=31536000, public, immutable"
```

## TL;DR ⚡

**AWS CloudFront** is not optional for production apps. It's the difference between your origin servers melting under load and them barely noticing traffic spikes.

**Your setup checklist:**
1. Enable CloudFront in front of S3 (never expose S3 directly)
2. Use Origin Access Control (OAC), not the deprecated OAI
3. Use versioned filenames for static assets → cache forever
4. Cache API responses aggressively (except auth endpoints)
5. Set `PriceClass_100` unless you have heavy usage outside US/Europe/Asia
6. Enable compression (`Compress: true`)
7. Set up custom error pages
8. Add CloudFront Functions for edge redirects (not Lambda@Edge)
9. Monitor the cache hit ratio in CloudWatch (aim for >80%)

**A serverless pattern that saved us:** We set up CloudFront in front of our API Gateway for product catalog endpoints. Cache TTL: 5 minutes. Result: 85% cache hit ratio. Our Lambda invocations dropped from 2M/month to 300K/month. Our DynamoDB read costs dropped proportionally. Five minutes of staleness on a product catalog that changes hourly? Worth it.

**When architecting on AWS, I learned:** The hardest part of CloudFront is not the setup - it's deciding what to cache. Make that decision carefully and you'll wonder how you ever deployed without it.

---

**Hit a CloudFront gotcha I didn't mention?** I'd love to hear it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - edge caching war stories are some of the best in the business! 😄

**More AWS production patterns?** Everything I've learned the expensive way is on [GitHub](https://github.com/kpanuragh).

*Go cache aggressively. Your origin servers and your AWS bill will both thank you.* ☁️⚡

---

**P.S.** CloudFront and S3 Transfer Acceleration are not the same thing. Transfer Acceleration speeds up *uploads* to S3 using the CloudFront network. CloudFront speeds up *downloads* to users. Both useful. Both often confused. You probably want CloudFront for most use cases. 📦
