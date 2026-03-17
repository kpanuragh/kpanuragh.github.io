---
title: "Lambda Function URLs: Stop Paying for API Gateway When You Don't Need It 💰⚡"
date: "2026-03-17"
excerpt: "AWS sneaked a feature into Lambda in 2022 that lets you call functions directly via HTTPS — no API Gateway required. I've been saving hundreds per month with it. Here's how."
tags: ["aws", "serverless", "lambda", "cost-optimization"]
featured: true
---

# Lambda Function URLs: Stop Paying for API Gateway When You Don't Need It 💰⚡

**Real talk:** For two years I was paying for API Gateway on endpoints that didn't need throttling, caching, request validation, or any of the 47 other features API Gateway offers.

I was essentially hiring a full-time bouncer for a room where only my own apps knocked.

Then I discovered **Lambda Function URLs** — and my AWS bill cried tears of joy.

## Wait, What Are Lambda Function URLs? 🤔

In April 2022, AWS quietly added a feature that lets you assign a dedicated HTTPS endpoint directly to any Lambda function. No API Gateway. No ALB. No nothing.

```
Before: Client → API Gateway → Lambda
After:  Client → Lambda (directly!)
```

Every Lambda function can get a URL like this:
```
https://abc123xyz.lambda-url.us-east-1.on.aws/
```

That's it. Call it like any REST endpoint. Lambda runs. Done.

**Cost comparison:**

```
API Gateway HTTP API:  $1.00 per million requests
API Gateway REST API:  $3.50 per million requests
Lambda Function URL:   $0.00 per million requests (Lambda cost only!)
```

You read that right. **Free.** The only cost is Lambda execution time — which you'd pay regardless.

## The Production Story That Changed My Mind 🏭

In production, I've deployed Stripe webhooks, GitHub webhooks, and Shopify order notifications — all tiny Lambda functions that did one job: receive a POST, validate a signature, put a message on SQS, return 200.

My old setup:
```
Stripe → API Gateway REST ($3.50/M) → Lambda → SQS
```

These endpoints received maybe 500k requests/month. Math:
- API Gateway: **$1.75/month**
- Lambda: $0.12/month

"Only $1.75!" I hear you say. Multiply by 8 webhook endpoints. Times 12 months. That's **$168/year** for literally zero added value.

A serverless pattern that saved us: migrate all "dumb" webhooks to Lambda Function URLs. Cut that line item to $0.

## Setting It Up (It's Embarrassingly Simple) 🚀

### Via AWS Console

1. Open your Lambda function
2. Configuration → Function URL
3. Click "Create function URL"
4. Choose auth type: `NONE` or `AWS_IAM`
5. Done. Copy the URL.

### Via AWS CLI

```bash
aws lambda create-function-url-config \
  --function-name my-webhook-handler \
  --auth-type NONE \
  --cors '{
    "AllowOrigins": ["https://yoursite.com"],
    "AllowMethods": ["POST"],
    "AllowHeaders": ["Content-Type", "X-Stripe-Signature"]
  }'
```

You get back something like:
```json
{
  "FunctionUrl": "https://abc123.lambda-url.us-east-1.on.aws/",
  "FunctionArn": "arn:aws:lambda:...",
  "AuthType": "NONE"
}
```

### Via Terraform (the right way in production)

```hcl
resource "aws_lambda_function_url" "webhook" {
  function_name      = aws_lambda_function.webhook_handler.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["https://yoursite.com"]
    allow_methods     = ["POST"]
    allow_headers     = ["Content-Type", "X-Stripe-Signature"]
    max_age           = 86400
  }
}

output "webhook_url" {
  value = aws_lambda_function_url.webhook.function_url
}
```

## The Request/Response Format ⚙️

Function URLs use a slightly different event format than API Gateway — this trips people up.

**What your Lambda receives:**

```javascript
exports.handler = async (event) => {
  // event.body is a STRING (not parsed JSON!)
  const body = JSON.parse(event.body);

  // Headers are here
  const stripeSignature = event.headers['x-stripe-signature'];

  // HTTP method
  const method = event.requestContext.http.method;

  // Query params
  const params = event.queryStringParameters;

  // Your logic
  await processWebhook(body, stripeSignature);

  // Response format
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ received: true })
  };
};
```

**One gotcha:** `event.body` is base64-encoded if the content type is binary. Check `event.isBase64Encoded` and decode accordingly.

```javascript
const body = event.isBase64Encoded
  ? Buffer.from(event.body, 'base64').toString('utf8')
  : event.body;
```

Caught me off guard the first time Stripe sent a webhook with a weird content-type. 30 minutes of debugging. You're welcome. 😅

## When to Use It (And When NOT To) 🎯

### ✅ Perfect use cases:

**Webhooks** — Stripe, GitHub, Shopify, Twilio. These are single-purpose, low-volume, don't need rate limiting.

**Internal service-to-service calls** — Microservices calling each other within your AWS account? Use `AWS_IAM` auth. Free, secure, no API Gateway needed.

