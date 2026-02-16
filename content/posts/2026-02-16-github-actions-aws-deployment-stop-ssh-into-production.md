---
title: "GitHub Actions + AWS Deployment: Stop SSH-ing Into Production Like It's 2012 🚀☁️"
date: "2026-02-16"
excerpt: "Still deploying to AWS with 'git pull' over SSH? After setting up CI/CD pipelines for production serverless apps handling real traffic, here's how GitHub Actions + AWS makes deployment actually enjoyable (and way less terrifying!)"
tags: ["aws", "cloud", "ci-cd", "github-actions", "devops"]
featured: true
---

# GitHub Actions + AWS Deployment: Stop SSH-ing Into Production Like It's 2012 🚀☁️

**Real talk:** The first time I deployed to AWS, I literally SSH'd into an EC2 instance, ran `git pull`, restarted the server, and crossed my fingers. It worked! I felt like a genius. Then my boss asked, "What if the server crashes during deployment?" Me: "...I'll fix it?" Narrator: I did NOT fix it. 😅

Three production outages later, I discovered GitHub Actions + proper AWS deployment. Now I push to main, grab coffee, and watch automation do the work. Zero downtime. Full rollback capability. My stress level dropped by 90%!

Welcome to modern AWS deployment - where SSH is for emergencies, not daily deploys!

## What Even Is GitHub Actions + AWS? 🤔

**GitHub Actions = CI/CD built into GitHub** - Run workflows when code changes

**GitHub Actions + AWS = Automated deployment heaven:**

```
You push code → Tests run → Build happens → AWS deploys → Coffee tastes better ☕
```

**Manual deployment (the old way):**
```bash
ssh ec2-user@production-server
cd /var/www/app
git pull origin main  # Hope no merge conflicts!
npm install          # Pray dependencies work!
pm2 restart app      # Cross fingers!
# 5 minutes of anxiety
```

**Automated deployment (GitHub Actions):**
```yaml
# .github/workflows/deploy.yml
- Push to main
- Tests run automatically
- Build happens automatically
- Deploy to AWS automatically
- Rollback if anything fails
# 0 minutes of anxiety! 🎉
```

**Translation:** Stop manually deploying like it's 2012. Let robots do the boring, error-prone stuff!

## The SSH Deployment Disaster 💀

In production, I've deployed an e-commerce API to AWS. For the first 3 months, I deployed manually. Here's what went wrong:

**The timeline of pain:**

**Week 1:** Deployed by SSH. Forgot to restart the service. Users saw old version for 2 hours. 😬

**Week 3:** Ran `npm install` in production. A dependency failed. Site down for 15 minutes while I frantically rolled back. 💀

**Week 5:** Deployed on Friday at 5 PM (classic mistake). Broken migration script. Database locked. Spent my evening unfucking the database. 🤦‍♂️

**Week 8:** Realized I had been deploying to the STAGING server for 2 days. Production was 6 commits behind. 😱

**Boss:** "We need a better deployment process."

**Me:** *discovers GitHub Actions* "I got this!" 🚀

## My GitHub Actions + AWS Deployment Strategy 🎯

After 7+ years of AWS experience, here's the production-tested approach I use:

### Architecture #1: Lambda Deployment (Serverless)

**What I use it for:** APIs, webhooks, background jobs

**The setup:**

```yaml
# .github/workflows/deploy-lambda.yml
name: Deploy to AWS Lambda

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to Lambda
        run: |
          zip -r function.zip dist/ node_modules/
          aws lambda update-function-code \
            --function-name my-api \
            --zip-file fileb://function.zip

      - name: Notify Slack
        if: always()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text":"Deploy completed!"}'
```

