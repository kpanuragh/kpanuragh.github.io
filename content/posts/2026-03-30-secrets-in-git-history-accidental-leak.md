---
title: "Secrets in Git History: How to Accidentally Donate Your AWS Keys to Hackers 🔑💀"
date: "2026-03-30"
excerpt: "You deleted that .env file three commits ago. You think you're safe. You are not. Let's talk about why git never forgets, how attackers find your secrets in seconds, and how to actually fix it."
tags: ["security", "git", "devops", "secrets-management"]
featured: true
---

# Secrets in Git History: How to Accidentally Donate Your AWS Keys to Hackers 🔑💀

Here's a story I hear way too often:

> **Developer:** "I accidentally committed my AWS keys. But it's fine — I deleted the file and pushed again."
>
> **Me:** "When did this happen?"
>
> **Developer:** "About 40 minutes ago."
>
> **Me:** "Check your AWS billing console."
>
> **Developer:** *opens console* "...why are there 47 EC2 instances running in us-east-1?"

Yes. This is a real thing that happens. Within **minutes** of a secret hitting a public repo, automated bots are already scanning for it. GitHub is crawled constantly. Your "I'll just delete it" plan? That's not how git works, friend. 😬

## Git Never Forgets (And Neither Do Bots)

Git is designed around immutability. Every commit is a snapshot. When you `git rm secrets.env` and push a new commit, the file is gone from the *latest* version — but that commit where you added it? **Still there. Forever.**

Anyone can run:

```bash
# See the full history of a file, even deleted ones
git log --all --full-history -- .env

# Recover the contents of a file from a specific commit
git show abc1234:.env
```

And automated tools like [truffleHog](https://github.com/trufflesecurity/trufflehog), [gitleaks](https://github.com/gitleaks/gitleaks), and [git-secrets](https://github.com/awslabs/git-secrets) do exactly this — at scale, across millions of repos, constantly.

That AWS key you "deleted"? It was indexed by bots in under 5 minutes. They don't care that HEAD doesn't have it. They checked `git log`.

## How the Attack Actually Works

Here's the attacker's playbook — it's embarrassingly simple:

1. Bot finds a public GitHub repo (or gets tipped off by GitHub's secret scanning)
2. Clones the repo and runs `git log --all -p | grep -E 'AKIA[0-9A-Z]{16}'` (the AWS key pattern)
3. Extracts the key from history — even if it was committed and deleted in the same PR
4. Calls `aws sts get-caller-identity` to validate it
5. Spins up GPU instances to mine crypto, exfiltrates your S3 data, or sells the key on a dark web forum

The whole process is automated. You are not special enough for a human to manually target you. But the bots don't discriminate. 🤖

## Okay I Leaked a Secret. Now What? (The Real Fix)

**Step 0: Revoke it immediately.** Before anything else. Don't rewrite history first — the key is live *right now*. Rotate it, revoke it, nuke it from orbit.

```bash
# AWS example — revoke the key immediately
aws iam delete-access-key --access-key-id AKIAIOSFODNN7EXAMPLE
```

**Step 1: Purge it from git history.** Use `git filter-repo` (the modern replacement for the deprecated `filter-branch`):

```bash
# Install it
pip install git-filter-repo

# Nuke the file from ALL history
git filter-repo --path .env --invert-paths

# Force push to all branches (this rewrites history — coordinate with your team!)
git push origin --force --all
git push origin --force --tags
```

**Important:** Force-pushing rewrites history. Everyone who has cloned the repo will need to re-clone it. Tell your team before you do this. And if the repo was public even for a minute? Assume the secret is compromised regardless. History purging is for damage containment, not a guarantee of safety.

## Prevention: Stop Secrets From Ever Landing in Git

Fixing a leak is painful. Not leaking in the first place is better. Here's your defense stack:

**1. Pre-commit hooks with gitleaks**

```bash
# Install gitleaks
brew install gitleaks   # macOS
# or grab the binary from GitHub Releases

# Add a pre-commit hook to your repo
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
gitleaks protect --staged --redact -v
if [ $? -ne 0 ]; then
  echo "🚨 gitleaks found secrets! Commit blocked."
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

Now every `git commit` will scan your staged files. If a secret pattern is detected, the commit is blocked before it ever touches history.

**2. Use a `.gitignore` that actually covers secrets**

```gitignore
# Secrets & environment files
.env
.env.*
!.env.example
*.pem
*.key
*.p12
*.pfx
secrets/
credentials.json
service-account*.json
```

Note the `!.env.example` — that lets you commit an example file with fake values, which is a great practice for onboarding.

**3. Never hardcode secrets. Use a secrets manager.**

Environment variables are fine for local dev, but in production use a proper secrets manager:

- **AWS Secrets Manager** or **Parameter Store**
- **HashiCorp Vault**
- **Doppler** (great DX for teams)
- **GitHub Actions Secrets** for CI/CD pipelines

The pattern is: your app reads secrets at runtime from the manager, never from a file that could end up in version control.

## The Broader Lesson: Assume Public Means Public Immediately

A lot of devs think "I'll push it privately and fix it before anyone notices." The problem is that bots are watching GitHub's public event stream in real time. The [GitHub Events API](https://docs.github.com/en/rest/activity/events) is public. If your repo was public for *any* amount of time, the 5-second rule doesn't apply here.

Treat every secret that touched a public repo as **fully compromised**, regardless of how fast you caught it.

Also worth noting: private repos aren't magic. If someone forks your repo, clones it, or if GitHub has a breach (unlikely but possible), that history goes with it. Defense in depth means secrets should never be in git at all — private or public.

## Your Security Checklist

- **Revoke first, ask questions later** — the moment you suspect a leak
- **Use gitleaks or similar** as a pre-commit hook in every repo
- **Add `.env*` to `.gitignore`** before your first commit
- **Use a secrets manager** in production, not flat files
- **Enable GitHub Secret Scanning** (free for public repos, available on GitHub Advanced Security for private)
- **Audit your history** with `git log --all -p | grep -iE 'password|secret|key|token'` on existing repos

---

Found this useful? I post about security, backend dev, and the occasional horror story on [Twitter/X](https://x.com/kpanuragh) and [GitHub](https://github.com/kpanuragh). And if this post just made you run `git log --all -p` on your repos... you're welcome. 😅

Stay paranoid out there. 🔐