**Simple CRUD APIs** — If you have a mobile app that just needs a few endpoints and traffic is predictable, Function URLs work great.

**CI/CD triggers** — Got a GitHub Action that deploys your app? Hit a Function URL instead of managing an API Gateway just for one endpoint.

### ❌ When you still need API Gateway:

**You need request throttling** — API Gateway can throttle at the API level before Lambda even runs. Function URLs don't have this. A traffic spike = Lambda bill spike.

**You need request validation** — API Gateway can reject malformed requests before they hit Lambda. Function URLs let everything through.

**You have WAF requirements** — AWS WAF integrates with API Gateway, not Function URLs (directly — you need CloudFront in front for WAF with Function URLs).

**Custom domain names** — Function URLs give you an ugly `.lambda-url.aws` address. If you need `api.yourcompany.com`, put CloudFront in front or use API Gateway.

**You need response caching** — API Gateway caches responses. Function URLs don't.

When architecting on AWS, I learned: the question isn't "API Gateway vs Function URLs" — it's "do I actually need what API Gateway provides?"

## The Security Part (Don't Skip This) 🔒

Function URLs with `auth-type: NONE` are **publicly accessible**. Anyone with the URL can call them.

For webhooks this is usually fine because you validate the payload signature:

```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  const signature = event.headers['stripe-signature'];
  const rawBody = event.body; // Keep as string for signature validation!

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // Now safe to process
  await handleStripeEvent(stripeEvent);
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
};
```

For internal services, use `AWS_IAM` auth instead — callers must sign requests with AWS SigV4. Much safer for service-to-service communication.

```bash
# Calling a Function URL with IAM auth (using curl + sigv4)
aws lambda invoke-url \
  --function-url https://abc123.lambda-url.us-east-1.on.aws/ \
  --body '{"action": "process"}' \
  response.json
```

## Real Cost Savings: My Production Numbers 💸

When I migrated our e-commerce webhook infrastructure to Function URLs:

**Before (API Gateway HTTP API):**
```
8 webhook endpoints × ~500k requests/month
= 4M requests × $1.00/million
= $4/month API Gateway
+ Lambda costs: $0.85/month
Total: $4.85/month
```

**After (Function URLs):**
```
8 endpoints
= $0 Function URLs
+ Lambda costs: $0.85/month
Total: $0.85/month
```

**Savings: $4/month** → $48/year. Sounds small, right?

Now multiply by our **23 Lambda functions** that had pointless API Gateway fronts. We're talking **$1,100/year** saved. On something AWS literally gave us for free.

The PRD I wrote to justify this migration was two sentences: "API Gateway adds zero value here. Removing it saves money."

Easiest approval I've ever gotten. 😂

## The Migration Gotchas ⚠️

A few things that burned me during migration:

**1. Event format differences**

API Gateway v1 (REST) → API Gateway v2 (HTTP) → Function URLs are all slightly different event formats. Test your handler with the actual Function URL event structure before deploying.

**2. Response format**

Function URLs require the same response format as API Gateway v2 (HTTP API). If you were on API Gateway v1 (REST API), your response format might need updating:

```javascript
// API Gateway v1 (REST) format
return {
  statusCode: 200,
  body: JSON.stringify(data),
  isBase64Encoded: false
};

// Function URL format (same as API Gateway v2)
return {
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
  // isBase64Encoded: defaults to false, can omit
};
```

**3. No custom domain out of the box**

If your webhook provider hardcodes your endpoint URL (some do), switching means updating it with them. Plan for that.

**4. CloudWatch logs still work**

Good news: all your logging still shows up in CloudWatch. The Function URL change is transparent from the Lambda's perspective.

## The Bottom Line 💡

Lambda Function URLs are one of those AWS features that should've been the default from day one. The fact that every Lambda can be directly invoked over HTTPS without any middleware is obvious in hindsight.

**Use Function URLs when:**
- ✅ Simple webhooks (Stripe, GitHub, etc.)
- ✅ Internal service-to-service calls
- ✅ APIs that don't need throttling, caching, or validation
- ✅ You want to save money without sacrificing anything

**Keep API Gateway when:**
- ✅ You need WAF, throttling, or request validation
- ✅ You need a custom domain without CloudFront complexity
- ✅ You need response caching
- ✅ Your API is a real public-facing product with strict SLAs

In production, I've deployed both. The trick is knowing which one you actually need before defaulting to API Gateway because "that's how we've always done it."

Your Lambda deserves to speak for itself sometimes. Let it. 🚀

---

**Saving money on AWS?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love a good cost optimization war story!

**Want to see how I structure serverless apps?** Check out my [GitHub](https://github.com/kpanuragh) for real-world Lambda patterns.

*Now go audit how many API Gateways you have in front of Lambdas that don't need them.* I'll wait. ☁️💰

---

**P.S.** Function URLs support streaming responses too — your Lambda can stream chunks back to the client in real time. If you're building AI-powered features, this is huge. But that's a post for another day. 👀
