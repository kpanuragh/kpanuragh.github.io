---
title: "Docker Layer Caching: Why Your 10-Minute CI Builds Are Your Own Fault 🐳⚡"
date: "2026-02-27"
excerpt: "After countless deployments watching CI pipelines crawl, I finally learned what Docker's layer cache actually is — and how one misplaced COPY instruction was costing us 8 minutes on every single push. Here's how to stop throwing money at slow builds."
tags: ["\\\"devops\\\"", "\\\"docker\\\"", "\\\"ci-cd\\\"", "\\\"deployment\\\"", "\\\"performance\\\""]
featured: "true"
---

# Docker Layer Caching: Why Your 10-Minute CI Builds Are Your Own Fault 🐳⚡

**True story:** Our Node.js API had a CI pipeline that took 11 minutes to build. Eleven minutes. Every push. `npm install` alone was eating 7 of those minutes, reinstalling 800 packages that hadn't changed since last Tuesday.

I'd been living with it for two months. "Docker builds are just slow," I told myself. "It's the npm registry. It's the internet. It's Mercury retrograde."

Then I moved one line in the Dockerfile. Eleven minutes became three minutes. That one line change saved our team roughly 40 minutes of CI time per day.

Docker taught me the hard way: slow builds aren't Docker's fault. They're yours. And mine.

## How Docker's Layer Cache Actually Works 🧠

Every instruction in a Dockerfile creates a **layer**. Think of layers like pancakes stacked on top of each other. When you rebuild an image, Docker checks each layer from top to bottom and asks: "has anything changed?"

If the answer is **no** → use the cached layer. Takes milliseconds.
If the answer is **yes** → rebuild this layer AND every layer below it. Takes forever.

This is the key insight that changes everything:

> **Once a layer is invalidated, all subsequent layers are also invalidated.**

```
Layer 1: FROM node:20-alpine    → almost never changes ✅ cached
Layer 2: WORKDIR /app           → never changes ✅ cached
Layer 3: COPY . .               → changes on EVERY PUSH ❌ invalidates everything!
Layer 4: RUN npm install        → must reinstall because layer 3 changed 💀
Layer 5: RUN npm run build      → must rebuild because layer 4 changed 💀
```

See the problem? `COPY . .` copies your entire source directory — which changes every time you touch a single `.js` file. And it's sitting right before `npm install`, so npm reinstalls everything on every push.

## The Before: The Dockerfile That Was Slowly Killing Us 💀

This is almost exactly what we had:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# The one line that ruined everything 👇
COPY . .

RUN npm install

RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**What happens on every push:**

```
Step 1/7: FROM node:20-alpine    → ✅ CACHED (0.0s)
Step 2/7: WORKDIR /app           → ✅ CACHED (0.0s)
Step 3/7: COPY . .               → ❌ CHANGED (0.1s)
Step 4/7: RUN npm install        → ❌ REINSTALLING 847 PACKAGES (6m 42s) 😭
Step 5/7: RUN npm run build      → ❌ REBUILDING (1m 15s)
Step 6/7: EXPOSE 3000            → ❌ (0.0s)
Step 7/7: CMD                    → ❌ (0.0s)

Total: 8+ minutes. Every. Single. Push.
```

I fixed an 8-character typo in a comment and waited 8 minutes for CI. Eight minutes for a comment fix.

## The After: Same App, Three Times Faster ⚡

The fix is embarrassingly simple — copy your dependency manifests first, install, THEN copy your source code:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Step 1: Copy ONLY the dependency files 👇
COPY package.json package-lock.json ./

# Step 2: Install — only reruns if package.json changed
RUN npm ci --only=production

# Step 3: THEN copy your source code
COPY . .

RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Same push, different story:**

