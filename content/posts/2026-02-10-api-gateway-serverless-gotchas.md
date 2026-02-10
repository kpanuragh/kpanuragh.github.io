---
title: "API Gateway: The $$$$ Serverless Gotcha Nobody Warns You About 🚪💸"
date: "2026-02-10"
excerpt: "Your Lambda functions are cheap, but API Gateway is silently draining your wallet. After 7+ years architecting serverless backends, here are the API Gateway mistakes that cost me thousands!"
tags: ["aws", "serverless", "api-gateway", "cloud"]
featured: true
---

# API Gateway: The $$$$ Serverless Gotcha Nobody Warns You About 🚪💸

**Real talk:** When I first built a serverless API on AWS, I thought I was being clever. "Lambda is dirt cheap! $0.20 per million requests! This will cost pennies!"

Then the AWS bill arrived: $847 for a month.

The culprit? API Gateway charged me **$3.50 per million requests** (17× more than Lambda!) plus data transfer fees I didn't know existed. My "cheap serverless API" cost more than renting a dedicated server! 😭

Welcome to API Gateway - AWS's front door to serverless that nobody tells you is actually a toll booth!

## What Even Is API Gateway? 🤔

**API Gateway = The bouncer/traffic cop between the internet and your Lambda functions.**

**Think of it like:** A fancy receptionist desk at a corporate office. Sure, you could let people walk directly to your employees' desks... or you could make them check in first, show ID, get a visitor badge, and follow the rules!

**What it actually does:**
- Routes HTTP requests to Lambda functions
- Handles authentication (API keys, JWT, IAM)
- Rate limiting and throttling
- Request/response transformation
- Caching responses (for $$$)
- CORS headers (the bane of frontend devs everywhere)

**Why everyone uses it:**
- ✅ Easy Lambda integration (one click!)
- ✅ Built-in SSL/TLS (HTTPS for free)
- ✅ Scales automatically (millions of requests)
- ✅ No servers to manage

