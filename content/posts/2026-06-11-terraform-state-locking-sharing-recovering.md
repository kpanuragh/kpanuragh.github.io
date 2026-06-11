---
title: "🔒 Terraform State Is Not Your Personal File: Locking, Sharing, and Recovering It"
date: "2026-06-11"
excerpt: "Terraform state is the source of truth for your infrastructure. Corrupt it, race-condition it, or lose it — and you're in for a very bad day. Here's how to lock it, share it safely, and recover when things go sideways."
tags: ["terraform", "iac", "devops", "infrastructure", "state-management", "platform-engineering"]
featured: true
---

There's a story I've heard too many times. Two engineers, both running `terraform apply` at the same time. Different resources, they assume — should be fine. Except Terraform doesn't know that. Twenty minutes later, the state file is a beautiful Picasso painting of contradictions, and the entire staging environment is half-deployed in a way nobody can explain.

Terraform state is the heartbeat of your infrastructure. It's how Terraform knows what exists, what changed, and what to do next. Ignore it, misuse it, or let it get corrupted — and you'll be re-reading the entire Terraform docs at 2am, sweating through your shirt, wondering if `terraform import` is about to make things worse.

Let's fix that before it happens.

## Why State Matters More Than You Think

Every time you run `terraform apply`, Terraform reads the state file to understand the current world, compares it to your desired configuration, builds a diff, and makes API calls to close the gap. That state file *is* your infrastructure's source of truth — not your code, not the cloud console.

By default, state lives in a `terraform.tfstate` file right next to your code. Which means:

- It gets committed to git (it contains secrets, by the way — database passwords, API keys, the works).
- There's zero locking. Two people can write to it simultaneously with no conflict detection.
- It lives on someone's laptop, which is probably fine right until it isn't.

Local state is fine for learning. It's a disaster for anything beyond a personal project.

## Remote State: The Only Sane Option

Move your state to a remote backend. For AWS, the canonical setup is S3 for storage plus DynamoDB for locking:

```hcl
terraform {
  backend "s3" {
    bucket         = "my-company-terraform-state"
    key            = "prod/network/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-locks"
  }
}
```

The DynamoDB table needs a single `LockID` string attribute — that's it. Terraform creates a lock entry before writing state and removes it when done. If two people run `apply` concurrently, one of them gets a clear error: *"Error locking state: Error acquiring the state lock."* No silent corruption. Just a polite "wait your turn."

At Cubet, we provision the S3 bucket and DynamoDB table themselves via Terraform in a dedicated bootstrap workspace — then use that remote backend for everything else. A bit of a chicken-and-egg situation you solve once, then never again.

## When Locks Go Stale (And They Will)

Here's the fun part: Terraform only removes the lock on a clean exit. Kill the process with a hard Ctrl-C? Network dropout mid-apply? Process gets OOM-killed in CI? The lock stays. Forever. Or until someone manually removes it.

You'll know this happened when you see:

```
Error locking state: Error acquiring the state lock:
  ConditionalCheckFailedException: The conditional request failed

Lock Info:
  ID:        abc-123-def-456
  Path:      prod/network/terraform.tfstate
  Who:       user@their-laptop
  Created:   2026-06-11T08:30:00Z
```

If you're *sure* the previous operation is genuinely dead (not just slow), you can forcibly remove the lock:

```bash
terraform force-unlock abc-123-def-456
```

Key word: *sure*. Don't run this if there's any chance another apply is still running. Check Slack. Check CI. Check whether your colleague is currently staring at a frozen terminal before you pull the lever. Premature force-unlock is just manual state corruption with extra steps.

## Sharing State Across Workspaces

Large infrastructures split into multiple Terraform workspaces — networking, databases, applications. The app workspace needs the VPC ID from the networking workspace. How do you pass it across without hardcoding?

Enter `terraform_remote_state`:

```hcl
# In the app workspace — reads outputs from the networking workspace
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = "my-company-terraform-state"
    key    = "prod/network/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "app" {
  subnet_id = data.terraform_remote_state.network.outputs.private_subnet_id
  # ...
}
```

The networking workspace just needs to `output` the values you want to share. Clean separation, no hardcoded IDs scattered through your configs.

One gotcha: this creates a *read dependency*. Your app workspace now fails if the networking state is inaccessible or the output doesn't exist. Document your outputs. Keep them stable. Removing an output that another workspace reads is a breaking change — treat it like a public API, because it effectively is one.

## Recovering from State Disasters

State gets corrupted. Buckets get accidentally deleted. Someone runs `terraform state rm` on the wrong resource. It happens. Here's how to survive it.

**Enable versioning on your state S3 bucket.** Just do it. You want to roll back to state from 10 minutes ago when something goes sideways:

```bash
# List versions of your state file
aws s3api list-object-versions \
  --bucket my-company-terraform-state \
  --prefix prod/network/terraform.tfstate

# Restore a specific previous version
aws s3api get-object \
  --bucket my-company-terraform-state \
  --key prod/network/terraform.tfstate \
  --version-id <previous-version-id> \
  terraform.tfstate.backup
```

**Use `terraform state list` and `terraform state show` before any surgery.** These commands are read-only and safe — use them liberally before you `rm` or `mv` anything.

**When resources exist in the cloud but not in state**, `terraform import` re-links them. When resources exist in state but not in the cloud, `terraform state rm` removes them from Terraform's view without touching anything real. Neither is a magic wand — both require you to understand what you're doing — but they're the right tools for the right problems.

The worst place to be is resources that exist in both the cloud *and* state but with mismatched IDs. At that point, you're doing careful surgery with `terraform state mv` and very carefully reviewing every plan before applying. I've been there. It's not pleasant.

## The One Habit That Saves Everything

Before any production apply, use a saved plan:

```bash
terraform plan -out=plan.tfplan
# Review the output carefully — every + and - counts
terraform apply plan.tfplan
```

The plan file locks the intended changes. You apply exactly what you reviewed, nothing more. No surprises from a last-minute config edit. No "wait, was I pointed at staging or prod."

Combined with remote state, DynamoDB locking, S3 versioning, and sensible IAM on your state bucket, this setup survives real teams doing real work — including the 2am incident where someone is trying to roll back a bad deployment while another person is trying to patch a security group.

State is boring infrastructure. Until it isn't. Set it up right once and it disappears into the background where it belongs.

---

*Got a state disaster story? I've heard some wild ones — always happy to commiserate. Find me on X [@kpanuragh](https://x.com/kpanuragh).*
