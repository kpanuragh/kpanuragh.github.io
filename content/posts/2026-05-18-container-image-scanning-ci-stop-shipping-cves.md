---
title: "🔍 Container Image Scanning in CI: Stop Shipping CVEs to Production"
date: "2026-05-18"
excerpt: "Every Docker image you push is a bag of OS packages, language runtimes, and third-party libs — and any one of them could be a known exploit waiting to happen. Here's how to wire Trivy into your CI pipeline and actually act on what it finds."
tags:
  - devops
  - containers
  - security
  - ci-cd
  - trivy
featured: true
---

# 🔍 Container Image Scanning in CI: Stop Shipping CVEs to Production

Here's a fun exercise: pull any Docker image you shipped last month and run a vulnerability scanner against it. Go ahead — I'll wait.

Back? Yeah. That's a lot of red.

Most teams know container image scanning *exists* but treat it like a seatbelt they only buckle when they see a cop car. You'll add it "after the MVP", after the next sprint, after the next funding round. Meanwhile, your production pods are running `libssl` from 2021 with three known remote code execution vectors.

At Cubet, we've been baking image scanning directly into CI for a while now, and the lesson I keep relearning is: **the later you find a CVE, the more painful it is to fix**. Finding it before the image even leaves your pipeline? That's the dream.

## Why Your Images Are Sneakily Vulnerable

When you write `FROM node:20-slim` you're not just pulling Node. You're pulling a Debian base, the apt package cache, curl, libssl, libc, and a couple hundred other packages you never asked for. Each of those packages has a version. Each version has a CVE history.

Your app code might be immaculate — but you're still shipping `zlib` from 2022 because no one updated the base image.

This is the silent supply-chain problem everyone talks about at conferences and nobody fixes at 2pm on a Tuesday.

## Enter Trivy: The Scanner That Actually Gets Used

There are a dozen image scanners out there (Grype, Snyk, Clair, AWS Inspector). I keep coming back to [Trivy](https://github.com/aquasecurity/trivy) from Aqua Security because:

- It's a single binary with no database server to manage
- It scans OS packages *and* language dependencies (npm, pip, go.sum, Gemfile.lock) in one pass
- It runs beautifully in a GitHub Actions job with zero extra infra
- The output is actually readable

Basic usage is embarrassingly simple:

```bash
# Scan a local image before pushing
trivy image --exit-code 1 --severity HIGH,CRITICAL myapp:latest
```

`--exit-code 1` makes Trivy fail the command when it finds issues at the specified severity. That's what turns "nice report" into "pipeline gate".

## Wiring It Into GitHub Actions

Here's a real-world job you can drop into your workflow. This runs *after* your build step but *before* your push step — catching problems at the cheapest possible moment:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t ${{ github.repository }}:${{ github.sha }} .

      - name: Scan image with Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ github.repository }}:${{ github.sha }}
          format: table
          exit-code: "1"
          ignore-unfixed: true
          severity: "HIGH,CRITICAL"

      - name: Push image
        if: github.ref == 'refs/heads/main'
        run: |
          docker tag ${{ github.repository }}:${{ github.sha }} ghcr.io/${{ github.repository }}:latest
          docker push ghcr.io/${{ github.repository }}:latest
```

Two things worth calling out here:

**`ignore-unfixed: true`** — this flag is important. Without it, Trivy will flag CVEs that have *no available fix yet*, which means you'll fail your pipeline on things you literally cannot fix right now. You want to fail on things you *can* fix (i.e., update the package). Unfixed CVEs should go into a ticket, not block every deploy.

**Severity threshold** — `HIGH,CRITICAL` is usually the right starting point. Adding `MEDIUM` will give you hundreds of findings on any non-trivial image and cause teams to start ignoring the gate entirely. Start strict on what matters, then tune later.

## What To Do When the Scanner Screams

Getting a red CI run from Trivy is not the end of the world. Here's the triage order that actually works:

1. **Update the base image tag first.** A massive number of CVEs disappear by changing `FROM node:20-slim` to the latest patch. Base images get security updates; pinning to `node:20-slim` without a digest means you might be caching a stale layer.

2. **Check if it's in a path you use.** Trivy scans *everything* in the image, including dev tooling that never runs in production. If the vulnerable package is in a build-stage layer you discarded, it's not a risk.

3. **Use a `.trivyignore` file for accepted risks.** Sometimes a CVE is real, unfixable right now, and you've documented the accepted risk. Don't let it block every PR forever:

```
# .trivyignore
# CVE-2024-XXXXX: libfoo, no fix available as of 2026-05-18, tracked in JIRA-4512
CVE-2024-XXXXX
```

Treat this file like `// eslint-disable` — it must have a comment explaining *why* and a linked ticket. Blind ignores are just security theater.

4. **Pin base image digests for reproducibility.** For production images, swap `FROM node:20-slim` to `FROM node:20-slim@sha256:abc123...`. That way your base image can't silently change between builds, and your scanner results are deterministic.

## The Flywheel Effect

Here's what actually happens once scanning is in CI for a few months: developers start *caring* about base image freshness. When a PR fails because someone picked up a stale base image, they update it. That update often pulls in security fixes. Suddenly your image hygiene improves as a side effect of the gate — not because you wrote a policy, but because the feedback loop is fast.

At Cubet, we noticed our average CVE count per image dropped about 60% in the first quarter after we added this gate, not because we ran a cleanup sprint, but because developers started keeping base images fresh to avoid the red CI run.

Fast feedback loops beat long compliance audits every time.

## Beyond Just the App Image

One more thing: scanning your app image is table stakes. Consider also scanning:

- **Base images used across your org** — run Trivy on a schedule against your internal image registry
- **Third-party images** (databases, proxies, sidecars) you pull from Docker Hub — you didn't write that Nginx config, but you're running it
- **Infrastructure images** for your CI runners themselves — a compromised runner is worse than a compromised app image

Tools like [Harbor](https://goharbor.io/) let you enforce scanning policies at the registry level, so even if someone bypasses CI, they can't pull an unscanned image into your cluster.

## Ship Safer, Not Slower

Container scanning feels like extra friction until the day it catches a `libcrypto` CVE before it reaches production. Then it feels like the fastest possible way to avoid a 2am incident call.

Wire in Trivy this week. Start with `HIGH,CRITICAL` and `ignore-unfixed`. Build the habit before the breach.

Your future self (the one sleeping through alerts) will thank you.

---

*Running Trivy in your pipeline already? What's your threshold strategy — do you block on HIGH or only CRITICAL? Drop it in the comments.*
