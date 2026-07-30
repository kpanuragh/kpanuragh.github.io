---
title: "⚖️ Policy-as-Code with OPA: Teaching Your Pipeline to Say No"
date: "2026-07-30"
excerpt: "Every org eventually writes 'no public S3 buckets' in a wiki page nobody reads. OPA lets you write that rule in actual code, run it against every Terraform plan and Kubernetes manifest, and reject the bad ones before they ship — no wiki required."
tags:
  - iac
  - opa
  - policy-as-code
  - terraform
  - kubernetes
  - devops
featured: true
---

# ⚖️ Policy-as-Code with OPA: Teaching Your Pipeline to Say No

Every infrastructure team has a rulebook. "No public S3 buckets." "All pods need resource limits." "Prod deploys need two approvals." "Nothing runs as root." The rulebook lives in one of three places: a wiki page nobody opens, a Slack pin from 2023, or the tribal memory of the one senior engineer who reviews every PR and will absolutely notice if you skip it.

None of those scale. The wiki drifts out of date, the Slack pin gets buried, and the senior engineer goes on vacation exactly when someone ships a wildcard IAM policy. Rules that live in someone's head aren't rules — they're vibes with good intentions.

Policy-as-code is the fix: write the rule once, as code, and let a machine enforce it on every single plan, manifest, and request — consistently, tirelessly, and without needing to be tagged in a PR review. **Open Policy Agent (OPA)** is the tool most teams reach for, and its query language, **Rego**, is the part that trips everyone up on day one. Let's fix that.

## What OPA actually is

OPA is a general-purpose policy engine. You feed it structured input (JSON) — a Terraform plan, a Kubernetes admission request, an API payload — and it evaluates that input against rules you've written in Rego. The output is a decision: allow, deny, or a list of violations. It doesn't care what's asking; it's the same engine whether you're gating `terraform apply`, Kubernetes admission control, or your own API gateway.

The mental model that finally made Rego click for me: **it's not a scripting language, it's a query over a big nested document.** Your input is a tree of JSON. A Rego rule is a query that asks "does some path through this tree match my condition?" That's why Rego feels backwards if you're used to imperative code — you're not writing steps, you're writing constraints.

## The Terraform example everyone starts with

Here's a rule that blocks public S3 buckets, evaluated against a `terraform plan` JSON output:

```rego
package terraform.s3

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket_acl"
  resource.change.after.acl == "public-read"
  msg := sprintf("Bucket '%s' must not be publicly readable", [resource.address])
}
```

Run it with `conftest`, a wrapper around OPA built for exactly this:

```bash
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary > tfplan.json
conftest test tfplan.json --policy policies/
```

If someone's PR sets `acl = "public-read"`, CI fails with a human-readable message instead of a silent AWS misconfiguration that a security scanner finds three weeks later — or that a bot on the internet finds three hours later.

## The Kubernetes admission controller version

The same engine, wired into the cluster itself via **Gatekeeper** (OPA's Kubernetes-native wrapper), rejects bad manifests at `kubectl apply` time instead of after they're already running:

```rego
package kubernetes.admission

deny[msg] {
  input.request.kind.kind == "Pod"
  container := input.request.object.spec.containers[_]
  not container.resources.limits.memory
  msg := sprintf("Container '%s' has no memory limit", [container.name])
}
```

No memory limit, no admission. The pod never schedules, and nobody discovers the missing limit at 2am when it OOM-kills a node and takes three unrelated services with it.

## Where this actually saved us

At Cubet, we rolled out an OPA gate on Terraform plans after a change slipped through that opened a security group to `0.0.0.0/0` on a port that definitely should not have been public. Nobody did it maliciously — it was a copy-pasted module default that nobody re-checked. Human review had approved it because humans are bad at diffing forty lines of HCL and noticing the one CIDR block that matters.

We wrote the rule once:

```rego
deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_security_group_rule"
  resource.change.after.cidr_blocks[_] == "0.0.0.0/0"
  resource.change.after.from_port != 443
  msg := sprintf("Security group rule '%s' opens a non-443 port to the world", [resource.address])
}
```

It's been running in CI ever since, and the class of bug it exists for has not recurred — not because people got more careful, but because the check doesn't get tired, distracted, or talked into an exception in a stand-up.

## The part nobody warns you about

Rego's biggest gotcha is that **rules are implicitly OR'd, not AND'd** — multiple `deny` blocks with the same name accumulate into a set, they don't need to all be true. This trips up anyone coming from imperative languages who expects rule bodies to short-circuit like an `if` chain. Test your policies against known-good and known-bad inputs before trusting them in a gate — `opa test` supports exactly this, and skipping it is how a "strict" policy quietly lets everything through because one condition was subtly wrong.

The second gotcha: policy-as-code is only as good as its exception path. If engineers can't get a legitimate, time-boxed override without opening a ticket that sits for three days, they'll route around the gate entirely — disabling the check, or worse, applying changes outside the pipeline where nothing is checking anything. Build the escape hatch before you need it, and log every time it's used.

## Give it a try

Pick one rule from your team's tribal-knowledge rulebook — the one everyone quotes but nobody can point to in code — and write it in Rego this week. Run it against last month's Terraform plans with `conftest test` and see how many would have failed. That number is usually the argument you need to get budget for the rest of the rollout.
