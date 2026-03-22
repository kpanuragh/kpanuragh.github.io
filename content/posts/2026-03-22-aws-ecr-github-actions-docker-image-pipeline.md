---
title: "AWS ECR + GitHub Actions: The Docker Image Pipeline That Runs Itself 🐳🚀"
date: "2026-03-22"
excerpt: "After years of 'just push the image manually', I finally wired up a proper AWS ECR pipeline with GitHub Actions. Build, scan, tag, push, deploy - all automated. Here's the setup I wish I had from day one."
tags: ["devops", "docker", "ci-cd", "aws", "deployment"]
featured: true
---

# AWS ECR + GitHub Actions: The Docker Image Pipeline That Runs Itself 🐳🚀

**Hot take:** If you're still running `docker push` from your laptop, you are one coffee spill away from shipping a broken image to production.

I've done it. Pushed the wrong tag. Pushed an image built against `main` when the hotfix was on a branch. Pushed an unscanned image with a critical CVE and found out at 2 AM. Docker taught me the hard way that local pushes are a liability, not a workflow.

After countless deployments — and a few memorable disasters — I built a GitHub Actions pipeline that handles everything: build, scan, tag with a Git SHA, push to AWS ECR, and trigger a rolling deploy. No more manual steps. No more "which version is in prod?" confusion. Just commit and ship.

Here's the full setup.

## Why AWS ECR and Not Docker Hub? 🤔

Docker Hub is fine until it isn't:

| | Docker Hub (Free) | AWS ECR |
|---|---|---|
| Pull rate limits | 100 pulls/6hr (anonymous) | Unlimited within AWS |
| Private repos | 1 free | Unlimited |
| Image scanning | Manual, paid | Built-in with ECR Enhanced Scanning |
| IAM auth | ❌ | ✅ (no long-lived credentials!) |
| Same-region pulls | Slower, external | **Free + fast** |
| Cost | Free tier limited | ~$0.10/GB/month |

When deploying to ECS or EKS, ECR images pull from the same AWS region. No egress costs. No rate limits. IAM-based auth that rotates automatically. It's the obvious choice once you're on AWS — yet I kept using Docker Hub out of habit for way too long. 😅

## Step 1: Create Your ECR Repository ⚙️

First, create the repo. You can click around the console or do it properly:

```bash
# Create the repository
aws ecr create-repository \
  --repository-name my-api \
  --region ap-south-1 \
  --image-scanning-configuration scanOnPush=true \
  --encryption-configuration encryptionType=AES256

# Note the repositoryUri in the output:
# 123456789.dkr.ecr.ap-south-1.amazonaws.com/my-api
```

**Enable lifecycle policies immediately** — or you'll wake up to a bill for 500 untagged image layers:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 production images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged images after 1 day",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 1
      },
      "action": { "type": "expire" }
    }
  ]
}
```

```bash
aws ecr put-lifecycle-policy \
  --repository-name my-api \
  --lifecycle-policy-text file://lifecycle.json
```

A CI/CD pipeline that saved our team from a $200/month ECR bill: lifecycle policies. Set them before you forget. ⚠️

## Step 2: Create an IAM Role for GitHub Actions 🔑

**Do NOT use an IAM user with long-lived access keys.** I see this everywhere and it terrifies me. One leaked key in a commit = compromised pipeline.

Use OIDC federation instead — GitHub's identity provider talks directly to AWS:

```bash
# Create the OIDC provider (one-time setup)
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Then create an IAM role with a trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

