---
title: "🔐 SOPS: The Right Way to Commit Secrets to Git (Yes, Really)"
date: "2026-06-04"
excerpt: "Your .env files don't belong in git — but your encrypted secrets do. SOPS lets you commit ciphertext, decrypt at runtime, and stop playing the 'who has the secret?' game with your team."
tags:
  - security
  - secrets-management
  - devops
  - encryption
  - sops
featured: true
---

There's a rite of passage every developer goes through. You join a new team, ask where the secrets are, and someone sheepishly says: "Oh, there's a `.env.production` file in the shared Google Drive. Or maybe Slack. Actually, ping Raj — he has the copy that works."

This is chaos. And it's completely normal.

The usual solutions aren't much better: either you use a secrets manager (now you need credentials to access your credentials — the *secret zero problem*), or you just... don't commit secrets anywhere and rely on tribal knowledge. Both are terrible at 2 AM when something breaks in production.

**SOPS** (Secrets OPerationS, originally from Mozilla) takes a third path: commit your secrets to git, but encrypted. The files are readable by humans when decrypted, diff friendly, and the encryption key lives somewhere sensible — your cloud KMS, an age key, or a PGP key. No secret zero. No Slack DMs. No Google Drive archaeology.

## What SOPS Actually Does

SOPS encrypts only the *values* in your YAML, JSON, or `.env` files — not the keys. This matters more than it sounds.

A regular `secrets.yaml` in production might look like:

```yaml
database_password: "correct-horse-battery-staple"
stripe_secret_key: "sk_live_abc123def456"
redis_url: "redis://:hunter2@redis.internal:6379"
```

After `sops --encrypt secrets.yaml`, it becomes:

```yaml
database_password: ENC[AES256_GCM,data:Xk2P...==,iv:...,tag:...,type:str]
stripe_secret_key: ENC[AES256_GCM,data:mR3q...==,iv:...,tag:...,type:str]
redis_url: ENC[AES256_GCM,data:9wLp...==,iv:...,tag:...,type:str]
sops:
    kms:
        - arn: arn:aws:kms:eu-west-1:123456789:key/your-key-id
          ...
    lastmodified: "2026-06-04T10:00:00Z"
    version: 3.9.0
```

The keys (`database_password`, `stripe_secret_key`) stay in plaintext — which means `git diff` still shows you *which* secrets changed, even if you can't see the values. That's a massive win for code review. You can see "oh, the Redis URL changed" without seeing the password.

## Setting Up SOPS with age (The Modern Approach)

`age` is a modern, simple encryption tool that replaces PGP for most use cases. Less ceremony, fewer footguns.

```bash
# Install age and sops
brew install age sops  # or your package manager of choice

# Generate an age key pair
age-keygen -o ~/.config/sops/age/keys.txt
# Public key: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p

# Tell SOPS where your key is
export SOPS_AGE_KEY_FILE=~/.config/sops/age/keys.txt
```

Create a `.sops.yaml` at the repo root to configure which files get encrypted and with which key:

```yaml
# .sops.yaml — commit this, it's not a secret
creation_rules:
  - path_regex: secrets\.yaml$
    age: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
  - path_regex: secrets\.production\.yaml$
    # Production uses KMS — no single person can decrypt alone
    kms:
      - arn: arn:aws:kms:eu-west-1:123456789012:key/mrk-abc123
```

Now encryption and decryption are single commands:

```bash
sops --encrypt secrets.yaml > secrets.enc.yaml  # or edit in-place
sops --decrypt secrets.enc.yaml                 # pipe to your app
sops secrets.yaml                               # opens in $EDITOR, auto-encrypts on save
```

That last one — `sops secrets.yaml` — is the workflow that wins people over. It opens your secrets in vim (or whatever), lets you edit them in plaintext, and re-encrypts transparently when you save. It's the closest thing to "just works" that secrets management gets.

## The Team Setup: Multiple Recipients

The real power comes when you add multiple age public keys or KMS keys — anyone on the list can decrypt, and you rotate access by changing the key list and re-encrypting.

At Cubet, we use a hybrid approach: developer workstations use age keys (cheap to generate, easy to rotate), and CI/CD and production use AWS KMS. The `.sops.yaml` for production environments references the KMS ARN only — so secrets.production.yaml literally cannot be decrypted on a developer laptop, even if they have the file. The decryption happens inside the deployment pipeline that has IAM access.

This pattern solves secret zero cleanly: developers authenticate to AWS via IAM roles (SSO or instance profiles), and KMS validates the IAM identity. No shared passwords, no "who has the key" problem.

## What SOPS Is Not

SOPS is a file encryption tool, not a secrets manager. It doesn't do:

- Secret rotation on a schedule
- Dynamic credentials (like Vault's database engine)
- Audit logs of who accessed what (KMS CloudTrail gives you some of this, but it's not SOPS-native)
- Runtime injection into running processes

For those, you still want something like HashiCorp Vault or AWS Secrets Manager. But SOPS fills a real gap: **secrets that live alongside your code in git**, like database URIs, third-party API keys, and config values that differ by environment. Those belong somewhere version-controlled, and SOPS makes it safe to do so.

A practical split that works well: dynamic, short-lived credentials (DB passwords, cloud IAM) go in Vault or Secrets Manager. Static, long-lived config secrets (API keys, feature flags with sensitive values, TLS certs) go in SOPS-encrypted files in git.

## The Key Rotation Story

One thing SOPS gets right that most teams ignore: key rotation is a first-class operation.

```bash
# Rotate to a new age key — re-encrypts all values with the new key
sops rotate --in-place secrets.yaml

# Add a new team member's key without losing existing encryption
sops updatekeys secrets.yaml
```

When someone leaves the team, you remove their public key from `.sops.yaml`, run `sops updatekeys` across all secret files, and commit. They can no longer decrypt anything going forward. The old encrypted blobs in git history are still encrypted with the old key (a limitation worth knowing), but anything new is safe. Pair this with periodic key rotation and you're in good shape.

## Start Small

You don't need to migrate everything at once. Pick one repo where secrets are currently in a shared doc or a Slack message, add SOPS, and live with it for a month. The friction is low enough that it almost always sticks.

Add this to your `.gitignore` to make sure you never accidentally commit the plaintext version:

```
# .gitignore
secrets.yaml          # plaintext
!secrets.enc.yaml     # encrypted version is fine
```

And add a git pre-commit hook or CI check that fails if an unencrypted secrets file appears in the diff. `sops --decrypt file.yaml 2>/dev/null && echo "ERROR: plaintext secrets detected" && exit 1` is a rough but effective one-liner.

The biggest enemy of secrets hygiene isn't malicious actors — it's convenience. SOPS makes the secure path almost as convenient as the insecure one. That's rare enough to be worth a blog post.

---

What's your current approach to secrets in git? Still doing the Google Drive dance, or have you found something better? Hit me up on [Twitter/X](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh) — I'm always curious what people are actually running in production.
