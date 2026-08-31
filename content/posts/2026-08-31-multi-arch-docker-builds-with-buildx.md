---
title: "Multi-Arch Docker Builds: How Buildx Saved Me From an M1 Mac Rebellion 🏗️🍎"
date: "2026-08-31"
excerpt: "Half the team is on Apple Silicon, prod runs on x86, and your image only works on one of them. Here's how docker buildx and QEMU quietly fix the \"works on my Mac\" problem for containers."
tags: ["docker", "devops", "containers", "ci-cd", "platform-engineering"]
featured: true
---

There's a very specific flavor of panic that hits when a teammate pings you with "hey, the container starts on my machine but crashes in staging with `exec format error`." You stare at the Dockerfile. You stare at the CI logs. Everything looks fine. Then it clicks: they built the image on their shiny M-series MacBook, pushed it straight to the registry, and your staging cluster is running plain old x86_64 EC2 instances. The image isn't broken — it's just speaking a CPU dialect your servers don't understand.

This used to be a rare edge case. Now that half of every engineering team owns an ARM laptop and the other half's production still runs on Intel/AMD, it's a Tuesday. The fix isn't "ban M-series Macs" (good luck with that) — it's building images that actually contain both architectures. That's what `docker buildx` is for, and once you get past the slightly weird mental model, it's genuinely one of the more satisfying pieces of the Docker toolchain to understand.

## Why a normal `docker build` can't just do this

A regular Docker image is architecture-specific by nature — it's a stack of layers compiled for one instruction set. What `buildx` gives you is a **manifest list** (sometimes called a "fat manifest"): a single tag in the registry that points to multiple architecture-specific images under the hood. When someone runs `docker pull myapp:latest`, the Docker daemon on their machine automatically picks the variant that matches its own CPU. Same tag, different bytes, depending on who's asking.

The tricky part is that your CI runner is (almost certainly) x86_64. It can't natively execute ARM instructions to build the ARM variant. This is where `QEMU` user-mode emulation comes in — `buildx` transparently runs an emulated ARM environment inside your x86 builder so it can compile and test the ARM layers, slowly, but correctly.

## Setting it up

First, make sure you've got a builder that supports multiple platforms — the default `docker` driver usually doesn't, so you create a dedicated one:

```bash
docker buildx create --name multiarch --driver docker-container --use
docker buildx inspect --bootstrap
```

That `--bootstrap` flag forces it to spin up immediately so you catch driver issues before your first real build instead of mid-CI-run. Then the actual build is one command:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag registry.example.com/myapp:1.4.0 \
  --push \
  .
```

Note the `--push` — this matters more than it looks. Multi-platform manifest lists can't be loaded into your local Docker daemon the way single-arch images can (`--load` only works for one platform at a time), so if you want the manifest list to actually exist as a coherent object, it has to go straight to a registry. The first time you try to `--load` a two-platform build and get a cryptic error, you'll remember this paragraph.

## The part nobody warns you about: build time

Here's the anecdote that actually taught me to respect this tool. At Cubet, we had a Node service with a native dependency (a compiled addon, not pure JS) that took about 90 seconds to build natively on our x86 CI runners. Straightforward, fast, nobody thought about it. Then we added `--platform linux/amd64,linux/arm64` to support engineers running the service locally on M-series Macs during development.

The amd64 leg still took 90 seconds. The arm64 leg — running under QEMU emulation on the same x86 runner — took almost eleven minutes. Compiling native code under emulation is slow in a way that interpreted JS mostly isn't, because every instruction the compiler emits gets translated on the fly instead of running natively. Our CI pipeline, which had comfortably fit inside a 5-minute budget, suddenly looked like it was building a kernel.

The fix wasn't cleverness, it was honesty about what QEMU is for:

```yaml
# .github/workflows/build.yml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Turning on registry/GHA layer caching cut the arm64 leg roughly in half on subsequent builds since the native addon's compiled layer could be reused when its inputs hadn't changed. For the truly painful cases, the better long-term answer is **native arm64 runners** instead of emulation — GitHub Actions and most cloud CI providers now offer them directly, and a native arm64 build of that same addon took under two minutes. Emulation is great for "make it work"; native runners are what you reach for once "make it fast" becomes the actual requirement.

## A few lessons that'll save you a debugging session

- **Test both variants, not just the one you built locally.** A base image or dependency that silently only ships amd64 binaries will build "successfully" under QEMU and then fail at runtime on real ARM hardware. `docker run --platform linux/arm64 myapp:1.4.0 node -e "console.log('ok')"` on an x86 machine will emulate-execute it and catch this before your users do.
- **Pin your base images carefully.** `FROM node:20-slim` resolves to a different digest per architecture — that's expected and fine, since it's exactly what the manifest list mechanism is for. Just don't be surprised when `docker inspect` shows different `Id` values for "the same" tag pulled on different machines.
- **Don't multi-arch everything by default.** If your image only ever runs on your own known infrastructure, the emulation tax isn't worth paying. Reach for `buildx --platform` when you have an actual audience for the second architecture — local dev on ARM laptops, an ARM-based production fleet for cost savings, whatever it is — not as a reflexive best practice.

Multi-arch builds are one of those things that feel like unnecessary ceremony right up until the day someone on your team buys a new laptop and your "it works on every machine" container stops being true. Set up `buildx` once, wire the caching in properly, and it becomes invisible infrastructure instead of a recurring fire drill.

Running mixed-architecture teams or fleets? I'd love to hear how you've tackled the build-time tradeoff — native runners, smarter caching, or just eating the QEMU tax. Drop a comment or find me on the socials linked below.
