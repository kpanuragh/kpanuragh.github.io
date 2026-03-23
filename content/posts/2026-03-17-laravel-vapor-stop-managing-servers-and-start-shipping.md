---
title: "Laravel Vapor: Stop Managing Servers and Start Shipping 🚀"
date: "2026-03-17"
excerpt: "Your ops team is tired of 3am 'the server is on fire' calls. Laravel Vapor deploys your app to AWS Lambda and lets you sleep like a baby. Here's everything I learned building serverless e-commerce on it."
tags: ["\\\"laravel\\\"", "\\\"php\\\"", "\\\"aws\\\"", "\\\"serverless\\\""]
---

# Laravel Vapor: Stop Managing Servers and Start Shipping 🚀

Picture this: It's Black Friday. Your e-commerce app is getting 10x the normal traffic. Your server is sweating. Your Slack is exploding. You're refreshing CloudWatch with one hand and Googling "how to vertically scale EC2 really really fast" with the other.

That was the last time I managed traditional servers for a Laravel app. Never again.

At Cubet Techno Labs, I architected our e-commerce backend on **Laravel Vapor** — Laravel's serverless deployment platform built on AWS Lambda. No server provisioning. No capacity planning. No 3am alerts because someone bought 50 pairs of sneakers and took down the site.

Let me tell you everything I wish someone had told me.

## What Even Is Laravel Vapor? 🤔

Vapor is Laravel's official serverless deployment platform. You push your code, Vapor packages it up, and AWS Lambda runs it. Your app scales from 1 request to 10,000 requests per second *automatically* — no load balancers to configure, no auto-scaling groups to wrestle with.

Under the hood it uses:
- **AWS Lambda** for PHP execution
- **RDS Proxy** for database connections (Lambda + databases = connection pool nightmare without it)
- **SQS** for queues
- **S3** for file storage
- **CloudFront** for serving assets at CDN speed

The magic? You don't configure any of that manually. Vapor does it with a YAML file.

## The Vapor Config That Made Me Smile 😄

Here's a real `vapor.yml` (simplified from what we run in production):

```yaml
id: 12345
name: my-ecommerce-app

environments:
    production:
        runtime: php-8.2:al2
        memory: 1024
        cli-memory: 512
        timeout: 30
        domain: api.myshop.com
        database: production-mysql
        cache: production-redis
        queues:
            - default
            - high-priority
            - notifications
        build:
            - 'composer install --no-dev'
            - 'php artisan event:cache'
            - 'php artisan route:cache'
            - 'php artisan view:cache'
```

That's it. That config gives you auto-scaling PHP, managed Redis, managed MySQL via RDS Proxy, and three separate queue workers — all on AWS infrastructure.

Deploy with one command:

```bash
vapor deploy production
```

Watching that deploy spinner is genuinely satisfying. Like watching a slow cooker meal turn into dinner without you doing anything.

## The Things Nobody Warns You About ⚠️

As a Technical Lead, I've learned that every powerful tool has gotchas. Vapor has a few good ones:

### 1. Lambda Is Stateless (Really, Actually Stateless)

No filesystem writes that persist. No `/tmp` folder shared between requests. If your code writes to `storage/app/` and expects it to be there on the next request... surprise! It won't be.

**Before (breaks on Vapor):**
```php
// Don't do this — Lambda's /tmp is ephemeral and not shared
Storage::disk('local')->put('report.csv', $csvContent);
$path = Storage::disk('local')->path('report.csv');
return response()->download($path);
```

**After (Vapor-friendly):**
```php
// Store on S3, stream from S3
$path = 'reports/' . Str::uuid() . '.csv';
Storage::disk('s3')->put($path, $csvContent);
return Storage::disk('s3')->download($path);
```

In production systems I've built, we audited every `Storage::disk('local')` call before going live. Found 14 of them. Each one would have caused a silent failure on Vapor.

### 2. Cold Starts Are Real (But Manageable)

First request to a fresh Lambda container takes 200-800ms longer than normal. For an e-commerce API, that's visible to users.

**The fix:** Vapor has "warming" built in. Add this to `vapor.yml`:

```yaml
environments:
    production:
        warm: 5  # Keep 5 Lambda instances pre-warmed
```

That keeps 5 containers alive and toasty, eliminating cold starts for your expected concurrency. In our busiest periods, we bumped this to 20 and it made P95 latency drop noticeably.

### 3. Database Connections: RDS Proxy Is Non-Negotiable

