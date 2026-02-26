---
title: "Canary Deployments: How to Ship to 1% of Users Without Losing Your Mind (or Your Job) 🐦"
date: "2026-02-26"
excerpt: "After one too many 'we'll just deploy and watch the errors' moments that turned into production incidents, I discovered canary deployments. Now I ship to 1% of users first, sleep normally, and only promote to 100% when the metrics agree."
tags: ["devops", "deployment", "ci-cd", "aws"]
featured: true
---

# Canary Deployments: How to Ship to 1% of Users Without Losing Your Mind (or Your Job) 🐦

**True story:** We once pushed a "minor refactor" to production. Full rollout. All users, immediately. The refactor included a miscalculated tax rate that charged every Indian customer 180% GST instead of 18%.

We caught it 11 minutes later via a Slack message that said "bro why is this ₹500 plan showing ₹9,000."

11 minutes. Thousands of users. One decimal point.

That was the day I stopped doing full rollouts and started deploying canaries.

## What Is a Canary Deployment, Exactly? 🤔

The name comes from the old mining practice of sending a canary into a coal mine before the miners. If the canary survived — great, proceed. If it didn't — don't go in.

A canary deployment works the same way: you send your new code to a **small percentage of real users** first. Maybe 1%. Maybe 5%. You watch the metrics. If nothing explodes, you gradually increase the percentage until you're at 100%. If something explodes, you roll back immediately — and only 1% of users ever felt the pain.

```
Canary rollout timeline:

v1.0 → v1.1

Stage 1:  1% canary  → watch for 10 mins
Stage 2: 10% canary  → watch for 10 mins
Stage 3: 50% canary  → watch for 10 mins
Stage 4: 100% full   → done

At any stage, if error rate > threshold → rollback instantly
```

Versus the old way:

```
The old way:
  Deploy v1.1 to 100% of users
  Frantically watch Sentry
  Incident at 2 AM
  Rollback (another full deploy, 10 more minutes of pain)
  Apologize to users
```

## The Deployment That Converted Me ☠️

Before the GST incident I described above, our release process was:

1. Merge PR to `main`
2. GitHub Actions builds and pushes image to ECR
3. ECS updates service → new containers replace old ones
4. Monitor Sentry for 20 minutes
5. Assume everything is fine

Step 4 was the lie. We weren't *monitoring*. We were hoping. And hoping is not a deployment strategy.

After the tax rate disaster, I spent three days setting up canary deployments with AWS ALB weighted routing. The next release — a completely unrelated change — had a subtle database query regression that caused 500ms latency spikes on one endpoint.

The canary caught it at 5% traffic. 95% of users had no idea anything happened. I rolled back, fixed the query, redeployed. Total user impact: maybe 50 requests saw a slow response.

After countless deployments, I now consider canary releases non-negotiable for anything touching billing, auth, or core user flows.

## Canary Deployments with AWS ALB Weighted Routing ⚙️

AWS Application Load Balancers let you split traffic between two target groups by weight. That's the foundation of our canary setup.

**The infrastructure (Terraform):**

```hcl
# Two target groups — stable and canary
resource "aws_lb_target_group" "stable" {
  name        = "api-stable"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "canary" {
  name        = "api-canary"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Weighted forwarding — 99% stable, 1% canary to start
resource "aws_lb_listener_rule" "api_weighted" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.stable.arn
        weight = 99
      }
      target_group {
        arn    = aws_lb_target_group.canary.arn
        weight = 1
      }
    }
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
```

**The canary shift script:**

```bash
#!/bin/bash
# canary-shift.sh — adjust traffic weights between stable and canary

LISTENER_RULE_ARN="${LISTENER_RULE_ARN}"
STABLE_TG_ARN="${STABLE_TG_ARN}"
CANARY_TG_ARN="${CANARY_TG_ARN}"
CANARY_WEIGHT="${1:-1}"  # Default 1%, pass as argument
STABLE_WEIGHT=$((100 - CANARY_WEIGHT))

echo "Shifting traffic: ${STABLE_WEIGHT}% stable / ${CANARY_WEIGHT}% canary"

aws elbv2 modify-rule \
  --rule-arn "$LISTENER_RULE_ARN" \
  --actions "Type=forward,ForwardConfig={TargetGroups=[{TargetGroupArn=${STABLE_TG_ARN},Weight=${STABLE_WEIGHT}},{TargetGroupArn=${CANARY_TG_ARN},Weight=${CANARY_WEIGHT}}]}"

echo "✅ Traffic split updated at $(date)"
```

