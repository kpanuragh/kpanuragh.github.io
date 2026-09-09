---
title: "🎲 Build Reproducibility: Same Commit, Different Binary"
date: "2026-09-09"
excerpt: "You checked out the exact same commit and got a different artifact. Welcome to the world of non-reproducible builds, where 'it built fine yesterday' is not a debugging strategy."
tags: ["devops", "ci-cd", "docker", "build-systems", "supply-chain"]
featured: true
---

Here's a fun exercise. Take a commit hash from three weeks ago, check it out on a clean machine, run your build, and diff the output against what's currently running in production. If you're confident they'll match byte-for-byte, you either run a genuinely hermetic build pipeline, or you haven't tried this yet.

Most teams haven't tried it. And when they do, the results range from "huh, timestamps are different" to "wait, why does this binary have a different dependency tree than the one we shipped." Build reproducibility — the property that the same source, built twice, produces an identical artifact — sounds like a nice-to-have until you need to answer a question like "was this exact binary built from this exact code" during an incident, an audit, or a supply-chain scare. Then it's suddenly the only thing that matters.

## Why builds drift even when nothing "changed"

The seductive lie of CI/CD is that a pipeline is deterministic because it's automated. It isn't. Automation just means the nondeterminism happens consistently instead of randomly. A few of the usual suspects:

**Unpinned dependencies.** `npm install` without a committed lockfile, or a lockfile that allows range resolution, means the "same" build pulls whatever's newest in the registry today. Your `package.json` says `^4.2.0`; last month that resolved to `4.2.1`, today it resolves to `4.3.0` because someone published a patch, and now your build includes code you never reviewed.

**Timestamps baked into artifacts.** Compilers and archive tools love embedding build time by default. Two builds from identical source, one second apart, produce different SHA256s because the `.tar.gz` header or the PE/ELF timestamp differs — even though the actual logic inside is byte-identical.

**Ambient environment leaking in.** Locale, timezone, hostname, the order `readdir()` happens to return files in on a given filesystem — these are all things that can silently influence output if your build scripts aren't careful (globbing without sorting is a classic culprit).

**Base image drift.** `FROM node:20` isn't a version pin, it's a moving target. `node:20` today and `node:20` next Tuesday can point at different underlying images with different OS packages, because tags get republished.

## The pin-everything checklist

Reproducibility is mostly the absence of implicit inputs. Every value that can influence the output needs to be either pinned or excluded. In practice:

```dockerfile
# Bad: tag is a moving target
FROM node:20-alpine

# Good: pinned to a specific digest
FROM node:20-alpine@sha256:2d07db07a2solidhashsolidhash

# Good: lockfile is committed and CI fails without it
RUN npm ci --frozen-lockfile
```

`npm ci` instead of `npm install` isn't a style preference — it's the difference between "install exactly what the lockfile says" and "install compatible with, then maybe update the lockfile." One is reproducible, the other is a suggestion.

For compiled languages, strip the timestamp entirely instead of trying to control it:

```bash
# Go: strip build-path and timestamp info for a deterministic binary
go build -trimpath -ldflags="-buildid=" -o app ./cmd/app

# Compare two builds of the same commit
sha256sum app app-rebuild
```

If those hashes don't match on a clean checkout, something in your toolchain is leaking nondeterminism, and it's worth the half day to go find it before it finds you during an incident review.

## Where I've actually hit this

At Cubet Techno Labs, we had a case where a "hotfix" deploy behaved differently than staging even though the deploy pipeline swore it was the same commit. Turned out staging had been built two days earlier from a base image tag that had since been republished upstream with a bumped OpenSSL package, and the fix touched TLS handshake behavior indirectly. The code was identical. The environment underneath it wasn't. We only caught it because someone thought to diff the two container image SHAs and noticed the base layer digests didn't match — the application layer was byte-identical, the OS layer wasn't.

The fix wasn't glamorous: pin every base image by digest, not tag, and add a CI step that rebuilds a random recent commit weekly and diffs the resulting image digest against what's in the registry. If they diverge and the source hasn't changed, the pipeline flags it instead of silently shipping a mystery artifact.

## Reproducibility is a supply-chain control, not just a nice property

This matters more than "clean diffs are satisfying." If you can't reproduce a build from source, you can't verify that what's running in production actually came from the code you reviewed — which is exactly the gap that lets a compromised build server or a poisoned dependency slip an unreviewed binary into your deploy without anyone noticing. Projects like Reproducible Builds (the Debian-adjacent effort, not a product) exist specifically because "trust the build pipeline" isn't a security model, it's a hope.

You don't need to go full hermetic-Bazel-sandbox to get real value here. Start small:

1. Pin base images by digest, not tag.
2. Commit lockfiles and enforce them in CI (`npm ci`, `pip install --require-hashes`, etc.).
3. Strip timestamps and build paths from compiled output where your toolchain supports it.
4. Once a week, rebuild an old commit and diff the artifact hash against what's deployed. If it doesn't match and the source hasn't changed, that's a page-worthy signal, not a shrug.

Go pick one commit from last month, build it twice on a clean runner, and diff the output. If it doesn't match, you've just found your next sprint's most valuable ticket — and it won't be the last time that check saves you.
