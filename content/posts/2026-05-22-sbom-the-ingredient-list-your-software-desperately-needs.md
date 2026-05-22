---
title: "🧾 SBOM: The Ingredient List Your Software Desperately Needs"
date: "2026-05-22"
excerpt: "You wouldn't eat food without knowing what's in it. So why are you shipping software without a bill of materials? Here's how to generate an SBOM and actually use it before your own Log4Shell moment lands."
tags: ["security", "supply-chain", "sbom", "devops", "open-source"]
featured: true
---

Remember Log4Shell? That December 2021 panic where everyone spent the weekend asking "do we use Log4j somewhere?" and half the answers were "...maybe?"

That "maybe" is the problem. And an SBOM — a **Software Bill of Materials** — is the cure.

## What Even Is an SBOM?

Think of it as the nutrition label on your software. Every package, library, transitive dependency, and their exact versions — written down in a machine-readable format so you (and your scanners) can reason about what's actually running in production.

Without an SBOM, your response to "are you vulnerable to CVE-2024-XXXX?" is a frantic grep through `package.json`, `go.sum`, `requirements.txt`, and three Dockerfiles, hoping you didn't miss anything. With one, it's a ten-second query.

Two formats dominate the space right now:

- **SPDX** — the Linux Foundation standard, older, used heavily in compliance contexts
- **CycloneDX** — OWASP-backed, richer vulnerability metadata, friendlier tooling ecosystem

Both are fine. CycloneDX has better tool support in 2026, so that's what I'll use below.

## Generating Your First SBOM

The fastest path is [Syft](https://github.com/anchore/syft) — an open-source CLI from Anchore that can scan container images, directories, lock files, and binaries.

```bash
# Install
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin

# Scan a container image, output CycloneDX JSON
syft my-app:latest -o cyclonedx-json > sbom.json

# Or scan a local directory (great for CI before you even build the image)
syft dir:. -o cyclonedx-json > sbom.json
```

The output is a JSON document listing every component Syft could identify — name, version, PURL (package URL), license, and the ecosystem it came from (npm, pip, Go modules, Alpine apk, Debian dpkg, etc.). One file, everything in one place.

At Cubet, we pipe this into CI on every merge to `main`. It takes about 8 seconds for a typical Node.js service. The SBOM gets uploaded as a build artifact alongside the Docker image — so six months from now, when a new CVE drops, we can check *exactly* what was shipping at any point in time without rebuilding anything.

## Actually Using the SBOM (This Is the Important Part)

Generating an SBOM and doing nothing with it is like having smoke detectors and never connecting them to the alarm. Here's how to make it actionable.

### 1. Vulnerability Scanning with Grype

Syft's sibling tool [Grype](https://github.com/anchore/grype) can consume an SBOM directly and cross-reference every component against NVD, GitHub Advisory, and OSV databases:

```bash
# Install Grype
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

# Feed it the SBOM you generated earlier
grype sbom:./sbom.json

# Or pipe directly
syft my-app:latest -o cyclonedx-json | grype --add-cpes-if-none
```

You get a table of CVEs, severity levels, and whether a fix is available — all scoped to exactly what you're shipping, not the whole internet's problem set. Add `--fail-on high` to break CI when a high-severity vuln lands.

### 2. License Compliance

SBOM formats carry license metadata. If your legal team needs confirmation that nothing GPL-contaminated is sneaking into your proprietary product, you can parse the SBOM and fail builds on disallowed licenses:

```bash
# Quick license summary from a CycloneDX JSON
jq '[.components[].licenses[]?.license.id] | group_by(.) | map({license: .[0], count: length})' sbom.json
```

I've seen teams discover they were shipping LGPL code in a closed-source product because an indirect dependency three layers deep quietly changed its license. An SBOM check in CI catches this before the lawyers do.

### 3. Diff Between Releases

SBOMs make release-to-release comparisons trivial. Tools like `sbom-diff` or just a plain `diff` on sorted component lists let you see exactly what changed dependency-wise between `v1.4.2` and `v1.4.3`. Useful for audit trails, change reviews, and understanding why your Docker image suddenly grew by 40MB.

## Wiring It Into GitHub Actions

Here's a minimal CI step that generates an SBOM and gates on high-severity CVEs:

```yaml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    image: my-app:${{ github.sha }}
    format: cyclonedx-json
    output-file: sbom.json
    upload-artifact: true

- name: Scan SBOM for vulnerabilities
  uses: anchore/scan-action@v3
  with:
    sbom: sbom.json
    fail-build: true
    severity-cutoff: high
```

The `sbom-action` automatically uploads the SBOM as a GitHub Actions artifact, which means it's associated with the specific workflow run and the commit SHA. You now have a permanent, queryable record of what every build contained.

## The Supply Chain Reality Check

SolarWinds. XZ Utils. Polyfill.io. The pattern is always the same: an attacker compromises something upstream that you implicitly trust, and your software ships malicious code without anyone noticing — because nobody had a clear list of what was in the box.

An SBOM doesn't prevent compromise. But it collapses your incident response time from "spend a week auditing every repo" to "query the artifact database, get an answer in minutes." When the next Log4j hits (and it will), being able to say "we were running 2.14.0, here's the list of affected services, here are the patched versions already deployed" is the difference between a calm afternoon and a career-defining weekend.

## Start Today

You don't need to boil the ocean. Pick one service, add `syft` to CI, upload the SBOM as an artifact. That's it. Run Grype against it next week. Add the license check the week after. In a month you'll have a proper supply chain visibility layer that would have saved you the panic drill.

Your future self — the one getting paged at 2am about a critical CVE — will be very grateful.

---

Got questions about SBOM tooling or supply chain security? I'm [@kpanuragh](https://twitter.com/kpanuragh) on Twitter or connect with me on [LinkedIn](https://linkedin.com/in/kpanuragh). Always happy to nerd out about this stuff.
