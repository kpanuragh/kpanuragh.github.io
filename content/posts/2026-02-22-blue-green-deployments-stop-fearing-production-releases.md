---
title: "Blue-Green Deployments: How I Finally Stopped Fearing Production Releases 🔵🟢🚀"
date: "2026-02-22"
excerpt: "After years of white-knuckling every production deploy and praying nothing broke, I discovered blue-green deployments. Now my team ships on Fridays. On purpose. Here's how we got there."
tags: ["devops", "deployment", "ci-cd", "aws"]
featured: true
---

# Blue-Green Deployments: How I Finally Stopped Fearing Production Releases 🔵🟢🚀

**Confession:** I once scheduled a production deployment at 2 AM on a Tuesday because I was convinced that was the safest time. Set three alarms. Briefed two other developers. Had a rollback plan printed on paper. Deployed. Broke the login flow. Rolled back at 3:15 AM.

The problem wasn't the time of day. The problem was that every deploy was a one-way door — once the new code was live, the old code was gone, and "rollback" meant another deployment.

Blue-green deployments changed that completely. Now rollback takes 30 seconds. We deploy on Friday afternoons. Sometimes for fun.

## What Blue-Green Actually Means 🤔

The idea is disarmingly simple: you run **two identical production environments** at all times.

- **Blue** is your current live environment. Real users, real traffic.
- **Green** is your next version. Deployed, tested, sitting idle.

Your load balancer (or DNS, or ALB target group) points at Blue. To release, you flip it to point at Green. Rollback? Flip it back to Blue. The whole switch takes seconds.

```
Before deploy:
  Internet → Load Balancer → [BLUE: v1.2.3] ← active
                           → [GREEN: empty] ← idle

After deploy:
  Internet → Load Balancer → [BLUE: v1.2.3] ← idle (instant rollback available)
                           → [GREEN: v1.3.0] ← active
```

No in-place upgrades. No "the new container is replacing the old one." Both environments exist simultaneously. You test Green before switching. You switch. You keep Blue warm until you're confident Green is stable.

## The Deployment That Converted Me 🔥

Before blue-green, our team's deploy process was:

1. SSH into production server
2. `git pull`
3. `composer install --no-dev`
4. `php artisan migrate`
5. `php artisan optimize`
6. Pray
7. Check Sentry frantically for 20 minutes

The database migrations were the killer. Once you ran them, the old code might be incompatible with the new schema. There was no "undo" — migrations don't automatically reverse.

A CI/CD pipeline that saved our team: After a botched deploy broke our API's authentication for 22 minutes during peak hours, our CTO gave me one week to fix the release process. I implemented blue-green on AWS. Our next deploy had a migration issue in Green — I caught it during smoke testing, flipped back to Blue in 8 seconds, fixed the migration, re-deployed. Users never knew. That 8-second flip paid for the week of work.

## Blue-Green on AWS with ALB Target Groups ⚙️

AWS Application Load Balancers make blue-green elegant. Each environment is a separate target group. Switching traffic is an API call.

**Infrastructure setup (Terraform):**

```hcl
# Two target groups — one per environment
resource "aws_lb_target_group" "blue" {
  name        = "api-blue"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
  }
}

resource "aws_lb_target_group" "green" {
  name        = "api-green"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
  }
}

# Listener rule — initially points to blue
resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn  # Start here
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
```

**The flip script (shell):**

```bash
#!/bin/bash
# flip-traffic.sh — switch ALB between blue and green

ALB_ARN="arn:aws:elasticloadbalancing:ap-south-1:123456789:loadbalancer/app/api-alb/..."
LISTENER_ARN="arn:aws:elasticloadbalancing:ap-south-1:123456789:listener/app/api-alb/.../..."
BLUE_TG_ARN="arn:aws:elasticloadbalancing:ap-south-1:123456789:targetgroup/api-blue/..."
GREEN_TG_ARN="arn:aws:elasticloadbalancing:ap-south-1:123456789:targetgroup/api-green/..."

CURRENT=$(aws elbv2 describe-rules \
  --listener-arn "$LISTENER_ARN" \
  --query 'Rules[?Priority==`1`].Actions[0].TargetGroupArn' \
  --output text)

if [ "$CURRENT" = "$BLUE_TG_ARN" ]; then
  echo "Current: BLUE → Switching to: GREEN"
  NEXT="$GREEN_TG_ARN"
else
  echo "Current: GREEN → Switching to: BLUE"
  NEXT="$BLUE_TG_ARN"
fi

aws elbv2 modify-rule \
  --rule-arn "$(aws elbv2 describe-rules \
    --listener-arn "$LISTENER_ARN" \
    --query 'Rules[?Priority==`1`].RuleArn' \
    --output text)" \
  --actions "Type=forward,TargetGroupArn=$NEXT"

echo "✅ Traffic flipped in $(date)"
```

