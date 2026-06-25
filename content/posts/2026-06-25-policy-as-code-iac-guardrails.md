---
title: "Policy as Code: Stop Your IaC From Shipping Disasters 🛡️"
date: "2026-06-25"
excerpt: "Drift detection catches problems after the fact. Policy as code stops them at the gate — before a misconfigured S3 bucket or an unrestricted security group ever touches your cloud account."
tags:
  - devops
  - infrastructure-as-code
  - security
  - terraform
  - opa
featured: true
---

Here's a fun game: grep your Terraform for `0.0.0.0/0` in a security group ingress rule. Go ahead, I'll wait.

If you found something, you're not alone. At Cubet, we audited an older project's IaC repo last year and found three security groups with wide-open SSH rules that had been sitting there — version-controlled, peer-reviewed, and deployed — for over eighteen months. Nobody caught it because nobody was specifically *looking* for it. The code review passed because the diff looked reasonable in isolation.

This is the problem that policy as code solves. Not drift detection (that's after the fact), not manual audits (that's expensive and inconsistent), but *automated guardrails that run in CI before `terraform apply` ever fires*.

---

## What "Policy as Code" Actually Means

Policy as code is the practice of expressing security and compliance rules as machine-executable code, then running those rules against your infrastructure definitions the same way you run unit tests against application code.

The three tools you'll hear about most:

- **OPA (Open Policy Agent)** — general-purpose policy engine, uses the Rego language
- **Conftest** — a CLI wrapper around OPA specifically designed for config files (Terraform, Kubernetes YAML, Dockerfiles)
- **Checkov** — Python-based static analysis purpose-built for IaC, ships with hundreds of built-in rules

They all work on the same idea: take your IaC *before it runs*, parse it, and fail fast if it violates your rules.

---

## Conftest: OPA for the Rest of Us

OPA is powerful but Rego has a learning curve. Conftest lowers that curve considerably by giving you a conventional file layout and a simple CLI.

Install it:
```bash
brew install conftest
# or
curl -L https://github.com/open-policy-agent/conftest/releases/latest/download/conftest_Linux_x86_64.tar.gz | tar xz
```

Write a policy. This one lives in `policy/terraform.rego`:
```rego
package main

# Deny any security group that allows unrestricted ingress
deny[msg] {
  resource := input.resource.aws_security_group[name]
  rule := resource.ingress[_]
  rule.cidr_blocks[_] == "0.0.0.0/0"
  rule.from_port == 22
  msg := sprintf(
    "Security group '%s' allows SSH from 0.0.0.0/0 — that's a hard no.",
    [name]
  )
}

# Deny S3 buckets that are missing server-side encryption
deny[msg] {
  resource := input.resource.aws_s3_bucket[name]
  not resource.server_side_encryption_configuration
  msg := sprintf(
    "S3 bucket '%s' has no server-side encryption configured.",
    [name]
  )
}
```

Run it against your Terraform plan output:
```bash
# Generate the plan as JSON
terraform plan -out=tfplan
terraform show -json tfplan > plan.json

# Run policies against it
conftest test plan.json --policy policy/
```

If any `deny` rule fires, the exit code is non-zero and your CI pipeline stops. That's it. No complex setup, no dashboards — just a failing CI job with a human-readable message.

---

## Checkov: Batteries Included

If Rego feels like overkill for your team, Checkov is the pragmatic alternative. It ships with 1,000+ built-in rules covering AWS, Azure, GCP, Kubernetes, and more — and you get a lot of coverage for free on day one.

```bash
pip install checkov

# Run against a directory of Terraform files
checkov -d ./infra/

# Run against a specific plan JSON (catches dynamic values Terraform generates)
checkov -f plan.json --file-type terraform_plan
```

A typical output looks like:

```
Check: CKV_AWS_23: "Ensure every security groups rule has a description"
  FAILED for resource: aws_security_group.web
  File: /infra/networking.tf:14-28

Check: CKV_AWS_18: "Ensure the S3 bucket has access logging enabled"
  FAILED for resource: aws_s3_bucket.assets
  File: /infra/storage.tf:3-9

Passed checks: 47, Failed checks: 2, Skipped checks: 0
```