Lambda functions scale horizontally. 100 concurrent requests = 100 Lambda instances trying to open 100 database connections simultaneously. MySQL will throw up. RDS Proxy pools those connections so your database only sees what it can handle.

Vapor's `database` key in the config automatically sets up RDS Proxy. Don't skip it. I'm serious.

## Real Talk: The Cost Question 💰

Everyone asks: "Is it expensive?"

**Honest answer:** It depends wildly on traffic patterns.

For our e-commerce platform, Vapor was **cheaper** than our previous EC2 setup because we weren't paying for idle capacity. Lambda charges per request and per 100ms of execution. When there are no requests, you pay nothing.

**Pro tip:** Use Vapor's built-in metrics to monitor invocation counts. If you have background jobs running constantly (like polling for updates every second), those rack up Lambda costs fast. Migrate those to scheduled tasks or SQS-triggered jobs instead.

## The Workflow That Changed My Life 🎯

Here's the development setup that works beautifully:

```bash
# Local: still use Laravel Sail (Docker)
./vendor/bin/sail up

# Staging: deploy to Vapor staging environment
vapor deploy staging

# Production: deploy with confidence
vapor deploy production --message "feat: add one-click checkout"
```

**Real Talk:** We deploy to staging automatically on every main branch merge via GitHub Actions. Production deploys are manual with a required confirmation. After one accidental deploy at 2pm on a Friday (don't ask), that manual step became sacred.

## Vapor vs Traditional Servers: The Honest Scorecard 📊

| Thing | Traditional EC2 | Laravel Vapor |
|-------|----------------|---------------|
| Traffic spikes | Heart attack | Yawn |
| 3am server fires | Yes | Rarely |
| Ops overhead | High | Low |
| Cold starts | None | Yes (manageable) |
| Long-running processes | Fine | Limited to 29 mins |
| Cost at low traffic | Paying for idle | Pay per use |
| Cost at high traffic | Might need upgrade | Scales automatically |

## When NOT to Use Vapor 🚫

As much as I love it, Vapor isn't for everything:

- **Long-running processes** (video encoding, massive CSV imports): Lambda's 29-minute max timeout will bite you. Use dedicated EC2 or ECS tasks for these.
- **WebSocket servers**: Use Laravel Reverb on a traditional server for this. Lambda is stateless, WebSockets are stateful — they don't mix.
- **Budget under $50/month**: Vapor itself costs $39/month for the platform subscription (plus AWS costs). If you're a solo developer with a tiny hobby project, it's overkill.

## Bonus Tips From 2 Years of Production Vapor 🎯

**Tip 1: Use Vapor's secret management for .env**
```bash
vapor env:pull production  # Download secrets from AWS
vapor env:push production  # Push updated secrets to AWS
```
Never commit secrets to your repo. Vapor stores them in AWS Secrets Manager.

**Tip 2: Watch your Lambda memory setting**
Start at 1024MB. If your functions are timing out, try bumping to 1769MB — at that threshold, Lambda gives you a full vCPU instead of a fraction of one. It's often faster AND cheaper because functions complete quicker.

**Tip 3: Asset compilation happens at deploy time**
```yaml
build:
    - 'npm ci && npm run build'  # Compile assets in the build step
    - 'composer install --no-dev'
```
Vapor uploads compiled assets to S3 automatically. No more "who forgot to run `npm run build`?" moments.

## The Bottom Line

A pattern that saved us in a real project: when we launched a flash sale campaign that sent 50,000 users to a single product page in under 3 minutes, Vapor scaled automatically to handle it. Zero intervention. Zero downtime. The only alert I got was from our monitoring dashboard saying "traffic spike detected" — not "server is down."

That's the promise of serverless done right. Your infrastructure scales with your success, not against it.

Laravel Vapor isn't magic. It's AWS Lambda with excellent Laravel integration and sane defaults. But when you're a Technical Lead responsible for uptime, "sane defaults" and "scales automatically" are the most beautiful words in engineering.

---

**TL;DR:** Laravel Vapor = your Laravel app on AWS Lambda, auto-scaling, zero server management. Watch out for stateless filesystem, cold starts, and database connection limits. It's genuinely production-ready — we run real e-commerce on it.

---

**Questions about serverless Laravel?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — happy to talk architecture over (virtual) coffee.

**Want more Laravel deep dives?** Star the [blog repo on GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and keep shipping! 🚀