And attach a minimal permission policy — **only what the pipeline needs**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:ListImages"
      ],
      "Resource": "arn:aws:ecr:ap-south-1:123456789:repository/my-api"
    }
  ]
}
```

Notice that second `Resource` is scoped to **one specific repo**. Not `*`. Minimal blast radius if something goes wrong. 🛡️

## Step 3: The GitHub Actions Workflow 🤖

Here's the full pipeline. Read through it — every section has a purpose:

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  AWS_REGION: ap-south-1
  ECR_REPOSITORY: my-api

permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # Configure AWS credentials via OIDC — no secrets stored!
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-ecr
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      # Set up Docker Buildx for layer caching
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # Generate tags: branch-sha for PRs, latest + sha for main
      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}
          tags: |
            type=ref,event=branch
            type=sha,prefix=sha-
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=raw,value=prod-${{ github.sha }},enable=${{ github.ref == 'refs/heads/main' }}

      # Build with layer caching (dramatically speeds up CI)
      - name: Build and push Docker image
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.ref == 'refs/heads/main' }}  # Only push on main!
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gist,scope=${{ github.ref_name }}
          cache-to: type=gist,mode=max,scope=${{ github.ref_name }}
          build-args: |
            BUILD_SHA=${{ github.sha }}
            BUILD_TIME=${{ github.event.head_commit.timestamp }}

  # Separate job: scan AFTER building, BEFORE deploying
  security-scan:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-ecr
          aws-region: ${{ env.AWS_REGION }}

      - name: Wait for ECR scan to complete
        run: |
          echo "Waiting for image scan results..."
          sleep 30

          FINDINGS=$(aws ecr describe-image-scan-findings \
            --repository-name ${{ env.ECR_REPOSITORY }} \
            --image-id imageTag=prod-${{ github.sha }} \
            --query 'imageScanFindings.findingSeverityCounts' \
            --output json)

          echo "Scan results: $FINDINGS"

          CRITICAL=$(echo $FINDINGS | jq -r '.CRITICAL // 0')
          HIGH=$(echo $FINDINGS | jq -r '.HIGH // 0')

          if [ "$CRITICAL" -gt "0" ]; then
            echo "❌ Found $CRITICAL CRITICAL vulnerabilities! Blocking deploy."
            exit 1
          fi

          if [ "$HIGH" -gt "5" ]; then
            echo "⚠️ Found $HIGH HIGH vulnerabilities. Review before deploying."
            exit 1
          fi

          echo "✅ Security scan passed. Proceeding to deploy."

  # Deploy only after scan passes
  deploy:
    needs: [build-and-push, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production  # Requires manual approval in GitHub settings!

    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-ecr
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to ECS
        run: |
          # Force new deployment — ECS will pull the latest image
          aws ecs update-service \
            --cluster production \
            --service my-api \
            --force-new-deployment \
            --query 'service.deployments[0].status' \
            --output text

      - name: Wait for deployment to stabilize
        run: |
          aws ecs wait services-stable \
            --cluster production \
            --services my-api
          echo "✅ Deployment complete and healthy!"
```

**What makes this pipeline special:**
- ✅ OIDC auth — zero long-lived credentials stored in GitHub
- ✅ Only pushes images on `main` — PRs build but don't pollute ECR
- ✅ Scans BEFORE deploying — no CVEs sneaking into prod
- ✅ Uses GitHub Environments with manual approval gate
- ✅ Layer caching baked in — builds that were 8 minutes are now 2

## The Deployment Horror Story That Prompted All This 💀

Picture it: **December 2022, last Friday before the holiday freeze.**

I merged a hotfix, opened my terminal, ran `docker build`, `docker push`, `kubectl set image`... and everything looked fine. Monitoring was green. Users were happy.

**Monday morning:** Pagerduty fires. 40% of requests erroring. Turns out the image I built had a dependency conflict because I had a different `node_modules` checkout locally than CI would have produced. My laptop had an older lock file. The image worked fine in my test, failed horribly in prod.

**The fix took 3 minutes.** The post-mortem took 3 hours.

That Monday, I sat down and built the pipeline above. The rule became: **no human being touches `docker push` in production. Ever.** The pipeline is the only entity with permission to push — and it runs from a clean checkout every time.

No more "works on my machine" because the build doesn't happen on my machine anymore. 🎯

## Tagging Strategy: Stop Using `latest` for Everything 🏷️

`latest` is a lie. It doesn't mean the latest tested, stable, production-ready image. It means "whatever was pushed most recently." In practice, it means chaos.

**My tagging strategy after setting up ECR:**

```bash
# What gets pushed for every commit to main:
prod-a3f8c21          # Immutable: the specific SHA
sha-a3f8c21           # Same, different prefix for tooling
latest                # Updated — but you DON'T deploy this tag

# What ECS/Kubernetes actually runs:
prod-a3f8c21          # Always deploy the SHA tag, never latest
```

**Why deploy by SHA and not `latest`?**

