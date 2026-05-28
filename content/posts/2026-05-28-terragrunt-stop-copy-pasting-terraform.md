---
title: "🌱 Terragrunt: Stop Copy-Pasting Your Terraform Like It's 2015"
date: 2026-05-28
excerpt: "If your infra repo has a staging/ and prod/ folder with 95% identical Terraform code, you've already lost. Terragrunt fixes that — and a few other things Terraform makes surprisingly painful."
tags: [devops, terraform, terragrunt, iac, infrastructure-as-code, platform-engineering]
featured: true
---

Picture this: You have a perfectly crafted Terraform module for your ECS service. Works great in dev. Now you need staging and prod. So you… copy the folder. Fine. Then you add a new environment. Copy. Then your company ships two products. Copy, copy. Six months later you have seven near-identical directories, a `variables.tf` that's drifted in four of them, and `prod/` is still on Terraform 1.3 because someone was scared to upgrade it.

This is **Terraform copy-paste hell**, and it's embarrassingly common.

I hit this at Cubet about a year into managing a multi-environment AWS setup. We had `infra/dev/`, `infra/staging/`, `infra/prod/` — each with the same modules, the same backend config (almost), the same everything except a few environment-specific values. Every time we updated a module we had to update it in three places and pray we didn't miss one. We missed one. Prod drifted. It was a fun postmortem.

Enter **Terragrunt**.

## What Even Is Terragrunt?

Terragrunt is a thin wrapper around Terraform (and OpenTofu) maintained by Gruntwork. It doesn't replace Terraform — it orchestrates it. Think of it as the missing glue layer that makes large Terraform setups actually maintainable.

Its core promises:

- **DRY configurations** — write backend config and remote state once, inherit everywhere
- **Module sourcing** — reference versioned canonical modules without duplicating them
- **Dependency management** — run infrastructure stacks in the correct order automatically
- **run-all** — `terragrunt run-all plan` across every module in one command

## The Problem in Plain Code

Here's what a typical multi-env Terraform repo looks like before Terragrunt:

```
infra/
  dev/
    main.tf        # module call
    backend.tf     # S3 backend config
    variables.tf
    terraform.tfvars
  staging/
    main.tf        # identical, different vars
    backend.tf     # identical, different key
    variables.tf
    terraform.tfvars
  prod/
    ... (same again, different values, slowly diverging)
```

Every `backend.tf` is copy-pasted with one line changed. Every `main.tf` calls the same module with slightly different inputs. One wrong bucket name in `prod/backend.tf` and your state gets written somewhere weird. Ask me how I know.

## The Terragrunt Fix

Terragrunt introduces `terragrunt.hcl` — a config file that handles the repetitive ceremony. Here's a root-level one that defines backend config exactly once:

```hcl
# terragrunt.hcl (root of your infra repo)
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
  config = {
    bucket         = "my-company-tf-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "tf-state-lock"
  }
}
```

That `path_relative_to_include()` is the magic. Each child module just includes the root and adds its own inputs:

```hcl
# infra/prod/ecs-service/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "git::https://github.com/my-org/terraform-modules.git//ecs-service?ref=v1.4.0"
}

inputs = {
  env           = "prod"
  desired_count = 3
  cpu           = 512
  memory        = 1024
}
```

No backend config. No module duplication. Just inputs. The state key becomes `prod/ecs-service/terraform.tfstate` automatically. Changing the S3 bucket name? One file. Done.

## Dependency Management That Doesn't Hurt

One underrated Terragrunt feature: `dependency` blocks. Say your ECS service depends on a VPC and an ECR repo. Instead of a runbook that says "apply VPC first, then networking, then the service, don't forget the order":

```hcl
dependency "vpc" {
  config_path = "../vpc"
}

dependency "ecr" {
  config_path = "../ecr"
}

inputs = {
  vpc_id          = dependency.vpc.outputs.vpc_id
  container_image = dependency.ecr.outputs.repository_url
}
```

Now `terragrunt run-all apply` figures out the DAG and applies in the right order. Outputs from one module flow directly into inputs of another. The runbook becomes a `Makefile` target.

## Lessons From the Trenches

After rolling this out across several projects at Cubet, a few things stood out:

**The initial migration is tedious; the ongoing maintenance is bliss.** Moving an existing Terraform project to Terragrunt takes a half-day of restructuring. Once it's done, adding a new environment is a new directory with a 10-line `terragrunt.hcl`. Worth every minute.

**Pin your module versions — this is not optional.** Terragrunt makes it easy to source git-tagged modules. Use it. `?ref=v1.4.0` beats `?ref=main` every time. A colleague pushed a breaking module change on a Friday. Every environment that used `main` got it on the next `apply`. Environments pinned to a tag were fine.

**`run-all` is powerful and dangerous in equal measure.** `terragrunt run-all destroy` will try to destroy everything — and ask nicely first, but still. Learn `--exclude-dir` and `--terragrunt-non-interactive` before you wire run-all into CI.

**Use mock outputs for local dev.** When planning a service that depends on a VPC not yet applied, Terragrunt needs the VPC outputs. Add `mock_outputs` to your dependency block during development — it prevents "dependency outputs not found" from blocking local iteration while you're still building things out.

## Is It Worth the Extra Tool?

If you have one environment and two modules, probably not. Stick with plain Terraform.

But if you're managing three or more environments, teams sharing infrastructure modules, or you've ever said "wait, which folder is the canonical one?" — Terragrunt pays for itself in the first month. The cognitive overhead of one extra tool is nothing compared to the overhead of keeping seven directories in sync manually.

It's not perfect. Documentation can be sparse for edge cases, and debugging `run-all` dependency resolution sometimes means reading the source. But compared to seven copies of the same backend config slowly drifting apart, I'll take it every time.

## Where to Start

1. Read the Terragrunt docs on `remote_state` first — that feature alone wins most people over.
2. Restructure one environment before touching others. Don't boil the ocean.
3. Extract your Terraform code to shared modules (separate repo or a `modules/` directory). Terragrunt shines brightest when modules are versioned and shared.
4. Add `run-all plan` to your CI pipeline. Catching drift across all environments in one pipeline step is genuinely satisfying.

Your infrastructure repo doesn't have to look like a copy-paste accident from a busy sprint. Terragrunt is the glue Terraform was always missing — and once you've used it on a real multi-environment setup, going back feels like writing CSS without variables.
