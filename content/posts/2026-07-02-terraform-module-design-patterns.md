---
title: "Terraform Module Design: Stop Building One Giant Spaghetti Module 🍝"
date: "2026-07-02"
excerpt: "Most teams' first Terraform module is a monolith that does everything and configures nothing well. Here's how to design modules that are actually reusable — thin wrappers, composition over configuration, and the variable-count trap that bites everyone once."
tags:
  - devops
  - terraform
  - infrastructure-as-code
  - platform-engineering
featured: true
---

Every Terraform repo has one. That `modules/app/` directory with a `variables.tf` file so long you need to `Ctrl+F` to find anything, forty-three input variables, half of them booleans like `enable_thing` and `create_other_thing`, and a `main.tf` full of `count = var.enable_thing ? 1 : 0` ternaries stacked three levels deep. Nobody remembers which combination of flags actually works together. Nobody wants to touch it. It ships anyway, because it's the only module anyone trusts not to silently break something else.

I've built that module. You've probably built that module too. Let's talk about how to not build it again.

---

## The God Module Anti-Pattern

Here's roughly what it looks like — and if this feels uncomfortably familiar, you're not alone:

```hcl
variable "create_load_balancer" {
  type    = bool
  default = true
}

variable "create_autoscaling_group" {
  type    = bool
  default = true
}

variable "enable_https" {
  type    = bool
  default = false
}

variable "use_spot_instances" {
  type    = bool
  default = false
}

# ...39 more variables like this
```

The problem isn't that these variables exist individually — it's that they exist *together*, in one module, controlling one another's behavior through conditionals nobody fully traces anymore. Want HTTPS without an autoscaling group? Better hope someone tested that combination. Want spot instances but not the load balancer? Good luck reading the `count` expressions to find out if that's even supported.

This is what happens when a module tries to be configurable enough to serve every team's use case instead of composable enough to be combined for each one.

---

## Pattern 1: Thin Wrappers Around Cloud Resources

The single highest-leverage habit: keep your lowest-level modules as close to a 1:1 mapping with the underlying cloud resource as you can stand. Don't wrap `aws_s3_bucket` in a module that also creates an IAM policy, a CloudFront distribution, and a Route53 record "for convenience." That's not a module, that's three modules wearing a trenchcoat.

```hcl
# modules/s3-bucket/main.tf — thin, boring, predictable
resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
```

Boring is the goal here. This module does one thing, has few inputs, and every combination of those inputs is valid because there just aren't that many combinations to get wrong.

---

## Pattern 2: Compose, Don't Configure

Once you have thin, boring building-block modules, the interesting logic moves *up* a layer — into a composition module that wires them together for a specific use case. This is where the "which flags work together" problem disappears, because you're no longer expressing "logging bucket" and "audit bucket" and "assets bucket" as fifteen conditionals inside one module. You're expressing them as three separate calls to the same thin module.

```hcl
# environments/prod/main.tf
module "audit_logs_bucket" {
  source             = "../../modules/s3-bucket"
  bucket_name        = "acme-audit-logs-prod"
  versioning_enabled = true
}

module "static_assets_bucket" {
  source             = "../../modules/s3-bucket"
  bucket_name        = "acme-static-assets-prod"
  versioning_enabled = false
}

module "cloudfront_for_assets" {
  source      = "../../modules/cloudfront"
  origin_arn  = module.static_assets_bucket.arn
  domain_name = "assets.acme.com"
}
```

Each module stays dumb and reusable. The intelligence — "the assets bucket gets a CDN, the audit bucket doesn't" — lives in the composition, which is plain, readable HCL rather than buried inside a `count` expression three files deep.

At Cubet, we migrated a client's infra off a single 60-variable "everything" module into this thin-wrapper-plus-composition structure over about two sprints. The module count in the repo actually went *up* — from one sprawling module to about eight small ones — but the number of Slack messages asking "does this flag combination work?" went to zero, because there were no flag combinations left to ask about.

---

## Pattern 3: Version Pin Your Own Modules Like You'd Pin Anyone Else's

This one's easy to skip because it's *your* module, in *your* repo, so why bother with a version constraint? Because "your repo today" and "your repo after three more PRs" are different things, and an unpinned local module reference means every consumer silently picks up every change the moment it merges.

```hcl
# Bad — always tracks the tip of main, no matter what changed there
module "vpc" {
  source = "git::https://github.com/acme/tf-modules.git//vpc"
}

# Good — explicit, reviewable, roll-backable
module "vpc" {
  source = "git::https://github.com/acme/tf-modules.git//vpc?ref=v2.3.1"
}
```

Tag your module repo releases the same way you'd tag a library. When you bump a consuming environment from `v2.3.1` to `v2.4.0`, that's a one-line diff in a PR — reviewable, revertable, and attributable when something goes sideways. Without the pin, "what changed in the VPC module last Tuesday" becomes a `git log` archaeology exercise across every environment that happened to run `terraform apply` that week.

---

## Pattern 4: Outputs Are Part of Your Interface Too

Teams obsess over input variables and treat outputs as an afterthought — whatever falls out of the resource block, expose it, done. But outputs are the other half of your module's contract, and a missing output turns into someone reaching for `data` blocks or, worse, hardcoding an ARN because your module didn't expose it.

```hcl
# modules/s3-bucket/outputs.tf
output "id" {
  value = aws_s3_bucket.this.id
}

output "arn" {
  value = aws_s3_bucket.this.arn
}

output "bucket_regional_domain_name" {
  value = aws_s3_bucket.this.bucket_regional_domain_name
}
```

A useful heuristic: if a downstream module or resource would plausibly need a value derived from what you created, output it — even if nothing consumes it yet. It costs nothing to expose and saves the next person from either a `data "aws_s3_bucket"` lookup (a needless extra API call and a subtle race if that bucket was just created in the same apply) or a hardcoded string that quietly breaks the day the bucket gets renamed.

---

## The Test: Can You Explain It Without the Source Code Open?

Here's the litmus test I use now before merging any new module: can I describe what it does, and what its main inputs mean, without having the `main.tf` open in front of me? If the answer requires tracing three `count` expressions and a `for_each` over a `local` that's itself built from two other variables, the module is too clever, not too configurable. Clever conditionals feel efficient when you write them and feel like a trap when you're debugging a 2am plan diff that touches resources you didn't expect.

Thin modules, composed explicitly, pinned by version, with outputs treated as a real interface — none of this is exotic. It's the same discipline you'd apply to any shared library. Terraform just makes it easier to skip, because HCL will happily let you build the god module and it'll even work, right up until the day someone needs the one combination of flags nobody tested.

---

Go look at your most-imported module right now. Count the variables. If it's north of fifteen, or if any of them have names like `enable_x_but_only_if_y`, that's your sign — split it, pin it, and let composition do the configuring instead.
