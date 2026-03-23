---
title: "Docker Layer Caching: Stop Rebuilding Your Entire Image for a One-Line Change 🐳⚡"
date: "2026-03-12"
excerpt: "Your CI pipeline takes 12 minutes to build a Docker image. 11 of those minutes are installing the same npm packages you installed yesterday. Let's fix that with Docker layer caching."
tags: ["\"devops\"", "\"docker\"", "\"ci-cd\"", "\"github-actions\"", "\"performance\""]
featured: "true"
---

# Docker Layer Caching: Stop Rebuilding Your Entire Image for a One-Line Change 🐳⚡

**True story:** I once watched a developer push a typo fix — one character change in a comment — and then wait 14 minutes for CI to finish building the Docker image. Fourteen minutes. For a typo. In a comment.

When I looked at the Dockerfile, I understood immediately. They were doing this:

```dockerfile
# The Dockerfile of Pain
FROM node:18-alpine
WORKDIR /app
COPY . .          # ← Copies EVERYTHING first
RUN npm install   # ← Then installs all packages
RUN npm run build
```

Every. Single. Build. Installing all packages from scratch. No cache. Just pure, unfiltered waiting. ☕☕☕

**The fix took 30 seconds.** The time savings were enormous. Let me show you.

## How Docker Layers Actually Work 🧅

Docker images are like onions — they're made of layers, and both make you cry when mishandled.

Every instruction in your Dockerfile creates a layer. Docker caches each layer. If the layer's **inputs haven't changed**, Docker reuses the cached version instead of running the command again.

The catch: **if any layer changes, every layer after it gets rebuilt from scratch.**

```dockerfile
FROM node:18-alpine        # Layer 1 - cached (base image)
WORKDIR /app               # Layer 2 - cached
COPY . .                   # Layer 3 - CHANGED (you edited a file!)
RUN npm install            # Layer 4 - rebuilt (previous layer changed)
RUN npm run build          # Layer 5 - rebuilt
```

See the problem? `COPY . .` copies your entire source code. Change one `.js` file and npm install runs again. Every time. Forever.

## The Fix: Order Matters More Than You Think 📋

The golden rule: **put things that change rarely near the top, things that change often near the bottom.**

```dockerfile
# BEFORE: The slow way (14 minutes per build)
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```dockerfile
# AFTER: The fast way (2 minutes per build)
FROM node:18-alpine
WORKDIR /app

# Copy ONLY package files first
COPY package*.json ./

# Install dependencies - this layer is cached until package.json changes!
RUN npm ci --only=production

# NOW copy source code (changes every commit)
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**What changed:** We split `COPY . .` into two steps. Now when you change a source file:
- Layer 1-4 (base, workdir, package.json, npm install) → **cache hit** ✅
- Layer 5+ (source code, build) → rebuilt 🔄

Result: npm install runs only when `package.json` changes. Not on every commit.

**Real numbers from my projects:**
- Before: 12-14 minutes per CI build
- After: 2-3 minutes per CI build
- Same node_modules, same result, 80% less waiting

## GitHub Actions: Persisting Cache Between Runs 🚀

Here's the dirty secret about Docker layer caching in CI: **by default, it doesn't persist between jobs.**

Each GitHub Actions runner is a fresh VM. Your carefully crafted Dockerfile cache? Gone. Every run starts cold.

Unless you use the cache action:

```yaml
# .github/workflows/build.yml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push with cache
        uses: docker/build-push-action@v5
        with:
          context: .
          push: ${{ github.ref == 'refs/heads/main' }}
          tags: myapp:latest
          # ↓ This is the magic part
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

The `type=gha` cache stores Docker build layers in GitHub Actions cache storage. Your second build of the day? Blazing fast. Your 50th build? Still blazing fast.

**Pro tip:** Use `mode=max` to cache all layers including intermediate ones. The default only caches the final image.

## Multi-Stage Builds: Cache the Build, Ship the Result 🏗️

Here's where it gets really powerful. Multi-stage builds let you use a fat build environment but ship a lean production image — and cache each stage independently.

```dockerfile
# Multi-stage Dockerfile with smart caching
FROM node:18-alpine AS deps
WORKDIR /app
# Only package files - cached until deps change
COPY package*.json ./
RUN npm ci

