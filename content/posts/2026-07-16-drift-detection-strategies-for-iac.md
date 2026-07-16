---
title: "Configuration Drift: The Silent Divorce Between Your Terraform and Reality 👻"
date: "2026-07-16"
excerpt: "Your state file says one thing. Your cloud account says another. They stopped talking weeks ago and nobody noticed until the outage. Here's how to actually catch drift before it catches you."
tags:
  - devops
  - terraform
  - infrastructure-as-code
  - platform-engineering
featured: true
---

Somewhere in your cloud account right now, there's a security group rule that isn't in your Terraform. Someone added it during an incident at 2 AM, six months ago, "just to get things working," and swore they'd write the PR the next morning. They did not write the PR the next morning. Terraform doesn't know the rule exists. Your state file is blissfully unaware. And the next `terraform apply` someone runs is either going to silently leave it there forever, or rip it out mid-incident and reintroduce the exact bug it was fixing.

This is drift. It's the gap between the infrastructure you *declared* and the infrastructure you actually *have*, and it grows in the dark — every manual console click, every "quick fix" via CLI, every auto-scaling event that changes an instance count Terraform thinks it owns. IaC promises your code is the source of truth. Drift is reality quietly disagreeing.

## Why Drift Is Worse Than It Sounds

The scary part isn't that drift exists — some amount is inevitable. It's that most teams only discover it in one of two ways: a failed `apply` with a cryptic diff nobody expected, or an outage where the running config doesn't match what anyone can find in version control. Neither is a good time to learn your source of truth lied to you.

At Cubet, we had a load balancer's health check threshold get bumped from 3 failures to 10 during a rough deploy — someone was trying to stop flapping. It worked. It also meant that six months later, a genuinely broken service stayed "healthy" for eleven extra minutes before anything paged, because the Terraform config still said `3` and nobody double-checked that the live value matched. The drift wasn't malicious. It was just invisible.

## Detection Strategy 1: Scheduled Plan-Only Runs

The cheapest thing you can do is also the most underused: run `terraform plan` on a schedule and alert on non-empty diffs, without ever applying.

```yaml
# .github/workflows/drift-detect.yml
name: drift-detect
on:
  schedule:
    - cron: "0 */6 * * *"

jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init
      - id: plan
        run: |
          terraform plan -detailed-exitcode -out=tfplan
        continue-on-error: true
      - name: Alert on drift
        if: steps.plan.outputs.exitcode == '2'
        run: ./scripts/notify-slack.sh "Drift detected in ${{ github.repository }}"
```

`-detailed-exitcode` is the whole trick here — exit code `0` means no changes, `1` means an error, `2` means "there's a diff." That's your drift signal, and it costs nothing but compute time and a webhook.

The catch: plan-only drift detection only tells you *something* changed, not whether it's dangerous. A drifted tag is noise. A drifted IAM policy is a 2 AM page. If every drift alert looks the same, people stop reading them within a month — which is exactly how the health-check-threshold incident above kept slipping past code review for so long.

## Detection Strategy 2: Tiered Alerting by Resource Sensitivity

Not all drift deserves the same urgency, so don't alert on it uniformly. Tag your resources or your Terraform code by blast radius and route accordingly.

```hcl
# main.tf
resource "aws_security_group" "app" {
  # ...
  tags = {
    drift_severity = "critical"
  }
}

resource "aws_instance" "worker" {
  # ...
  tags = {
    drift_severity = "low"
  }
}
```

Then in your drift-checking script, parse the plan JSON and split the diff by tag before deciding where it goes:

```bash
terraform show -json tfplan | jq '
  .resource_changes[]
  | select(.change.actions != ["no-op"])
  | {address, severity: .change.after.tags.drift_severity // "unclassified"}
'
```

Critical-severity drift pages someone. Low-severity drift lands in a weekly digest. Unclassified drift is its own signal — it means someone forgot to tag a new resource, which is a process gap worth fixing on its own.

## Detection Strategy 3: Continuous Reconciliation Tools

Scheduled plans are polling. If you want something closer to real-time, tools like **driftctl**, **AWS Config Rules**, or Terraform Cloud's native drift detection watch for changes as they happen rather than waiting for the next cron tick.

```bash
driftctl scan --from tfstate://terraform.tfstate \
  --to aws+tf \
  --output json://drift-report.json
```

The tradeoff is cost and complexity — you're now running an extra piece of infrastructure whose job is to watch your infrastructure, which is a very platform-engineering sentence to type out loud. For a small account, scheduled `plan` runs are plenty. Past a certain scale — hundreds of resources, multiple teams pushing changes outside your pipeline — continuous scanning starts paying for itself, mostly by shrinking the window between "drift happened" and "someone knows."

## The Part Nobody Wants to Hear: Fix the Culture, Not Just the Tooling

Detection is only half the problem. The other half is that manual changes keep happening in the first place, usually because the IaC pipeline is slower than the incident. If `terraform apply` takes fifteen minutes and a fix takes fifteen seconds via console, guess which one wins during an outage. That's not a moral failing, it's a design failure in your deployment path.

The fix isn't "tell people to stop." It's making the fast path and the correct path the same path — break-glass procedures that still write back to Terraform afterward, PR templates that require a drift check before merge, and IAM policies that make console changes to Terraform-managed resources require an extra approval step instead of a single click. Drift detection tells you the gap exists. Reducing *how* the gap forms is the part that actually keeps you off the incident channel.

## Where to Start

If you've got zero drift detection today: ship the scheduled `plan`-only workflow this week. It's a few lines of YAML and it will almost certainly surface something surprising the first time it runs — it usually does. Then spend the next iteration on severity tiering, because an alert channel that cries wolf on tag changes is an alert channel people mute within a sprint.

Your state file and your cloud account are supposed to be telling the same story. Go check whether they still are — I'll wait.
