---
title: "🏗️ Multi-Arch Docker Builds: Buildx and the Great ARM Reckoning"
date: "2026-08-10"
excerpt: "Your laptop is ARM, your CI runner is ARM, and half your fleet is still x86 because nobody ever revisited that assumption. Buildx makes multi-arch images almost boring to produce — right up until QEMU quietly triples your build time and nobody notices until the bill does."
tags:
  - devops
  - docker
  - containers
  - ci-cd
featured: true
---

Here's a fun exercise: pull one of your team's "it just works" images on an M-series Mac and watch what happens. If you're lucky, it runs under emulation and everything is merely slow. If you're unlucky, something segfaults three layers deep in a native dependency and you spend an afternoon discovering that "it just works" secretly meant "it just works on the one architecture we tested."

Multi-arch used to be a niche concern — something you dealt with if you shipped to Raspberry Pis or the occasional ARM edge device. That era is over. Apple Silicon made ARM the default dev machine for a huge chunk of engineers, AWS Graviton made ARM the *cheaper* production option, and suddenly "build once, run anywhere" isn't a slogan, it's a requirement your CI pipeline either meets or silently fails at.

## The Naive Approach (And Why It Breaks)

The instinct is to just build on each architecture separately and push twice:

```bash
docker build -t myapp:amd64 .
docker build -t myapp:arm64 .
docker push myapp:amd64
docker push myapp:arm64
```

This mostly works until someone pulls `myapp:latest` on the wrong box and gets a binary compiled for a CPU that doesn't exist there. You end up hand-rolling manifest lists with `docker manifest create`, which is exactly as fun as it sounds, and exactly the kind of thing that gets forgotten during a Friday afternoon hotfix.

## Buildx Actually Fixes This

`docker buildx` builds a single multi-platform manifest that Docker resolves automatically based on the pulling machine's architecture. One tag, multiple platforms, correct image every time.

```bash
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.example.com/myapp:1.4.0 \
  --push .
```

That's it. `myapp:1.4.0` now silently resolves to the right binary whether it's pulled by a Graviton node in prod or a teammate's M3 laptop running a local repro. No more `amd64` suffix tags floating around as tribal knowledge.

## The Part Nobody Warns You About: Emulation Is Slow

Buildx builds non-native architectures through QEMU emulation by default, and emulation is not free. A Go build that takes 40 seconds natively can take 4+ minutes emulated, because every syscall is being translated on the fly. On a monorepo with a real dependency tree — think anything compiling native modules, not just pure Go or static binaries — a "quick" multi-arch build can quietly turn a 3-minute CI job into a 20-minute one.

At Cubet, we hit this the boring way: a pipeline that had been fine for months started timing out after we added `linux/arm64` to the platform list for a service with a native crypto dependency. Nobody had changed the Dockerfile. The build matrix had just quietly gotten twice as expensive, and the emulated arm64 leg was the one blowing past the timeout.

The fix wasn't cleverness, it was recognizing we were solving the wrong problem with QEMU. Two real options exist:

**1. Native builders per architecture, joined into one manifest.** Instead of emulating arm64 on an x86 runner, run an actual arm64 runner and have buildx orchestrate across both:

```bash
docker buildx create --name multiarch \
  --node amd64-node --platform linux/amd64 \
  ssh://ci-runner-x86

docker buildx create --name multiarch --append \
  --node arm64-node --platform linux/arm64 \
  ssh://ci-runner-arm
```

Each leg compiles natively at native speed; buildx just merges the results into one manifest at the end. This is the right call once your build time actually matters, which for most teams is sooner than they'd guess.

**2. Cache aggressively and accept emulation for less CPU-bound stages.** If your arm64 leg is mostly copying static assets and installing pre-built packages, emulation overhead barely matters. Reserve native runners for the legs that actually compile something.

## A Smaller Trap: `--platform` in FROM vs `--platform` on the Build

It's easy to conflate build-time platform targeting with the `--platform` flag inside a multi-stage Dockerfile:

```dockerfile
FROM --platform=$BUILDPLATFORM golang:1.23 AS build
ARG TARGETOS
ARG TARGETARCH
RUN GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /app .

FROM --platform=$TARGETPLATFORM alpine:3.20
COPY --from=build /app /app
```

`--platform=$BUILDPLATFORM` on the builder stage means the compiler itself runs natively (fast, no emulation) even though it's cross-compiling *for* the target — Go, Rust, and most modern toolchains handle cross-compilation better than QEMU handles emulating the compiler. Skip this and buildx will happily emulate your entire build toolchain for no reason, which is usually where that mystery 4x slowdown comes from.

## The Actual Lesson

Multi-arch isn't hard to get *correct* — buildx handles correctness for you almost by default. It's hard to get *cheap*, and that only shows up once your build matrix grows past "one quick platform flag." If you're adding `linux/arm64` to a pipeline today, budget five minutes to check whether you're compiling natively or emulating, because that decision is the difference between a build that scales and one that quietly eats your CI minutes until someone finally asks why deploys got slow.

Go check your `buildx build` invocations. If there's no `$BUILDPLATFORM` in your multi-stage Dockerfile and no native arm64 runner in your builder, you're probably paying the emulation tax without knowing it.