**Why this works:**
- ✅ Tests run before deploy (catch bugs early!)
- ✅ Automatic rollback if tests fail
- ✅ Zero downtime (Lambda updates atomically)
- ✅ Slack notification (know what's deployed)
- ✅ No SSH, no manual steps, no stress!

**Cost:** FREE for public repos! (2,000 minutes/month free for private repos)

### Architecture #2: S3 + CloudFront (Static Sites)

**What I use it for:** React/Vue frontends, documentation sites

```yaml
# .github/workflows/deploy-frontend.yml
name: Deploy Frontend to S3

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install and build
        run: |
          npm ci
          npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy to S3
        run: |
          aws s3 sync dist/ s3://my-site-bucket --delete

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DIST_ID }} \
            --paths "/*"

      - name: Verify deployment
        run: |
          curl -f https://mysite.com || exit 1
```

**A serverless pattern that saved us:** Deploy to S3, invalidate CloudFront, verify with curl. If verification fails, the workflow fails! 🎯

**Cost breakdown:**
- GitHub Actions: FREE (2,000 minutes)
- S3 storage: $0.023/GB (pennies!)
- CloudFront: $0.085/GB data transfer
- **Total for my blog:** ~$3/month! 💰

### Architecture #3: ECS/Fargate (Containerized Apps)

**What I use it for:** Long-running services, WebSocket servers, anything that needs Docker

```yaml
# .github/workflows/deploy-ecs.yml
name: Deploy to AWS ECS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: my-app
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG

      - name: Update ECS task definition
        run: |
          aws ecs register-task-definition \
            --cli-input-json file://task-definition.json

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster production \
            --service my-app-service \
            --task-definition my-app:latest \
            --force-new-deployment

      - name: Wait for deployment
        run: |
          aws ecs wait services-stable \
            --cluster production \
            --services my-app-service
```

**Why this is powerful:**
- ✅ Docker ensures consistency (works on my machine = works in prod!)
- ✅ ECS handles rolling updates (zero downtime!)
- ✅ Automatic rollback on health check failures
- ✅ Full control over runtime environment

**When architecting on AWS, I learned:** ECS is overkill for simple APIs (use Lambda!), but perfect for complex services! 🐳

## The Secrets Management You Actually Need 🔐

**The mistake everyone makes:**

```yaml
# DON'T DO THIS! 🚨
- name: Deploy
  env:
    AWS_ACCESS_KEY: AKIAIOSFODNN7EXAMPLE  # Hardcoded secret!
    DATABASE_URL: postgresql://user:pass@host/db  # PUBLIC IN GIT!
```

**The proper way - GitHub Secrets:**

```yaml
# .github/workflows/deploy.yml
- name: Deploy
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**How to set secrets:**

```bash
# Via GitHub UI:
# Repo → Settings → Secrets and variables → Actions → New repository secret

# Or via GitHub CLI:
gh secret set AWS_ACCESS_KEY_ID
gh secret set AWS_SECRET_ACCESS_KEY
gh secret set DATABASE_URL
```

**Pro tip - Use AWS IAM roles instead of access keys:**

```yaml
# Better approach - OIDC (no long-lived keys!)
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v2
  with:
    role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
    aws-region: us-east-1
```

**Why this is better:**
- ✅ No access keys to leak
- ✅ Temporary credentials (auto-expire)
- ✅ Fine-grained permissions
- ✅ AWS CloudTrail audit logs

**In production, I've deployed** systems using OIDC. Setup takes 10 minutes, saves you from credential leaks forever! 🔒

## GitHub Actions Deployment Patterns I Use Daily 💡

### Pattern #1: Environment-Based Deployment

```yaml
name: Deploy to Environments

on:
  push:
    branches: [dev, staging, main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Determine environment
        id: env
        run: |
          if [ "${{ github.ref }}" == "refs/heads/main" ]; then
            echo "env=production" >> $GITHUB_OUTPUT
            echo "function=my-api-prod" >> $GITHUB_OUTPUT
          elif [ "${{ github.ref }}" == "refs/heads/staging" ]; then
            echo "env=staging" >> $GITHUB_OUTPUT
            echo "function=my-api-staging" >> $GITHUB_OUTPUT
          else
            echo "env=dev" >> $GITHUB_OUTPUT
            echo "function=my-api-dev" >> $GITHUB_OUTPUT
          fi

      - name: Deploy to ${{ steps.env.outputs.env }}
        run: |
          aws lambda update-function-code \
            --function-name ${{ steps.env.outputs.function }} \
            --zip-file fileb://function.zip
```

**Why this works:** Same workflow, different environments. Push to `dev` → dev deployment. Push to `main` → production! 🎯

### Pattern #2: Blue/Green Deployment with Lambda Aliases

```yaml
- name: Deploy new version
  run: |
    # Publish new version
    VERSION=$(aws lambda publish-version \
      --function-name my-api \
      --query 'Version' --output text)

    # Update "staging" alias to new version
    aws lambda update-alias \
      --function-name my-api \
      --name staging \
      --function-version $VERSION

- name: Run smoke tests
  run: npm run test:smoke

- name: Promote to production
  if: success()
  run: |
    # Only update production alias if tests pass!
    aws lambda update-alias \
      --function-name my-api \
      --name production \
      --function-version $VERSION
```

**Result:** New version goes to staging first. Tests pass? Promote to production! Tests fail? Production still on old version! 🛡️

### Pattern #3: Database Migrations (The Safe Way)

```yaml
- name: Run database migrations
  run: |
    # Run migrations in a transaction
    npm run migrate:up

    # Verify migrations succeeded
    if [ $? -ne 0 ]; then
      echo "Migration failed! Rolling back..."
      npm run migrate:down
      exit 1
    fi

- name: Deploy application
  # Only deploys if migrations succeeded!
  run: |
    aws lambda update-function-code \
      --function-name my-api \
      --zip-file fileb://function.zip
```

**A serverless pattern that saved us:** Migrations run BEFORE deployment. If migrations fail, deployment never happens! No more broken databases! 🗄️

### Pattern #4: Rollback on Error

```yaml
- name: Deploy to Lambda
  id: deploy
  run: |
    # Get current version before deploying
    PREVIOUS_VERSION=$(aws lambda get-alias \
      --function-name my-api \
      --name production \
      --query 'FunctionVersion' --output text)

    echo "previous_version=$PREVIOUS_VERSION" >> $GITHUB_OUTPUT

    # Deploy new version
    aws lambda update-function-code \
      --function-name my-api \
      --zip-file fileb://function.zip

- name: Health check
  run: |
    sleep 10  # Give Lambda time to warm up
    curl -f https://api.mysite.com/health || exit 1

- name: Rollback on failure
  if: failure()
  run: |
    echo "Deployment failed! Rolling back..."
    aws lambda update-alias \
      --function-name my-api \
      --name production \
      --function-version ${{ steps.deploy.outputs.previous_version }}
```

**Why this is critical:** Deployment breaks? Automatic rollback to last working version! Production stays healthy! 🚑

## Common GitHub Actions + AWS Mistakes 🪤

### Mistake #1: Not Using Caching

**Bad (slow, expensive):**
```yaml
- name: Install dependencies
  run: npm install  # Downloads EVERYTHING every time!
```

**Good (fast, cheap):**
```yaml
- name: Setup Node.js
  uses: actions/setup-node@v3
  with:
    node-version: '18'
    cache: 'npm'  # Caches node_modules!

- name: Install dependencies
  run: npm ci  # Uses cache, 3× faster!
```

**Savings:** Reduced build time from 4 minutes → 90 seconds! 🚀

### Mistake #2: Deploying on Every Commit

**Bad:**
```yaml
on:
  push:  # Deploys on EVERY push to ANY branch!
```

**Good:**
```yaml
on:
  push:
    branches: [main]  # Only deploy from main branch!
  pull_request:
    types: [opened, synchronize]  # Run tests on PRs!
```

**Why:** You don't want 47 deployments from your feature branch! Only deploy from stable branches! 🎯

### Mistake #3: No Deployment Notifications

**Bad:** Deploy silently, check AWS console manually 👀

**Good:** Get notified when deployments happen!

```yaml
- name: Notify on success
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -H 'Content-Type: application/json' \
      -d '{
        "text": "✅ Deployment to production succeeded!",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*Deployment Status:* Success\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}"
          }
        }]
      }'

