---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Whole Kitchen to Serve One Dish"
date: 2026-05-05
excerpt: "Your Docker images are probably 10x bigger than they need to be. Multi-stage builds are the single easiest win in container optimization — and most developers skip them entirely. Here's how to fix that today."
tags: ["docker", "devops", "containers", "ci-cd", "performance", "best-practices"]
featured: true
---

Let me paint you a familiar picture.

You containerize your Node.js app for the first time. You're pumped. You write a `Dockerfile`, run `docker build`, and watch the layers stack up. Then you check the image size.

**1.4 GB.**

For a REST API that does three things.

You've essentially shipped the entire kitchen — the oven, the fridge, the pantry, the sous chef, the health inspector paperwork — just to deliver one plate of pasta. Docker multi-stage builds are how you send just the pasta.

## The Problem with "Just Install Everything"

Here's a typical beginner Dockerfile for a Go service:

```dockerfile
FROM golang:1.22

WORKDIR /app
COPY . .
RUN go mod download
RUN go build -o server .

EXPOSE 8080
CMD ["./server"]
```

This works. It runs. Your team ships it. Nobody asks questions.

But that `golang:1.22` base image is ~800MB on its own. It includes the Go toolchain, source cache, build tools, and a whole Debian system — **none of which your compiled binary actually needs at runtime**. You're paying for cold start time, container registry storage, and network transfer costs on every single deploy, forever.

The compiled Go binary might be 15MB. The image is 850MB. That's a 56x bloat ratio, and it's completely avoidable.

## Enter Multi-Stage Builds

Multi-stage builds let you use multiple `FROM` statements in one Dockerfile. Each stage can copy artifacts from previous stages, but **only what you explicitly ask for**. The final image contains only the last stage.

Here's that same Go service, done right:

```dockerfile
# Stage 1: Build
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

# Stage 2: Run
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata
WORKDIR /root/

COPY --from=builder /app/server .

EXPOSE 8080
CMD ["./server"]
```

The `builder` stage downloads dependencies and compiles. The final `alpine` stage gets only the compiled binary. Result: **~18MB** instead of 850MB. Same app, same functionality, 47x smaller image.

That's not a micro-optimization. That's the difference between a 30-second deploy and a 3-second one.

## A Real-World Node.js Example

Multi-stage builds shine even brighter for interpreted languages where you need build tools (TypeScript compiler, webpack, etc.) that serve zero purpose at runtime.

```dockerfile
# Stage 1: Install and build
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build   # tsc, webpack, whatever

# Stage 2: Production runtime
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Notice what the runtime stage gets:
- Production `node_modules` only (no `devDependencies`)
- Compiled `dist/` output (no raw TypeScript)
- **Not** the TypeScript compiler, test frameworks, source maps, or anything you use during development

A project that was 900MB is now ~180MB. And because `node_modules` is installed fresh from `package.json` rather than copied wholesale, the layer cache actually works properly too.

## The Lessons I Learned the Hard Way

**1. Install dev deps first, copy source second.** Docker layer caching invalidates from the first changed layer downward. If you `COPY . .` before `RUN npm install`, every source change triggers a full reinstall. Always copy `package.json` and install first, *then* copy source.

**2. Use `alpine` variants, but carefully.** Alpine is based on musl libc, not glibc. Most apps work fine. But if you're using native Node modules or certain Python packages, you'll hit segfaults that only appear in production. Test on alpine before committing to it — or use `slim` variants instead if you need glibc.

**3. Pin your base image versions.** `FROM node:20` silently pulls updated patches. Usually fine, occasionally disastrous. `FROM node:20.11.1-alpine3.19` means your build is reproducible six months from now. Use digests (`@sha256:...`) for truly immutable builds in security-sensitive contexts.

**4. Multi-stage ≠ multi-environment.** Don't be tempted to put your dev and prod configs in one Dockerfile with `ARG ENV=prod`. Keep environments separate. Multi-stage is for separating build from runtime, not for encoding configuration differences.

## The CI/CD Payoff

Here's where this gets tangible at scale. Smaller images mean:

- **Faster CI pipelines** — pulling a 200MB image instead of 1.2GB shaves real minutes off every build
- **Cheaper registries** — ECR, GCR, and Docker Hub pricing is storage-based
- **Quicker Kubernetes pod startups** — nodes pull images on first schedule; your 18MB Go binary starts before the 850MB one finishes pulling
- **Smaller attack surface** — fewer packages in the runtime image means fewer CVEs to patch and fewer tools for an attacker to misuse if they get in

A team shipping 20 deploys a day to 3 environments just got a free performance upgrade across the board.

## Go Do It Right Now

Pick one service in your stack. Check its current image size with `docker images`. Then add a two-stage `Dockerfile` — builder and runtime. Rebuild. Check the size again.

If you're not at least 3x smaller, I want to see your Dockerfile because something interesting is happening there.

Multi-stage builds are one of those rare things in software engineering that are strictly better: smaller, faster, more secure, and easier to reason about. There's no tradeoff. There's no "but it works on my machine." There's just the before and after.

Ship the pasta. Leave the kitchen at home.

---

*Found this useful? Try applying it to your heaviest image first — the wins are biggest where the bloat is worst. And if you're already doing multi-stage builds, the next level is [BuildKit's cache mounts](https://docs.docker.com/build/cache/optimize/) for dependency caching across builds.*