This is the script I run from a GitHub Actions job. It reads the current state, flips to the other environment, and logs everything. Whole operation: under 3 seconds.

## The GitHub Actions Workflow 🤖

Here's the full pipeline that deploys to Green and then flips traffic:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/GithubActionsDeployRole
          aws-region: ap-south-1

      - name: Log in to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push image
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/api:$IMAGE_TAG .
          docker push $ECR_REGISTRY/api:$IMAGE_TAG

      - name: Detect inactive environment
        id: detect-env
        run: |
          CURRENT=$(aws elbv2 describe-rules \
            --listener-arn ${{ secrets.LISTENER_ARN }} \
            --query 'Rules[?Priority==`1`].Actions[0].TargetGroupArn' \
            --output text)

          if [ "$CURRENT" = "${{ secrets.BLUE_TG_ARN }}" ]; then
            echo "deploy_env=green" >> $GITHUB_OUTPUT
            echo "deploy_tg=${{ secrets.GREEN_TG_ARN }}" >> $GITHUB_OUTPUT
          else
            echo "deploy_env=blue" >> $GITHUB_OUTPUT
            echo "deploy_tg=${{ secrets.BLUE_TG_ARN }}" >> $GITHUB_OUTPUT
          fi

      - name: Deploy to inactive environment
        run: |
          # Update ECS service in the inactive environment
          aws ecs update-service \
            --cluster api-cluster-${{ steps.detect-env.outputs.deploy_env }} \
            --service api-service \
            --force-new-deployment \
            --task-definition $(aws ecs register-task-definition \
              --family api-task \
              --container-definitions '[{"name":"api","image":"${{ steps.ecr-login.outputs.registry }}/api:${{ github.sha }}","portMappings":[{"containerPort":3000}]}]' \
              --query 'taskDefinition.taskDefinitionArn' \
              --output text)

      - name: Wait for deployment health
        run: |
          aws ecs wait services-stable \
            --cluster api-cluster-${{ steps.detect-env.outputs.deploy_env }} \
            --services api-service
          echo "✅ ${{ steps.detect-env.outputs.deploy_env }} environment is healthy"

      - name: Run smoke tests against inactive env
        run: |
          # Hit the inactive env directly (not through the public ALB)
          INTERNAL_URL="http://internal-${{ steps.detect-env.outputs.deploy_env }}.api.internal"
          curl -sf "$INTERNAL_URL/health" | jq '.status' | grep -q '"healthy"'
          curl -sf "$INTERNAL_URL/api/v1/ping" | jq '.pong' | grep -q 'true'
          echo "✅ Smoke tests passed"

      - name: Flip traffic to new environment
        run: |
          bash scripts/flip-traffic.sh
          echo "🔵🟢 Traffic switched to ${{ steps.detect-env.outputs.deploy_env }}"

      - name: Monitor for 2 minutes post-flip
        run: |
          sleep 120
          # Check error rate via CloudWatch
          ERROR_COUNT=$(aws cloudwatch get-metric-statistics \
            --namespace AWS/ApplicationELB \
            --metric-name HTTPCode_Target_5XX_Count \
            --start-time $(date -u -d '2 minutes ago' +%Y-%m-%dT%H:%M:%S) \
            --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
            --period 120 \
            --statistics Sum \
            --dimensions Name=LoadBalancer,Value=${{ secrets.ALB_FULL_NAME }} \
            --query 'Datapoints[0].Sum' \
            --output text)

          if (( $(echo "$ERROR_COUNT > 10" | bc -l) )); then
            echo "🚨 High error rate detected. Rolling back."
            bash scripts/flip-traffic.sh  # Flip back
            exit 1
          fi

          echo "✅ Post-deploy metrics look healthy"
