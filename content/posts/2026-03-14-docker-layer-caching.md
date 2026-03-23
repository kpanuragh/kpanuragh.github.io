---
title: "🐳 Docker Layer Caching: Stop Waiting 10 Minutes for Your CI to Install npm"
date: "2026-03-14"
excerpt: "Your Docker builds are slow because you're doing it wrong. Here's how layer caching actually works — and how to make your CI builds go from 10 minutes to 90 seconds."
tags: ["\\\"docker\\\"", "\\\"devops\\\"", "\\\"ci-cd\\\"", "\\\"performance\\\"", "\\\"containers\\\""]
featured: "true"
---

You push a one-line bug fix. You open GitHub Actions. You watch the CI pipeline install 847 npm packages. Again. For the fourth time today.

Sound familiar? Yeah. We've all been there, refreshing the build log like it'll somehow make `node_modules` download faster if we just *believe hard enough*.

The culprit is almost always Docker layer caching — or rather, the complete absence of it. The good news: once you understand how caching works, you can cut your build times dramatically. The bad news: you've probably been writing Dockerfiles wrong this whole time.

Let's fix that.

## How Docker Layers Actually Work

Every instruction in your Dockerfile (`RUN`, `COPY`, `ADD`, etc.) creates a new layer. Docker caches these layers, and if nothing has changed in a layer or anything *before* it, Docker reuses the cached version instead of rebuilding it.

The catch? Cache invalidation is sequential. The moment one layer changes, **every layer after it gets rebuilt from scratch**.

Here's a Dockerfile that most people write:

```dockerfile
# ❌ The "why is CI so slow" Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY . .

RUN npm install

RUN npm run build

CMD ["node", "dist/index.js"]
```

This looks fine. It is not fine.

Every single time you change *any* file — a comment in `App.tsx`, a typo fix, literally anything — the `COPY . .` layer invalidates, which means `npm install` runs again. All 847 packages. Every. Single. Time.

## The Fix: Order Layers by How Often They Change

The golden rule of Dockerfile optimization is **put things that change rarely at the top, things that change often at the bottom**.

Your `package.json` doesn't change on every commit. Your source code does. So copy them separately:

```dockerfile
# ✅ The "I understand caching now" Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first — these change rarely
COPY package.json package-lock.json ./

# Install dependencies — only reruns when package files change
RUN npm ci

# Now copy source code — this changes often, but it's AFTER the install
COPY . .

RUN npm run build

CMD ["node", "dist/index.js"]
```

That's it. That's the whole trick. Now `npm install` only re-runs when you actually change your dependencies. A routine code change goes from reinstalling everything to just copying files and running the build — often 5-10x faster.

## Taking It Further with BuildKit and GitHub Actions

If you're running builds in CI, you want to go one step further: persist the Docker layer cache *between* pipeline runs. Otherwise, every fresh CI runner starts from zero.

GitHub Actions makes this surprisingly easy with the `docker/build-push-action`:

```yaml
# .github/workflows/build.yml
name: Build and Push

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          # This is the magic — cache layers in GitHub's cache storage
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`type=gha` stores your Docker layer cache in GitHub Actions Cache, which persists between runs. Combined with the well-ordered Dockerfile above, your CI goes from "time to get coffee" to "done before I switch tabs."

## Real-World Lessons Learned (The Hard Way)

**Lesson 1: `COPY . .` is a time bomb.** I once spent an afternoon debugging why a "trivial" CI change was blowing up build times. Turned out someone had added a `COPY . .` early in the Dockerfile to make the path resolution easier. Every build was invalidating every subsequent cache layer. One reorder fixed it.

**Lesson 2: `.dockerignore` is not optional.** Without it, your `COPY . .` drags in `node_modules`, `.git`, `.env` files, and whatever else is sitting in your project root. Use a `.dockerignore` that mirrors your `.gitignore` at minimum. Your images will be smaller, and your cache will be more stable.

**Lesson 3: Multi-stage builds are your best friend.** If you're shipping a compiled artifact (Go binary, compiled frontend), use multi-stage builds. Your final image doesn't need the compiler, the test runner, or the build dependencies. Keep it lean.

**Lesson 4: `npm install` vs `npm ci` matters.** In a Dockerfile, always use `npm ci` instead of `npm install`. It's faster, it's deterministic, and it respects your lockfile exactly. `npm install` can subtly update things and — more importantly — its caching behavior is less predictable.

## The 90-Second Build

After applying these patterns to a real mid-sized Node.js service, here's what the numbers looked like:

- **Before:** ~9 minutes (npm install on every build)
- **After layer reordering:** ~3 minutes (npm install only on dependency changes)
- **After GHA cache:** ~75 seconds (most layers cached between runs)

That's a 7x improvement from two config changes and a better understanding of how Docker works. Not bad for an afternoon.

## Where to Go From Here

If your builds are still slow after fixing layer ordering, look at:

- **Multi-stage builds** to separate build and runtime environments
- **Base image selection** — `alpine` variants are smaller but can be slower to build due to musl libc edge cases; `slim` variants often hit the sweet spot
- **Remote caching** with a registry (like AWS ECR or GitHub Container Registry) for teams sharing build caches across machines

The rabbit hole goes deep, but you'll get 80% of the benefit from the basics: order your layers, copy dependencies before source, and persist your cache in CI.

Now go push that one-line bug fix. It should be done before you finish reading this sentence.

---

*Got a Docker build horror story or a caching trick I missed? I'd love to hear it — reach out on [GitHub](https://github.com/kpanuragh) or drop it in the comments below.*