Usage:
```bash
./canary-shift.sh 1   # 1% canary
./canary-shift.sh 10  # 10% canary
./canary-shift.sh 50  # 50% canary
./canary-shift.sh 100 # Full rollout (canary becomes the new stable)
```

## The GitHub Actions Pipeline 🤖

Here's the full canary deployment workflow. It deploys to the canary target group, waits, checks error rates, and promotes automatically — or rolls back if something goes wrong.

```yaml
# .github/workflows/canary-deploy.yml
name: Canary Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-canary:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE }}
          aws-region: ap-south-1

      - name: Log in to ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push image
        env:
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t ${{ steps.ecr.outputs.registry }}/api:$IMAGE_TAG .
          docker push ${{ steps.ecr.outputs.registry }}/api:$IMAGE_TAG

      - name: Deploy to CANARY target group
        run: |
          aws ecs update-service \
            --cluster api-cluster \
            --service api-canary \
            --force-new-deployment \
            --task-definition $(aws ecs register-task-definition \
              --family api-canary-task \
              --container-definitions "[{\"name\":\"api\",\"image\":\"${{ steps.ecr.outputs.registry }}/api:${{ github.sha }}\",\"portMappings\":[{\"containerPort\":3000}]}]" \
              --query 'taskDefinition.taskDefinitionArn' --output text)

          aws ecs wait services-stable \
            --cluster api-cluster \
            --services api-canary
          echo "✅ Canary deployed and healthy"

      - name: Shift 1% traffic to canary
        run: |
          bash scripts/canary-shift.sh 1
          echo "🐦 1% traffic now on canary"

      - name: Monitor canary at 1% (10 minutes)
        id: monitor-1pct
        run: |
          bash scripts/check-canary-health.sh 10 1
        # Exits 0 if healthy, 1 if error rate exceeded threshold

      - name: Shift 10% traffic to canary
        run: bash scripts/canary-shift.sh 10

      - name: Monitor canary at 10% (10 minutes)
        run: bash scripts/check-canary-health.sh 10 10

      - name: Shift 50% traffic to canary
        run: bash scripts/canary-shift.sh 50

      - name: Monitor canary at 50% (10 minutes)
        run: bash scripts/check-canary-health.sh 10 50

      - name: Full rollout — canary becomes stable
        run: |
          # Update stable service with the same image
          aws ecs update-service \
            --cluster api-cluster \
            --service api-stable \
            --task-definition $(aws ecs describe-task-definition \
              --task-definition api-canary-task \
              --query 'taskDefinition.taskDefinitionArn' --output text)
          aws ecs wait services-stable --cluster api-cluster --services api-stable
          # Route 100% back to stable
          bash scripts/canary-shift.sh 0
          echo "🚀 Full rollout complete. Canary promoted to stable."

      - name: Rollback on failure
        if: failure()
        run: |
          echo "🚨 Canary health check failed — rolling back to 0%"
          bash scripts/canary-shift.sh 0
          echo "✅ All traffic back on stable. Canary retired."
          exit 1
```

**The health check script:**

```bash
#!/bin/bash
# check-canary-health.sh <duration_minutes> <canary_weight_pct>

DURATION_MINS=$1
CANARY_WEIGHT=$2
ERROR_THRESHOLD=5  # Tolerate up to 5% error rate on canary

echo "Monitoring canary (${CANARY_WEIGHT}% traffic) for ${DURATION_MINS} minutes..."
sleep $((DURATION_MINS * 60))

# Query CloudWatch for 5xx errors on canary target group
ERRORS=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name HTTPCode_Target_5XX_Count \
  --dimensions Name=TargetGroup,Value="$CANARY_TG_NAME" \
  --start-time $(date -u -d "${DURATION_MINS} minutes ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period $((DURATION_MINS * 60)) \
  --statistics Sum \
  --query 'Datapoints[0].Sum' --output text)

REQUESTS=$(aws cloudwatch get-metric-statistics \
  --namespace AWS/ApplicationELB \
  --metric-name RequestCount \
  --dimensions Name=TargetGroup,Value="$CANARY_TG_NAME" \
  --start-time $(date -u -d "${DURATION_MINS} minutes ago" +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period $((DURATION_MINS * 60)) \
  --statistics Sum \
  --query 'Datapoints[0].Sum' --output text)

ERROR_RATE=$(echo "scale=2; ($ERRORS / $REQUESTS) * 100" | bc)
echo "Error rate: ${ERROR_RATE}% (threshold: ${ERROR_THRESHOLD}%)"

if (( $(echo "$ERROR_RATE > $ERROR_THRESHOLD" | bc -l) )); then
  echo "🚨 Error rate exceeded threshold! Triggering rollback."
  exit 1
fi

echo "✅ Canary healthy at ${CANARY_WEIGHT}% traffic. Proceeding."
```