```

After countless deployments, the part I consider non-negotiable: **smoke tests against the inactive environment before the flip**. You have a window where Green is fully deployed but getting zero user traffic. Use it. Hit your critical endpoints, check your health route, verify the database connection. If smoke tests fail, you never flip — users never see the broken version.

## The Database Migration Problem 🗄️

The hardest part of blue-green isn't the traffic flip. It's database migrations.

Blue is running code expecting schema version A. Green is running code expecting schema version B. They both connect to the same database. If your migration is destructive (dropping a column, renaming a field), Blue breaks the moment you run it — even before you flip traffic.

**The expand-contract pattern:**

```
Phase 1 — EXPAND (deploy with both old and new code compatible)
  Migration: Add new_email column (old code ignores it, new code writes to it)
  Deploy: Green uses new_email, Blue continues using email
  Flip: Traffic to Green

Phase 2 — CONTRACT (after Green has been stable for a few deploys)
  Migration: Drop old email column (both environments now use new_email)
  No code change needed

Never do "rename column" in one atomic deploy.
```

```php
// Phase 1 migration — safe during blue-green
Schema::table('users', function (Blueprint $table) {
    $table->string('new_email')->nullable(); // ADD — doesn't break Blue
});

// Phase 2 migration — only after old code is fully gone
Schema::table('users', function (Blueprint $table) {
    $table->dropColumn('email'); // REMOVE — now safe
});
```

Docker taught me the hard way that you can't treat database migrations like application code. The schema outlives any single deployment.

## Before vs After: What Changed for Our Team 📊

| Scenario | Before Blue-Green | After Blue-Green |
|---|---|---|
| Deploy window | 2 AM on Tuesday | Any time, any day |
| Rollback time | 5-15 mins (re-deploy old code) | 8 seconds (flip ALB rule) |
| "I broke prod" recovery | Panic, all-hands, incidents | Flip back, fix, redeploy |
| Database migration fear | High — one-way door | Managed — expand-contract |
| Friday deploys | Forbidden by team policy | Normal, expected |
| Smoke testing | "Check Sentry after deploy" | Automated, before traffic hits |
| On-call anxiety on deploy days | Constant | Low |

## Common Pitfalls to Avoid 🪤

**Pitfall #1: Forgetting your inactive environment accumulates drift**

If you only deploy Green when you're about to release, Green might be running a months-old image. Keep both environments updated. Some teams alternate which color is "live" every deploy — Blue gets this release, Green gets the next one.

**Pitfall #2: Hardcoded environment names in your app**

```bash
# Bad — your app thinks it knows which environment it is
APP_ENV=blue

# Good — your app only knows it's "production"
APP_ENV=production
DEPLOYMENT_SLOT=blue  # For observability only, not business logic
```

**Pitfall #3: Session stickiness breaking during flips**

If your users have sessions stored in-memory (stateful containers), flipping traffic drops them. Store sessions externally:

```yaml
# Docker Compose example — sessions go to Redis, not container memory
environment:
  SESSION_DRIVER: redis
  REDIS_URL: redis://session-store:6379
```

**Pitfall #4: Health checks that don't reflect real readiness**

A health check that returns 200 before the database connection pool warms up sends "healthy" traffic to an unready container. Your `/health` endpoint should actually verify what it claims to verify.

## TL;DR ✅

- Blue-green = two production environments, one gets traffic, one waits
- **Traffic flip** via ALB target group swap takes under 3 seconds
- **Rollback** is just flipping back to the previous environment — no re-deploy
- **Smoke test the inactive environment** before flipping — it's your last line of defense
- **Database migrations require expand-contract** — never break the running environment
- **Store sessions externally** so flips don't drop logged-in users
- **Monitor error rates for 2 minutes post-flip** — auto-rollback if metrics spike

The first blue-green deploy is the worst. You build the second environment, write the flip script, set up the pipeline, question all your life choices. Then it works. Then you deploy on a Friday for the first time in your career without sweating through your shirt. Worth every minute.

---

**Shipping to production and want to trade deployment war stories?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got plenty more where this came from.

**Want the full working setup?** My [GitHub](https://github.com/kpanuragh) has Terraform modules and GitHub Actions workflows from real production systems.

*How many of your deploys have a rollback plan that isn't "redeploy the old code and pray"? I'll wait.* 🔵🟢
