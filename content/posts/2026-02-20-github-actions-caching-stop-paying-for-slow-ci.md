---
title: "GitHub Actions Caching: Stop Paying to Download the Same 500MB Every Single Build 🏎️"
date: "2026-02-20"
excerpt: "Your CI pipeline downloads node_modules from scratch on every push and you're wondering why builds take 12 minutes. After burning through GitHub Actions minutes on avoidable downloads, here's the caching setup that cut our build times by 70%."
tags: ["devops", "github-actions", "ci-cd", "performance"]
featured: true
---

# GitHub Actions Caching: Stop Paying to Download the Same 500MB Every Single Build 🏎️

Let me paint you a picture. You push a one-line bug fix. You wait. And wait. GitHub Actions is downloading `node_modules`. All 400MB of it. Again. For the 47th time today across your team's pushes.

Meanwhile, your free GitHub Actions minutes are evaporating like water on a hot sidewalk.

I've been there. We had a monorepo CI pipeline that took **14 minutes** per push. Developers were pushing, grabbing coffee, checking Twitter, and *still* waiting. After digging into the run logs, the breakdown was brutal:

- 2 min — actual test execution
- 1 min — build
- **11 minutes — downloading dependencies. Every. Single. Time.**

The fix? GitHub Actions caching. Here's what I learned the hard way so you don't have to.

## Why Your CI Is Slow (Spoiler: It's the Downloads) 🐌

Without caching, every workflow run starts with a blank slate. Fresh runner, empty disk. Your workflow dutifully reinstalls everything from the internet:

```yaml
# The naive workflow that's killing your build times
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci  # Downloads 400MB from npm. Again. 😢

      - name: Run tests
        run: npm test
```

This works. It's just *expensive*. Every push triggers a fresh download from npm's servers. 50 pushes a day on a team of 5? That's 50 × 400MB = **20GB of bandwidth** burned on packages that haven't changed.

## The Fix: `actions/cache` 🚀

GitHub gives you a caching layer that persists between runs. The key insight: **cache based on your lockfile**. If `package-lock.json` hasn't changed, the dependencies haven't changed — skip the download.

```yaml
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
        id: npm-cache
        with:
          path: ~/.npm          # npm's global cache directory
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install dependencies
        run: npm ci  # Uses cache if hit, downloads if miss

      - name: Run tests
        run: npm test
```

The magic is in the `key`. It's a hash of your lockfile — change a dependency, get a fresh cache. Otherwise, `npm ci` reads from the local cache instead of the internet.

**Result on our project:** 11-minute installs → 45-second cache restores. That's not a typo.

## The Even Lazier Way: `setup-node` Built-in Caching 🎯

Here's a thing many developers don't know: `actions/setup-node` has caching built in. One extra line and you're done:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js with caching
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'          # ← This one line does the work

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

It handles the cache key, the restore keys, and the path automatically. Same goes for `yarn`, `pnpm`, `pip`, `poetry`, `composer`, `gem`... check the `setup-*` action for your language — odds are it already has this.

**Lesson learned:** I spent 2 hours configuring `actions/cache` manually before someone on my team pointed out `setup-node` already did it. Read the docs first. Or just ask someone who has. 😅

## Real-World Multi-Job Pipeline with Smart Caching

Here's a pattern I actually use in production — a pipeline with separate lint, test, and build jobs that all share the same cached dependencies:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  # Install once, share across jobs
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      # Cache the entire node_modules for downstream jobs
      - name: Cache node_modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-${{ hashFiles('package-lock.json') }}

  lint:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      # Restore the node_modules — no npm ci needed!
      - name: Restore node_modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-${{ hashFiles('package-lock.json') }}

      - run: npm run lint

  test:
    needs: install
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-${{ hashFiles('package-lock.json') }}

      - run: npm test

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Restore node_modules
        uses: actions/cache@v4
        with:
          path: node_modules
          key: node-modules-${{ hashFiles('package-lock.json') }}

      - run: npm run build
```

**Why this pattern wins:**
- Dependencies installed exactly **once** per commit
- Lint and test run in **parallel** (no waiting)
- Build only runs when both lint and test pass
- Cache hit means downstream jobs skip `npm ci` entirely

Our pipeline went from 14 minutes (serial, no cache) to **4 minutes** (parallel, cached). Same code, same tests.

## Cache Keys: The Art of Getting Them Right 🗝️

A bad cache key is worse than no cache. Too specific = always misses, you get nothing. Too broad = stale cache, you get broken builds.

```yaml
# Too specific — misses on every tiny change
key: ${{ runner.os }}-${{ github.sha }}-node_modules
# Every commit = new cache. Pointless.

# Too broad — stale dependencies slip through
key: node-modules-v1
# Everyone shares one cache forever. Will break.

# Just right — tied to lockfile content
key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
# Same deps = same key. New deps = new key. ✅
```

The `restore-keys` fallback is also worth understanding:

```yaml
key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
restore-keys: |
  ${{ runner.os }}-node-
```

If the exact key misses (first run after a dependency change), GitHub tries the fallback `restore-keys` in order. It loads an older cache, then `npm ci` only downloads the *delta*. Much faster than starting from zero.

## Lessons Learned the Expensive Way 💸

**1. Cache scope matters.** By default, caches are scoped to the branch. PRs can read from the base branch cache but write to their own. This is usually what you want — PRs inherit the main branch cache for free.

**2. Cache size limits are 10GB per repo.** You won't hit this easily, but if you cache build artifacts + node_modules + Docker layers in the same repo, you might. Monitor with `gh cache list`.

**3. Don't cache things that change per-commit.** Build output, coverage reports, anything with a timestamp — caching these is a waste of your 10GB limit and will cause confusing bugs.

**4. Cache invalidation bugs are real.** If your tests start randomly failing after a "nothing changed" push, your cache key is probably too broad and you're loading stale state. Add a manual bust: change `v1` to `v2` in your key.

```yaml
# Bust the cache when you suspect staleness
key: ${{ runner.os }}-node-v2-${{ hashFiles('**/package-lock.json') }}
#                            ↑ Increment this
```

**5. The GitHub Actions cache is eventually evicted.** Caches unused for 7 days get deleted. After a weekend with no pushes, Monday's first build is a cold start. Expected behavior — don't panic when it happens.

## Your 5-Minute Caching Upgrade

Here's the minimum viable cache upgrade you can add to any existing workflow right now:

1. Find your `setup-node` (or `setup-python`, `setup-java`, etc.) step
2. Add `cache: 'npm'` (or `pip`, `maven`, etc.)
3. Push and watch the second run

That's it. Most teams see 60-80% reduction in install time with this single change.

For the full multi-job pattern, spend 20 minutes wiring up the `node_modules` sharing approach above. The math is simple: if you have 10 developers pushing 5 times a day and saving 8 minutes per push, that's **6+ hours of developer time reclaimed daily**.

---

**Still watching the npm progress bar spin on every CI run?** Drop a comment below or find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — let's talk pipelines.

**Want to see more CI/CD patterns?** My [GitHub](https://github.com/kpanuragh) has real workflow files from real projects.

*Go cache something. Your team's patience and your GitHub bill will thank you.* 🏎️
