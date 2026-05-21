---
title: "⚔️ Pulumi vs Terraform: An Honest Take (No Fanboy Edition)"
date: "2026-05-21"
excerpt: "Everyone has an opinion on Pulumi vs Terraform. Here's mine — earned from actually migrating infrastructure, hitting the footguns, and writing YAML at 2am wondering why I got into this industry."
tags:
  - devops
  - infrastructure-as-code
  - terraform
  - pulumi
  - platform-engineering
featured: true
---

Everyone has opinions about Pulumi vs Terraform. Most of them come from people who've used one for a weekend and then written a hot take. This one comes from someone who's managed both in production — including a partial migration that started as "let's try Pulumi" and ended with me staring at a drift report wondering where it all went wrong.

Buckle up.

## First: Why We're Even Having This Conversation

Terraform has been the undisputed king of IaC for nearly a decade. Then HashiCorp changed the license to BSL in 2023, OpenTofu forked, and suddenly everyone started re-evaluating their toolchain. Pulumi, which lets you write infrastructure in actual programming languages (TypeScript, Python, Go, C#), suddenly looked a lot more interesting.

And honestly? Both tools have a legitimate place. The trick is knowing which place.

## What Terraform Does Well (and Why It's Still Dominant)

Let me be fair to Terraform. HCL (HashiCorp Configuration Language) has a reputation for being a "fake programming language" and getting mocked at conferences. That reputation is partly deserved. But HCL also has some serious advantages:

**The declarative mental model is genuinely good for infrastructure.** You describe what you want. Terraform figures out how to get there. It's boring in the best way — and boring is a virtue when you're managing production databases.

**The provider ecosystem is unmatched.** Over 3,000 providers. If your cloud provider, SaaS tool, or obscure internal service has a Terraform provider, there's a good chance someone's already written it and maintained it for five years. Pulumi has providers too, but many are wrappers around Terraform providers anyway (more on that in a minute).

**The plan output is chef's kiss.** `terraform plan` shows you exactly what will change, in a format that's easy to review in a PR. Your team can actually read it without knowing Terraform deeply.

Here's a simple example — provisioning an S3 bucket with versioning:

```hcl
resource "aws_s3_bucket" "app_artifacts" {
  bucket = "my-app-artifacts-${var.environment}"
  
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket_versioning" "app_artifacts" {
  bucket = aws_s3_bucket.app_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}
```

Clean. Readable. A junior engineer can understand what this does. That matters more than people admit.

## What Pulumi Does Genuinely Better

Now here's where Pulumi earns its keep.

**Real programming languages mean real abstractions.** In Terraform, if you want to create 10 similar resources with slightly different configs, you're reaching for `count`, `for_each`, and occasionally screaming into the void. In Pulumi TypeScript, you write a `for` loop. You use functions. You import libraries. You write tests.

```typescript
import * as aws from "@pulumi/aws";

const environments = ["dev", "staging", "prod"];

const buckets = environments.map(env => {
  const bucket = new aws.s3.Bucket(`app-artifacts-${env}`, {
    bucket: `my-app-artifacts-${env}`,
    versioning: { enabled: env !== "dev" },
    tags: { Environment: env, ManagedBy: "pulumi" },
  });
  return { env, bucket };
});

// Export all bucket names
export const bucketNames = Object.fromEntries(
  buckets.map(({ env, bucket }) => [env, bucket.bucket])
);
```

This doesn't sound revolutionary until you've spent an hour debugging a Terraform `for_each` with nested dynamic blocks and modules. Then it feels like oxygen.

**The secret weapon: component resources.** Pulumi lets you build reusable components that encapsulate multiple resources with sensible defaults — essentially an internal library of infrastructure patterns. At Cubet, we've used this to build a `SecureEcsService` component that always wires up the right IAM roles, logging config, and security groups. New service? Three lines of TypeScript. No copypasta.

**Testing is real testing.** You can unit-test Pulumi programs with Jest or pytest. Mock the providers, assert on resource properties, run in CI. Terraform has some testing tooling now, but it's nascent and awkward.

## The Footguns Nobody Mentions

Here's the stuff the blog posts written by DevRel teams skip:

**Pulumi state can get weird.** Terraform state is a JSON blob. Simple to inspect, simple to move around, simple to understand when something breaks. Pulumi's state is also a blob, but because it's tracking a program's execution rather than a static declaration, debugging drift or import issues requires understanding more context. When we had a resource orphaned during a failed migration, fixing it took two hours of reading the Pulumi docs and one StackOverflow answer from 2021.

**Pulumi providers wrap Terraform providers.** Many Pulumi AWS/GCP/Azure resources are generated from the Terraform provider via `pulumi-terraform-bridge`. That means bugs in the Terraform provider surface in Pulumi too. It also means the abstraction isn't always as clean as the marketing suggests.

**HCL is learnable; TypeScript debt is real.** Introducing Pulumi means your infrastructure code can accumulate all the same technical debt as your application code. Circular dependencies, overly clever abstractions, untested utility functions. Terraform's constraint of HCL prevents a lot of this by force. Whether that's a feature or a bug depends on your team.

## So Which One Should You Use?

**Use Terraform (or OpenTofu) if:**
- Your team is primarily ops-focused without strong programming backgrounds
- You're managing a relatively stable, declarative infrastructure
- You need broad provider coverage without surprises
- You want the widest hiring pool and most Stack Overflow answers

**Use Pulumi if:**
- Your platform team is full of software engineers who think in code
- You're building reusable internal infrastructure components
- You need complex conditional logic or dynamic resource generation
- Testing infrastructure is a priority, not an afterthought

**The honest answer:** Most teams should start with Terraform. It's not as exciting, but it's predictable. If you hit the ceiling of what HCL can express cleanly — and you will, eventually — then evaluate Pulumi with clear eyes and a solid migration plan.

## What We Did at Cubet

We run a hybrid. Core VPC networking, RDS, and EKS clusters stay in Terraform — stable, boring, rarely touched. New application-layer infrastructure (ECS services, Lambda functions, SQS queues) goes into Pulumi TypeScript. The platform team owns reusable components, app teams consume them.

Is it perfect? No. The dual-state setup adds cognitive overhead. But it lets us be pragmatic about the right tool for the layer rather than ideologically pure.

## The Bottom Line

Pulumi is genuinely better at expressing complexity. Terraform is genuinely better at expressing simplicity. Most infrastructure is simple most of the time — until it isn't.

Pick based on your team's strengths, not the conference talk you watched last week. And whichever you pick, write a README explaining why, so future-you doesn't have to reverse-engineer the decision at 2am.

---

**Using either tool in production? I'd love to hear what's working and what's driving you insane — the comment section (or my inbox) is open.**
