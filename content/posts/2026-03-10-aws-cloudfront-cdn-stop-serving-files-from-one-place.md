---
title: "AWS CloudFront: Stop Serving Files From One Place Like It's 1999 ⚡🌍"
date: "2026-03-10"
excerpt: "Your S3 bucket in us-east-1 is making users in Singapore wait 800ms for a logo. CloudFront fixes that AND slashes your bandwidth bill. Here's everything I learned the hard way."
tags: ["\\\"aws\\\"", "\\\"cloudfront\\\"", "\\\"cdn\\\"", "\\\"serverless\\\"", "\\\"performance\\\""]
featured: "true"
---

# AWS CloudFront: Stop Serving Files From One Place Like It's 1999 ⚡🌍

**Confession time:** For the first six months of my e-commerce backend, I was serving every image, every CSS file, and every API response directly from an EC2 instance in `us-east-1`. Users in London? Wait for Virginia. Users in Tokyo? Pray for Virginia. Users in São Paulo? Pour yourself a coffee while Virginia thinks about it. ☕

Then my boss showed me a screenshot of Chrome DevTools. The logo was taking **1.2 seconds** to load. For a PNG. A LOGO.

That was the day I truly discovered CloudFront. And honestly? It changed everything.

## What Even Is CloudFront? 🤔

CloudFront is AWS's Content Delivery Network (CDN). Think of it like having a clone of your files living in **600+ locations worldwide** — called edge locations. When someone requests your file, they get it from the server closest to THEM, not from your one lonely bucket in Ohio.

```
Without CloudFront:
User in Tokyo → all the way to us-east-1 → back to Tokyo
Round trip: ~180ms just for network latency

With CloudFront:
User in Tokyo → Tokyo edge location → done
Round trip: ~5ms ⚡
```

That's not a small improvement. That's a **36x speedup** just by not being geographically rude to your users.

## The Production Shock That Made Me Set This Up Properly 😱

In production, I've deployed a multi-region serverless e-commerce platform. We had S3 hosting static assets and EC2 serving API responses. At launch, everything looked fine on my laptop in Bangalore.

Then users started complaining from Southeast Asia, Europe, everywhere.

Our lighthouse score for a user in Germany: **32/100**. The culprit? Every single asset — images, fonts, JS bundles — was travelling halfway across the planet.

After properly configuring CloudFront, the same page scored **94/100**. Same code. Same server. Just... closer to the user.

## Setting It Up (The Right Way) 🚀

### Step 1: The Basic Distribution

```bash
# Create a CloudFront distribution in front of your S3 bucket
aws cloudfront create-distribution \
  --origin-domain-name my-bucket.s3.amazonaws.com \
  --default-root-object index.html
```

Or in your `serverless.yml` / CDK if you're not clicking around the console like it's 2012:

```yaml
# serverless.yml
resources:
  Resources:
    CloudFrontDistribution:
      Type: AWS::CloudFront::Distribution
      Properties:
        DistributionConfig:
          Origins:
            - DomainName: !GetAtt AssetsBucket.DomainName
              Id: S3Origin
              S3OriginConfig:
                OriginAccessIdentity: !Sub "origin-access-identity/cloudfront/${OAI}"
          DefaultCacheBehavior:
            ViewerProtocolPolicy: redirect-to-https
            CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # CachingOptimized
            TargetOriginId: S3Origin
          Enabled: true
          HttpVersion: http2
```

### Step 2: Stop Making S3 Public (Seriously) 🔒

A huge mistake I see all the time: people make their S3 bucket public and point CloudFront at the public URL. That means anyone can bypass CloudFront and hit your S3 bucket directly — skipping caching, bypassing WAF rules, and still charging you S3 data transfer costs.

**The fix: Origin Access Control (OAC)**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOnly",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::123456789:distribution/EDFDVBD6EXAMPLE"
        }
      }
    }
  ]
}
```

Now S3 is private. CloudFront is the bouncer. Only CloudFront gets in. ✅

## Cache Behavior: The Part Everyone Gets Wrong 💥

When I first set up CloudFront, I didn't think too hard about cache headers. I just enabled it and moved on. Big mistake.

**Problem 1:** Images cached for 24 hours. Users got stale product photos after we updated them. Customer support tickets poured in.

**Problem 2:** HTML files also cached for 24 hours. A deployment went out. Half of users got old UI, half got new UI. It looked like our app was having a stroke.

**The solution — different cache policies for different file types:**

```yaml
CacheBehaviors:
  # HTML: never cache (always fresh)
  - PathPattern: "*.html"
    CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad  # CachingDisabled
    ViewerProtocolPolicy: redirect-to-https

  # Versioned assets: cache forever (they have hashes in filenames)
  - PathPattern: "static/*"
    CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6  # CachingOptimized
    ViewerProtocolPolicy: redirect-to-https

  # Images: cache for 7 days
  - PathPattern: "images/*"
    DefaultTTL: 604800
    MaxTTL: 604800
    ViewerProtocolPolicy: redirect-to-https
```

**The golden rule:** If the filename has a content hash (e.g., `app.a3f9bc2.js`), cache forever. If it doesn't (e.g., `index.html`), cache for seconds or not at all.

A serverless pattern that saved us: build tools like Vite and webpack already add content hashes to JS/CSS. Let them do it. Then CloudFront caches `app.a3f9bc2.js` forever and busts the cache automatically when you deploy because the hash changes.

## Cache Invalidations: Use Them Wisely 💰

Every time you deploy and need to force CloudFront to drop old cached files, you create an invalidation. The first 1,000 invalidation paths per month are free. After that, it's $0.005 per path.

Doesn't sound like much? When architecting on AWS, I learned this the hard way: if you run deployments 20 times a day and invalidate `/` (which counts as a wildcard covering ALL paths), you can blow through your free tier fast.

**The smart approach:**

```bash
# Bad: invalidates everything every deploy
aws cloudfront create-invalidation \
  --distribution-id ABCDEF \
  --paths "/*"