**Why it's expensive:**
- 💸 $3.50 per million requests (vs Lambda's $0.20)
- 💸 Data transfer fees ($0.09/GB out)
- 💸 Caching costs $0.02/hour per GB
- 💸 Custom domains add CloudFront costs

**My wake-up call:** In production, I've deployed APIs handling 50M requests/month. API Gateway was 70% of our serverless costs! 🚨

## API Gateway Mistake #1: Using REST API Instead of HTTP API 🏃‍♂️

**The most expensive mistake I made:**

When I started with API Gateway in 2019, there was only **REST API**. Then AWS released **HTTP API** in 2020 - cheaper, faster, simpler.

**But nobody told me to switch!** I kept using REST API for 2 years, burning money! 🔥💸

### REST API vs HTTP API Comparison

**REST API (the old, expensive one):**
```
Cost: $3.50 per million requests
Features:
  ✅ API keys
  ✅ Request validation
  ✅ Response caching
  ✅ Usage plans
  ✅ SDK generation
  ❌ Expensive
  ❌ Slower (extra hops)
```

**HTTP API (the new, cheap one):**
```
Cost: $1.00 per million requests (71% cheaper!)
Features:
  ✅ JWT auth (native OIDC/OAuth2)
  ✅ Faster (lower latency)
  ✅ Simpler setup
  ✅ CORS auto-config
  ❌ No API keys
  ❌ No caching (yet)
  ❌ No usage plans
```

### Real Cost Comparison

**My API:** 50 million requests/month

**REST API costs:**
```
Requests: 50M × $3.50/M = $175/month
Data transfer: 100GB × $0.09 = $9/month
Total: $184/month
```

**HTTP API costs:**
```
Requests: 50M × $1.00/M = $50/month
Data transfer: 100GB × $0.09 = $9/month
Total: $59/month
```

**Savings: $125/month = $1,500/year** just by switching! 🎉

### When to Use Each

**Use HTTP API for:**
- Public REST APIs
- Microservices (service-to-service)
- Mobile app backends
- JWT/OAuth authentication
- **Anything where cost matters!**

**Use REST API only when you need:**
- API keys for third-party access
- Response caching (built-in)
- Usage plans / throttling per key
- Request validation schemas

**My production setup:** 95% HTTP APIs, 5% REST APIs (only where we sell API access to customers)

### How to Migrate REST → HTTP API

**Spoiler:** You can't "migrate" - you have to rebuild! 😭

```bash
# Create HTTP API
aws apigatewayv2 create-api \
  --name my-http-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:us-east-1:123456789:function/my-function

# Deploy to stage
aws apigatewayv2 create-stage \
  --api-id abc123 \
  --stage-name prod \
  --auto-deploy
```

**Or use Serverless Framework (way easier):**

```yaml
# serverless.yml
service: my-api

provider:
  name: aws
  runtime: nodejs18.x
  httpApi:  # ← HTTP API (cheap!)
    cors: true
    authorizers:
      jwtAuthorizer:
        identitySource: $request.header.Authorization
        issuerUrl: https://cognito-idp.us-east-1.amazonaws.com/us-east-1_ABC123
        audience:
          - your-app-client-id

functions:
  getUser:
    handler: handlers/user.get
    events:
      - httpApi:  # ← HTTP API endpoint
          path: /users/{id}
          method: GET
          authorizer:
            name: jwtAuthorizer
```

**When architecting on AWS, I learned:** Always start with HTTP API unless you have a specific reason not to! 🚀

## API Gateway Mistake #2: Not Enabling Caching (Or Paying for Unused Cache) 💵

**The caching dilemma:**

- **Without caching:** Every request hits Lambda ($$$)
- **With caching:** API Gateway caches responses... but charges $0.02/hour per GB! 💸

### When NOT to Cache (Don't Waste Money!)

```javascript
// Endpoints that CHANGE per request (don't cache!)
GET /user/profile        // User-specific data
POST /orders            // Creates new data
PUT /cart               // Updates state
GET /admin/dashboard    // Real-time data
```

**If you cache these, users see stale/wrong data!** 🚫

### When TO Cache (Save Lambda Costs!)

```javascript
// Endpoints that return SAME data for everyone
GET /products           // Product catalog (changes hourly)
GET /blog/posts        // Blog posts (static content)
GET /config            // App configuration
GET /categories        // Category list
```

**Cache = fewer Lambda invocations = lower costs!** ✅

### Caching Cost Analysis

**Without caching:**
```
50M requests/month
→ 50M Lambda invocations
→ Cost: (50M × $0.20/M) + (50M × $1.00/M) = $10 + $50 = $60
```

**With caching (90% cache hit rate):**
```
50M requests/month
→ 45M cached (API Gateway responds directly)
→ 5M hit Lambda (cache misses)
→ Lambda cost: 5M × $0.20/M = $1
→ API Gateway cost: 50M × $1.00/M = $50
→ Cache cost: 0.5GB × $0.02/hr × 730hr = $7.30
→ Total: $1 + $50 + $7.30 = $58.30
```

**Savings: $60 - $58.30 = $1.70/month** 🤔

**Wait, that's barely worth it!**

**But at scale:**
```
500M requests/month with 95% cache hit
Without cache: $100 (Lambda) + $500 (API GW) = $600
With cache: $10 (Lambda) + $500 (API GW) + $73 (cache) = $583
Savings: $17/month
```

**My verdict:** Only cache if you have **high traffic** + **same data for all users**!

### How to Enable Caching (REST API Only)

```bash
# Enable caching for specific stage
aws apigateway create-deployment \
  --rest-api-id abc123 \
  --stage-name prod \
  --cache-cluster-enabled \
  --cache-cluster-size '0.5'  # 0.5GB cache

# Cost: $0.02/hour × 0.5GB = $0.01/hour = $7.30/month
```

**Cache TTL (Time To Live):**

```javascript
// Lambda response with cache control
exports.handler = async (event) => {
  const products = await db.getProducts();

  return {
    statusCode: 200,
    headers: {
      'Cache-Control': 'max-age=3600',  // Cache for 1 hour
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(products)
  };
};
```

**Pro tip:** A serverless pattern that saved us: Use CloudFront in front of API Gateway for caching! It's cheaper than API Gateway caching and globally distributed! 🌍

## API Gateway Mistake #3: Getting Destroyed by Throttling Limits 🚦

**The surprise that wrecked my demo:**

I built a beautiful serverless app. Product demo day arrives. CEO invites 500 employees to try it.

**Result:** "429 Too Many Requests" errors everywhere! 🔥

**Why?** API Gateway default limits:
- **Burst limit:** 5,000 requests per second (regional)
- **Steady-state:** 10,000 requests per second
- **Per-route throttle:** Not set (WIDE OPEN!)

### The Accidental DDoS Attack

```javascript
// Frontend makes multiple parallel requests
async function loadDashboard() {
  const [user, orders, products, reviews, settings] = await Promise.all([
    fetch('/api/user'),
    fetch('/api/orders'),
    fetch('/api/products'),
    fetch('/api/reviews'),
    fetch('/api/settings')
  ]);
  // 500 users × 5 requests = 2,500 req/sec
  // Burst limit: FINE ✅
}

// But then user refreshes...
// 500 users refresh every 2 seconds = burst exceeded!
// Result: 429 errors! 💥
```

### How to Configure Throttling Properly

**1. Request a limit increase:**

```bash
# AWS Support ticket to increase limits
# Can get up to 100,000 req/sec (but costs more!)
```

**2. Set usage plans (REST API only):**

```bash
aws apigateway create-usage-plan \
  --name basic-plan \
  --throttle burstLimit=2000,rateLimit=1000 \
  --quota limit=1000000,period=MONTH

# Translation: 1000 req/sec steady, 2000 burst, 1M/month quota
```

**3. Add per-route throttling:**

```yaml
# Serverless Framework
functions:
  publicEndpoint:
    handler: public.handler
    events:
      - httpApi:
          path: /public/data
          method: GET
          throttling:
            maxRequestsPerSecond: 100  # Protect this route!
            maxConcurrentRequests: 50

  adminEndpoint:
    handler: admin.handler
    events:
      - httpApi:
          path: /admin/data
          method: GET
          throttling:
            maxRequestsPerSecond: 10  # Less traffic expected
```

### Better Solution: Add Rate Limiting at Lambda

```javascript
// Use DynamoDB to track requests per API key
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const apiKey = event.headers['x-api-key'];
  const now = Date.now();
  const window = 60 * 1000; // 1 minute

  // Check rate limit
  const result = await dynamodb.get({
    TableName: 'api_rate_limits',
    Key: { apiKey, window: Math.floor(now / window) }
  }).promise();

  const requestCount = (result.Item?.count || 0) + 1;

  if (requestCount > 100) {  // 100 req/minute limit
    return {
      statusCode: 429,
      body: JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: 60
      })
    };
  }

  // Increment counter
  await dynamodb.update({
    TableName: 'api_rate_limits',
    Key: { apiKey, window: Math.floor(now / window) },
    UpdateExpression: 'ADD #count :inc',
    ExpressionAttributeNames: { '#count': 'count' },
    ExpressionAttributeValues: { ':inc': 1 }
  }).promise();

  // Process request...
  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
```

**In production, I've learned:** Throttle at multiple layers - API Gateway for DDoS protection, Lambda for per-user limits! 🛡️

## API Gateway Mistake #4: Ignoring Request/Response Size Limits 📦

**The "it worked in dev" nightmare:**

```javascript
// Works fine locally
exports.handler = async (event) => {
  const largeDataset = await db.getAllUsers();  // 12MB response
  return {
    statusCode: 200,
    body: JSON.stringify(largeDataset)
  };
};
```

**In production:**
```
Error: Response payload size exceeded maximum allowed payload size (10 MB)
```

**API Gateway limits:**
- **Request payload:** 10MB max
- **Response payload:** 10MB max (6MB for REST API WebSocket)
- **Timeout:** 29 seconds max (Lambda can run for 15 minutes!)

### The Workarounds

**Option 1: Pagination (Best Practice)**

```javascript
exports.handler = async (event) => {
  const page = parseInt(event.queryStringParameters?.page || '1');
  const limit = 100;
  const offset = (page - 1) * limit;

  const users = await db.getUsers({ limit, offset });
  const total = await db.countUsers();

  return {
    statusCode: 200,
    body: JSON.stringify({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  };
};
```

**Option 2: Pre-signed S3 URL (For Large Files)**

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async (event) => {
  // Generate large report
  const report = await generateReport();  // 50MB file

  // Upload to S3
  await s3.putObject({
    Bucket: 'reports-bucket',
    Key: `reports/${Date.now()}.csv`,
    Body: report,
    ContentType: 'text/csv'
  }).promise();

  // Return pre-signed download URL
  const url = s3.getSignedUrl('getObject', {
    Bucket: 'reports-bucket',
    Key: `reports/${Date.now()}.csv`,
    Expires: 3600  // 1 hour
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ downloadUrl: url })
  };
};
```

**Option 3: Compression (Quick Win)**

```javascript
const zlib = require('zlib');