```
Step 1/8: FROM node:20-alpine          → ✅ CACHED (0.0s)
Step 2/8: WORKDIR /app                 → ✅ CACHED (0.0s)
Step 3/8: COPY package*.json ./        → ✅ CACHED (0.0s) ← didn't change!
Step 4/8: RUN npm ci --only=production → ✅ CACHED (0.0s) ← didn't change!
Step 5/8: COPY . .                     → ❌ CHANGED (0.1s)
Step 6/8: RUN npm run build            → ❌ REBUILDING (1m 15s)
Step 7/8: EXPOSE 3000                  → ❌ (0.0s)
Step 8/8: CMD                          → ❌ (0.0s)

Total: ~1m 30s. Same code change. 6 minutes saved. 🎉
```

The package.json didn't change, so npm install is cached. The only work Docker does is rebuilding the TypeScript. Beautiful.

## The Rule: Copy What Changes Least, First 📋

Think of it like packing a suitcase for a trip you take every week. You don't repack your toiletries from scratch each time — you leave the bag packed and only swap out the clothes.

```dockerfile
# SLOW — copies everything, reinstalls every time
COPY . .
RUN npm install

# FAST — copies manifests first, installs only when they change
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
```

**The golden rule:** Sort your Dockerfile instructions from **least frequently changing** to **most frequently changing**.

| Instruction | How often it changes | Should be... |
|---|---|---|
| `FROM node:20-alpine` | Rarely | First |
| `RUN apt-get install` | Rarely | Early |
| `COPY package*.json ./` | When deps change | Middle |
| `RUN npm ci` | When deps change | After manifests |
| `COPY . .` | Every commit | Late |
| `RUN npm run build` | Every commit | Late |

## The .dockerignore: Your Secret Weapon 🔥

Here's a subtle killer: even if you move `COPY . .` to the right place, Docker still invalidates the layer every time any file in your build context changes — including `node_modules`, build artifacts, `.git`, test results, and your entire local dev environment.

Without a `.dockerignore`, Docker sends your 500MB `node_modules` to the build context on every single build.

```bash
# .dockerignore — add this to EVERY project
node_modules
.git
.gitignore
*.md
*.log
dist
build
coverage
.nyc_output
.env
.env.*
docker-compose*.yml
.DS_Store
```

**What this does:**
- Prevents `node_modules` from being copied into the image (you're installing fresh anyway)
- Stops `.git` history from inflating your build context
- Keeps `dist` out so it doesn't accidentally shadow your build step
- Makes `COPY . .` much faster — only sends real source files

After adding `.dockerignore`, I watched our build context shrink from 650MB to 2MB. The COPY step went from 4 seconds to under 1 second.

## BuildKit Cache Mounts: The Nuclear Option 🚀

If you're using Docker BuildKit (you should be — it's been the default since Docker 23.0), there's an even more powerful caching tool: `--mount=type=cache`.

This creates a persistent cache directory that survives across builds, even when the layer itself is rebuilt:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

# Mount the npm cache directory — persists between builds!
RUN --mount=type=cache,target=/root/.npm \
    npm ci --cache /root/.npm

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**Why this is magic:**

Without cache mount: when `package.json` changes, npm downloads every package fresh from the registry.

With cache mount: when `package.json` changes, npm downloads only the *new or updated* packages. Everything that was previously downloaded is already in `/root/.npm`. It's like having your own local npm mirror.

For a project with 800 packages, this can turn a "new dependencies" build from 7 minutes to under 2 minutes.

**For Laravel/PHP projects:**

```dockerfile
# syntax=docker/dockerfile:1
FROM php:8.3-fpm-alpine

WORKDIR /var/www

COPY composer.json composer.lock ./

RUN --mount=type=cache,target=/root/.composer \
    composer install --no-dev --optimize-autoloader

COPY . .
RUN php artisan optimize
```

## In CI/CD: Making It Actually Fast 🤖

The layer cache lives on your build machine. In GitHub Actions, the build machine is ephemeral — spun up fresh for every run. Your cache dies with it.

