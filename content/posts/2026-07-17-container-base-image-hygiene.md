---
title: "🧼 Container Base Image Hygiene: You FROM'd a Stranger's Computer"
date: "2026-07-17"
excerpt: "Every FROM line in your Dockerfile is a trust decision you probably made without thinking. Here's why 'it pulled and it ran' is not the same as 'it's safe', and how to actually clean up your base image habits."
tags: ["docker", "containers", "supply-chain", "security", "devops"]
featured: true
---

Quick exercise: open your most important Dockerfile and look at the `FROM` line. Now ask yourself — when was the last time you actually checked what's *in* that image, who publishes it, and whether it's still getting patched? If your honest answer is "never," congratulations, you're normal. You're also shipping a stranger's computer into production and calling it your application.

This is the part of supply chain security that gets way less airtime than dependency confusion or typosquatted npm packages, but it's arguably a bigger blast radius, because a bad base image doesn't just compromise one library — it compromises the entire filesystem your app lives in.

## "FROM node:latest" is not a Dockerfile line, it's a bet

Here's the thing nobody tells junior engineers: `FROM node:18` doesn't pin anything meaningful. Tags are mutable. The maintainers can — and do — push new content under the same tag when they rebuild for a CVE patch, a base OS bump, or honestly just routine maintenance. That's usually a good thing! Except it means the image you tested on Monday is not bit-for-bit the image that gets pulled in your Friday deploy.

```dockerfile
# What most Dockerfiles look like
FROM node:18-alpine
```

`node:18-alpine` today might be Alpine 3.19 with OpenSSL 3.1.4. Next month it might be a different Alpine point release entirely. You have no record of which one you actually shipped unless you go dig through registry pull logs — which, let's be honest, nobody has ever done at 2am during an incident.

The fix is boring and everyone knows it and almost nobody does it consistently: pin by digest, not tag.

```dockerfile
# Reproducible, auditable, and immune to tag-mutation surprises
FROM node:18-alpine@sha256:1a526b97cace6b4006256570efa1a29cd1fe4b98rb63e0f0eb1c62c50c5eebc9
```

Yes, it's ugly. Yes, you now need a process to bump that digest deliberately (Renovate and Dependabot both do this fine). That process is the entire point — updates should be a reviewed PR, not a silent thing that happens because someone re-ran `docker build` on a Tuesday.

## The image you didn't choose is bigger than the app you wrote

Pull `ubuntu:22.04` and you get a general-purpose OS with a package manager, a shell, curl, and a few hundred packages you will never use. Every one of those is attack surface. Every one of those shows up in a CVE scan whether or not your app touches it. Every one of those is something an attacker can use *after* they've gotten a foothold — `curl` and `bash` sitting in your runtime image is a gift to anyone doing post-exploitation.

This is why the "distroless" and "scratch" movements exist. Google's `gcr.io/distroless/*` images strip out the shell, the package manager, everything except the language runtime and your app. No shell means a huge class of "download a reverse shell and pivot" playbooks just don't work.

```dockerfile
# Multi-stage build: fat builder, skinny runtime
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

The build stage gets a full toolchain because it needs one. The runtime stage gets exactly one binary and nothing to `exec` into. If a container escape attempt lands on this image, there's no shell for it to escape *into*.

## Scanning is table stakes, not the finish line

A `trivy image myapp:latest` or `docker scout cves myapp:latest` in CI catches the obvious stuff — known CVEs in packages your base image drags in. Every team should have this gating builds. But scanning only tells you about vulnerabilities that are already *known* and already *cataloged*, and it tells you nothing about provenance — i.e., is this actually the image the publisher built, or something that got tampered with between their CI and your registry pull?

That's where signing and attestation come in. Sigstore's `cosign` lets you verify an image was signed by the org that claims to have built it:

```bash
cosign verify --certificate-identity-regexp "https://github.com/nodejs/.*" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  node:18-alpine
```

At Cubet, we ended up wiring image signature verification into the admission controller for our internal clusters — not because we expected Docker Hub itself to get compromised, but because it closes off an entire class of "someone pushed a malicious image to an internal registry that looks legit" scenarios. It's a five-minute policy change with an outsized payoff, and it catches mistakes as often as it catches attacks — a mistyped registry path pointing at a typo-squatted image gets rejected the same way a genuinely malicious one would.

## The hygiene checklist that actually matters

Skip the 40-item PDF checklist. If you only do these four things, you've covered most of the real risk:

1. **Pin by digest**, bump deliberately via a bot + PR review, not implicitly on every rebuild.
2. **Go minimal** — distroless or scratch for the runtime stage, full toolchain only in the build stage.
3. **Scan in CI and fail the build** on criticals, not just "generate a report nobody reads."
4. **Rebuild regularly even when your app code doesn't change.** This one trips people up — if your last image build was three months ago, you're running three months of unpatched base OS regardless of how fresh your application code is. Schedule a rebuild-and-rescan job weekly even with zero commits.

That last point is the one teams miss most, because it feels like busywork — nothing in the app changed, so why rebuild? Because the base image underneath it did, and CVEs get disclosed against packages you never directly chose to include.

## It's not paranoia, it's just reading the ingredient label

None of this is exotic. It's the container-world equivalent of checking expiry dates and reading ingredients instead of assuming "it's on the shelf, so it's fine." Every `FROM` line is an ingredient you're trusting to run in production, and the good news is that fixing this doesn't require a security team — it requires a Renovate config, a `trivy` step in CI, and a multi-stage Dockerfile that doesn't ship a shell it doesn't need.

Go check your `FROM` line. I'll wait.

---

Got a base image horror story, or a hygiene habit I missed? Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp/) — always happy to trade Dockerfile war stories.