# ----

FROM node:18-alpine AS builder
WORKDIR /app
# Reuse cached deps layer from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ----

# Production image - tiny and secure
FROM node:18-alpine AS production
WORKDIR /app

# Only copy what we need to run
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Run as non-root user (security bonus!)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

**Three stages, three cache layers:**
1. `deps` — rebuilds only when `package.json` changes
2. `builder` — rebuilds only when source code changes
3. `production` — ships a clean image without dev tools, build artifacts, or unnecessary files

**Typical size reduction:** 1.2GB build image → 180MB production image. Your Kubernetes pods thank you.

## Lessons Learned the Hard Way 🔥

**Lesson 1: `.dockerignore` is not optional**

If you don't have a `.dockerignore` file, `COPY . .` copies your `node_modules`, `.git`, `*.log` files, and your entire downloads folder if you accidentally put the project there. Every layer cache invalidates on every build.

```bash
# .dockerignore
node_modules
.git
.gitignore
*.log
.env
.env.*
dist
coverage
.nyc_output
README.md
docker-compose*.yml
Dockerfile*
```

I once spent two hours debugging "why is my Docker image 3GB?" The answer: no `.dockerignore`, and `node_modules` was being copied in before being overwritten by `npm install`. Two copies of node_modules in one image. Beautiful.

**Lesson 2: `npm ci` instead of `npm install` in Docker**

`npm install` can modify `package-lock.json`. That modification invalidates the cache layer. Use `npm ci` — it's deterministic, faster in CI, and won't silently change your lockfile mid-build.

**Lesson 3: Tag your cache properly in CI**

When building for multiple branches, scope your cache keys or branches will pollute each other's caches:

```yaml
cache-from: type=gha,scope=${{ github.ref_name }}
cache-to: type=gha,scope=${{ github.ref_name }},mode=max
```

## The Bottom Line 💡

Docker layer caching isn't magic — it's just understanding that Docker is lazy in the best possible way. It will happily skip work it's already done. Your job is to structure your Dockerfile so that "work already done" covers as much ground as possible.

**The checklist:**
- ✅ Copy dependency files (`package.json`, `requirements.txt`, `go.mod`) before source code
- ✅ Add a `.dockerignore` file — seriously, do it right now
- ✅ Use `npm ci` / `pip install --no-cache-dir` / equivalent locked installs
- ✅ Use multi-stage builds to separate build and runtime environments
- ✅ Use `cache-from` / `cache-to` in your CI config to persist cache between runs
- ✅ Order Dockerfile layers from least-changed to most-changed

A 14-minute build becoming a 2-minute build isn't just a developer quality-of-life win. It's faster feedback on PRs, faster deploys to production, and lower CI bill. Every minute you shave off the build is a minute 10 developers don't wait, multiplied by every push, every day, forever.

## Your Action Plan 🚀

**Today (takes 10 minutes):**
1. Look at your Dockerfile — does `COPY . .` come before `RUN npm install`? Fix it.
2. Check if you have a `.dockerignore` — create one if not.
3. Swap `npm install` for `npm ci`.

**This week:**
1. Add `cache-from` / `cache-to` to your GitHub Actions workflow.
2. Convert to multi-stage builds if you aren't already.
3. Measure the before/after build times and send the diff to your manager. They'll love it.

**This month:**
1. Audit all your Dockerfiles across projects.
2. Set up a build time dashboard (GitHub Actions gives you this for free in the workflow summary).
3. Document your Dockerfile patterns in a team wiki so new engineers don't reinvent the pain wheel.

---

**Still waiting 14 minutes for Docker builds?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk about what your Dockerfile looks like — I promise it's fixable.

**Want to see real Dockerfiles from production?** Check out my [GitHub](https://github.com/kpanuragh) for examples that actually work in CI.

*Now go restructure those Dockerfiles. Your future self will thank you.* ⚡🐳

---

**P.S.** The developer with the 14-minute typo fix? After the Dockerfile reorder, their next build took 90 seconds. They sent me a gif of someone doing a happy dance. Worth it.

**P.P.S.** If you're on GitLab CI, the equivalent is `--cache-from` in your `docker build` command with the registry as the cache source. Same concept, slightly different syntax. The layer order rules are identical.
