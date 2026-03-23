---
title: "Canary Deployments: Ship to 5% of Users First, Burn Down Production Never 🐤🔥"
date: "2026-03-09"
excerpt: "After shipping a buggy release that took down 100% of users at once, I learned canary deployments the hard way. Here's how to roll out features to 5% of traffic first so your disasters only affect 5% of users."
tags: ["\\\"devops\\\"", "\\\"deployment\\\"", "\\\"ci-cd\\\"", "\\\"kubernetes\\\"", "\\\"docker\\\""]
featured: "true"
---

# Canary Deployments: Ship to 5% of Users First, Burn Down Production Never 🐤🔥

**Real story:** It was a Tuesday. 2:47 PM. I pushed what I thought was a "minor config change" to production.

Within 3 minutes: 100% of users were getting 500 errors. Every single one of them.

Within 5 minutes: Slack was on fire. CEO was pinging me. My heart was somewhere in my stomach.

Within 15 minutes: I had rolled back, but the damage was done — 15 minutes of complete outage. Support tickets flooded in. My manager's face when we had the post-mortem? I still see it in my nightmares. 😅

**The fix?** Not better testing (though that helps). Not more code reviews. It was deploying to 5% of users first, so that disaster affected 5% of users — not 100%.

Welcome to canary deployments. The thing I wish someone had told me on day one.

## What Even Is a Canary Deployment? 🤔

The name comes from the old mining practice of sending a canary into the coal mine first. If the canary died, miners knew not to go in.

Harsh. But also... exactly what we do to production.

**The idea:**
1. Deploy new version to 5% of your servers (or traffic)
2. Watch metrics: errors, latency, memory
3. If everything looks good → gradually increase to 10%, 25%, 50%, 100%
4. If something breaks → roll back only 5% of traffic. The other 95% never even knew.

**The alternative (what everyone does):**
1. Deploy to 100% of production
2. Pray
3. Get paged at 2 AM
4. Panic rollback
5. Post-mortem
6. Repeat

A canary deployment is just... organized cowardice. And I mean that in the best possible way. 🎯

## The Deployment Horror Story That Converted Me 💀

After setting up CI/CD pipelines for several Laravel and Node.js projects, I thought I had deployment figured out. Tests? ✅ Staging environment? ✅ Code review? ✅

What I didn't have: **a way to limit blast radius.**

**The incident:**

A new payment validation feature passed all tests. Staging looked great. We shipped to production on a Friday afternoon (first mistake, I know).

```
Deploy started: 3:12 PM
100% of traffic on new version: 3:14 PM
First error alert: 3:14 PM and 30 seconds
Support tickets: 47 in 10 minutes
Revenue lost: $0 (users couldn't checkout at all)
My blood pressure: 📈📈📈
```

The bug? An edge case in address validation that only triggered for users with PO Box addresses. Happened to affect 23% of our checkout attempts. In testing? Zero PO Box addresses. Classic.

**With canary deployment:**
- 5% of traffic hits new version → 5% of checkout attempts fail
- Alert fires after 2 minutes
- Rollback in 30 seconds
- 95% of users never noticed
- I still have a job

Instead, I learned this lesson the expensive way. Don't be me.

## Setting Up Canary Deployments: The Kubernetes Way ⚙️

Kubernetes makes canary deployments surprisingly elegant. The trick? Two Deployments sharing one Service.

### Step 1: Your Stable Production Deployment

```yaml
# deployment-stable.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-stable
  labels:
    app: myapp
    version: stable
spec:
  replicas: 9  # 90% of traffic
  selector:
    matchLabels:
      app: myapp
      version: stable
  template:
    metadata:
      labels:
        app: myapp
        version: stable
    spec:
      containers:
      - name: myapp
        image: myapp:v1.4.2  # Current stable version
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

### Step 2: Your Canary Deployment (The 5% Experiment)

```yaml
# deployment-canary.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-canary
  labels:
    app: myapp
    version: canary
spec:
  replicas: 1  # 10% of total replicas = ~10% traffic
  selector:
    matchLabels:
      app: myapp
      version: canary
  template:
    metadata:
      labels:
        app: myapp
        version: canary
    spec:
      containers:
      - name: myapp
        image: myapp:v1.5.0  # New version being tested!
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

### Step 3: One Service to Route Them All

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-service
spec:
  selector:
    app: myapp  # Matches BOTH stable and canary pods!
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP

