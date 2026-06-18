---
title: "⚠️ Infrastructure Drift: When Your Cloud Stops Matching Your Terraform"
date: "2026-06-18"
excerpt: "Infrastructure drift is the gap between what Terraform thinks exists and what's actually running in your cloud. Here's how to detect it, fix it, and stop it from biting you at 2 AM."
tags: ["terraform", "infrastructure-as-code", "devops", "platform-engineering", "cloud"]
featured: true
---

You `git push` a Terraform change, CI runs `terraform apply`, everything goes green. You close your laptop. Six weeks later, an on-call alert wakes you up at 2 AM because *something* changed in production and nobody knows what.

That something has a name: **infrastructure drift**.

## What Is Infrastructure Drift?

Drift is the gap between what Terraform *thinks* exists and what's *actually* running in your cloud account. Your state file says the security group allows port 443 only. Reality says someone added port 8080 "just temporarily" three months ago and forgot to remove it.

Drift happens in three ways:

1. **Console cowboys** — someone clicks around in the AWS/GCP/Azure console to "quickly fix" something and never encodes it as IaC.
2. **Partial applies** — Terraform apply fails midway, leaving resources in a state that matches neither the old nor the new config.
3. **External automation** — auto-scaling, cloud-managed updates, or other tools modify resources that Terraform also manages.

None of these are hypothetical. At Cubet, we once spent two hours debugging a broken deployment pipeline before realizing someone had manually updated an ECR repository policy in the console after our last apply. The state file was confidently wrong, and Terraform had no idea.

## Detecting Drift: `terraform plan` Is Your First Tool

The most basic drift check is `terraform plan` against a live environment. If Terraform shows changes you didn't author, you have drift.

```bash
terraform plan -detailed-exitcode
# Exit code 0: no changes
# Exit code 1: error  
# Exit code 2: changes detected (drift or pending changes)
```

The `-detailed-exitcode` flag is the key for CI. A non-zero exit code from a scheduled drift check means someone needs to investigate.

Here's a simple drift-check job in GitHub Actions that runs every weekday morning:

```yaml
name: Drift Detection

on:
  schedule:
    - cron: "0 9 * * 1-5"  # weekdays at 9 AM UTC

jobs:
  detect-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.0"

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.DRIFT_CHECKER_ROLE_ARN }}
          aws-region: ap-south-1

      - name: Terraform Init
        run: terraform init -backend-config="bucket=${{ secrets.TF_STATE_BUCKET }}"

      - name: Check for drift
        id: drift
        run: |
          set +e
          terraform plan -detailed-exitcode -out=drift.tfplan 2>&1 | tee plan_output.txt
          echo "exit_code=${PIPESTATUS[0]}" >> $GITHUB_OUTPUT

      - name: Alert on drift
        if: steps.drift.outputs.exit_code == '2'
        run: |
          echo "::warning::Infrastructure drift detected! Review the plan output."
          cat plan_output.txt
          # Post to Slack, PagerDuty, or your alerting system here
```

This catches drift at 9 AM when humans are awake and caffeinated — not at 2 AM when someone is frantically SSH-ing into a bastion host.

## The `moved` Block: Refactoring Without Destroying

A sneaky cause of *intentional* drift is resource renaming. Before Terraform 1.1, renaming a resource in your config meant destroy + recreate. Teams would run `terraform state mv` manually, which worked fine until someone forgot and you had a zombie resource living rent-free in state.

The `moved` block fixes this cleanly:

```hcl
# You renamed this resource in your config:
# resource "aws_s3_bucket" "old_name" → "aws_s3_bucket" "new_name"

moved {
  from = aws_s3_bucket.old_name
  to   = aws_s3_bucket.new_name
}
```

Terraform sees the `moved` block, updates state, and plans zero destructions. Once you've applied, delete the block — it's a migration artifact, not a permanent fixture. This also works for module reorganizations:

```hcl
moved {
  from = module.legacy_vpc.aws_vpc.main
  to   = module.networking.aws_vpc.main
}
```

Clean refactoring without the heart-stopping "will destroy" line in your plan.

## Preventing Drift: The Real Fix

Detection is reactive. Prevention is the goal.

**Lock down console access.** If engineers can make changes in the cloud console that bypass IaC, drift is inevitable. Use IAM policies that deny write access to production resources outside of your CI/CD role. Yes, this is uncomfortable the first time an engineer needs an emergency fix. Yes, it's still necessary.

**Import before you write.** When you bring an existing resource under Terraform management, use `terraform import` (or the `import` block in HCL 1.5+) *before* writing config — not after. Writing config to match a resource you haven't imported yet is how you end up with two slightly-different definitions fighting over state.

```hcl
import {
  to = aws_security_group.app
  id = "sg-0abc123def456"
}
```

Run `terraform plan` after importing. Terraform will show the diff between the real resource and your HCL. Close that gap before the next `apply`.

**Avoid `-target` except in emergencies.** `terraform apply -target` applies a subset of resources and leaves state inconsistent with your config. Every `-target` apply is technical debt you'll pay in drift later. If you reach for it more than once a quarter, something is wrong with your module boundaries.

## When You Find Drift: Triage First

Not all drift is equal. A security group with an extra inbound port is urgent. A CloudWatch log retention setting bumped from 90 to 120 days is not.

When drift shows up in your plan:

1. **Find who changed it.** CloudTrail (AWS), Cloud Audit Logs (GCP), or Activity Log (Azure) tell you exactly when a resource was modified and by whom. Never assume nobody knows — the evidence is always there.
2. **Decide: IaC wins or reality wins?** If someone encoded a real fix manually, encode it in Terraform and apply. If the manual change was a mistake, run `terraform apply` to revert it.
3. **Document the incident.** Drift that you fix without understanding why it happened will happen again. Add a brief comment in the PR that fixes it: what drifted, why, who changed it.

## The Mindset Shift

Infrastructure drift isn't a Terraform problem — it's a process problem. Terraform can only manage what it knows about. If your organization treats the cloud console as a valid change mechanism *alongside* IaC, you will have drift, full stop.

The teams that handle this best treat IaC with the same discipline as application code: all changes go through PRs, CI enforces the plan on every merge, and production console access is a break-glass procedure with mandatory audit trails. Drift detection is a health check, not an afterthought.

Your cloud should be boring. If `terraform plan` consistently returns "no changes" and you feel mildly disappointed because there's nothing to debug, you've built something solid.

Now go add that drift detection cron job. Your future 2 AM self will thank you.