- name: Notify on failure
  if: failure()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -H 'Content-Type: application/json' \
      -d '{
        "text": "🚨 Deployment to production FAILED!",
        "blocks": [{
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*Deployment Status:* Failed\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}\n*Action:* Check logs immediately!"
          }
        }]
      }'
```

**Result:** Know instantly if deployments succeed or fail. No more "wait, did it deploy?" moments! 📢

### Mistake #4: Not Testing Before Deployment

**Bad:**
```yaml
- name: Deploy
  run: aws lambda update-function-code ...
# No tests! YOLO! 💀
```

**Good:**
```yaml
- name: Run unit tests
  run: npm test

- name: Run integration tests
  run: npm run test:integration

- name: Lint code
  run: npm run lint

- name: Type check
  run: npm run type-check

- name: Security audit
  run: npm audit --audit-level=high

- name: Deploy (only if all tests pass!)
  run: aws lambda update-function-code ...
```

**When architecting on AWS, I learned:** Every minute spent on tests saves hours debugging production! Write tests, run them in CI! 🧪

## The Cost of GitHub Actions + AWS 💸

**My production e-commerce API:**

**Before automation (manual deployment):**
- Developer time: 30 min/deploy × 20 deploys/month = 10 hours/month
- Downtime from bad deploys: 2 hours/month
- Mental stress: Priceless (but actually very expensive!)

**After GitHub Actions automation:**
- GitHub Actions: FREE (2,000 minutes/month for private repos)
- AWS Lambda: $12/month (1M requests)
- S3 for artifacts: $0.50/month
- Developer time: 0 hours/month (fully automated!)
- Downtime: 0 hours/month (automatic rollback!)
- **Total savings: ~$2,000/month in developer time!** 🎉

**The reality:** Automation pays for itself in the FIRST deployment!

## The Deployment Checklist I Use in Production ✅

Before setting up GitHub Actions + AWS:

- [ ] **Set up AWS IAM user/role** with least-privilege permissions
- [ ] **Store secrets in GitHub Secrets** (never in code!)
- [ ] **Write tests** (unit, integration, smoke tests)
- [ ] **Add health check endpoint** to verify deployments
- [ ] **Set up rollback mechanism** for failures
- [ ] **Configure notifications** (Slack, email, etc.)
- [ ] **Test in staging first** before production
- [ ] **Document the deployment process** (for your team!)
- [ ] **Set up monitoring** (CloudWatch, DataDog, etc.)
- [ ] **Create runbook for failures** (what to do when things break)

## Quick Start: Deploy Your First Lambda with GitHub Actions 🚀

**Step 1: Create IAM user for GitHub Actions**

```bash
# Create IAM policy
aws iam create-policy \
  --policy-name GitHubActionsLambdaDeploy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction"
      ],
      "Resource": "arn:aws:lambda:*:*:function:my-api"
    }]
  }'

