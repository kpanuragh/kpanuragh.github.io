---
title: "🚀 GitHub Actions Caching: Stop Waiting 10 Minutes for a 30-Second Build"
date: 2026-04-16
excerpt: "Your CI pipeline shouldn't feel like waiting for a dial-up modem. Learn how GitHub Actions caching can slash build times from minutes to seconds — with real configs you can steal today."
tags: ["devops", "github-actions", "ci-cd", "productivity"]
featured: true
---

# 🚀 GitHub Actions Caching: Stop Waiting 10 Minutes for a 30-Second Build

Let's be honest. We've all been there.

You push a one-line bug fix. You open the GitHub Actions tab. You watch the spinner. You make coffee. You come back. Still running. You check Twitter. Still running. You question your career choices. *Finally* — green checkmark. Twelve minutes later.

The culprit? Your CI is downloading the entire internet on every single run.

Today we fix that.

## Why Your Pipeline Is Painfully Slow

Most CI pipelines spend the majority of their time doing things that *didn't change* since the last run:

- Installing npm packages that haven't been updated in months
- Downloading Docker base images that are identical to yesterday's
- Compiling dependencies that nobody touched

GitHub Actions has a built-in caching mechanism that can eliminate nearly all of this wasted time. And yet, shockingly, many teams never configure it.

Let's change that.

## The Magic of `actions/cache`

GitHub Actions provides a `cache` action that stores directories between workflow runs and restores them when the cache key matches. Think of it like a really smart `cp` command that works across different CI runs.

The key insight is this: **cache keys are hashes of your dependency lock files**. If `package-lock.json` hasn't changed, neither have your dependencies — so why reinstall them?

Here's a complete, production-ready Node.js workflow with caching:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Cache node_modules
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

Notice the `restore-keys` field — that's your fallback. If the exact cache key doesn't exist (e.g., first run after updating a package), it'll restore the *closest* matching cache instead of starting from scratch. You get partial credit instead of zero.

**Real result:** A project that took 8 minutes to install dependencies now takes 15 seconds on cache hit. That's not a typo.

## Level Up: Caching Docker Layers in Builds

If you're building Docker images in CI, you're probably rebuilding them from scratch every time too. Docker layer caching to the rescue.

Using GitHub's container registry as a cache backend:

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Log in to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Build and push with layer cache
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ghcr.io/${{ github.repository }}:latest
    cache-from: type=registry,ref=ghcr.io/${{ github.repository }}:buildcache
    cache-to: type=registry,ref=ghcr.io/${{ github.repository }}:buildcache,mode=max
```

The `mode=max` flag tells BuildKit to cache *all* layers, not just the final image layers. Your `RUN apt-get install` step? Cached. Your `COPY` and compile steps? Cached. Only the layers that actually changed get rebuilt.

A Docker image that took 6 minutes to build now takes 45 seconds on a warm cache. Your teammates will think you're a wizard.

## The Lesson I Learned the Hard Way

Early in my career, I was proud of a CI pipeline I built. Tests, linting, Docker build, deploy — the works. Ran in about 14 minutes per push.

"That's fine," I told myself. "CI is supposed to take a while."

Then I calculated the cost. 10 developers. Each pushing 5-6 times a day. 14 minutes per run. GitHub Actions charges per minute. At the end of the month, I got a bill that made me physically wince.

After adding dependency caching, Docker layer caching, and parallelizing some steps, we got down to under 3 minutes. Same pipeline. Same tests. 78% cheaper. The CTO bought me lunch.

The lesson: **slow CI isn't just annoying, it's expensive** — in dollars and in developer flow state. Every time a dev has to context-switch while waiting for a build, you lose 10-20 minutes of focused work. Multiply that across your team and it's genuinely significant.

## Bonus: Cache Gotchas to Avoid

A few things that will bite you if you're not careful:

**1. Don't cache things that change frequently.** If your `package.json` changes on every PR, your cache will miss constantly and you'll get zero benefit. Cache only what's stable.

**2. Cache size limits apply.** GitHub gives you 10 GB of cache storage per repository. Caches not accessed in 7 days are evicted. Don't try to cache gigantic artifacts.

**3. Secrets never get cached.** GitHub strips secrets from cache. This is a feature, not a bug — never put credentials in a directory you're caching.

**4. Cross-OS caches don't work.** A cache built on `ubuntu-latest` won't restore on `windows-latest`. Always include `runner.os` in your cache key (as shown in the examples above).

## Your Action Items

Here's what to do today — yes, *today*:

1. Open your slowest GitHub Actions workflow
2. Find the `npm install`, `pip install`, or `go mod download` step
3. Add the appropriate `actions/cache` step before it
4. Push and compare the timing on the next two runs

That's it. You'll have measurable results within the hour, and you'll wonder why you waited so long.

CI/CD should enable fast iteration, not punish it. A pipeline that takes 15 minutes to validate a typo fix is a pipeline that developers learn to fear and avoid. Make your CI fast, and you'll naturally get more commits, smaller PRs, and higher confidence in your codebase.

Now go forth and cache aggressively. Your future self (and your cloud bill) will thank you.

---

*Have a caching win story or a gotcha that burned you? Drop it in the comments — I read every one.*