The fix: use Docker's `--cache-from` with a registry to persist the cache between CI runs:

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Log in to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build with registry cache
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/api:${{ github.sha }}
          # Pull previous image as cache source 👇
          cache-from: type=registry,ref=${{ secrets.ECR_REGISTRY }}/api:cache
          # Push updated cache back to registry 👇
          cache-to: type=registry,ref=${{ secrets.ECR_REGISTRY }}/api:cache,mode=max
```

**What `mode=max` does:** Exports cache layers for ALL intermediate build stages, not just the final image. For multi-stage builds, this means your `RUN npm ci` cache is saved even if it's in a throwaway build stage.

A CI/CD pipeline that saved our team: after I set this up, we went from 11-minute cold builds to under 3 minutes warm. The pipeline was pulling our base layers from ECR instead of rebuilding them from scratch. Saved money on compute, saved developers from going for coffee every time they pushed.

## Common Mistakes That Kill Your Cache 🚨

**Mistake #1: ARG before RUN**

```dockerfile
# Bad — ARG changes invalidate the cache for everything below
ARG VERSION=1.0.0
RUN npm ci  # Cache invalidated if VERSION changes

# Good — put ARGs as late as possible
RUN npm ci
ARG VERSION=1.0.0
LABEL version="${VERSION}"
```

**Mistake #2: `RUN apt-get update` without pinning versions**

```dockerfile
# Bad — same command, different results over time (apt updates daily)
RUN apt-get update && apt-get install -y curl

# Better — pin the package or combine with actual installs so cache is appropriate
RUN apt-get update && apt-get install -y curl=7.88.1-10 \
    && rm -rf /var/lib/apt/lists/*
```

**Mistake #3: Copying config files that change often, early**

```dockerfile
# Bad — config changes invalidate the npm install layer
COPY . .           # includes .eslintrc, tsconfig.json, jest.config.js
RUN npm ci

# Good — only copy manifests before install
COPY package*.json ./
RUN npm ci
COPY . .           # config files come after install
```

## Before vs After: What Changed for Us 📊

| Metric | Before | After |
|---|---|---|
| Cold build (new machine) | 11m 20s | 11m 20s (same — cold is cold) |
| Warm build (source change) | 11m 20s | 1m 45s |
| Warm build (deps change) | 11m 20s | 4m 10s |
| CI compute cost/month | ~$180 | ~$45 |
| Developer wait time/day | 40-50 min | 8-12 min |
| Times I lied about cache being "just slow" | Countless | 0 |

That `~$135/month` saving didn't require a new tool, a new service, or a team meeting. It required understanding 10 lines of Dockerfile ordering.

## TL;DR ✅

- Docker caches layers from top to bottom — once a layer changes, **all subsequent layers rebuild**
- **Copy dependency manifests first, install, then copy source** — this is the single most impactful change
- Add a **`.dockerignore`** to keep your build context small and your COPY layers stable
- Use **`--mount=type=cache`** for package manager caches that survive reinstalls
- In CI, use **registry-based cache** with `cache-from` and `cache-to` so the ephemeral build machine benefits from previous runs
- Put **ARG instructions as late as possible** — they're cache busters
- Slow Docker builds are usually a Dockerfile ordering problem, not a Docker problem

After countless deployments, the lesson I keep relearning is that slow CI is a choice you're making in your Dockerfile. The cache is there. It's incredibly powerful. You just have to stop fighting it.

Go check your Dockerfile right now. Is `COPY . .` above your install step? You're welcome.

---

**Optimized a slow pipeline recently?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love comparing deploy war stories.

**Want to see real Dockerfiles?** Check my [GitHub](https://github.com/kpanuragh) — every project has a `.dockerignore` and properly ordered layers now. Learn from my past mistakes so you don't have to make them yourself.

*If your `npm install` is running on every CI push, close this tab and go fix your Dockerfile. I'll still be here when you get back.* 🐳⚡