exports.handler = async (event) => {
  const data = await getLargeData();  // 8MB uncompressed

  const compressed = zlib.gzipSync(JSON.stringify(data));
  // Now: 1.2MB compressed! ✅

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip'
    },
    body: compressed.toString('base64'),
    isBase64Encoded: true
  };
};
```

**A pattern that saved us:** Always paginate lists, compress responses, use S3 for large files! 🚀

## API Gateway Mistake #5: CORS Configuration Hell 😈

**Every frontend developer's nightmare:**

```javascript
// Frontend code
fetch('https://api.example.com/users')
  .then(res => res.json())
  .catch(err => console.error(err));

// Browser console:
// ❌ Access to fetch at 'https://api.example.com/users' from origin
// 'https://myapp.com' has been blocked by CORS policy
```

**Why CORS exists:** Browsers block cross-origin requests to prevent malicious sites from stealing data!

**Why it's annoying:** You control BOTH the frontend and backend, but the browser doesn't trust you! 🤦‍♂️

### The Proper CORS Fix (HTTP API)

```yaml
# serverless.yml
provider:
  httpApi:
    cors:
      allowedOrigins:
        - https://myapp.com
        - https://staging.myapp.com
      allowedHeaders:
        - Content-Type
        - Authorization
        - X-Api-Key
      allowedMethods:
        - GET
        - POST
        - PUT
        - DELETE
        - OPTIONS
      allowCredentials: true
      exposedHeaders:
        - X-Request-Id
      maxAge: 3600  # Cache preflight for 1 hour
