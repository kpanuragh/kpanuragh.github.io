---
title: "🚀 GitHub Actions Caching: Stop Watching the Progress Bar Spin"
date: 2026-05-17
excerpt: "Your CI pipeline takes 12 minutes to install npm packages every single run. There's a better way — and it won't require a PhD in DevOps."
tags: ["devops", "github-actions", "ci-cd", "performance"]
featured: true
---

# 🚀 GitHub Actions Caching: Stop Watching the Progress Bar Spin

We've all been there. You push a tiny one-line bug fix, open a coffee, watch the GitHub Actions run tick from 0%… 2%… 4%… and then the Slack notification rolls in from your teammate: *"Is CI broken again?"*

No. CI is not broken. It's just spending eight of your twelve minutes downloading the same `node_modules` folder it downloaded yesterday. And the day before. And every day for the past six months.

This is the DevOps equivalent of re-reading the entire instruction manual before using your microwave each morning.

Let's fix it.

---

## Why Caching Matters (More Than You Think)

GitHub Actions runs every job in a fresh, ephemeral VM. That's great for reproducibility — but terrible for your patience and your bill. Every minute of CI time costs money, and every install step is burning both.

Here's a real-world baseline from a medium-sized Node.js project:

| Step | Without Cache | With Cache |
|---|---|---|
| `npm ci` | 4m 30s | 12s |
| Docker layer pulls | 3m 15s | 40s |
| Total pipeline | 11m 20s | 3m 10s |

That's **8 minutes saved per run**. If your team pushes 20 times a day, that's 2.5 hours of human (and machine) time handed back to you daily. Go touch grass. Or write more features. Your call.

---

## The Basics: Caching npm Dependencies

The `actions/cache` action is your best friend here. The key is generating a cache key from your lockfile so the cache automatically busts when your dependencies actually change.

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'          # <-- built-in shorthand, does the heavy lifting

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

The `cache: 'npm'` option on `setup-node` is the lazy (smart) path. It automatically caches `~/.npm` using `package-lock.json` as the cache key. Change the lockfile → new cache. Same lockfile → cache hit. Elegant.

But what if you need more control? Maybe you're caching a custom tool, build artifacts, or you're not using Node at all?

---

## Going Deeper: Manual Cache Control

Here's a more explicit setup using `actions/cache` directly, which gives you full control over paths and key strategies:

```yaml
- name: Cache node_modules
  uses: actions/cache@v4
  id: npm-cache
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-npm-

- name: Install dependencies
  if: steps.npm-cache.outputs.cache-hit != 'true'
  run: npm ci
```

A few things worth calling out here:

**The `key`** uses `hashFiles` to fingerprint your lockfile. The moment you `npm install` something new, the hash changes, the old cache is bypassed, and a fresh one is saved at the end of the run.

**The `restore-keys`** is your fallback. If the exact key isn't found, GitHub will grab the most recent cache that starts with `${{ runner.os }}-npm-`. This is called a *partial cache restore* — you still get most of your packages cached, and only the new additions get downloaded. Much better than starting cold.

**The `if:` condition** skips the install entirely on a full cache hit. Zero network calls. Maximum smugness.

---

## Real-World Lesson: The Cache Poisoning Trap

Here's something that'll bite you eventually: **don't cache your `node_modules` directory directly**.

```yaml
# ❌ Don't do this
path: node_modules
key: ${{ runner.os }}-node-modules-${{ hashFiles('package-lock.json') }}
```

Why? Native addons (like `bcrypt`, `sharp`, or `canvas`) get compiled for the host OS during install. If you cache the compiled binaries and GitHub switches your runner from one Ubuntu patch to another, you'll get cryptic runtime errors that have nothing to do with your code. 

Cache `~/.npm` (the download cache) instead, and let `npm ci` do the linking step locally. It's fast because the tarballs are already there — and the compilation is always fresh for the current environment.

The lesson: **cache the inputs, not the outputs** when the outputs depend on the environment.

---

## Bonus: Caching Docker Layers in Your Workflow

If your pipeline builds Docker images, you're probably pulling the same base layers on every run. GitHub's `docker/build-push-action` has first-class support for layer caching via the GitHub Actions cache backend:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`type=gha` tells BuildKit to use GitHub Actions cache as the layer store. `mode=max` caches every layer, not just the final one. The result: if only your app code changed and your `apt-get` layer is identical, that layer is restored from cache in seconds.

The first run after adding this will feel slow — it's warming the cache. The second run will make you smile.

---

## Quick Wins Checklist

Before you call it done, run through these:

- [ ] Are you caching your package manager's download cache (`~/.npm`, `~/.cache/pip`, `~/.gradle/caches`)?
- [ ] Is your cache key based on a **lockfile hash**, not a date or branch name?
- [ ] Do you have `restore-keys` for partial cache fallback?
- [ ] Are you using `cache: 'npm'` / `cache: 'pip'` built-ins where available? They're well-maintained and handle edge cases.
- [ ] Are Docker image builds using `cache-from: type=gha`?

---

## The Takeaway

Slow CI is a tax on developer happiness. Every minute your engineers spend watching a spinner is a minute they're not in flow, not shipping, and probably opening Twitter instead.

GitHub Actions caching is one of the highest ROI improvements you can make to your pipeline with almost zero risk. It takes 15 minutes to set up and pays dividends every single day.

Go cache something. Your future self (and your colleagues) will thank you.

---

*Have a caching war story — a key collision, a poisoned cache, a partial restore that saved your deploy? Drop it in the comments. The DevOps struggle is real and shared.*
