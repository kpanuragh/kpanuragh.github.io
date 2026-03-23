---
title: "Deployment Smoke Tests: Stop Letting Users Tell You Your Deploy Is Broken 🔥"
date: "2026-03-21"
excerpt: "After countless deployments, I learned the hard way that 'it works in staging' is not a deployment strategy. Smoke tests run in under 60 seconds and catch the disasters before your users do - here's how to build them."
tags: ["\\\"devops\\\"", "\\\"deployment\\\"", "\\\"ci-cd\\\"", "\\\"testing\\\"", "\\\"automation\\\""]
featured: "true"
---

# Deployment Smoke Tests: Stop Letting Users Tell You Your Deploy Is Broken 🔥

**Confession time:** I once deployed a Node.js API to production at 11 PM on a Friday, went to bed feeling proud, and woke up to 47 Slack messages, 3 emails from the client, and a call from my manager asking why the checkout page had been returning 500 errors for six hours. 😰

**The best part?** The fix was one line. A missing environment variable. A `DATABASE_URL` that pointed to staging instead of production.

Sixty seconds of smoke testing would have caught it. Instead, I spent six hours of user downtime and two hours of my Saturday morning fixing it.

That incident changed how I deploy software forever.

## What's a Smoke Test Anyway? 🤔

A smoke test isn't a full integration test suite. It's not a unit test. It's a quick sanity check that runs **immediately after deployment** to verify the app didn't completely explode.

The name comes from hardware testing: you plug in a new circuit board and see if it catches fire. If it smokes — bad. If it doesn't — worth testing further.

**In software terms:**
- ✅ Can the app start and respond to requests?
- ✅ Can it connect to the database?
- ✅ Can it connect to Redis/cache?
- ✅ Do the most critical API endpoints return 200?
- ✅ Does the auth flow work?

That's it. Not 500 test cases. **5-10 checks. Under 60 seconds.**

## The Incident That Started It All 💀

Let me tell you about Black Friday 2022.

Our e-commerce platform handled payment processing for 12 clients. We'd been running CI/CD for 8 months — GitHub Actions, automated tests, the works. We were *confident*.

```bash
# Our "deployment pipeline" at the time
npm run test        # ✅ 847 tests pass
docker build .      # ✅ Image built
kubectl apply -f .  # ✅ Pods deployed
# Done! Let's go home! 🏃‍♂️
```

What we didn't check:
- Did the payment gateway ENV variable survive the Kubernetes secret rotation we did that morning?
- Did the new image have the right `STRIPE_WEBHOOK_SECRET`?
- Could the deployed pods actually *talk* to the payment service?

**The result:** For four hours on Black Friday, every payment attempt silently failed. Users got "Processing..." forever. We didn't know until a client called screaming.

After that incident, I spent a weekend building smoke tests. **We've never had a silent post-deploy failure since.** 🎯

## Building Your First Smoke Test Suite ⚙️

### The Health Check Endpoint (Start Here)

First, add a proper health check endpoint to your app. Not just `GET /ping` returning "pong" — that tells you nothing useful.

**Node.js/Express:**

```javascript
// routes/health.js
const router = require('express').Router();
const db = require('../db');
const redis = require('../redis');

router.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || 'unknown',
    checks: {}
  };

  // Check database connectivity
  try {
    await db.raw('SELECT 1');
    checks.checks.database = 'ok';
  } catch (err) {
    checks.checks.database = 'failed';
    checks.status = 'degraded';
  }

  // Check Redis connectivity
  try {
    await redis.ping();
    checks.checks.cache = 'ok';
  } catch (err) {
    checks.checks.cache = 'failed';
    checks.status = 'degraded';
  }

  // Check critical ENV vars exist
  const requiredEnvVars = ['DATABASE_URL', 'REDIS_URL', 'STRIPE_SECRET_KEY'];
  const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

  if (missingEnvVars.length > 0) {
    checks.checks.config = `missing: ${missingEnvVars.join(', ')}`;
    checks.status = 'unhealthy';
  } else {
    checks.checks.config = 'ok';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

module.exports = router;
```

**Laravel:**

```php
// routes/api.php
Route::get('/health', function () {
    $checks = [
        'status' => 'ok',
        'version' => config('app.version', 'unknown'),
        'checks' => [],
    ];

    // Database check
    try {
        DB::select('SELECT 1');
        $checks['checks']['database'] = 'ok';
    } catch (\Exception $e) {
        $checks['checks']['database'] = 'failed';
        $checks['status'] = 'degraded';
    }

    // Redis check
    try {
        Redis::ping();
        $checks['checks']['cache'] = 'ok';
    } catch (\Exception $e) {
        $checks['checks']['cache'] = 'failed';
        $checks['status'] = 'degraded';
    }

    // Required ENV vars
    $required = ['DB_HOST', 'REDIS_HOST', 'STRIPE_SECRET'];
    $missing = array_filter($required, fn($v) => empty(env($v)));

    if (!empty($missing)) {
        $checks['checks']['config'] = 'missing: ' . implode(', ', $missing);
        $checks['status'] = 'unhealthy';
    } else {
        $checks['checks']['config'] = 'ok';
    }

    $statusCode = $checks['status'] === 'ok' ? 200 : 503;
    return response()->json($checks, $statusCode);
});
```

