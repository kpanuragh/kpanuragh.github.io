---
title: "🌊 Terraform Drift: The Infrastructure That Stopped Listening To Your Code"
date: "2026-08-27"
excerpt: "Your Terraform state says one thing. Your cloud account says another. Somewhere in between, a console click or a rogue script quietly rewrote reality — and nobody wrote a commit for it."
tags: ["devops", "terraform", "infrastructure-as-code", "drift-detection", "iac"]
featured: true
---

Here's a fun exercise. Run `terraform plan` on a "stable" production environment you haven't touched in a month. Go on, I'll wait.

If you got `No changes. Your infrastructure matches the configuration.` — congratulations, you work somewhere with actual change control discipline, and I have questions about how you got that job.

If you got a wall of yellow diffs for resources nobody remembers editing, welcome to **drift** — the gap between the infrastructure you declared in code and the infrastructure that actually exists. It's the IaC equivalent of finding out your roommate repainted the kitchen while you were on vacation and didn't tell you. The house still works. It's just not the house you designed.

## How drift actually happens

Nobody sets out to cause drift. It sneaks in through the side door:

- Someone "just quickly" bumps an instance type in the AWS console during an incident, fixes the fire, and forgets to backport it to the `.tf` file.
- An auto-scaling policy or a managed service (looking at you, RDS minor version auto-upgrades) changes a resource attribute on its own.
- A second pipeline, script, or human with different credentials touches the same resources outside of Terraform entirely.
- Someone runs `terraform apply` from a stale branch with an outdated module pin, and it "corrects" things back to something nobody wants either.

Each of these is individually harmless. Stack a few months of them and your state file becomes historical fiction — technically based on real events, but not to be trusted as a source of truth.

## Why this is worse than it sounds

The scary part isn't that drift exists — it's that it's invisible until someone runs `plan`. And by then it's usually a surprise mid-incident, at the worst possible time, when you're trying to figure out why a change that "should be a no-op" is actually about to delete a security group that got manually recreated with different rules six weeks ago.

At Cubet, we had a staging environment where an engineer had manually widened an ingress rule to `0.0.0.0/0` to unblock a demo, and never reverted it. It sat there for weeks. Terraform didn't know because nobody ran `plan` against staging outside of active feature work — it wasn't in the deploy pipeline, just something people ran "when they remembered." The fix wasn't heroic; it was embarrassing. We just hadn't been looking.

## Catching it before it catches you

The fix is depressingly simple: run `plan` on a schedule, not just on push, and treat unexpected diffs as a signal, not noise.

```yaml
# .github/workflows/drift-detect.yml
name: terraform-drift-check
on:
  schedule:
    - cron: "0 * * * *"   # hourly, adjust to your paranoia level
  workflow_dispatch: {}

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init -input=false
      - run: |
          terraform plan -detailed-exitcode -no-color -out=drift.tfplan
        id: plan
        continue-on-error: true
      - name: Alert on drift
        if: steps.plan.outputs.exitcode == '2'
        run: |
          curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d '{"text":"⚠️ Terraform drift detected in prod. Someone touched the console again."}'
```

The `-detailed-exitcode` flag is the whole trick — `0` means no changes, `1` means an error, `2` means there's a diff. That single number turns "silent drift" into "a Slack message with your name on it."

## Deciding what to do about it

Detecting drift is the easy half. The harder question is: who's allowed to fix it, and how?

The honest answer is a decision tree, not a script:

1. **Was the manual change correct and should it stay?** Update the `.tf` code to match reality, then `terraform apply` so state and config agree again. This is the "adopt the drift" path.
2. **Was it a mistake or a stopgap?** Run `terraform apply` to snap it back to declared config — but only after confirming nothing depends on the drifted state (that `0.0.0.0/0` rule, for instance, needs a human decision, not an automatic revert during business hours).
3. **Is it a resource Terraform shouldn't manage at all** (something a managed service mutates on its own, like an RDS engine version bump)? Add it to `lifecycle { ignore_changes = [...] }` so you stop getting false-positive noise:

```hcl
resource "aws_db_instance" "main" {
  # ...

  lifecycle {
    ignore_changes = [engine_version]
  }
}
```

Skipping this step is how teams end up "fixing" drift that was never actually a problem, over and over, forever.

## The real lesson

Terraform state isn't a guarantee, it's a snapshot — a claim about the world that goes stale the moment anyone or anything with credentials acts outside of it. Treat `plan` as a monitoring signal, not a pre-deploy formality, and drift stops being a mystery you inherit during an incident and becomes a routine you run before coffee gets cold.

If you're managing infra with Terraform and you don't have a scheduled drift check running somewhere, that's your Monday task. Go set one up — future-you, staring at an unexplained diff at 2 AM, will send present-you a thank-you note.