```

### The Proper CORS Fix (Lambda Response)

```javascript
exports.handler = async (event) => {
  // Your logic here
  const result = await processRequest(event);

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': 'https://myapp.com',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Credentials': 'true',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(result)
  };
};
```

### The "Allow Everything" (Dev Only!) 🚨

```javascript
// ONLY FOR DEVELOPMENT - NEVER IN PRODUCTION!
return {
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',  // Any origin
    'Access-Control-Allow-Headers': '*',  // Any headers
    'Access-Control-Allow-Methods': '*'   // Any methods
  },
  body: JSON.stringify(result)
};
```

**Why this is dangerous:** Allows malicious sites to call your API from victim browsers! 🚫

**My production CORS setup:**
- Whitelist specific origins (no wildcards!)
- Use `allowCredentials: true` for authenticated APIs
- Cache preflight responses (reduce OPTIONS requests)
- Handle CORS in API Gateway (not Lambda) for performance

## API Gateway Mistake #6: Not Using Custom Domains 🌐

**The ugly URL nobody wants:**

```
https://abc123xyz.execute-api.us-east-1.amazonaws.com/prod/users
```

**What users expect:**

```
https://api.myapp.com/users
```

**Why it matters:**
- Professional appearance
- SEO benefits
- Easier to remember
- Can move backends without breaking clients

### Set Up Custom Domain

**1. Get SSL certificate (ACM):**

```bash
aws acm request-certificate \
  --domain-name api.myapp.com \
  --validation-method DNS
```

**2. Create custom domain in API Gateway:**

```bash
aws apigatewayv2 create-domain-name \
  --domain-name api.myapp.com \
  --domain-name-configurations CertificateArn=arn:aws:acm:...
```

**3. Create DNS record (Route 53):**

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123456 \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.myapp.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d-abc123.execute-api.us-east-1.amazonaws.com",
          "EvaluateTargetHealth": false
        }
      }
    }]
  }'
```

**Or use Serverless Framework (easiest):**

```yaml
# serverless.yml
provider:
  httpApi:
    domain:
      domainName: api.myapp.com
      certificateArn: arn:aws:acm:us-east-1:123456789:certificate/abc-123
```

**Result:** Professional API URL! ✨

## The API Gateway Cost Optimization Playbook 💰

Here's how I cut our API Gateway costs by 65%:

### 1. Switch REST API → HTTP API

**Instant savings: 71% on API Gateway costs!**

```
Before: $175/month (50M req)
After: $50/month (50M req)
Savings: $125/month = $1,500/year
```

### 2. Use CloudFront for Caching (Instead of API Gateway Cache)

```yaml
# CloudFront distribution pointing to API Gateway
Behaviors:
  - PathPattern: /static/*
    CacheTTL: 86400  # 1 day
  - PathPattern: /dynamic/*
    CacheTTL: 0  # No cache
```

**Why it's better:**
- CloudFront: $0.085/GB (cheaper!)
- Global edge locations (faster!)
- More flexible caching rules

**Savings:** $20/month vs API Gateway cache!

### 3. Compress Responses