**What a good health response looks like:**

```json
{
  "status": "ok",
  "version": "v2.4.1",
  "timestamp": "2026-03-21T10:30:00Z",
  "checks": {
    "database": "ok",
    "cache": "ok",
    "config": "ok"
  }
}
```

**What a broken deploy looks like:**

```json
{
  "status": "unhealthy",
  "checks": {
    "database": "ok",
    "cache": "ok",
    "config": "missing: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET"
  }
}
```

That second response? It would have saved my Black Friday. 😤

### The Smoke Test Script 🧪

Now build the script that runs after every deploy:

```bash
#!/bin/bash
# scripts/smoke-test.sh

APP_URL="${1:-https://api.myapp.com}"
MAX_RETRIES=5
RETRY_DELAY=10

echo "🔥 Running smoke tests against: $APP_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PASS=0
FAIL=0

# Function to test an endpoint
check_endpoint() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local retries=0

  while [ $retries -lt $MAX_RETRIES ]; do
    status=$(curl -s -o /dev/null -w "%{http_code}" \
      --max-time 10 \
      --header "Accept: application/json" \
      "$url")

    if [ "$status" -eq "$expected_status" ]; then
      echo "  ✅ $name → HTTP $status"
      PASS=$((PASS + 1))
      return 0
    fi

    retries=$((retries + 1))
    echo "  ⏳ $name → HTTP $status (retry $retries/$MAX_RETRIES)"
    sleep $RETRY_DELAY
  done

  echo "  ❌ $name → HTTP $status (expected $expected_status)"
  FAIL=$((FAIL + 1))
  return 1
}

# Core health check
check_endpoint "Health Check" "$APP_URL/health"

# Auth endpoints
check_endpoint "Login page accessible" "$APP_URL/api/login" 405  # Should return 405 for GET
check_endpoint "Register page accessible" "$APP_URL/api/register" 405

# Public API endpoints
check_endpoint "Products list" "$APP_URL/api/products"
check_endpoint "Categories list" "$APP_URL/api/categories"

# Static assets
check_endpoint "API documentation" "$APP_URL/api/docs"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ✅ $PASS passed | ❌ $FAIL failed"

if [ $FAIL -gt 0 ]; then
  echo "🚨 SMOKE TESTS FAILED! Consider rolling back!"
  exit 1
fi

echo "🎉 All smoke tests passed! Deploy successful!"
exit 0
```

Run it after every deploy:

```bash
./scripts/smoke-test.sh https://api.myapp.com
```

## Wiring It Into Your CI/CD Pipeline 🚀

### GitHub Actions

**Before (naive deploy):**

```yaml
# .github/workflows/deploy.yml
- name: Deploy to production
  run: |
    kubectl apply -f k8s/
    echo "Deployed! 🤞"
```

**After (smoke-tested deploy):**

```yaml
# .github/workflows/deploy.yml
name: Deploy & Verify

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          kubectl apply -f k8s/
          kubectl rollout status deployment/api --timeout=120s

      - name: Wait for deployment to stabilize
        run: sleep 15

      - name: Run smoke tests
        run: |
          chmod +x scripts/smoke-test.sh
          ./scripts/smoke-test.sh ${{ secrets.PRODUCTION_URL }}

      - name: Rollback on smoke test failure
        if: failure()
        run: |
          echo "🚨 Smoke tests failed! Rolling back..."
          kubectl rollout undo deployment/api
          kubectl rollout status deployment/api --timeout=120s
          echo "🔄 Rollback complete! Investigate before redeploying."

      - name: Notify team
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: failure
          text: "🚨 Production deploy FAILED smoke tests! Rolled back automatically."
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

**What this does:**
1. Deploy the new version
2. Wait for pods to be ready
3. Run smoke tests
4. If tests fail → automatic rollback + Slack alert
5. If tests pass → party time 🎉

**A CI/CD pipeline that saved our team:** We once pushed a config change that broke our payment processor connection. The smoke tests caught it in 45 seconds, rolled back automatically, and we fixed it before any user noticed. No incident. No 3 AM calls. Just a GitHub Actions notification. 🙏

### Testing the Right Things ⚡

Not all smoke tests are equal. Here's what actually matters:

**Tier 1 - Critical (must pass, rollback if fail):**
```bash
# App is up and healthy
GET /health → 200

# Database is reachable
Health check includes DB check → "database": "ok"

# Most critical business endpoint works
GET /api/products → 200 with data

# Auth isn't broken
POST /api/login → 422 (needs credentials, but route works)
```

**Tier 2 - Warning (fail loudly, but don't rollback):**
```bash
# Third-party integrations
GET /api/payment/status → 200

