---
title: "🔒 Version Pinning: Why \"^1.2.3\" Is a Security Vulnerability Waiting to Happen"
date: "2026-06-19"
excerpt: "SemVer promises that minor and patch updates are safe. Supply chain attackers are counting on you to believe that. Here's why floating versions are a silent threat and how to pin everything that matters."
tags:
  - security
  - supply-chain
  - devops
  - dependencies
  - npm
featured: true
---

Here's a fun thought experiment: when was the last time you looked at *exactly* what code ran in your CI pipeline? Not the code you wrote — the code that `npm install` silently fetched from the internet and executed on your machine with full privileges.

If your answer is "uhh, whenever I wrote `package.json`," then we need to talk about version pinning.

## The SemVer Social Contract Is a Gentlemen's Agreement

Semantic versioning (`MAJOR.MINOR.PATCH`) comes with an implicit promise: patch updates only fix bugs, minor updates only add backwards-compatible features, major updates may break things.

This promise is beautiful in theory. In practice, it's held together with vibes and a prayer.

The `^` prefix in npm means "give me anything compatible with this major version." So `"lodash": "^4.17.15"` lets npm silently upgrade you to `4.99.0` the next time someone runs `npm install` on a fresh machine. And if that `4.99.0` was pushed by an attacker who compromised the maintainer's npm credentials? Congratulations, you're part of a supply chain attack.

This isn't hypothetical. The 2018 `event-stream` incident had attackers publish a malicious `flatmap-stream` package that was added as a dependency of `event-stream` — a package downloaded millions of times weekly. It went undetected for weeks because the malicious code only targeted wallets belonging to one specific Bitcoin project and was obfuscated well enough to pass casual review.

No CVE saved anyone. No firewall blocked it. Version pinning would have.

## Three Places You're Probably Floating When You Shouldn't Be

### 1. Docker Image Tags

```dockerfile
# This is not a version. This is a wish.
FROM node:20-alpine

# This is a version.
FROM node:20.15.1-alpine3.20@sha256:a1b2c3d4e5f6...
```

The `latest` tag is an obvious offender — everyone knows not to use it. But `node:20-alpine` is just as bad. That tag is a mutable pointer. The image it refers to today is not the image it refers to next month. Node security patches, Alpine updates, even rebuilds for certificate rotations all silently shift what `20-alpine` means.

At Cubet, we had a pipeline that built consistently for six months, then failed mysteriously after an Alpine base image update changed where a native library was located. It took two hours to diagnose. Pinning to a digest would have made that breakage explicit rather than silent.

The SHA256 digest approach means you get exactly the image you tested with, forever — until you explicitly upgrade. The tradeoff is that you need a process to update those digests regularly. That's a good problem to have.

### 2. GitHub Actions

```yaml
# 🚨 Trusting a mutable tag — a tag can be force-pushed
- uses: actions/checkout@v4

# ✅ Pinning to a commit SHA — immutable, auditable
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

GitHub Actions run in your CI environment with access to your secrets, your artifacts, and your deployment keys. The action `@v4` is a mutable tag. A compromised maintainer account could push malicious code to that tag, and your pipelines would pick it up on the next run.

The `tj-actions/changed-files` supply chain attack in 2023 exploited exactly this. The action's tags were modified to exfiltrate CI secrets. Projects pinned to commit SHAs were unaffected.

Add a comment with the human-readable version so future-you knows what `11bd71901b...` actually is. It's slightly ugly. It's also the difference between "compromised" and "not our problem."

### 3. pip and Python Requirements

```txt
# requirements.txt — floating, dangerous
requests>=2.28.0
cryptography>=41.0.0

# requirements-frozen.txt — pinned with hashes
requests==2.32.3 \
  --hash=sha256:70761cfe03c773ceb22aa2f671b4757976145175cdfca038c02654d061d6dcc6 \
  --hash=sha256:f2c42d36e76aebf0f2d79d0a9b5a1d5f4e6a3a2b1c0d9e8f7a6b5c4d3e2f1a0
```

The `pip install --require-hashes` flag refuses to install any package without a verified hash. Combined with a frozen requirements file, this means you get exactly the wheel you audited, with cryptographic proof.

`pip-compile` from the `pip-tools` package generates these frozen files from your human-readable `requirements.in`. Run it in CI, commit the output, and Dependabot can still send you PRs when versions update — you just review the diff consciously rather than accepting updates silently.

## But What About Security Patches?

This is the objection I hear every time: "If I pin everything, I'll miss security patches!"

This is backwards.

With floating versions, you get *all* changes automatically — including malicious ones. With pinning, you get *no* changes automatically — including security fixes. The question is which failure mode you'd rather manage.

Pinning doesn't mean ignoring updates. It means making updates *deliberate*. Dependabot, Renovate Bot, or `npm audit` can still alert you to vulnerabilities in pinned versions. The difference is that you consciously choose to update, review the changelog, and verify the new version is what it claims to be.

The supply chain attackers are betting on the opposite workflow: that you have floating versions, that you don't review dependency updates, and that something small and unfamiliar sneaking into your `node_modules` on a Tuesday morning goes unnoticed.

## A Practical Pinning Strategy

You don't have to pin everything immediately. Start with what matters most:

1. **Pin your base Docker images to digests** — this is the highest leverage change and usually the simplest.
2. **Pin GitHub Actions to commit SHAs** — tools like `pin-github-action` can automate the initial conversion.
3. **Use lockfiles and commit them** — `package-lock.json`, `Gemfile.lock`, `poetry.lock`, `Cargo.lock`. These are version pins. They belong in source control.
4. **Add hash verification for critical Python/pip dependencies** — use `pip-compile --generate-hashes`.
5. **Automate updates with human review** — Dependabot or Renovate with required PR review, not auto-merge.

The goal isn't to freeze your dependencies forever. It's to make the act of updating an explicit, reviewable decision rather than something that happens silently at 3 AM during a CI run.

SemVer is a convention, not a guarantee. Maintainer accounts get compromised. Packages get abandoned and then resurrected by malicious actors. Build pipelines download and execute untrusted code every single day.

The trust model of `npm install` is "we trust every person who has ever pushed to this package, plus everyone who might get access to their account in the future." That's a lot of trust to extend to a caret in a JSON file.

Pin your versions. Review your updates. Make the implicit explicit.

---

Thinking about your own supply chain exposure? I'd love to hear what pinning strategies your team uses — or what nightmare story made you finally start pinning. Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh). If this post saved you from a bad day, share it with the person on your team who still has `"react": "latest"` in their package.json.
