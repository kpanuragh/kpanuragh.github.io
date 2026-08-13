---
title: "🙈 Secrets in IaC: The Variable That Outs Itself"
date: "2026-08-13"
excerpt: "Marking a Terraform variable sensitive = true feels like closing the curtains. It doesn't. Here's where secrets actually leak out of infrastructure-as-code, and the boring plumbing that stops it."
tags:
  - devops
  - terraform
  - infrastructure-as-code
  - iac
  - secrets
featured: true
---

# 🙈 Secrets in IaC: The Variable That Outs Itself

I once watched a `db_password` variable survive three separate "we fixed it" commits before anyone noticed it was still sitting in plaintext, in three places at once: a `.tfvars` file in the repo, the Terraform state file, and — because nobody had thought about it — the CI job's build log, cheerfully printed as part of an `apply` output that nobody scrolled past.

Nobody typed the password into any of those places on purpose. Infrastructure as code has a habit of doing that for you. You declare a resource, the resource needs a credential, and unless you go out of your way to stop it, that credential ends up parked somewhere durable, searchable, and very much not a secret anymore.

## The `sensitive = true` false sense of security

Terraform gives you this, and it feels like it should be enough:

```hcl
variable "db_password" {
  type      = string
  sensitive = true
}
```

`sensitive = true` redacts the value from `plan` and `apply` console output — that's genuinely useful, it stops the "oops, printed to the terminal" class of leak. What it does **not** do is keep the value out of the state file. Terraform still has to know the actual password to configure the resource, so it writes it to `terraform.tfstate` in plain, unencrypted JSON, sensitivity flag or not.

```bash
terraform show -json terraform.tfstate | jq '.values.root_module.resources[] | select(.type=="aws_db_instance") | .values.password'
# "hunter2_but_worse_because_its_real"
```

Anyone with read access to your state backend — the S3 bucket, the Terraform Cloud workspace, the shared filesystem someone forgot to lock down — can pull the secret straight out, no `sensitive` flag consulted. If your state file is the diary of your infrastructure, secrets are the pages you really didn't mean to leave in it.

## Where it actually leaks

Three places, none of them the obvious "someone hardcoded it in main.tf":

1. **`.tfvars` committed by habit.** Someone creates `prod.tfvars` locally to test, it works, they `git add .` at the end of a long day, and it's in history forever — `git rm` afterward doesn't help, the blob is still reachable from an old commit.
2. **State, as above.** Encrypted-at-rest state (S3 with SSE, a Terraform Cloud workspace) protects against someone stealing the bucket contents off disk. It does nothing against someone who's simply allowed to read the file through normal access — which is usually a much bigger set of people than "could steal the disk."
3. **CI logs.** `terraform apply` output, provider debug logs (`TF_LOG=DEBUG` is a secret-exfiltration tool if you leave it on in CI), and any `local-exec` provisioner that echoes an environment variable "just for debugging."

None of these need an attacker. They need one tired engineer and one Tuesday.

## What actually stops it: don't put secrets in the config in the first place

The fix isn't a stronger `.gitignore` — it's structuring things so the secret material never has a Terraform-managed representation to leak. Reference secrets that live in a real secrets manager, by ARN or path, and let the *provider* fetch the value at apply time from a system built to hold it:

```hcl
data "aws_secretsmanager_secret_version" "db" {
  secret_id = "prod/rds/app-db"
}

resource "aws_db_instance" "app" {
  # ...
  password = data.aws_secretsmanager_secret_version.db.secret_string
}
```

This doesn't magically remove the value from state — Terraform still needs it to configure the resource, so it's still there, unencrypted, in the state blob. What it *does* remove is the human step where someone types or pastes the secret into a `.tfvars` file, an environment variable in a Slack thread, or a "temporary" default value that outlives the person who wrote it. The secrets manager becomes the one place rotation, auditing, and access control actually happen; Terraform becomes a consumer, not a vault.

For the state-file leakage itself, the honest options are: encrypt state with a backend that supports it and lock down IAM on who can `GetObject`, or reach for tooling built for exactly this — `sops` for encrypting values inside version-controlled files, or a provider like Vault's Terraform integration that issues short-lived, per-apply credentials instead of static long-lived ones. A password that expires in an hour is a much smaller finding when it does end up somewhere it shouldn't.

```yaml
# sops-encrypted tfvars, safe to commit
db_password: ENC[AES256_GCM,data:Tr0ub4dor...,iv:...,tag:...,type:str]
```

`sops` decrypts through a KMS key at apply time via a wrapper or the `sops` Terraform provider, so what lives in git is ciphertext, not a redaction promise.

## The lesson from the CI log incident

At Cubet Techno Labs, the fix that actually stuck wasn't a policy document — it was two mechanical changes: turning off `TF_LOG` in every pipeline by default (opt-in, never default-on), and adding a pre-commit hook that scans for high-entropy strings and known secret patterns before anything reaches the remote. Neither is clever. Both catch the failure mode that matters, which is a person under time pressure taking the fastest path, not a sophisticated attacker.

Secrets in IaC don't usually leak because someone attacked your pipeline. They leak because the pipeline was never designed to *not* know them in the first place, and "don't commit secrets" was the entire strategy. Give the secret a real home — a manager, a KMS-backed encryption layer, short-lived credentials — and the variable stops having anything worth outing.

If your `.tfvars` files are gitignored but your git history still has three retired versions of `prod.tfvars` sitting in old commits, that's not a hypothetical. Go check. Rotate whatever you find.
