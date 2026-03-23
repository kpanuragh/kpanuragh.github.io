---
title: "Chaos Engineering: Break Your Own Systems Before Your Users Do 🔥🐵"
date: "2026-03-12"
excerpt: "I deliberately killed database connections in production and my team almost fired me. Then our system survived a REAL outage without anyone noticing. Here's why controlled chaos is the most underrated scalability practice."
tags: ["\"architecture\"", "\"scalability\"", "\"system-design\"", "\"chaos-engineering\"", "\"resilience\""]
featured: "true"
---

# Chaos Engineering: Break Your Own Systems Before Your Users Do 🔥🐵

**Real talk:** One Friday afternoon I told my team "I'm going to randomly terminate half our Lambda functions while real traffic is flowing." The silence in the Slack channel was deafening. Someone typed "are you feeling okay?" 😅

Three months later, our e-commerce backend survived a full AWS availability zone failure during Black Friday. Zero customer complaints. Zero data loss. The on-call engineer slept through it.

That's what chaos engineering does for you.

## What Is Chaos Engineering? 🤔

Netflix coined it. Their engineers got tired of discovering system failures when customers did. So they built **Chaos Monkey** — a tool that randomly kills production servers.

Deliberately. In production.

The idea sounds insane until you realize the alternative:

```
WITHOUT Chaos Engineering:
→ System has hidden failure modes
→ Users discover them at 2am Black Friday
→ You spend 6 hours debugging something "that never happens"
→ Your boss discovers it on Twitter
→ You update your LinkedIn profile

WITH Chaos Engineering:
→ You discover failure modes in controlled conditions
→ You fix them before they matter
→ System handles real failures gracefully
→ Users don't notice
→ You get a raise (maybe)
```

The principle: **If it hurts to do it, do it more often until it doesn't hurt.**

## The Incident That Made Me a Believer 💀

When I was building our e-commerce backend, we had a payment service that called an external card processor. It was fine. Until it wasn't.

**What happened on a random Tuesday:**
- Card processor had a slowdown (not down, just SLOW)
- Our payment service called it synchronously
- Response time went from 200ms → 12 seconds
- Our checkout endpoints timed out
- Connection pool exhausted
- Checkout API went down completely
- Users couldn't buy anything
- 4 hours of downtime
- $80,000 revenue lost (the math that REALLY gets your attention)

**What should have happened:**
- Card processor slows down
- Our circuit breaker opens after 5 failures
- Checkout returns "payment processing delayed, we'll confirm shortly"
- Users get order confirmed via email when payment resolves
- Nobody notices

We HAD a circuit breaker in code review. We'd never tested it under real conditions. It had a bug. We discovered it in the worst possible way.

**As a Technical Lead, I've learned:** Code that isn't tested under failure conditions isn't tested at all.

## The Chaos Engineering Process 🔬

Don't just start randomly breaking things. That's not chaos engineering, that's self-sabotage. The process:

```
1. HYPOTHESIZE: "Our system should handle X failure gracefully"
2. BASELINE: Measure normal system behavior
3. EXPERIMENT: Introduce controlled failure
4. OBSERVE: Does system behave as hypothesized?
5. FIX: If not, repair the weak point
6. REPEAT: Run in more realistic conditions
```

**Simple example:**

```
Hypothesis: "If our Redis cache dies, the app falls back to database"

Baseline: p99 response time = 45ms (cache hit rate 85%)

Experiment: Kill Redis

Observation:
  - Response time spiked to 800ms (expected - DB hit)
  - Error rate: 0% ✅ (great, fallback works!)
  - Response time recovered when Redis came back ✅

Result: PASSED. Cache is non-critical. 🎉
```

Easy win. Now let's try a harder one.

## The Experiments That Changed Our Architecture 🧪

### Experiment #1: Database Primary Goes Down

**Hypothesis:** Read replicas take over, writes queue up, no data loss.

```bash
# In staging: Kill the primary database
aws rds failover-db-cluster --db-cluster-identifier prod-cluster

# Observe what happens to your application
```

**What we discovered:**

```javascript
// Our original connection code (BROKEN under failover)
const db = mysql.createPool({
  host: 'primary-db.cluster.us-east-1.rds.amazonaws.com',
  // Hardcoded primary! No failover handling!
});

// We got during the experiment:
// Error: ECONNREFUSED - after 30 seconds of retrying primary
// 30 seconds of 500 errors. In production = thousands of angry users.

// Fixed version:
const db = mysql.createPool({
  host: 'cluster-endpoint.cluster.us-east-1.rds.amazonaws.com', // cluster endpoint auto-routes!
  connectTimeout: 5000,    // Fail fast, don't hang
  acquireTimeout: 5000,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0
});

// With retry logic:
async function queryWithRetry(sql, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await db.execute(sql, params);
    } catch (err) {
      if (i === retries - 1) throw err;

      const delay = Math.pow(2, i) * 100; // Exponential backoff
      console.log(`DB query failed, retry ${i+1} in ${delay}ms`);
      await sleep(delay);
    }
  }
}
```