# Kubernetes automatically distributes traffic based on pod count:
# - 9 stable pods + 1 canary pod = 10 total
# - Service routes ~10% traffic to canary (1/10 pods)
# - No configuration needed - math does the work! 🎯
```

Deploy and check it works:

```bash
# Apply both deployments
kubectl apply -f deployment-stable.yaml
kubectl apply -f deployment-canary.yaml
kubectl apply -f service.yaml

# Verify pods are running
kubectl get pods -l app=myapp
# NAME                             READY   STATUS
# myapp-stable-7d8f9b-xxxxx        1/1     Running   (×9)
# myapp-canary-6c7e8a-yyyyy        1/1     Running   (×1)

# Check traffic split
kubectl describe service myapp-service
# Endpoints: 9 stable + 1 canary = 10 total
```

Approximately 10% of traffic now hits the canary. Time to watch the metrics. 👀

## The Graduation: Scaling the Canary Up 📈

If your canary is healthy after 10-15 minutes, gradually promote it:

```bash
# Phase 1: 10% canary (1 replica canary, 9 stable)
# Wait 10 minutes, check dashboards...

# Phase 2: 25% canary
kubectl scale deployment myapp-canary --replicas=3
kubectl scale deployment myapp-stable --replicas=7

# Wait 10 minutes, check dashboards...

# Phase 3: 50% canary
kubectl scale deployment myapp-canary --replicas=5
kubectl scale deployment myapp-stable --replicas=5

# Wait 10 minutes, all looks good...

# Phase 4: Promote to 100%!
kubectl scale deployment myapp-canary --replicas=10
kubectl scale deployment myapp-stable --replicas=0

# Phase 5: Update stable to new version, delete canary
kubectl set image deployment/myapp-stable myapp=myapp:v1.5.0
kubectl scale deployment myapp-stable --replicas=10
kubectl delete deployment myapp-canary

# 🎉 Full rollout complete! Total time: ~45 minutes
```

**The rollback if canary goes bad:**

```bash
# Something's wrong! Roll back in 30 seconds:
kubectl scale deployment myapp-canary --replicas=0
# OR just delete it
kubectl delete deployment myapp-canary

# 95%+ of users were never affected
# Deep breath. Write the post-mortem. Learn.
```

## GitHub Actions: Automating the Canary Pipeline 🤖

Manual scaling is tedious. Let's automate it with GitHub Actions:

```yaml
# .github/workflows/canary-deploy.yml
name: Canary Deployment

on:
  push:
    branches: [main]

jobs:
  deploy-canary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-south-1

      - name: Build and push Docker image
        run: |
          docker build -t myapp:${{ github.sha }} .
          docker push myapp:${{ github.sha }}

      - name: Deploy canary (10% traffic)
        run: |
          # Update canary with new image
          kubectl set image deployment/myapp-canary \
            myapp=myapp:${{ github.sha }}

          # Scale: 1 canary + 9 stable = 10% canary traffic
          kubectl scale deployment myapp-canary --replicas=1
          kubectl scale deployment myapp-stable --replicas=9

          echo "Canary deployed! Monitoring for 10 minutes..."

      - name: Monitor canary health
        run: |
          # Wait and check error rate
          sleep 600  # 10 minutes

          ERROR_RATE=$(kubectl exec -it monitoring-pod -- \
            promtool query instant \
            'rate(http_requests_total{status=~"5..",version="canary"}[5m])' \
            | jq '.data.result[0].value[1]')

          echo "Canary error rate: $ERROR_RATE"

          if (( $(echo "$ERROR_RATE > 0.01" | bc -l) )); then
            echo "❌ Error rate too high! Rolling back canary..."
            kubectl scale deployment myapp-canary --replicas=0
            exit 1
          fi

          echo "✅ Canary looks healthy!"

      - name: Promote to full rollout
        if: success()
        run: |
          # Full promotion
          kubectl set image deployment/myapp-stable \
            myapp=myapp:${{ github.sha }}
          kubectl scale deployment myapp-stable --replicas=10
          kubectl scale deployment myapp-canary --replicas=0

          echo "🎉 Full rollout complete!"
```

**A CI/CD pipeline that saved our team hours of manual work** — and protected users while we slept. 🙏

## Metrics That Actually Matter During a Canary 📊

Don't just deploy and hope. Watch these specific metrics:

```bash
# 1. Error rate comparison (stable vs canary)
kubectl top pods -l app=myapp

# 2. Response time percentiles
# In Prometheus:
# histogram_quantile(0.99, http_request_duration_seconds{version="canary"})
# vs
# histogram_quantile(0.99, http_request_duration_seconds{version="stable"})