```yaml
# Bad: What does this actually run? Nobody knows!
image: 123456789.dkr.ecr.ap-south-1.amazonaws.com/my-api:latest

# Good: Exactly this commit, pinned forever
image: 123456789.dkr.ecr.ap-south-1.amazonaws.com/my-api:prod-a3f8c21
```

When an incident happens at 2 AM, you want to know *exactly* what code is running. A SHA tag gives you that. `latest` gives you a mystery. 🕵️

## Bonus: Rollback in 60 Seconds ⏪

The best part of SHA-tagged images? Rollback is instant:

```bash
# What commit is currently deployed?
aws ecs describe-tasks \
  --cluster production \
  --tasks $(aws ecs list-tasks --cluster production --service-name my-api --query 'taskArns[0]' --output text) \
  --query 'tasks[0].containers[0].image' \
  --output text
# Output: 123456789.dkr.ecr.ap-south-1.amazonaws.com/my-api:prod-a3f8c21

# Roll back to last known good SHA:
aws ecs update-service \
  --cluster production \
  --service my-api \
  --task-definition my-api:PREVIOUS_REVISION \
  --force-new-deployment

# Wait for it:
aws ecs wait services-stable --cluster production --services my-api
echo "Rolled back! ✅"
```

**No rebuilding. No redeployment from scratch.** The old image is still in ECR (lifecycle policy keeps the last 10 prod tags). Pull it, run it, done. A CI/CD pipeline that saved our team from prolonged incidents more than once: immutable image tags + rollback by revision. 🙌

## Common Pitfalls to Avoid 🪤

**Pitfall #1: Pushing on every branch push**

```yaml
# Bad — pollutes ECR with images from every feature branch
on:
  push:

# Good — only push images you might actually deploy
push: ${{ github.ref == 'refs/heads/main' }}
```

**Pitfall #2: Storing AWS credentials as GitHub secrets**

```yaml
# Bad — rotates manually, leaks if secrets are exposed
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}

# Good — short-lived token via OIDC, auto-rotates
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::ACCOUNT:role/github-actions-ecr
```

**Pitfall #3: Skipping the scan because "it slows down CI"**

Yes, it adds 60 seconds. A production breach costs significantly more. Scan everything. Block on criticals. 🛡️

**Pitfall #4: Not setting lifecycle policies immediately**

ECR charges $0.10/GB/month. A Node.js image is 200MB. If your CI runs 50 times a day for 6 months, you've got 9,000 images × 200MB = 1.8TB in ECR. That's $180/month of forgotten images. Set lifecycle policies on day one. 💸

## The Before/After Reality Check 📊

**Before the pipeline:**
```bash
# My Friday deploy ritual:
git pull                           # Hope nobody pushed since I branched
npm run build                      # 6 minutes on my MacBook
docker build -t myapp:latest .     # 8 minutes
docker push myapp:latest           # 4 minutes, upload varies
kubectl set image deployment/myapp myapp=myapp:latest  # Deploys "latest"
# TOTAL: 18-25 minutes
# RELIABILITY: Depends on my laptop's mood
# ROLLBACK: Pray the old "latest" is still somewhere
```

**After the pipeline:**
```bash
git push origin main
# CI takes over:
# Build: 2 min (layer cache)
# Scan: 1 min
# Push to ECR: 45 sec
# ECS deploy: 3 min (rolling update)
# TOTAL: ~7 minutes, unattended
# RELIABILITY: Identical build environment every time
# ROLLBACK: aws ecs update-service --task-definition previous:revision
```

After countless deployments, I learned: **automation isn't laziness. It's the only way to stay sane at scale.** The pipeline is more reliable than I am at 8 PM on a Friday.

## TL;DR 🎯

1. **Create ECR repo** with `scanOnPush=true` and lifecycle policies
2. **Use OIDC** — never store IAM credentials in GitHub secrets
3. **Build on every commit**, push only on `main`
4. **Tag images by Git SHA** — never deploy `latest` to production
5. **Scan before deploy** — block on critical/high CVEs
6. **Use `aws ecs wait services-stable`** — don't declare victory until the deployment is actually done

Your future self at 2 AM will thank you for building this today. 🙏

---

**Running this pipeline?** Compare notes with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm always curious how other teams handle image management at scale.

**Check out real GitHub Actions configs** on [GitHub](https://github.com/kpanuragh) — production battle-tested pipelines from real projects!

*Now go set those lifecycle policies before you forget!* 🐳