**Finding this in a 3-hour chaos experiment vs finding it during Black Friday:** Not a hard choice.

### Experiment #2: Slow External Payment API

This is the one that would have saved us $80,000.

```javascript
// Chaos experiment: Add artificial latency to payment service calls
// Using a local proxy (toxiproxy is perfect for this)

// toxiproxy config:
{
  "name": "payment-api",
  "listen": "0.0.0.0:8001",
  "upstream": "payment-processor.com:443",
  "enabled": true
}

// Add latency toxic via API:
// POST /proxies/payment-api/toxics
{
  "name": "payment-latency",
  "type": "latency",
  "attributes": {
    "latency": 8000,  // 8 second delay
    "jitter": 2000    // ± 2 seconds
  }
}
```

**What the experiment revealed:**

```
WITHOUT timeout config:
→ Payment calls hang for 8-10 seconds
→ Connection pool fills up (20 connections waiting)
→ All other endpoints start timing out
→ Entire app is degraded because of ONE slow external service
→ Classic cascading failure 💥

WITH proper timeouts + circuit breaker:
→ Payment call fails fast after 3 seconds
→ Circuit breaker opens after 5 consecutive timeouts
→ Fallback: Queue payment for async retry
→ User gets "Order confirmed, payment processing" message
→ Other endpoints unaffected ✅
```

**The fix was adding one thing:**

```javascript
// Before: Trusting external APIs to be fast
const result = await axios.post('https://payment-api.com/charge', data);

// After: Never trust external APIs
const result = await axios.post('https://payment-api.com/charge', data, {
  timeout: 3000,  // 3 second max. Period.
  signal: AbortSignal.timeout(3000)
});

// Plus circuit breaker (we used opossum):
const CircuitBreaker = require('opossum');

const breaker = new CircuitBreaker(callPaymentApi, {
  timeout: 3000,           // 3 second timeout
  errorThresholdPercentage: 50, // Open if 50% of calls fail
  resetTimeout: 30000      // Try again after 30 seconds
});

breaker.fallback(() => ({ status: 'queued', message: 'Payment processing' }));
```

### Experiment #3: One Availability Zone Dies

When I said "I'm going to randomly terminate half our Lambda functions" — this was it. Simulating an AZ outage.

```
Architecture BEFORE chaos experiment:
┌──────────────────────────────────────┐
│ us-east-1a (ALL our Lambda functions)│
│ RDS Primary                          │
│ ElastiCache Primary                  │
└──────────────────────────────────────┘
Single AZ = Single point of failure 😬

Architecture AFTER:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   us-east-1a    │  │   us-east-1b    │  │   us-east-1c    │
│ Lambda (33%)    │  │ Lambda (33%)    │  │ Lambda (34%)    │
│ RDS Primary     │  │ RDS Standby     │  │ RDS Standby     │
│ Cache Primary   │  │ Cache Replica   │  │ Cache Replica   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         └──────────────────┴──────────────────┘
                      Load Balancer
```

**The chaos experiment that revealed this:** We terminated all Lambda functions in us-east-1a. 100% of traffic failed. That's when we realized everything was in one AZ.

**Fixing it was embarrassingly simple:** Multi-AZ was one Terraform config change. We just... never checked.

## Tools for Chaos Engineering 🛠️

### For AWS (What I Use)

**AWS Fault Injection Simulator (FIS):**

```json
{
  "description": "Kill 50% of ECS tasks",
  "targets": {
    "ECSTasksToStop": {
      "resourceType": "aws:ecs:task",
      "resourceTags": { "Environment": "staging" },
      "selectionMode": "PERCENT(50)"
    }
  },
  "actions": {
    "StopTasks": {
      "actionId": "aws:ecs:stop-task",
      "targets": { "Tasks": "ECSTasksToStop" }
    }
  },
  "stopConditions": [
    {
      "source": "aws:cloudwatch:alarm",
      "value": "ErrorRateTooHigh"
    }
  ]
}
```

The stop condition is KEY. If error rate exceeds your threshold, chaos stops automatically. Safety first. 🛑

### For Local Development

**Toxiproxy** — Network condition simulator:

```bash
# Install
docker run -d --name toxiproxy -p 8474:8474 -p 8001-8010:8001-8010 shopify/toxiproxy

# Create proxy
curl -X POST http://localhost:8474/proxies \
  -d '{"name":"database","listen":"0.0.0.0:5433","upstream":"postgres:5432"}'

# Add latency
curl -X POST http://localhost:8474/proxies/database/toxics \
  -d '{"name":"latency","type":"latency","attributes":{"latency":500}}'

# Add packet loss
curl -X POST http://localhost:8474/proxies/database/toxics \
  -d '{"name":"loss","type":"bandwidth","attributes":{"rate":0}}'
```

Your app talks to `localhost:5433` instead of Postgres directly. You control the chaos.

### The Chaos Checklist I Run Every Quarter 📋