# Background job status
GET /api/queues/health → 200
```

**Tier 3 - Informational (log, don't block):**
```bash
# Performance check
Response time < 2000ms

# Response size reasonable
Content-Length > 0
```

## Before/After: Real Numbers from Our Team 📊

**Before smoke tests (6 months, 3-person team):**

| Incident Type | Count | Avg Time to Detect | Avg Time to Fix |
|---|---|---|---|
| Broken ENV vars | 4 | 45 min (users reported) | 30 min |
| DB connection lost | 2 | 90 min (on-call alert) | 15 min |
| Missing routes | 3 | 20 min (error monitoring) | 10 min |
| Total user impact | 9 incidents | ~4 hrs avg | — |

**After smoke tests (next 6 months, same team):**

| Incident Type | Count | Avg Time to Detect | Avg Time to Fix |
|---|---|---|---|
| Broken ENV vars | 2 | 45 sec (smoke test) | 5 min (rollback) |
| DB connection lost | 1 | 30 sec (smoke test) | 5 min (rollback) |
| Missing routes | 0 | — | — |
| Total user impact | 0 incidents | ~40 sec avg | — |

**The smoke tests cost me a weekend to build. The ROI was immediate.** 💰

## Common Pitfalls (Learn from My Mistakes!) 🪤

### Mistake #1: Testing Too Much

**Bad smoke test (takes 5 minutes):**
```bash
# Tests 200 endpoints
# Runs database migrations check
# Downloads test fixtures
# Validates every API response schema
# Full end-to-end user journey
```

**Good smoke test (takes 45 seconds):**
```bash
# Tests 8 critical endpoints
# Checks health endpoint (includes DB/cache)
# Verifies auth flow exists
# Done!
```

Smoke tests should be **fast and focused**. If they take more than 2 minutes, they're not smoke tests — they're integration tests pretending to be smoke tests.

### Mistake #2: Not Retrying

Containers take time to start. Load balancers take time to route. Don't fail on the first 503.

**Bad:**
```bash
status=$(curl -s -o /dev/null -w "%{http_code}" "$URL/health")
if [ "$status" != "200" ]; then exit 1; fi  # Fails if pod isn't ready yet!
```

**Good:**
```bash
for i in {1..5}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$URL/health")
  [ "$status" = "200" ] && break
  echo "Retry $i/5..."
  sleep 10
done
```

**Docker taught me the hard way:** New containers need 10-30 seconds to be healthy. Give them time. 🐳

### Mistake #3: Not Testing the Right URL

```yaml
# Wrong: tests the staging URL (oops!)
- run: ./smoke-test.sh https://staging.myapp.com

# Right: tests what was ACTUALLY deployed
- run: ./smoke-test.sh ${{ vars.PRODUCTION_URL }}
```

I've done this. We tested staging, celebrated, and production was on fire. 🔥

### Mistake #4: Skipping the Rollback

```yaml
# Bad: tests but just notifies on failure
- name: Smoke test
  run: ./smoke-test.sh $PROD_URL
  continue-on-error: true  # 👈 NO! This defeats the purpose!

# Good: roll back on failure!
- name: Rollback on failure
  if: failure()
  run: kubectl rollout undo deployment/api
```

What's the point of knowing your deploy broke if you don't fix it? 🤷

## The Minimum Viable Smoke Test 🎯

If you're starting from zero, here's the simplest possible smoke test:

```bash
#!/bin/bash
# smoke-test-minimal.sh

URL="${1:-https://api.myapp.com}"

echo "Testing $URL..."

for i in {1..5}; do
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL/health")
  if [ "$status" = "200" ]; then
    echo "✅ Health check passed!"
    exit 0
  fi
  echo "Attempt $i failed (HTTP $status), retrying..."
  sleep 10
done

echo "❌ Health check failed after 5 attempts!"
exit 1
```

**Add this to your pipeline today.** It takes 10 minutes to set up and will save you hours of pain.

## TL;DR 💡

After 7+ years deploying production applications to AWS, this is what I know about smoke tests:

- 🔥 **Smoke tests = fast sanity checks after every deploy** (not full test suites)
- ⚡ **60 seconds max** — if longer, trim scope
- 🔄 **Auto-rollback on failure** — the whole point is catching it before users do
- 🏥 **Build a real `/health` endpoint** — not just a ping
- 📣 **Alert your team** — even automatic rollbacks need human awareness

The question isn't "should I build smoke tests?" It's "how many more Black Fridays are you willing to ruin without them?" 🎄💀

---

**Still finding out your deploys are broken from angry users?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've set up these pipelines for Laravel, Node.js, and containerized apps across a dozen production environments.

**Want the full smoke test template?** Check my [GitHub](https://github.com/kpanuragh) — full scripts, GitHub Actions workflows, and health check implementations included.

*Now go protect your deploys before your users become your QA team.* 🔥🛡️

---

**P.S.** The Friday night deploy that triggered this post? We still call it "The Incident" two years later. My teammates mention it every time someone wants to skip smoke tests. Some lessons stick. 😅