# 3. Pod restarts (crash loops = bad news)
kubectl get pods -l version=canary --watch

# 4. Memory usage (memory leaks show up fast)
kubectl top pods -l version=canary
```

**My personal canary health checklist:**
- Error rate < 0.5% (same as stable)
- P99 latency within 10% of stable
- Zero pod restarts
- Memory usage not climbing
- CPU usage roughly equal

If any of these are off? Roll back first, investigate second. Always.

## Before/After: The Real Impact 💡

**Before canary deployments (my old painful way):**

| Deploy | Outcome | Users Affected | Recovery Time |
|--------|---------|----------------|---------------|
| v1.3 | Bug in image upload | **100%** for 12 min | 45 min |
| v1.4 | Payment edge case | **100%** for 8 min | 20 min |
| v1.4.1 | Memory leak | **100%** for 22 min | 1 hour |

**After canary deployments:**

| Deploy | Outcome | Users Affected | Recovery Time |
|--------|---------|----------------|---------------|
| v1.5 | Bug caught in canary | **~10%** for 3 min | 30 seconds |
| v1.6 | Memory leak caught | **~10%** for 5 min | 30 seconds |
| v1.7 | Clean rollout | **0%** impacted | N/A — it worked! |

**The math is simple:** Same number of bugs (we're all human). But the blast radius drops from 100% → 10%. Every time.

## Common Pitfalls (Learn from My Mistakes) 🪤

### Pitfall #1: Deploying Database Migrations with Canary

This will wreck you. You have two app versions running simultaneously — both hitting the same database. If v1.5.0 adds a non-nullable column, v1.4.2 won't know how to handle it.

**The fix:** Expand/Contract migrations:

```sql
-- Bad: Non-backwards-compatible migration
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NOT NULL;

-- Good: Backwards-compatible (add nullable first)
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NULL;
-- Deploy canary, promote, THEN make it NOT NULL in a separate migration
```

**Docker taught me the hard way:** Running two app versions means your database schema must support both. Plan accordingly. 🗃️

### Pitfall #2: Not Monitoring the Right Thing

Deploying canary then going for coffee is not a canary strategy. It's wishful thinking.

**After countless deployments,** I learned: Set up Slack alerts for error rate spikes before you even deploy.

```yaml
# prometheus-alert-rules.yaml
groups:
- name: canary.rules
  rules:
  - alert: CanaryHighErrorRate
    expr: |
      rate(http_requests_total{status=~"5..",version="canary"}[5m])
      /
      rate(http_requests_total{version="canary"}[5m]) > 0.02
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Canary error rate above 2% - ROLL BACK!"
```

### Pitfall #3: Keeping the Canary Running Too Long

A canary is meant to be promoted or killed — not left running indefinitely. I've seen teams leave canary deployments running for weeks "just to be safe." Now you're maintaining two production configs. That's not safety, that's chaos.

**Rule:** Canary should graduate (or die) within 30-60 minutes of deployment. No exceptions.

### Pitfall #4: Skipping Canary for "Small" Changes

Famous last words: *"It's just a config change, we don't need canary for this."*

That "minor config change" I mentioned at the top of this post? Yeah.

**After 7 years deploying production applications:** There is no such thing as a safe deploy. Canary everything.

## TL;DR: Your Canary Deployment Cheat Sheet 🎯

**The 30-second summary:**
1. Keep your stable deployment running (9 replicas)
2. Deploy new version as canary (1 replica = ~10% traffic)
3. Watch error rate, latency, and memory for 10-15 minutes
4. If healthy: scale up canary, scale down stable, gradually
5. If broken: `kubectl scale deployment myapp-canary --replicas=0` — done in 30 seconds

**The mindset shift:**
- Old me: "Testing in staging is enough, ship it!"
- New me: "Production IS the test. Just limit who sees it first."

Canary deployments won't make your code better. They won't catch every bug. But they transform "100% of users are affected" into "10% of users noticed a hiccup, and we fixed it before they could even tweet about it."

That's not just good DevOps. That's sleeping at night. 😴

---

**Deployed something terrifying lately?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I have deployment war stories for days.

**Want my GitHub Actions canary templates?** They're on my [GitHub](https://github.com/kpanuragh) — battle-tested on real production systems.

*Now go ship that feature. Just do it to 5% of users first.* 🐤

---

**P.S.** Yes, the original canaries in coal mines were a tragic situation. But our digital canaries? They just get rolled back with `kubectl scale --replicas=0`. Nobody gets hurt. 🐦✨
