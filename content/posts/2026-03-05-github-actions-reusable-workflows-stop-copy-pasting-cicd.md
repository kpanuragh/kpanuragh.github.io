---
title: "GitHub Actions Reusable Workflows: Stop Copy-Pasting Your CI/CD Into Every Repo 🔁"
date: "2026-03-05"
excerpt: "After setting up the same GitHub Actions pipeline for the 11th microservice in a row — copy, paste, tweak, commit, forget to update the original — I finally snapped. Here's how reusable workflows ended the nightmare and made our CI/CD actually maintainable."
tags: ["devops", "ci-cd", "github-actions", "deployment"]
featured: true
---

# GitHub Actions Reusable Workflows: Stop Copy-Pasting Your CI/CD Into Every Repo 🔁

**Honest confession:** I spent a Tuesday afternoon propagating a one-line security fix across 14 microservice repos. Same workflow file. Same change. Fourteen pull requests. Fourteen merges. One deeply questioning-my-life-choices developer.

The "fix" was adding `--no-cache` to a Docker build step because our base image had a silent CVE update that wasn't getting picked up. Three repos were already vulnerable by the time I finished the other eleven.

After countless deployments and too many "why is this repo on the old pipeline?" Slack threads, I finally learned about GitHub Actions reusable workflows. It's the feature that turns "update 14 repos" into "update 1 file."

## What's Actually Happening When You Copy-Paste Workflows 💀

You merge your first microservice. The pipeline works. You clone the repo to start the second one. You copy `.github/workflows/deploy.yml`. Tweak two lines. Ship it.

Six months later:

```
repo-1/.github/workflows/deploy.yml  ← v3 (latest security patches)
repo-2/.github/workflows/deploy.yml  ← v2 (missing OIDC auth)
repo-3/.github/workflows/deploy.yml  ← v1 (uses deprecated actions)
repo-4/.github/workflows/deploy.yml  ← v3 (fine)
repo-5/.github/workflows/deploy.yml  ← v1.5 (someone "customized" it)
# ...
repo-14/.github/workflows/deploy.yml ← v? (nobody knows)
```

You now have 14 slightly different versions of "the same" pipeline. Each one a snowflake. Each one someone's afternoon to audit. Each vulnerability fix requires 14 PRs.

This is not CI/CD. This is copy-paste archaeology.

## Reusable Workflows: The Concept 🧠

GitHub Actions lets you define a workflow in one place — a "caller" triggers a "called" workflow stored in a central repo. The called workflow can accept inputs, receive secrets, and run on its own runner. The caller just says "run that thing" and passes what it needs.

```
Repo A (caller) ──┐
Repo B (caller) ──┤──► .github/workflows/deploy.yml in your-org/shared-workflows
Repo C (caller) ──┘         (the called/reusable workflow)
```

Change the reusable workflow once. Every caller picks it up. No 14-PR Tuesdays.

## Your First Reusable Workflow ⚙️

Create a new repo: `your-org/shared-workflows`. This becomes your single source of CI/CD truth.

**`your-org/shared-workflows/.github/workflows/deploy-node.yml`:**

```yaml
name: Deploy Node.js Service

# This is what makes it reusable
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string          # 'staging' or 'production'
      service-name:
        required: true
        type: string          # 'api', 'worker', 'frontend'
      node-version:
        required: false
        type: string
        default: '20'
    secrets:
      AWS_ROLE_ARN:
        required: true
      ECR_REGISTRY:
        required: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}

    permissions:
      id-token: write   # OIDC - no stored AWS keys!
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: 'npm'

      - name: Install and test
        run: |
          npm ci
          npm run test
          npm run build

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-south-1

      - name: Build and push Docker image
        run: |
          IMAGE_TAG="${{ inputs.service-name }}:${{ github.sha }}"
          docker build --no-cache -t $IMAGE_TAG .
          docker tag $IMAGE_TAG ${{ secrets.ECR_REGISTRY }}/$IMAGE_TAG
          docker push ${{ secrets.ECR_REGISTRY }}/$IMAGE_TAG

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster ${{ inputs.environment }} \
            --service ${{ inputs.service-name }} \
            --force-new-deployment
```