When a rule doesn't fit your context, you can suppress it inline:
```hcl
resource "aws_s3_bucket" "internal_logs" {
  bucket = "my-internal-audit-logs"

  # checkov:skip=CKV_AWS_18: this IS the log bucket — logging logs to itself is circular
}
```

Inline suppressions are great because they're *documented decisions in code*, not silent exceptions in a dashboard somewhere.

---

## Wiring It Into CI

The value multiplies enormously once this runs on every pull request. Here's a minimal GitHub Actions step that blocks merges on policy failures:

```yaml
- name: Terraform Plan
  run: terraform plan -out=tfplan
  working-directory: ./infra

- name: Export plan as JSON
  run: terraform show -json tfplan > plan.json
  working-directory: ./infra

- name: Checkov policy scan
  uses: bridgecrewio/checkov-action@master
  with:
    file: infra/plan.json
    file_type: terraform_plan
    soft_fail: false          # hard fail — block the PR
    output_format: github_failed_only
```

With `soft_fail: false`, the action exits non-zero and GitHub marks the check as failed. The PR can't merge until the policy violation is fixed or explicitly suppressed with a comment in the code explaining *why*.

That last part matters more than it sounds. Forcing engineers to write `# checkov:skip=... reason: ...` in the source creates an audit trail. Six months from now, when someone asks "why is access logging disabled on this bucket?", the answer is right there in git blame.

---

## The Shift-Left Mental Model

Security teams used to operate reactively: wait for something to go wrong, then investigate. Cloud security tools improved this with drift detection and real-time monitoring. Policy as code moves the check one step earlier still — to the *authoring* phase, before anything is deployed.

```
Write IaC → PR opens → policy scan runs → FAIL (or pass) → review → merge → apply
               ↑
         caught here, costs nothing to fix
```

Compare that to catching a misconfigured security group in production after a pen test surfaces it. Fixing it at the PR stage is a five-minute edit. Fixing it after it's been live for a year involves a postmortem, a ticket, a change-control review, possibly a compliance incident, and a very awkward conversation with your security team.

---

## What to Policy-Gate First

If you're starting from zero, don't try to boil the ocean. My recommended priority order:

1. **Public exposure** — S3 ACL public-read, security groups open to `0.0.0.0/0` on sensitive ports
2. **Encryption at rest** — RDS, S3, EBS, Secrets Manager
3. **Logging and audit trails** — CloudTrail enabled, VPC flow logs, S3 access logging
4. **IAM hygiene** — no `*:*` actions on policies, no inline policies on users

Start with Checkov's built-in rules for these categories — you'll cover most of them without writing a single line of Rego. Once your team is comfortable with the workflow, layer in custom OPA/Conftest policies for your organisation-specific rules.

---

## The Real Win Is the Conversation

Here's the thing nobody tells you: the biggest benefit of policy as code isn't the violations it blocks. It's the *culture shift* it creates.

When engineers know a policy gate exists, they start thinking about it *while* writing the IaC — not after. "Will this security group rule pass Checkov?" becomes a question you ask yourself before you even push. That anticipation is worth more than any scan.

At Cubet, after we introduced Checkov into our Terraform pipeline, the number of security-related PR comments from our platform team dropped noticeably — not because the platform team stopped caring, but because the obvious problems were being caught automatically before human review. Reviewers could focus on architecture and logic, not "hey you left port 22 open again."

That's the shift-left promise actually delivering.

---

Pick one tool — Checkov if you want fast wins, Conftest if you want fine-grained control — add it to your CI on your next IaC PR, and run it in `soft_fail: true` for a week to see what lights up. You'll likely be surprised by what's already in your repo. Then flip the switch to hard-fail and start making those violations someone's problem to fix rather than someone else's problem to discover.

Your future self — staring at a 2am pager alert about an exposed resource — will thank you.
