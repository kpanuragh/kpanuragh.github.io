---
title: "🧩 Terraform Module Design Patterns That Don't Make You Hate Your Future Self"
date: "2026-09-10"
excerpt: "Most Terraform modules start clean and end up as a 40-variable monster nobody wants to touch. Here's how to design modules that stay maintainable past the first six months."
tags: ["devops", "terraform", "infrastructure-as-code", "iac", "cloud"]
featured: true
---

Every Terraform module starts the same way. Someone writes a tidy little `modules/vpc` with four inputs and two outputs, everyone's happy, and it goes in the wiki as "the way we do networking now." Eighteen months later that same module has 43 variables, six of which are booleans that toggle other booleans, a `count` vs `for_each` fight nobody remembers starting, and a comment that just says `# DO NOT TOUCH, ASK RAJ`. Raj left the company in March.

This isn't a Terraform problem. It's a module *design* problem, and it's completely avoidable if you treat modules like the public API surface they actually are — because that's exactly what they are, whether you meant to build an API or not.

## The "god module" anti-pattern

The most common failure mode is one module trying to do everything. You start with an RDS module, and every time someone needs one slightly different knob — a read replica here, a different parameter group there, cross-region backups for the compliance team — it gets bolted on as an optional variable with a default.

```hcl
# modules/rds/variables.tf — six months later
variable "enable_read_replica"     { type = bool, default = false }
variable "enable_cross_region_backup" { type = bool, default = false }
variable "enable_performance_insights" { type = bool, default = true }
variable "use_custom_parameter_group" { type = bool, default = false }
variable "parameter_group_family"  { type = string, default = null }
variable "skip_final_snapshot_in_dev_only_trust_me" { type = bool, default = false }
```

Every one of these felt reasonable in isolation. Together, they turn the module into a decision tree that only the original author can navigate, and every `terraform plan` becomes an exercise in "wait, which combination of flags did I set for prod again?"

The fix isn't "never add options." It's recognizing when a variable is actually describing a *different resource shape*, not a tweak to an existing one. A read replica isn't a flag on your primary database module — it's its own composable piece that references the primary's outputs.

## Composition over configuration

The pattern that actually scales is small, single-purpose modules that compose, rather than one flexible module that tries to be every possible configuration at once.

```hcl
# root module — composing small pieces instead of one mega-module
module "primary_db" {
  source     = "./modules/rds-instance"
  identifier = "orders-primary"
  engine     = "postgres"
  instance_class = "db.r6g.large"
}

module "read_replica" {
  source              = "./modules/rds-read-replica"
  replicate_source_db = module.primary_db.arn
  instance_class      = "db.r6g.large"
}

module "backup_vault" {
  source   = "./modules/backup-plan"
  resource_arn = module.primary_db.arn
  schedule = "cron(0 3 * * ? *)"
}
```

Each module does one thing and has a small, stable variable surface. The read replica module doesn't need to know about backup schedules; the backup module doesn't need an `enable_this_only_if_prod` flag. When requirements change, you add or swap a module in the composition instead of adding a new branch inside an existing one.

At Cubet, we went through exactly this migration on a shared "app infra" module that had grown to support four teams' slightly different needs. Splitting it into `compute`, `networking`, and `data` modules that composed together — instead of one module with a `team_name` variable driving fifteen internal conditionals — cut our average onboarding time for a new service from "half a day of reading `locals.tf`" to about twenty minutes.

## Treat variables like a public API, because they are one

The moment more than one team consumes your module, its variables are a contract. Renaming `subnet_id` to `subnet_ids` because you decided to support multiple AZs is a breaking change exactly like renaming a REST field, and it deserves the same discipline:

```hcl
variable "subnet_ids" {
  description = "List of subnet IDs. Use this instead of the deprecated subnet_id."
  type        = list(string)
  default     = []
}

variable "subnet_id" {
  description = "DEPRECATED: use subnet_ids instead. Kept for backward compatibility until v3.0.0."
  type        = string
  default     = null
}

locals {
  effective_subnet_ids = var.subnet_id != null ? [var.subnet_id] : var.subnet_ids
}
```

Pin module versions with a constraint (`source = "git::...?ref=v2.4.0"` or a registry version constraint), publish a CHANGELOG, and bump major versions on breaking changes. It feels like overhead for "just some HCL," but the alternative is a Slack message that says "hey did anyone change the VPC module, prod plan looks weird" at 4:45pm on a Friday.

## Outputs are the other half of the contract

Modules get a lot of design attention on inputs and almost none on outputs, which is backwards — outputs are how modules compose. If your module only outputs `id`, every consumer that needs the ARN, the security group, or the endpoint has to either fork the module or write a data source to re-derive information Terraform already had.

```hcl
output "id" {
  value = aws_db_instance.this.id
}

output "arn" {
  value = aws_db_instance.this.arn
}

output "endpoint" {
  value = aws_db_instance.this.endpoint
}

output "security_group_id" {
  value = aws_security_group.db.id
}
```

A good rule of thumb: if a resource attribute is something a downstream module or root config could plausibly need, output it. It costs nothing at plan time and saves someone a painful `terraform state show` archaeology session later.

## The lesson that took too long to learn

The module that ages well isn't the one with the most options — it's the one with the fewest surprises. Small modules, stable interfaces, explicit deprecation instead of silent renames, and outputs generous enough that nobody needs to fork you just to get one more attribute.

If you're staring at a module with a variable named `special_flag_2` and no idea what it does, that's not a documentation problem. That's a design problem, and the fix is usually to split, not to add a comment.

What's the worst "god module" you've inherited? I'd genuinely like to hear the variable count — reply and let's compare scars.