Now in each microservice, the entire CI/CD pipeline is:

**`your-org/api-service/.github/workflows/deploy.yml`:**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: your-org/shared-workflows/.github/workflows/deploy-node.yml@main
    with:
      environment: production
      service-name: api
      node-version: '20'
    secrets:
      AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN }}
      ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}
```

That's it. Fourteen repos. Fourteen 12-line files. One place to update when something breaks.

## The Secrets Problem (And Why It Bit Me) 🔐

The first time I set up a reusable workflow, I thought `secrets: inherit` was the magic shortcut:

```yaml
# Caller
jobs:
  deploy:
    uses: your-org/shared-workflows/.github/workflows/deploy.yml@main
    secrets: inherit   # Passes ALL secrets from caller to called workflow
```

Docker taught me the hard way: `secrets: inherit` is fine for internal repos, but if your reusable workflow repo is public, you've just exposed every secret name to the world (not the values, but names leak information). Explicit secret forwarding is 5 extra lines and infinitely safer:

```yaml
# Better - explicit is clear and safe
jobs:
  deploy:
    uses: your-org/shared-workflows/.github/workflows/deploy.yml@main
    secrets:
      AWS_ROLE_ARN: ${{ secrets.AWS_ROLE_ARN }}
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Name your secrets. Know what you're passing. Your future self debugging a 3 AM incident will thank you.

## Versioning: The Part Nobody Talks About 📌

Here's the trap: if all 14 repos call `@main`, a broken commit to shared-workflows breaks all 14 pipelines simultaneously. You've turned one snowflake problem into one catastrophic blast radius problem.

The fix is to version your reusable workflows like a library:

```bash
# In shared-workflows repo, after testing:
git tag v2.1.0
git push origin v2.1.0
```

```yaml
# Callers pin to a tag
jobs:
  deploy:
    uses: your-org/shared-workflows/.github/workflows/deploy-node.yml@v2.1.0
    # ...
```

Now you can iterate on `@main`, cut a new tag when it's stable, and let repos upgrade on their own schedule. The worker service can stay on `v2.0.0` while you test `v2.1.0` on a lower-risk repo first.

**My tagging strategy after a painful lesson:**

```
v1.x.x  ← legacy, still supported
v2.x.x  ← current stable (most repos here)
main    ← experimental, only our throwaway services use this
```

## Real Before/After: Our Microservice Pipeline 📊

**Before:** 14 repos × ~80 lines of workflow YAML = 1,120 lines of duplicated infrastructure logic scattered across our org.

**After:**

```
shared-workflows/
├── .github/workflows/
│   ├── deploy-node.yml        (60 lines)
│   ├── deploy-laravel.yml     (75 lines)
│   ├── run-security-scan.yml  (30 lines)
│   └── notify-slack.yml       (20 lines)

each microservice/
└── .github/workflows/
    └── deploy.yml             (12 lines each)
```

A CI/CD pipeline that saved our team two hours every time we needed to update the deploy process. Security patch? One commit. OIDC migration? One PR. Node version bump across all services? Change the default in `deploy-node.yml`.

## Composing Workflows: Calling Multiple at Once 🎼

Reusable workflows shine when you compose them like functions:

```yaml
name: Full Release Pipeline

on:
  push:
    branches: [main]

jobs:
  security-scan:
    uses: your-org/shared-workflows/.github/workflows/run-security-scan.yml@v1.2.0
    with:
      severity-threshold: HIGH

  deploy-staging:
    needs: security-scan
    uses: your-org/shared-workflows/.github/workflows/deploy-node.yml@v2.1.0
    with:
      environment: staging
      service-name: api
    secrets:
      AWS_ROLE_ARN: ${{ secrets.STAGING_AWS_ROLE_ARN }}
      ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}

  deploy-production:
    needs: deploy-staging
    uses: your-org/shared-workflows/.github/workflows/deploy-node.yml@v2.1.0
    with:
      environment: production
      service-name: api
    secrets:
      AWS_ROLE_ARN: ${{ secrets.PROD_AWS_ROLE_ARN }}
      ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}

  notify:
    needs: deploy-production
    if: always()
    uses: your-org/shared-workflows/.github/workflows/notify-slack.yml@v1.2.0
    with:
      status: ${{ needs.deploy-production.result }}
    secrets:
      SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

Security scan → staging → production → Slack notification. Entirely from composed reusable blocks. The repo's own workflow file is a readable description of what happens, not a 200-line implementation.

## Common Pitfalls That Will Burn You 🔥

**Pitfall #1: Hardcoding regions/clusters in the reusable workflow**

```yaml
# Bad - now everyone is locked to ap-south-1
aws-region: ap-south-1

# Good - make it an input with a sensible default
inputs:
  aws-region:
    type: string
    default: 'ap-south-1'
```

**Pitfall #2: The reusable workflow repo has no branch protection**

If anyone can push to `main` in shared-workflows, anyone can silently modify every pipeline in your org. Add required reviews and status checks to the shared-workflows repo. It's critical infrastructure.

**Pitfall #3: Outputs from reusable workflows**

If you need the called workflow to return a value (like an image digest or deploy URL), you have to explicitly wire up outputs — they don't bubble up automatically:

```yaml
# In the reusable workflow
jobs:
  deploy:
    outputs:
      image-digest: ${{ steps.build.outputs.digest }}
    steps:
      - id: build
        run: echo "digest=$(docker inspect ...)" >> $GITHUB_OUTPUT

# In the caller
jobs:
  deploy:
    uses: your-org/shared-workflows/.github/workflows/deploy-node.yml@v2.1.0
    # ...

  notify:
    needs: deploy
    steps:
      - run: echo "Deployed digest ${{ needs.deploy.outputs.image-digest }}"
```

**Pitfall #4: Forgetting `workflow_call` allows no other triggers**

A reusable workflow file with `on: workflow_call` cannot also be manually triggered unless you add `workflow_dispatch`. I've been confused by this more than once when trying to test the shared workflow directly.

```yaml
on:
  workflow_call:
    inputs: { ... }
  workflow_dispatch:   # Add this for manual testing
    inputs: { ... }   # Mirror the same inputs
```

## The Migration Path (Don't Do It All at Once) 🛤️

When I migrated our org, I didn't tackle all 14 repos in a day. A CI/CD pipeline that saved our team from the big-bang migration regret:

**Week 1:** Create shared-workflows repo. Build v1.0.0 of deploy-node.yml. Test it against a throwaway service.

**Week 2:** Migrate the 2-3 least critical services. Watch for edge cases. Tag v1.1.0 with fixes.

**Week 3:** Migrate staging-only pipelines. Build confidence.

**Week 4+:** Roll out to production-critical services once the reusable workflow has proven itself.

Each repo migration is a 5-minute PR. The whole org is on shared workflows within a month, with zero big-bang risk.

## TL;DR 🎯

If you have more than two repos with GitHub Actions:

1. Create `your-org/shared-workflows`
2. Move your pipeline logic into `workflow_call` workflows there
3. Each repo's deploy file becomes 12 lines of "use that, with these inputs"
4. Tag releases. Pin callers to tags. Update on your own schedule.
5. Never write `--no-cache` in 14 files again

The week I migrated our microservices was the last week a security fix to our CI/CD required more than one pull request. That alone was worth the afternoon it took to set up.

Your pipelines are code. They deserve the same DRY principles you apply to everything else.

---

**Spent a Tuesday on CI/CD copy-paste duty?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - commiserate or share your shared-workflows setup!

**Want to see real reusable workflow templates?** Check out my [GitHub](https://github.com/kpanuragh) for the patterns I actually use in production.

*Now go create that shared-workflows repo and reclaim your Tuesdays.* 🔁🚀
