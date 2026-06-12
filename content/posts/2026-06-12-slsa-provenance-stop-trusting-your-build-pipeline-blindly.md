---
title: "🔏 SLSA Provenance: Stop Trusting Your Build Pipeline Blindly"
date: "2026-06-12"
excerpt: "You sign your commits. You pin your dependencies. But can you prove that the binary shipping to users was actually built from that commit, by that pipeline, without tampering? SLSA answers that question."
tags:
  - security
  - supply-chain
  - slsa
  - devops
  - ci-cd
featured: true
---

# 🔏 SLSA Provenance: Stop Trusting Your Build Pipeline Blindly

You sign your commits. You pin your dependencies. You have an SBOM. You feel good about your supply chain security.

Then someone asks you a simple question: *"Can you prove that the binary you shipped last Tuesday was actually built from commit `a3f9c12`, by your CI pipeline, and that nothing touched it in between?"*

Silence.

That gap — between "I wrote secure code" and "I can prove what's running in production is that code" — is exactly what **SLSA** (pronounced "salsa", and yes, the acronym is **Supply chain Levels for Software Artifacts**) was designed to close.

## What SLSA Actually Is

SLSA is a framework from Google (now stewarded by the OpenSSF) that defines four levels of supply chain integrity. Think of it as a trust ladder: each level adds more verifiable guarantees about *how* your software was built.

| Level | What It Proves |
|-------|---------------|
| SLSA 1 | Build provenance exists (even if unsigned) |
| SLSA 2 | Provenance is signed by the build service |
| SLSA 3 | Build runs on a hardened, isolated environment |
| SLSA 4 | Two-party review, hermetic builds, reproducible |

Most teams are living at an *implicit Level 0* — they trust their CI because, well, it hasn't exploded yet. That's not a security posture, that's optimism.

## The Attack You're Not Thinking About

Here's the threat model that keeps supply chain folks up at night: **a compromised build pipeline.**

Your source code is clean. Your dependencies are pinned. But what if:

- Someone pushed a malicious step to your GitHub Actions workflow?
- A CI runner was compromised and injected code into the build artifact?
- An artifact was swapped in the registry between build and deploy?

Signed commits prove the *source* was legitimate. SLSA provenance proves the *artifact* was built legitimately, from that source, by a trustworthy process.

These are different things. Both matter.

## Getting Signed Commits Right

Before provenance, let's talk about the foundation: signed commits with GPG (or the more modern SSH key signing).

```bash
# Configure Git to sign commits with SSH key (simpler than GPG)
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true

# Verify a commit's signature
git log --show-signature -1
# commit a3f9c12...
# Good "git" signature for committer email with ED25519 key SHA256:...
```

In GitHub, enable **"Require signed commits"** on your protected branches under `Settings → Branches → Branch protection rules`. Now every merge to `main` has a verified author.

But again — this only proves who wrote the code. Not how the binary was built.

## Generating SLSA Provenance in GitHub Actions

The good news: GitHub Actions now has native support for SLSA provenance via the `slsa-framework/slsa-github-generator` action. Here's what it looks like for a Go binary:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      digests: ${{ steps.hash.outputs.digests }}
    steps:
      - uses: actions/checkout@v4
      - name: Build binary
        run: |
          go build -o myapp ./cmd/myapp
          sha256sum myapp > checksums.txt

      - name: Generate artifact hash
        id: hash
        run: |
          echo "digests=$(cat checksums.txt | base64 -w0)" >> "$GITHUB_OUTPUT"

      - uses: actions/upload-artifact@v4
        with:
          name: myapp
          path: myapp

  provenance:
    needs: build
    permissions:
      actions: read
      id-token: write
      contents: write
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.0.0
    with:
      base64-subjects: "${{ needs.build.outputs.digests }}"
      upload-assets: true
```

When this runs, GitHub generates a signed provenance attestation — a JSON document that records:

- The exact commit SHA that triggered the build
- The workflow file and ref used
- The runner environment
- The output artifact digest

This attestation is signed using GitHub's OIDC identity, which means it's cryptographically tied to GitHub's infrastructure. You can't fake it without compromising GitHub itself.

## Verifying Provenance Downstream

Generating provenance is only half the job. You need to *verify* it before you deploy.

```bash
# Install the SLSA verifier
go install github.com/slsa-framework/slsa-verifier/v2/cli/slsa-verifier@latest

# Verify a binary's provenance before deploying
slsa-verifier verify-artifact myapp \
  --provenance-path myapp.intoto.jsonl \
  --source-uri github.com/yourorg/yourrepo \
  --source-tag v1.2.3

# Output on success:
# Verified signature against tlog entry index 123456789
# Verified build using workflow ".github/workflows/release.yml"
# PASSED: Verified SLSA provenance
```

At Cubet, we integrated a verification step into our deployment scripts — if the provenance check fails, the deploy halts. It's a 10-line addition to the pipeline, but it means we can prove, for any artifact in production, exactly which commit it came from and which pipeline built it. That audit trail has already come in useful once when a client asked us to demonstrate our build integrity controls.

## The Dependency Chain Problem

SLSA provenance for *your* code is great. But your binary also contains 200 third-party dependencies. This is where provenance meets the broader supply chain ecosystem.

Projects publishing to PyPI, npm, and Maven are increasingly attaching SLSA attestations to their releases. Python 3.13+ packages on PyPI now include provenance by default. The `npm audit signatures` command checks package signatures.

The long game here is a world where your package manager refuses to install an unattested package above a certain risk threshold — similar to how browsers refuse invalid TLS certificates. We're not there yet, but the infrastructure is being built.

## What Level Should You Target?

For most teams shipping to production:

- **Level 1** is the floor — at minimum, generate *some* provenance, even unsigned. It starts the audit trail.
- **Level 2** is achievable today with GitHub Actions and takes an afternoon to set up.
- **Level 3** requires ephemeral, isolated build environments (GitHub's hosted runners qualify) and a bit more pipeline discipline.
- **Level 4** is for high-stakes infrastructure (package managers, security tooling, OS-level software).

If you're a startup shipping a web app, Level 2 is probably your sweet spot. If you're building something that ends up in other people's supply chains — an SDK, a CLI tool, a Docker base image — aim for Level 3.

## The Bigger Picture

Supply chain attacks have become one of the most cost-effective attack vectors for adversaries. SolarWinds, XZ Utils, the npm `event-stream` incident — in each case, the source code looked fine. The tampering happened in the build or distribution layer.

SLSA provenance is the technical mechanism that makes "trust but verify" actually verifiable. It's not about paranoia — it's about being able to answer the auditor's question, the incident responder's question, or your own question at 2am when something is behaving strangely in production.

Did that binary actually come from what you think it came from?

With SLSA, you can prove it. Without it, you're hoping.

---

**Start here:** Add the `slsa-github-generator` action to your next release workflow. It's free, it's open source, and it takes less time than writing the runbook about why you *don't* have provenance yet.

---

*Found this useful? I write about security, DevOps, and engineering tradeoffs at [iamanuragh.in](https://iamanuragh.in). Connect on [GitHub](https://github.com/kpanuragh) or drop me a message — always happy to talk supply chain security.*