# Good: only invalidate what changed
aws cloudfront create-invalidation \
  --distribution-id ABCDEF \
  --paths "/index.html" "/manifest.json"
```

Even better? Use **content hashing** for your assets so you never need to invalidate them. The only files that need invalidation are the ones without hashes — typically `index.html` and maybe a `manifest.json`.

## CloudFront in Front of API Gateway ⚡

Here's a move not enough people use: putting CloudFront in front of API Gateway, not just S3.

**Why?**
- CloudFront edge locations handle TLS termination, which is faster
- You can cache API responses at the edge (for GETs that don't change often)
- You get WAF protection at the CDN layer
- Consistent URL structure (`api.yourdomain.com` instead of that ugly `.execute-api.us-east-1.amazonaws.com` URL)

```yaml
Origins:
  - DomainName: abc123.execute-api.us-east-1.amazonaws.com
    Id: ApiGatewayOrigin
    CustomOriginConfig:
      HTTPSPort: 443
      OriginProtocolPolicy: https-only

CacheBehaviors:
  - PathPattern: "/api/*"
    CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad  # No cache by default
    OriginRequestPolicyId: b689b0a8-53d0-40ab-baf2-68738e2966ac  # Forward all headers
    AllowedMethods: [GET, HEAD, OPTIONS, PUT, PATCH, POST, DELETE]
```

**Cache product listings? Yes.** A product catalog GET endpoint that changes every 5 minutes? Cache it at the edge for 4 minutes. You just cut 80% of your API Gateway calls. That's real money.

## The Cost Story That'll Make You Setup CloudFront Today 💸

Before CloudFront, my static asset delivery costs looked like this:

```
S3 data transfer out (to internet): $0.09/GB
EC2 data transfer: $0.09/GB
Monthly total: ~$340 for 3.5TB transferred
```

After CloudFront:

```
CloudFront data transfer (first 10TB): $0.0085/GB
S3 → CloudFront transfer: $0.00/GB (FREE within AWS!)
Monthly total: ~$29 for the same 3.5TB
```

**That's a $311/month saving.** Over a year, that's nearly **$3,700** just by putting a CDN in front of S3. CloudFront pays for itself in the first hour.

The magic: S3 to CloudFront data transfer is **free**. You only pay when CloudFront delivers to the end user, at a rate 10x cheaper than S3's direct egress.

## Common Gotchas I Hit So You Don't Have To 🪤

**Gotcha #1: CORS headers not forwarded**

You set up CORS on S3 but CloudFront isn't forwarding the `Origin` header to S3, so CORS never works. Fix: create an Origin Request Policy that forwards the `Origin` header.

**Gotcha #2: Cookies killing cache efficiency**

If you forward all cookies to the origin, CloudFront creates a separate cache entry for each unique cookie value. With session cookies, that means basically zero caching. Be explicit: only forward the cookies your backend actually needs.

**Gotcha #3: HTTP/2 Push thinking it works on API Gateway**

It doesn't. Don't spend three hours debugging why your H2 push hints aren't firing. Just... don't.

**Gotcha #4: Not enabling access logging**

CloudFront has its own access logs that land in S3. They're turned OFF by default. Enable them. When you have a sudden bandwidth spike at 3 AM, you'll want to know which files were hot.

```bash
aws cloudfront update-distribution \
  --id ABCDEF \
  --distribution-config file://dist-config.json  # with Logging.Enabled: true
```

## The 5-Minute Checklist Before Going Live ✅

1. **OAC configured?** S3 bucket should be private, CloudFront should be the only one with access
2. **HTTPS enforced?** `redirect-to-https` on all behaviors
3. **Cache policies set?** Don't use the same policy for HTML and versioned assets
4. **Custom domain + ACM cert?** Nobody wants `d1234.cloudfront.net` in their browser bar
5. **WAF attached?** Optional but highly recommended for API origins
6. **Logs enabled?** You'll thank yourself at 3 AM

## TL;DR 🎯

CloudFront is one of those AWS services where the ROI is immediate and obvious:
- **Performance:** Files served from 5ms away instead of 180ms away
- **Cost:** 10x cheaper than serving directly from S3/EC2
- **Security:** Your origin stays private; only CloudFront touches it
- **Scale:** Handles traffic spikes automatically; your origin doesn't feel a thing

In production, I've deployed CloudFront in front of every public-facing asset in our stack — static files, API Gateway, even S3-hosted SPAs. It's one of the first things I configure in any new AWS project now.

Stop letting your S3 bucket in Ohio do all the work. Put CloudFront in front of it and let AWS's global network do the heavy lifting. Your users (and your AWS bill) will thank you. 🚀

---

**Have a CloudFront horror story?** I'd love to hear it on [LinkedIn](https://www.linkedin.com/in/anuraghkp). We can bond over the time we made S3 buckets public and CloudWatch started screaming. 😅

**Exploring serverless architecture?** Check out my [GitHub](https://github.com/kpanuragh) where I have a few real-world serverless setups with CloudFront baked in from day one.

*Now go add CloudFront to that S3 bucket you've been serving directly. I'll wait.* ☁️⚡
