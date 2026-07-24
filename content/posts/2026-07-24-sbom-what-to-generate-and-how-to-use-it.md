---
title: "📦 SBOM: The Ingredients Label Nobody Reads Until Someone Gets Sick"
date: "2026-07-24"
excerpt: "Everyone's generating SBOMs now because a compliance checkbox told them to. Almost nobody is querying them when the next XZ-Utils-style backdoor drops. Here's how to generate one that's actually useful, and what to do with it at 2am."
tags:
  - security
  - supply-chain
  - sbom
  - devsecops
  - cicd
featured: true
---

Quick test: does your project have an SBOM sitting somewhere in CI artifacts right now? Good, most teams do these days — some regulation, customer questionnaire, or executive order (literally, in the US) made "generate an SBOM" a checkbox someone ticked in 2024.

Second question: the next time a library gets backdoored — think XZ Utils, think `event-stream`, think whatever's next — how long would it take you to answer "are we affected?" across every service you run?

If the honest answer is "grep through Slack and hope someone remembers," you have an SBOM, but you don't have a supply chain security program. Those are different things, and the gap between them is where I want to spend this post.

## What an SBOM actually is (and isn't)

A Software Bill of Materials is a structured, machine-readable inventory of every component in your software — direct dependencies, transitive dependencies, sometimes OS packages, sometimes the compiler that built it. Two formats dominate: **CycloneDX** (born in the AppSec world, OWASP-backed) and **SPDX** (born in the license-compliance world, now an ISO standard). Both do roughly the same job today; pick whichever your tooling supports better and don't lose sleep over it.

What an SBOM is *not*: a vulnerability scan. This trips people up constantly. An SBOM is the ingredients label. It tells you the jar contains peanuts. It does not tell you peanuts are currently subject to a recall. You need a second step — matching the SBOM against a vulnerability database — to get from "here's what's in it" to "here's what's wrong with it."

## Generating one that's actually worth having

The fastest path with real teeth is [Syft](https://github.com/anchore/syft), which can point at a repo, a container image, or a running filesystem and spit out a CycloneDX or SPDX document:

```bash
# Scan a built container image
syft packages your-registry/api:2026.07.24 -o cyclonedx-json > sbom.json

# Or scan a source checkout before you even build
syft packages dir:. -o cyclonedx-json > sbom.json
```

The image-scan version matters more than people think. Your `package-lock.json` tells you what npm installed. It says nothing about the base image's OpenSSL version, the `curl` binary baked in three `FROM` layers ago, or that stray Python your Dockerfile pulled in for a build step and forgot to strip out. Most real-world CVE exposure I've dealt with at Cubet came from OS-level packages in base images, not application dependencies — and a source-only SBOM is blind to all of it.

Wire it into CI right after the image builds, not as an afterthought job that runs separately and drifts out of sync:

```yaml
- name: Build image
  run: docker build -t api:${{ github.sha }} .

- name: Generate SBOM
  run: syft packages api:${{ github.sha }} -o cyclonedx-json=sbom-${{ github.sha }}.json

- name: Upload SBOM as artifact
  uses: actions/upload-artifact@v4
  with:
    name: sbom
    path: sbom-${{ github.sha }}.json
```

Attach the SBOM to the release, not just the CI run. GitHub Actions artifacts expire; releases don't. If you're pushing images to a registry, [attaching the SBOM as an OCI artifact](https://github.com/sigstore/cosign) alongside the image (`cosign attach sbom`) means the two travel together forever, which is exactly the property you want when someone asks "what was actually running in prod on March 3rd."

## The part everyone skips: actually querying it

Generating the SBOM is the easy 20%. The useful 80% is what you do with it *before* it's an emergency.

Pair it with [Grype](https://github.com/anchore/grype) to turn the inventory into an actual vulnerability report:

```bash
grype sbom:sbom.json --fail-on high
```

But the real payoff shows up on the day a new CVE drops for something like `xz-utils` or `libwebp` and every security team on the planet is asking the same question simultaneously. Instead of SSHing into boxes or re-scanning every service live, you query the SBOMs you already archived:

```bash
# Across every stored SBOM, does anything reference the bad package/version?
grep -l '"name": "xz-utils"' sboms/*.json
```

That's the entire point of generating SBOMs *continuously* rather than once a quarter for an audit: they become a searchable historical index of "what did we ship, and when." An SBOM generated once and filed away answers nothing about last month's release that's still running on a customer's on-prem box.

## VEX: the piece that stops SBOMs from crying wolf

Here's the failure mode that kills SBOM programs: a scanner flags 400 "vulnerabilities," 380 of them are in code paths you don't even call, and the team stops looking at the report entirely within a month. Alert fatigue isn't just a paging problem — it's a supply-chain-tooling problem too.

This is what **VEX** (Vulnerability Exploitability eXchange) documents are for. A VEX statement says, essentially, "yes, CVE-2026-XXXXX affects a component we ship, but our usage doesn't invoke the vulnerable code path, so it's `not_affected`." You generate these once, attach them to the SBOM, and every future scan can suppress the noise automatically instead of a human re-litigating the same false positive every sprint.

```json
{
  "vulnerability": { "id": "CVE-2026-12345" },
  "statement": {
    "status": "not_affected",
    "justification": "vulnerable_code_not_in_execute_path",
    "products": [{ "id": "pkg:oci/api@2026.07.24" }]
  }
}
```

Nobody enjoys writing these. Write them anyway for your top recurring false positives — it's the difference between a vulnerability report people trust and one they mute.

## Where to actually start

You don't need the full VEX pipeline on day one. In order of "value per hour invested":

1. Generate an SBOM for your container images in CI, attach it to the artifact/release.
2. Run Grype against it and fail the build on `critical`/`high` for anything with a known fix available.
3. Archive every SBOM somewhere greppable and durable, not just 90-day CI retention.
4. Add VEX statements for your worst repeat-offender false positives once the noise gets annoying.

Do step one this week. It's a fifteen-minute CI change, and it's the difference between "we think we're fine" and "we can prove it" the next time a maintainer's GitHub account gets compromised and ships a backdoor to eight million weekly downloads before anyone notices.

---

Found this useful, or got your own SBOM horror story to share? Come yell at me about it:

- Twitter/X: [@anuragh_kp](https://twitter.com/anuragh_kp)
- GitHub: [kpanuragh](https://github.com/kpanuragh)
- LinkedIn: [anuraghkp](https://linkedin.com/in/anuraghkp)