## Before vs After: What Changed 📊

| Scenario | Full Rollout | Canary Deployments |
|---|---|---|
| New bug impact | 100% of users | 1-5% of users |
| Time to detect regression | After rollout (when it's too late) | During canary phase |
| Rollback time | 8-15 mins (full re-deploy) | 30 seconds (weight back to 0) |
| Friday deployments | Forbidden | Routine |
| "The deploy broke something" incident | All-hands, post-mortem | "Canary caught it, rolled back, fixed" |
| Confidence before 100% rollout | Hope and prayers | Actual error rate data |

## Common Pitfalls to Avoid 🪤

**Pitfall #1: Treating canary as an excuse to skip testing**

Canary is a production safety net, not a replacement for staging and integration tests. The canary should catch edge cases and load-related issues that are hard to simulate — not bugs that a 5-minute smoke test would catch. Don't use "the canary will catch it" as a reason to skip QA.

**Pitfall #2: Not tracking which version each request hit**

If you don't tag your logs and metrics with the deployment version, you can't separate canary errors from stable errors:

```javascript
// Tag every log line with the version
const logger = winston.createLogger({
  defaultMeta: {
    service: 'api',
    version: process.env.APP_VERSION || 'unknown',
    deployment: process.env.DEPLOYMENT_SLOT || 'stable', // 'canary' or 'stable'
  },
  // ...
});
```

Now CloudWatch Logs Insights can show you `| filter deployment = "canary"` and you'll see only canary traffic.

**Pitfall #3: Setting your error threshold too high (or too low)**

- Too high (30%): You'll promote buggy code because 30% errors is "acceptable"
- Too low (0.1%): Normal baseline noise will trigger rollbacks on healthy deploys

Know your baseline error rate in production before setting canary thresholds. I start at 2x the baseline. If production normally has 0.5% errors, my canary threshold is 1%.

**Pitfall #4: Stateful canary without sticky sessions**

If users randomly bounce between canary and stable on each request, stateful operations break. A user creates a resource on stable, then GETs it hitting canary — which has a different schema. Use ALB sticky sessions for canary, or design your API to be stateless (you should be doing this anyway).

```yaml
# ALB target group with stickiness for canary
resource "aws_lb_target_group" "canary" {
  # ...
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 3600  # 1 hour — user stays on canary for the full session
    enabled         = true
  }
}
```

**Pitfall #5: Long-lived canaries become forgotten tech debt**

A canary that's been at 5% for three weeks isn't a canary anymore. It's a second production environment that nobody maintains. Set a maximum canary duration (say, 2 hours). Either promote or roll back. Don't let it linger.

## TL;DR ✅

- Canary = deploy to a small % of users, monitor, gradually increase
- **1% → 10% → 50% → 100%** with health checks at each stage
- **ALB weighted routing** makes this a 30-second traffic shift, not a re-deploy
- **Auto-rollback** on error rate spike — the canary catches the coal mine gas before the miners go in
- **Tag logs with version** so you can filter canary vs stable in CloudWatch
- **Know your baseline error rate** before setting thresholds
- **Set a time limit** — canaries that linger become production drift

The GST bug that charged ₹9,000 for a ₹500 plan? With canary deployments, 50 users would have seen it (and probably would not have even completed the checkout). Instead of thousands. We'd have rolled back in 30 seconds and fixed it before most people even tried to upgrade.

That's the whole point. Let the canary fly first.

---

**Shipping to production and want to swap deployment war stories?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I have a lot more where that GST story came from.

**Want the scripts?** The full canary deployment setup — Terraform, GitHub Actions, and health check scripts — is on my [GitHub](https://github.com/kpanuragh).

*How many of your last 10 deploys were full rollouts with no gradual traffic shifting? Yeah. Let's fix that.* 🐦