```
Network failures:
□ Service A can't reach Service B
□ External API returns 500s
□ External API is slow (8+ seconds)
□ DNS resolution fails

Infrastructure failures:
□ Primary database goes down
□ Cache layer dies (Redis/ElastiCache)
□ Message queue is unavailable
□ 50% of application instances terminate

Resource exhaustion:
□ Database connection pool fills up
□ Memory pressure (kill -9 when OOM)
□ CPU spike on dependent service
□ Disk fills up on logging node

Data failures:
□ Malformed responses from external APIs
□ Unexpected null values in database
□ Schema mismatch between services
```

**Every item that breaks something is a bug waiting to happen in production.**

## Common Chaos Findings (And How to Fix Them) 🪤

### Finding #1: No Timeouts on External Calls

**The symptom:** Kill downstream service → entire app hangs

**The fix:**
```javascript
// NEVER do this:
const data = await externalApi.fetch(url);

// ALWAYS do this:
const data = await Promise.race([
  externalApi.fetch(url),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 3000)
  )
]);
```

### Finding #2: Retry Storms

**The symptom:** Service comes back up → immediately gets hammered by retries from everyone → goes back down

**The fix: Exponential backoff with jitter**

```javascript
async function retry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;

      // Exponential backoff: 100ms, 200ms, 400ms...
      // Jitter: Add random 0-100ms so not all clients retry simultaneously
      const backoff = Math.pow(2, attempt - 1) * 100;
      const jitter = Math.random() * 100;
      await sleep(backoff + jitter);
    }
  }
}
```

### Finding #3: Synchronous Chain of Death

```
User Request
    → Service A (10ms)
        → Service B (50ms)
            → Service C (100ms)
                → External API (slow: 8000ms!)
                    → Entire chain hangs 💥
```

**The fix: Async where possible, timeouts everywhere, fallbacks for non-critical paths**

### Finding #4: No Health Checks

**The symptom:** Service crashes → load balancer keeps sending traffic to it → 50% of requests fail

**The fix:**
```javascript
// Express health check endpoint
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');  // Check DB
    await redis.ping();           // Check cache

    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});
```

## When NOT to Run Chaos Experiments ⚠️

As a Technical Lead, I've learned: chaos engineering has rules.

**Never chaos in production without:**
- Proper monitoring in place (you need to see the impact)
- Automated stop conditions (error rate too high → stop experiment)
- Team awareness (don't chaos at 2pm on a Friday, and TELL your team)
- Rollback plan (can you undo the change in 30 seconds?)
- Starting in staging first

**Never chaos:**
- During peak traffic (unless that's the point, and even then, carefully)
- When the team is already fighting an incident
- On databases without backup verification
- Without understanding the blast radius

**Start here:**
1. Staging environment, controlled conditions
2. Non-critical services first (logging, analytics)
3. Work up to critical paths
4. Only then consider (carefully) production experiments

## The ROI of Breaking Things on Purpose 💰

**A scalability lesson that cost us:** That $80,000 payment outage I mentioned? We could have prevented it with a 3-hour chaos experiment in staging. Instead, we found the failure mode when it cost us real money and real customer trust.

After we implemented regular chaos engineering:
- Production incidents down 60%
- Mean time to recovery down 75% (we'd practiced)
- Black Friday: Zero SEV1 incidents for the first time ever
- On-call engineer actually slept

The math is simple: 3 hours of controlled chaos > 6 hours of panicked production debugging + $80,000 revenue loss.

## TL;DR 🎯

**Chaos engineering in one sentence:** Find your system's breaking points in a controlled experiment before your users find them for you.

**The core practice:**
1. **Form a hypothesis** (system should handle X failure)
2. **Baseline your metrics** (know what "normal" looks like)
3. **Inject controlled failure** (start small, staging first)
4. **Observe and fix** (most findings are embarrassingly fixable)
5. **Run regularly** (systems change, failure modes change)

**Tools:** AWS FIS for production, Toxiproxy for local, Chaos Monkey for the brave.

**The uncomfortable truth:** Every production system has failure modes its owners don't know about. Chaos engineering is just deciding whether you'll discover them on your schedule or your users' schedule.

When designing our e-commerce backend's resilience strategy, chaos engineering wasn't optional — it was the only way to know if our circuit breakers, timeouts, and failover configs actually worked. Reading the docs and writing the code isn't enough. You have to *break it* to trust it.

Your users are going to find your weaknesses eventually. Better you find them first. 🔥🐵

---

**Do you have chaos engineering horror stories?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got more where these came from.

**Want to see resilience patterns in code?** Check my [GitHub](https://github.com/kpanuragh) — I've open-sourced some of the circuit breaker patterns we use in production.

*Now go break something. Intentionally. With a plan.* 🧪

---

**P.S.** The first time I ran a chaos experiment in production, I forgot to tell the on-call engineer. At 3pm he got a PagerDuty alert, opened his laptop in a panic, and started debugging something I had deliberately caused. I owe him a beer. Or twelve. 🍺
