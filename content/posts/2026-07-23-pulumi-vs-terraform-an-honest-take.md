---
title: "🥊 Pulumi vs Terraform: An Honest Take After Actually Shipping Both"
date: "2026-07-23"
excerpt: "Every \"Pulumi vs Terraform\" post online is written by someone who used one of them for a weekend. Here's what changes after you've run both in production for over a year — state files, drift, and the one feature that actually matters."
tags:
  - devops
  - iac
  - terraform
  - pulumi
  - platform-engineering
featured: true
---

Every few months, someone on the team posts a link in Slack titled something like "Why We Switched From Terraform to Pulumi (And You Should Too)" and the thread turns into a religious war for about twenty minutes before everyone goes back to writing HCL because the migration ticket is still sitting in the backlog labeled "Q3."

I've now shipped real infrastructure with both tools, in production, for over a year each — not weekend toy projects, actual "if this breaks, someone's pager goes off" infrastructure. So here's the take nobody selling you a tool wants to give: **they're both fine, and the reason to pick one over the other is almost never the reason people argue about online.**

Let's get into it.

## The argument everyone has is the wrong one

The internet's favorite Pulumi pitch is "real programming language instead of a DSL." And sure, writing:

```typescript
const bucket = new aws.s3.Bucket("logs", {
  versioning: { enabled: true },
});

const replicaBuckets = regions.map(
  (region) => new aws.s3.Bucket(`logs-${region}`, { ... }, { provider: providers[region] })
);
```

feels nicer than HCL's `for_each` and `dynamic` block gymnastics if you already think in TypeScript. But "I get to use `if` statements and `for` loops" was never actually Terraform's limitation — HCL has had `for_each`, `count`, and conditional expressions for years, and honestly, most infra code shouldn't need more logic than that. If your Terraform module needs a real programming language's worth of branching, that's usually a sign the module is doing too much, not that HCL is too weak.

The real differences live somewhere less flashy: **state handling, the plan/diff experience, and what happens when reality drifts from your code.**

## State: Terraform makes you think about it, Pulumi hides it (until it doesn't)

Terraform's state file is annoying and also honest. You know it exists, you know where it lives (hopefully an S3 backend with DynamoDB locking, not someone's laptop), and when something goes wrong you can `terraform state list`, `terraform state rm`, or `terraform import` your way out of trouble because the mental model is transparent.

Pulumi also has state — it's just tucked behind the Pulumi Service (or your own S3/Azure Blob backend) and presented to you as a nicer UI. Most of the time this is genuinely better: automatic encryption, a web dashboard showing every deploy's diff, per-resource history. But the first time you hit a state corruption issue — we had a partially-applied update get killed mid-deploy by a CI timeout — the debugging experience is worse precisely because the abstraction is thicker. With Terraform I can eyeball the JSON. With Pulumi, I'm reading `pulumi stack export`, piping it through `jq`, and hoping I understand the resource URN scheme well enough to hand-edit it safely.

Neither is wrong. But "Pulumi's state management is nicer" is only true on the happy path.

## The plan/preview diff is where Pulumi actually wins

This is the one I'll defend without caveats. `pulumi preview` and `terraform plan` are trying to answer the same question — "what's about to change?" — but Pulumi's diff, especially with the `--diff` flag, is genuinely more readable for deeply nested resources:

```bash
pulumi preview --diff

  ~ aws:ec2/securityGroup:SecurityGroup: (update)
      [id=sg-0abc123]
      [urn=urn:pulumi:prod::api::aws:ec2/securityGroup:SecurityGroup::api-sg]
    ~ ingress: [
      ~ [0]: {
          ~ fromPort: 443 => 8443
          ~ toPort  : 443 => 8443
        }
    ]
```

Terraform's plan output is fine for flat resources but gets noisy fast once you're deep in nested blocks or `for_each` maps — you end up scrolling past forty lines of `(known after apply)` to find the one field that actually changed. This isn't a dealbreaker, but if your team reviews infra diffs in PRs (you should), Pulumi's output saves real reviewer time.

## Where Terraform wins and nobody mentions it: the ecosystem tax

Pulumi's provider model wraps the Terraform provider under the hood for most clouds — which means when AWS ships a new resource type, Terraform gets it first, and Pulumi's bridged provider catches up days to weeks later. We hit this directly waiting on support for a newer RDS Blue/Green deployment resource. It wasn't a huge deal, but it's a real lag, and it compounds if you're on a cloud provider with a smaller Pulumi community (anything beyond AWS/Azure/GCP, basically).

Also: every Terraform module on the registry, every Stack Overflow answer, every "here's how to configure X" blog post from the last decade assumes HCL. Onboarding a new engineer to Terraform means pointing them at an ocean of existing examples. Onboarding to Pulumi means a smaller pond, plus explaining your team's chosen language (TypeScript vs Python vs Go — pick wrong and half your prior Pulumi googling doesn't apply).

## What we actually decided

At Cubet, the call ended up being boring: existing infra stayed on Terraform because rewriting working modules for a marginally nicer diff view isn't worth the migration risk, but a new internal platform team building dynamic per-tenant environments went with Pulumi — because the logic for "spin up N nearly-identical stacks with slight per-tenant config" was genuinely painful in HCL and trivial as a TypeScript function that returns a `pulumi.ComponentResource`.

That's the actual decision framework, not "which one is trendier":

- **Mostly static infra, big team, lots of existing modules to reuse or reference** → Terraform. The ecosystem gravity is real.
- **Infra that needs actual computation — dynamic fan-out, complex conditional logic, sharing code with your app's language** → Pulumi earns its keep.
- **Either way**, treat your state backend like the production dependency it is: locked, versioned, backed up, and never edited by hand unless you enjoy 2am incident reviews.

## The takeaway

Stop asking "which IaC tool is better." Ask "does this specific piece of infrastructure need a real programming language, or am I just tired of HCL syntax today?" Nine times out of ten it's the second one, and that's not a reason to migrate — it's a reason to write a cleaner Terraform module.

If you've actually run both past the six-month mark, I'd genuinely like to hear where you landed and why — drop it in the comments or ping me, because most of what's written about this comparison online is written by people who never had to debug a corrupted state file at 11pm.
