---
title: "🧱 Terraform Module Design Patterns: Stop Writing Infrastructure Spaghetti"
date: 2026-06-04
excerpt: "Your Terraform works, but it's held together with copy-paste and prayers. Here's how to design modules that are actually reusable, testable, and won't make your teammates cry."
tags:
  - terraform
  - infrastructure-as-code
  - devops
  - platform-engineering
  - cloud
featured: true
---

You know the feeling. You open a Terraform repo for the first time and it hits you: a single `main.tf` with 900 lines, every resource hardcoded, three copies of the same S3 bucket config, and a variable called `var.thing`. Nobody planned this. It just... grew.

I've seen this at Cubet more than once. We inherit infrastructure code the way you inherit a cluttered apartment — functional on the surface, cursed on the inside. And every time, the root cause is the same: no module design discipline from the start.

So let's fix that.

## The Core Problem: Modules as an Afterthought

Most teams write Terraform the same way beginners write code — inline everything until it hurts, then extract. By the time the pain is obvious, the blast radius of a refactor is enormous. You've got 15 environments referencing the same monolithic module and a `count = var.enable_this_weird_thing ? 1 : 0` that's controlling three different resources.

Good module design starts with a question: **what is the unit of deployment for my infrastructure?**

Not "what resources exist" — that's just a list. What *thing* do you deploy together, version together, and reason about together? A VPC. An RDS cluster with its security groups. An EKS node group. That's your module boundary.

## Pattern 1: The Interface Contract

A module's inputs and outputs are a contract. Treat them like a public API, not a pile of variables.

Bad:

```hcl
# variables.tf — the "just add more" approach
variable "enable_thing"       { type = bool }
variable "thing_size"         { type = string }
variable "thing_name_prefix"  { type = string }
variable "thing_name_suffix"  { type = string }
variable "thing_tags_extra"   { type = map(string) }
```

This is a leaky internal model masquerading as an interface. Every new requirement punches another hole in it.

Better — design the surface deliberately:

```hcl
# variables.tf — opinionated, minimal surface
variable "name" {
  description = "Name for the resource group; used as a prefix for child resource names."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev / staging / prod)."
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

variable "tags" {
  description = "Additional tags merged with module-level defaults."
  type        = map(string)
  default     = {}
}
```

Two rules: **every variable has a description** (future you will thank you), and **validation blocks are free — use them**. Catching a bad environment value at `terraform plan` beats a mysterious IAM error three steps later.

## Pattern 2: Composition Over Configuration Flags

This is the one that separates the veterans from the rest. It's tempting to add a `var.enable_monitoring = true` boolean that conditionally adds CloudWatch alarms, metric filters, and a dashboard inside your core module. Don't.

You now have a module that does two things. It violates the single-responsibility principle for infrastructure, which sounds pedantic until you're trying to test just the core resource without triggering the monitoring stack.

Instead, compose:

```hcl
# root/main.tf
module "rds" {
  source      = "./modules/rds"
  name        = "orders-db"
  environment = "prod"
  instance_class = "db.t3.medium"
}

module "rds_alarms" {
  source      = "./modules/rds-alarms"
  db_id       = module.rds.db_instance_id
  environment = "prod"
  alert_topic_arn = var.ops_sns_topic
}
```

`rds` module knows nothing about alarms. `rds_alarms` receives the ID it needs and handles its own lifecycle. You can deploy them independently, version them independently, and — crucially — you can skip `rds_alarms` in dev without touching a feature flag.

We adopted this pattern on a multi-tenant platform at Cubet and it cut our "I only want to change the alarm thresholds" deploy cycle from 20 minutes to under 5. The RDS module didn't need to be touched at all.

## Pattern 3: Outputs as the Public Surface

Outputs are not an afterthought for when you need a value somewhere else. They are the module's public interface — the only thing that should cross the module boundary.

Define outputs proactively, even if you don't immediately consume them:

```hcl
# modules/rds/outputs.tf
output "db_instance_id"       { value = aws_db_instance.this.id }
output "db_endpoint"          { value = aws_db_instance.this.endpoint }
output "db_port"              { value = aws_db_instance.this.port }
output "security_group_id"    { value = aws_security_group.rds.id }
output "parameter_group_name" { value = aws_db_parameter_group.this.name }
```

The security group output is key. Callers should be able to add their own ingress rules without forking your module — they just grab `module.rds.security_group_id` and add a rule from their own `aws_security_group_rule` resource. This is composition again: give callers the handles they need, don't anticipate every possible use case inside the module.

## Pattern 4: Version Pinning Is Not Optional

If you're sourcing from a registry or a git remote, pin versions. Every time. No exceptions.

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.1"   # allow patch, not minor or major
  # ...
}
```

Unpinned modules are a time bomb. A provider or module update runs on someone's laptop at 11pm, breaks prod at 11:05pm, and you spend an hour bisecting a problem that didn't exist when you `git clone`d. The `~>` constraint is your friend — it allows bug fixes without allowing breaking changes.

For internal modules, use git tags:

```hcl
module "rds" {
  source = "git::https://github.com/your-org/terraform-modules.git//rds?ref=v2.3.1"
}
```

This is the `package-lock.json` equivalent for infrastructure. Your infra should be reproducible six months from now, not just today.

## The Anti-Pattern Graveyard

A few things I've stopped doing, and you should too:

**The god module.** One module that creates networking, compute, database, and DNS. Change one thing, re-plan everything. Break it up.

**Boolean explosion.** `var.create_public_subnet`, `var.create_private_subnet`, `var.create_intra_subnet`, `var.create_database_subnet`... you've reinvented the module interface as a checkbox form. Extract subnet types into separate modules.

**Hardcoded region.** `us-east-1` buried in a `data "aws_availability_zones"` call inside a supposedly reusable module. Now it's not reusable.

**Passing secrets as variables.** Don't put database passwords in your tfvars, even encrypted. Use `data "aws_secretsmanager_secret_version"` inside the module and pull at plan time. Keep the secret out of state.

## Where to Go From Here

Module design is fundamentally about empathy — for your future self, your teammates, and the person who inherits this repo after you leave. The patterns above won't magically fix a bad repository, but they give you a vocabulary and a set of decision rules.

Start small: pick one sprawling `main.tf` and ask "what are the natural deployment units here?" Extract one module with a clean interface. Outputs only. Validation on the critical inputs. Version-pin everything.

The infrastructure spaghetti doesn't untangle itself, but it does untangle one module at a time.

---

*Fighting legacy Terraform and winning (slowly)? Share your module horror stories — I'm at [@kpanuragh](https://twitter.com/kpanuragh). Misery loves company.*
