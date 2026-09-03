---
title: "🪢 Terragrunt: Keeping Your Terraform DRY Without Losing Your Mind"
date: "2026-09-03"
excerpt: "Three environments, one module, and a backend block copy-pasted so many times it developed its own personality. Here's how Terragrunt talked me out of that mess."
tags: ["devops", "terraform", "terragrunt", "iac", "infrastructure-as-code"]
featured: true
---

Every Terraform project starts innocent. One module, one environment, one `backend.tf` you wrote once and never think about again. Then someone says "we need staging" and suddenly you're maintaining three copies of the same 40 lines of backend config, provider blocks, and variable wiring — differing only in a bucket name and a tag.

Six months later you've got `dev/main.tf`, `staging/main.tf`, and `prod/main.tf`, each one a slightly-drifted fossil of the others, and a bug where prod is missing a provider alias that dev has because someone updated dev in a hurry and forgot the other two exist. This is the exact problem Terragrunt was built to solve, and it took me embarrassingly long to stop fighting it and just use it.

## The copy-paste tax

Here's what that "innocent" setup actually looks like once you have more than one environment:

```
environments/
  dev/
    main.tf
    backend.tf
    variables.tf
  staging/
    main.tf        # 95% identical to dev
    backend.tf      # different bucket, same everything else
    variables.tf
  prod/
    main.tf        # 95% identical to dev, plus one extra rule
    backend.tf
    variables.tf
```

Nothing here is *wrong*, exactly. It's just that "identical except for one line" is a maintenance trap. Every module version bump, every provider constraint change, every new required tag has to be applied three times by hand, and Terraform gives you zero warning when you miss one — it just quietly applies the old version somewhere.

## What Terragrunt actually changes

Terragrunt doesn't replace Terraform; it's a thin wrapper that generates the boilerplate you'd otherwise hand-maintain, and lets environments inherit from a shared root config instead of copying it. The whole pitch is one file at the root:

```hcl
# terragrunt.hcl (root)
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
  config = {
    bucket         = "acme-tfstate-${get_env("ENV", "dev")}"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "acme-tf-locks"
    encrypt        = true
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite"
  contents  = <<EOF
provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = { ManagedBy = "terragrunt" }
  }
}
EOF
}
```

Every environment then becomes a tiny file that just says "include the root, use this module, here are my variables":

```hcl
# environments/staging/vpc/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "git::https://github.com/acme/tf-modules.git//vpc?ref=v2.3.0"
}

inputs = {
  cidr_block  = "10.20.0.0/16"
  environment = "staging"
}
```

That's it. No backend block, no provider block, no repeated boilerplate. Bump the module version for everyone by changing `ref=v2.3.0` in one place (or per-environment, deliberately, when you're staging a rollout) — either way it's a decision you make on purpose instead of an artifact of forgetting to copy a file.

## Where it actually saved us

At Cubet, we had exactly the three-environment mess described above, plus a fourth "sandbox" account that had drifted so far from the others that nobody trusted it for testing anymore. Migrating to Terragrunt wasn't glamorous work — it was a week of moving files around and fixing state paths — but the payoff showed up the first time we needed to add a mandatory `CostCenter` tag across every account for a finance audit. One change to the root `generate "provider"` block, and every environment picked it up on its next plan. Before Terragrunt, that would've been four PRs, four reviews, and at least one account that got missed until someone asked about it three weeks later.

## The footgun nobody warns you about

Terragrunt's `dependency` block is the other big win — it lets one module read another's outputs instead of hardcoding IDs:

```hcl
dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  vpc_id = dependency.vpc.outputs.vpc_id
}
```

Convenient, until you run `apply` on a module whose dependency hasn't been applied yet in a fresh environment. Terragrunt will happily use **mock outputs** during `plan` if you configure `mock_outputs`, but forget that setting and you'll get a cryptic failure about outputs not existing — usually during a demo, naturally. Set `mock_outputs` deliberately for anything used in a `plan`-only context (like CI), and you'll save yourself that particular round of Slack messages asking if the pipeline is broken.

## Is it worth adopting?

If you've got one environment and one AWS account, skip it — you'd be adding a tool to solve a problem you don't have yet. But the moment you're maintaining the same backend and provider config in more than two places, that's your signal. The DRY-ness isn't the real win; the real win is that a change to shared config becomes *one* change instead of a checklist you hope everyone remembers.

If your `environments/` folder currently looks like three siblings who stopped talking to each other, give Terragrunt an afternoon. Start with just the `remote_state` and `generate` blocks — you don't need to restructure everything on day one, and the backend deduplication alone is usually enough to justify the migration.
