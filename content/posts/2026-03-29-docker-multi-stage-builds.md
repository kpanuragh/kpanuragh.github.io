---
title: "🐳 Docker Multi-Stage Builds: Stop Shipping Your Entire Toolchain to Production"
date: 2026-03-29
excerpt: "Your Docker image doesn't need gcc, npm, and the entire internet to run a Node.js app. Multi-stage builds let you build fat, ship lean — here's how to stop deploying a 1.2GB monster when 80MB will do."
tags: ["docker", "devops", "containers", "best-practices", "ci-cd"]
featured: true
---

Let me paint you a picture. You've just containerized your shiny new Node.js API. You run `docker images` and see this:

```
my-api    latest    a3f9b2c1d4e5    2 minutes ago    1.24GB
```

**1.24 gigabytes.** For a REST API that does three things. Your production server is now lugging around webpack, TypeScript, all of `node_modules` (including the dev ones), and probably the ghost of `left-pad` somewhere in there.

This is where Docker multi-stage builds walk in, crack their knuckles, and say *"I've got you."*

## What Are Multi-Stage Builds, Anyway?

The core idea is dead simple: use multiple `FROM` statements in a single Dockerfile. Each `FROM` starts a fresh image layer — a new "stage." You can copy artifacts *from* earlier stages into later ones, leaving behind all the build junk you don't need at runtime.

Think of it like baking bread. You need a mixer, a bowl, measuring cups, and your oven. But when you put the bread on the table, you don't also put the mixer there. You just serve the bread.

Multi-stage builds let you **build** with everything, but **ship** only the finished loaf.

## A Tale of Two Dockerfiles

Here's a typical before-and-after for a Node.js + TypeScript app.

**The naive Dockerfile (the 1.2GB monster):**

```dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install          # installs ALL deps, including devDependencies

COPY . .
RUN npm run build        # compiles TypeScript → JavaScript

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

This image contains: Node.js, npm, all your dev dependencies, TypeScript, ts-node, your source `.ts` files, and the compiled output. Most of that is dead weight at runtime.

**The multi-stage Dockerfile (the lean machine):**

```dockerfile
# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci                        # clean install with lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build                 # compile TypeScript → dist/


# ---- Stage 2: Production ----
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev             # only production dependencies

COPY --from=builder /app/dist ./dist   # grab compiled output from Stage 1

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The final image only contains: the Alpine base, production `node_modules`, and your compiled `dist/` folder. The `builder` stage evaporates entirely — it never makes it into the pushed image.

**Result?** You just went from 1.24GB to ~120MB. That's a 90% reduction. Your CI pipeline just got faster, your pulls are snappier, and your attack surface shrank dramatically because there's no compiler or build tooling sitting in production waiting to be exploited.

## The Real-World Lessons (Learned the Hard Way)

**1. Use `npm ci` instead of `npm install` in Docker.**
`npm ci` installs exactly what's in your lockfile and fails loudly if something's off. It's deterministic, faster in CI, and won't silently upgrade anything. Your 3am self will thank you.

**2. Order your COPY statements to maximize layer caching.**
Always copy `package*.json` and run `npm ci` *before* copying your source code. Your source changes constantly; your dependencies don't. If you flip the order, Docker invalidates the install cache on every single code change. This is the #1 Dockerfile mistake I see.

**3. Name your stages.**
`AS builder`, `AS production`, `AS tester` — named stages let you target them specifically. You can run `docker build --target builder .` to get a debug image with all the tools intact. Super handy when you're hunting down a build-time issue.

**4. Alpine isn't always the answer.**
`node:20-alpine` is tiny and great for many apps, but Alpine uses `musl libc` instead of `glibc`. Some native Node modules get grumpy about this. If you hit weird runtime errors with native addons, try `node:20-slim` (Debian-based, still much smaller than full Debian) before you start digging into yak-shaving territory.

## Bonus: Targeting Stages in CI

One underused trick — you can use stage targeting in your CI/CD pipeline to run tests in the builder stage (where dev tools exist) before producing the lean production image:

```yaml
# GitHub Actions snippet
- name: Build and test
  run: |
    docker build --target builder -t my-api:test .
    docker run --rm my-api:test npm test

- name: Build production image
  run: docker build --target production -t my-api:latest .
```

Tests run in the fat image with all the dev tooling. Production gets shipped as the lean image. Best of both worlds, zero compromise.

## The Payoff

Multi-stage builds aren't a micro-optimization — they're table stakes for production Docker work. Smaller images mean:

- **Faster CI/CD pipelines** (less data to push/pull)
- **Quicker container startup** (less filesystem overhead)
- **Reduced attack surface** (no compilers, no package managers sitting idle)
- **Lower storage costs** in your container registry

That 1.2GB image you've been living with? It's costing you in ways you might not even be measuring yet.

---

**Give it a try this week.** Take one of your existing Dockerfiles, add a second `FROM` stage, and see what the final image size looks like. I'd be shocked if you don't cut it by at least 50%.

If you're already doing multi-stage builds and want to go deeper, look into [BuildKit's cache mounts](https://docs.docker.com/build/cache/optimize/) (`--mount=type=cache`) — they're the next level for making builds ludicrously fast.

Drop a comment or reach out on Twitter/X if you've got a particularly gnarly Dockerfile you want to tame. We can nerd out about it. 🐳