# Create IAM user
aws iam create-user --user-name github-actions

# Attach policy
aws iam attach-user-policy \
  --user-name github-actions \
  --policy-arn arn:aws:iam::YOUR_ACCOUNT:policy/GitHubActionsLambdaDeploy

# Create access key
aws iam create-access-key --user-name github-actions
```

**Step 2: Add secrets to GitHub**

```bash
gh secret set AWS_ACCESS_KEY_ID
gh secret set AWS_SECRET_ACCESS_KEY
```

**Step 3: Create workflow file**

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS Lambda

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm test
      - run: npm run build

      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - run: |
          zip -r function.zip .
          aws lambda update-function-code \
            --function-name my-api \
            --zip-file fileb://function.zip
```

**Step 4: Push to main and watch the magic!** 🪄

## The Bottom Line 💡

GitHub Actions + AWS deployment isn't just automation - it's **peace of mind**!

**The essentials:**
1. **Automate everything:** No more SSH, no more manual steps
2. **Test before deploy:** Catch bugs in CI, not production
3. **Rollback on failure:** Always have a way back
4. **Monitor and notify:** Know what's deployed, when it breaks
5. **Start simple:** One workflow, one environment, iterate from there

**The truth about modern deployment:**

Manual deployment is technical debt. Every SSH session is risk. Every `git pull` in production is a potential disaster. Automation isn't "nice to have" - it's **essential** for professional AWS deployments!

**In production, I've deployed** hundreds of Lambda functions, dozens of ECS services, countless S3 sites. Every single one uses GitHub Actions now. Zero regrets! The first deploy takes 30 minutes to set up. Every deploy after that is free, fast, and fearless! 🚀

You don't need perfect CI/CD from day one - you need AUTOMATED deployment that prevents disasters! And GitHub Actions + AWS gives you that! ☁️

## Your Action Plan 🎯

**This week:**
1. Set up IAM user for GitHub Actions
2. Add AWS credentials to GitHub Secrets
3. Write your first deployment workflow
4. Test in staging environment

**This month:**
1. Add automated tests to workflow
2. Implement blue/green deployments
3. Set up rollback mechanism
4. Add deployment notifications

**This quarter:**
1. Automate database migrations
2. Implement multi-environment deployments
3. Add comprehensive monitoring
4. Become the CI/CD champion on your team! 🏆

## Resources Worth Your Time 📚

**Tools I use daily:**
- [GitHub Actions Marketplace](https://github.com/marketplace?type=actions) - Pre-built actions
- [AWS Actions](https://github.com/aws-actions) - Official AWS actions
- [act](https://github.com/nektos/act) - Test GitHub Actions locally

**Reading list:**
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [AWS Lambda CI/CD](https://docs.aws.amazon.com/lambda/latest/dg/lambda-cicd.html)
- [Serverless Framework GitHub Actions](https://www.serverless.com/framework/docs/guides/cicd/github-actions)

**Real talk:** The best deployment is the one you don't have to think about! Set it up once, trust it forever!

---

**Still manually deploying to AWS?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your deployment automation wins!

**Want to see my CI/CD setups?** Check out my [GitHub](https://github.com/kpanuragh) - I've open-sourced my deployment workflows!

*Now go forth and automate those deployments!* 🚀☁️

---

**P.S.** If you're still SSH-ing into production servers to deploy, I'm not judging you (okay, maybe a little). We've all been there! But seriously, set up GitHub Actions this week. Future you will be VERY grateful! 🙏

**P.P.S.** I once spent 3 hours debugging a production issue that turned out to be "I deployed to the wrong server." GitHub Actions eliminates these facepalm moments. You're welcome! 😅
