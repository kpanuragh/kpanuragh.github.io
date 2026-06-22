---
title: "🧅 Layer Order Matters: Stop Rebuilding Your Entire Docker Image on Every Commit"
date: "2026-06-22"
excerpt: "Your CI pipeline rebuilds a 2GB image from scratch every time someone fixes a typo. Here's how intelligent layer ordering turns a 4-minute build into a 20-second one."
tags:
  - docker
  - containers
  - ci-cd
  - devops
  - performance
featured: true
---

Every developer has stared at a CI build log scrolling past `npm install`... `pip install`... `bundle install`... for the fourth time in ten minutes. You pushed a one-line fix. You are watching 847 packages download from the internet. Again.

This is a solved problem. And the solution has been sitting in Docker's documentation since 2013. We just keep ignoring it.

## How Docker Layer Caching Actually Works

Every instruction in a Dockerfile creates a layer — a diff snapshot on top of the previous one. Docker caches each layer using a hash of its inputs: the instruction text, the files it copies, and the parent layer hash.

When a layer's hash changes, **every subsequent layer is invalidated**. Cache miss on layer 4 means layers 5 through 40 all rebuild. This is the trap most Dockerfiles fall into.

Here's the classic mistake I see on almost every new project at Cubet:

```dockerfile
# ❌ The "I'll fix it later" Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy everything first
COPY . .

# Then install deps
RUN npm ci

RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Looks harmless. The problem: that `COPY . .` copies your entire source tree — including `src/`, `tests/`, `.env.example`, and the file you just changed. **Any code change invalidates the dependency install layer.** You're downloading `node_modules` on every push.

## The Golden Rule: Stable Things First, Volatile Things Last

Think of your Dockerfile as a sorted list by change frequency:

1. Base image — changes almost never
2. System dependencies — changes rarely  
3. Package manifests (`package.json`, `requirements.txt`) — changes occasionally
4. Application source code — changes constantly

Copy only what's needed for each step, in that order:

```dockerfile
# ✅ Cache-aware Dockerfile
FROM node:20-alpine
WORKDIR /app

# Layer 1: system deps (rarely changes)
RUN apk add --no-cache curl

# Layer 2: only the manifest files (changes when you add/remove packages)
COPY package.json package-lock.json ./

# Layer 3: install deps (cache hit as long as manifests haven't changed)
RUN npm ci --only=production

# Layer 4: source code (changes every commit — fine, it's fast now)
COPY src/ ./src/
COPY tsconfig.json ./

RUN npm run build

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Now when you fix a typo in `src/routes/users.ts`, Docker replays layers 1–3 from cache in milliseconds and only re-runs the final `COPY` and `build` step. A 4-minute build becomes 20 seconds.

## Multi-Stage Builds Amplify the Effect

Cache efficiency compounds when you combine it with multi-stage builds. The pattern is: build dependencies once in a heavy image, copy only the artifacts to a lean runtime image.

```dockerfile
# Stage 1: builder — all the heavy lifting, cache-friendly
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci                          # cached unless lockfile changes

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build                   # only reruns when source changes

# Stage 2: runtime — tiny, no build tools, no node_modules bloat
FROM node:20-alpine AS runtime
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production        # separate cache key for prod-only install

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Your final image doesn't contain TypeScript, build tools, or dev dependencies. The builder stage caches its dependency install separately from the runtime stage. Two cache pools, double the efficiency.

## The `COPY` Glob Trap

Here's a subtlety that burns people regularly. This looks like it only copies JSON files:

```dockerfile
COPY *.json ./
```

But if your repo root contains `generated-schema.json` that regenerates on every CI run, this `COPY` instruction changes on every build — even though `package.json` didn't. The hash is computed over all matched files.

Be explicit:

```dockerfile
COPY package.json package-lock.json tsconfig.json ./
```

Name the files. The extra typing is worth it. Similarly, use `.dockerignore` aggressively to keep noisy files out of the build context entirely:

```
# .dockerignore
.git
node_modules
dist
out
coverage
*.log
.env*
```

Without `.dockerignore`, Docker sends your entire repo — including `.git` history and `node_modules` — to the daemon as build context. That transfer alone can add seconds before a single layer runs.

## CI-Specific: Registry Caching

Local layer caching disappears when your CI runner is ephemeral (which most are). The fix is `--cache-from` with a registry:

```yaml
# GitHub Actions example
- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myrepo/myapp:latest
    cache-from: type=registry,ref=myrepo/myapp:buildcache
    cache-to: type=registry,ref=myrepo/myapp:buildcache,mode=max
```

`mode=max` exports all intermediate layers to the registry, not just the final image. When the next CI job starts on a clean runner, it pulls those intermediate layers and gets full cache hit behavior.

We set this up across most of our Docker-based pipelines at Cubet and the cold-runner build time dropped from ~5 minutes to under a minute for services with stable dependency manifests.

## Quick Checklist

Before your next Dockerfile commit, run through this:

- [ ] Package manifests are `COPY`d before source code
- [ ] `.dockerignore` exists and excludes `.git`, `node_modules`, build outputs
- [ ] Multi-stage build separates build tools from runtime
- [ ] No `COPY . .` before an expensive `RUN` step
- [ ] CI pipeline uses `--cache-from` with a registry backend
- [ ] Individual files are named in `COPY` rather than broad globs when order matters

The container you ship doesn't care about layer order — it runs the same either way. But your team's iteration speed absolutely does. Ten developers pushing several times a day, each waiting 4 minutes instead of 20 seconds: that's over an hour of lost productivity daily, silently burned in CI.

Layer ordering is unglamorous infrastructure work. No one puts it on a roadmap. But the day you fix it, everyone quietly notices their builds got fast.

---

*Is your Dockerfile still copying everything before installing deps? Pick one service, apply the pattern above, and time the before and after. Drop the results in the comments — I'm curious how much variance there is across stacks.*