```javascript
// Reduce data transfer by 70%!
const compressed = zlib.gzipSync(JSON.stringify(data));
// 10MB → 2MB = $0.0063 saved per request
```

### 4. Batch Requests (Frontend Optimization)

```javascript
// BAD: 5 separate requests
await fetch('/api/user');
await fetch('/api/orders');
await fetch('/api/products');
await fetch('/api/reviews');
await fetch('/api/settings');
// Cost: 5 × $1.00/M = $0.000005

// GOOD: 1 batched request
await fetch('/api/dashboard');  // Returns all data
// Cost: 1 × $1.00/M = $0.000001
// Savings: 80%!
```

### 5. Use WebSockets for Real-Time (Instead of Polling)

```javascript
// BAD: Poll every 5 seconds
setInterval(() => fetch('/api/notifications'), 5000);
// 12 req/min × 1440 min/day = 17,280 req/day per user!

// GOOD: WebSocket connection
const ws = new WebSocket('wss://api.myapp.com');
ws.onmessage = (event) => updateNotifications(event.data);
// 1 connection, unlimited messages!
```

**Total Savings: $847/month → $295/month (65% reduction!)** 🎉

## The API Gateway Security Checklist 🛡️

Before going to production:

- [ ] Use HTTP API (unless you need REST API features)
- [ ] Enable throttling (protect against DDoS)
- [ ] Add authentication (JWT, API keys, or IAM)
- [ ] Configure CORS properly (whitelist origins)
- [ ] Enable CloudWatch logging (debug issues)
- [ ] Set up custom domain (professional URLs)
- [ ] Add request validation (block malformed requests)
- [ ] Enable AWS WAF (block common attacks)
- [ ] Use API keys for partner access
- [ ] Monitor costs with billing alerts

## The Bottom Line 💡

API Gateway is powerful - but it's the most expensive part of serverless!

**The essentials:**
1. **Use HTTP API** (71% cheaper than REST API)
2. **Cache strategically** (CloudFront > API Gateway cache)
3. **Configure throttling** (protect from DDoS)
4. **Optimize payloads** (pagination, compression, S3)
5. **Set up CORS correctly** (whitelist origins)

**The truth about API Gateway:**

It's not "too expensive" - it's "expensive when misconfigured!" With HTTP APIs and proper caching, serverless is actually cheap!

**When architecting our e-commerce backend**, I learned this the hard way: API Gateway costs scale with requests AND data transfer. Use HTTP APIs from day one. Cache at CloudFront (not API Gateway). Compress everything. And for the love of all that is holy, NEVER use REST API unless you absolutely need its features! 🙏

You don't need perfect API Gateway config from day one - you need SMART defaults that balance cost with features! 🚀

## Your Action Plan 🎯

**This week:**
1. Check your API Gateway bill (REST vs HTTP API?)
2. Switch to HTTP API if possible
3. Add CloudFront for caching
4. Enable compression for large responses

**This month:**
1. Set up custom domains
2. Configure throttling properly
3. Add authentication (JWT/API keys)
4. Optimize payload sizes (pagination!)

**This quarter:**
1. Reduce data transfer by 50%
2. Implement WebSockets for real-time features
3. Batch frontend requests
4. Become the API Gateway cost optimization guru! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [API Gateway Pricing Calculator](https://aws.amazon.com/api-gateway/pricing/)
- [Serverless Framework](https://www.serverless.com/) - Deploy HTTP APIs easily
- [Postman](https://www.postman.com/) - Test API Gateway endpoints

**Reading list:**
- [HTTP API vs REST API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
- [API Gateway Best Practices](https://docs.aws.amazon.com/apigateway/latest/developerguide/best-practices.html)

**Real talk:** The best API Gateway strategy is cheap by default (HTTP API), fast globally (CloudFront), and secure always! 🔒

---

**API Gateway bill too high?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your serverless cost optimization wins!

**Want to see my serverless architectures?** Check out my [GitHub](https://github.com/kpanuragh) - I've built production APIs handling millions of requests!

*Now go forth and build cost-effective APIs!* 🚀💰

---

**P.S.** If you've never compared REST API vs HTTP API costs, do that RIGHT NOW. I'll wait. Seriously. You might discover you're paying 71% more than you need to! 💸

**P.P.S.** I once forgot about data transfer costs and racked up a $400 bill in 2 weeks. The API returned 5MB responses for a frontend that polled every 10 seconds. Moral: Compress your responses and stop polling! Use WebSockets! 🚨
