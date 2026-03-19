---
title: "GitHub Actions Cache: Stop Reinstalling the Same npm Packages 50 Times a Day ⚡"
date: "2026-03-19"
excerpt: "Your CI pipeline downloads 400MB of node_modules on every single push. I've set up GitHub Actions for dozens of projects, and actions/cache alone cut our CI times from 8 minutes to 90 seconds. Here's exactly how."
tags: ["devops", "ci-cd", "github-actions", "optimization"]
featured: true
---

# GitHub Actions Cache: Stop Reinstalling the Same npm Packages 50 Times a Day ⚡

**True story from 2022:** Our team had a monorepo with three services. Every PR triggered a CI run that installed npm packages fresh. 400MB of node_modules. Downloaded from scratch. On every single push.

We pushed ~30 times a day.

That's **12GB of npm downloads. Daily.** Our CI bill was climbing, our engineers were staring at spinning wheels for 8 minutes per push, and our free GitHub Actions minutes evaporated by Wednesday every week.

Then I found `actions/cache`. Setup took 10 minutes. CI dropped to 90 seconds.

I felt like an idiot for not doing it sooner. 😅

## Why Your CI Is Slow (And It's Not Your Fault) 🐢

Every GitHub Actions job starts from a **clean virtual machine**. No memory. No files. No cache. Your entire `node_modules` directory — all 400MB of it — is nuked and recreated on every run.

```bash
# What GitHub Actions does WITHOUT caching, every single time:
npm install
# Downloading express@4.18.2... 2MB
# Downloading typescript@5.0.0... 15MB
# Downloading jest@29.5.0... 8MB
# ... 487 more packages
# Installed 490 packages in 3m 42s 😴
```

This is the equivalent of throwing away your entire kitchen every morning and buying new pots, pans, and a stove before you can make breakfast.

**With caching:**
```bash
npm install
# Cache hit! Restored node_modules from cache.
# Installed 0 packages in 1.2s ⚡
```

## The Fix: actions/cache in 10 Minutes 🔧

GitHub's official `actions/cache` action saves your dependencies between runs. The first run downloads everything normally. Every subsequent run restores from cache — IF your `package.json` (or `package-lock.json`) hasn't changed.

### For Node.js / npm

**Before (8 minutes, no cache):**

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci   # Downloads EVERYTHING. Every. Single. Time.

      - name: Run tests
        run: npm test
```

**After (90 seconds, with cache):**

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      # THE MAGIC: Cache node_modules based on package-lock.json hash
      - name: Cache node_modules
        uses: actions/cache@v4
        id: cache-node
        with:
          path: node_modules
          key: node-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            node-${{ runner.os }}-

      # Only runs if cache missed (package-lock.json changed)
      - name: Install dependencies
        if: steps.cache-node.outputs.cache-hit != 'true'
        run: npm ci

      - name: Run tests
        run: npm test
```

**What changed:**
- `path`: What to cache (the `node_modules` folder)
- `key`: A unique ID for this cache. Uses a hash of `package-lock.json` — if the lockfile changes, the cache is invalidated automatically! 🎯
- `restore-keys`: Fallback if exact key doesn't match — uses a partial cache instead of starting from scratch
- `if: steps.cache-node.outputs.cache-hit != 'true'`: Only install if cache missed!

**Result:** 3m 42s → 8s on cache hits. Yes, eight seconds. 🚀

## Actually, Use setup-node's Built-in Cache (Even Easier) 🤫

**Hot tip I learned after doing it the hard way for 6 months:**

`actions/setup-node` has caching built in. You don't even need `actions/cache` for basic npm/yarn/pnpm:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'   # That's it. One line. Done.

- name: Install dependencies
  run: npm ci
  # Still needs to run, but deps already cached!
```

**Or for yarn:**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'yarn'

- run: yarn install --frozen-lockfile
```

**Or for pnpm:**
```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 8

- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'pnpm'

- run: pnpm install --frozen-lockfile
```

This caches the npm/yarn/pnpm **global cache** (not node_modules itself), so `npm ci` still runs fast by pulling from local cache. Simpler, battle-tested, and recommended by GitHub themselves.

## The Horror Story That Made Me Obsess Over This 💀

**March 2023, 4 PM on a Friday (red flag #1):**

We were hitting GitHub's free tier limit by Thursday every single week. The team was grumbling. PRs sat unreviewed because nobody wanted to trigger another CI run.

I sat down, ran the numbers:
- 5 developers × 6 pushes/day = 30 CI runs/day
- Each CI run: 4 minutes of npm install + 2 minutes of tests = 6 minutes
- Total: **3 hours/day of CI time** just reinstalling packages

After adding caching:
- Each CI run: 15 seconds of cache restore + 2 minutes of tests = ~2.5 minutes
- Total: **75 minutes/day of CI time**

We saved **105 minutes of CI time daily**. That's almost 2 hours of GitHub Actions minutes back in our pockets, every single day.

**Cost savings on our paid plan:** ~$180/month. For 10 minutes of YAML editing. 💸

## Caching for Other Languages (Because It's Not Just npm) 🌍

### PHP / Composer (Laravel projects)

After setting up CI/CD for several Laravel projects, this is my standard template:

```yaml
- name: Setup PHP
  uses: shivammathur/setup-php@v2
  with:
    php-version: '8.3'
    tools: composer:v2

- name: Cache Composer packages
  uses: actions/cache@v4
  with:
    path: vendor
    key: composer-${{ runner.os }}-${{ hashFiles('composer.lock') }}
    restore-keys: |
      composer-${{ runner.os }}-

- name: Install Composer dependencies
  run: composer install --no-interaction --prefer-dist --optimize-autoloader
```

**Before:** `composer install` took 2m 30s every run.
**After:** Cache hit restores vendor in 8 seconds.

If you're deploying Laravel to AWS and your CI takes forever, this single change pays for itself in 20 minutes of setup time.

### Python / pip

```yaml
- name: Cache pip packages
  uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: pip-${{ runner.os }}-${{ hashFiles('requirements.txt') }}
    restore-keys: |
      pip-${{ runner.os }}-

- name: Install Python dependencies
  run: pip install -r requirements.txt
```

### Go modules

```yaml
- name: Cache Go modules
  uses: actions/cache@v4
  with:
    path: |
      ~/.cache/go-build
      ~/go/pkg/mod
    key: go-${{ runner.os }}-${{ hashFiles('go.sum') }}
    restore-keys: |
      go-${{ runner.os }}-

- name: Download Go modules
  run: go mod download
```

## The Full Production CI Workflow (What I Actually Use) 🏭

Here's my battle-tested GitHub Actions workflow for a Node.js + TypeScript project with everything set up correctly:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20'

jobs:
  # Job 1: Lint and type check (fast, no heavy deps)
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  # Job 2: Tests (runs parallel with lint)
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]   # Test multiple Node versions!

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        if: matrix.node-version == '20'  # Only upload once

  # Job 3: Build (only if tests pass)
  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      # Cache the build output for the deploy job
      - name: Cache build output
        uses: actions/cache@v4
        with:
          path: dist
          key: build-${{ github.sha }}

  # Job 4: Deploy (only on main branch push)
  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      # Restore the built dist from previous job (no rebuild!)
      - name: Restore build cache
        uses: actions/cache@v4
        with:
          path: dist
          key: build-${{ github.sha }}

      - name: Deploy to production
        run: |
          # Deploy your dist folder
          echo "Deploying commit ${{ github.sha }}..."
```

**Why this is great:**
- ✅ `lint` and `test` jobs run **in parallel** (saves time)
- ✅ Matrix testing across Node 18, 20, 22 simultaneously
- ✅ npm cache shared via `setup-node`'s built-in cache
- ✅ Build output cached between jobs (no double-building)
- ✅ Deploy only happens when tests pass AND it's main branch

**Total time on cache hit:** ~2 minutes. Down from 12. 🎯

## Common Mistakes (Learn From Mine) 🪤

### Mistake #1: Caching node_modules with npm install (not ci)

```yaml
# BAD: npm install can produce different results!
- run: npm install

# GOOD: npm ci is deterministic and faster
- run: npm ci
```

`npm ci` deletes `node_modules` and installs from `package-lock.json`. It's reproducible. `npm install` can silently upgrade packages and break your cache. **Always `npm ci` in CI.** (The "ci" in the name isn't a coincidence!)

### Mistake #2: Wrong cache key

```yaml
# BAD: Cache never invalidates! Stale deps forever.
key: node-modules-v1

# BAD: Too specific, cache never hits
key: node-${{ github.sha }}   # Different every commit!

# GOOD: Invalidates when lockfile changes
key: node-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
```

The hash of your lockfile is the perfect cache key. Changes when your dependencies change. Stable otherwise.

### Mistake #3: Forgetting restore-keys

```yaml
# BAD: If exact key misses, starts from scratch!
- uses: actions/cache@v4
  with:
    path: node_modules
    key: node-${{ hashFiles('package-lock.json') }}

# GOOD: Falls back to partial cache on miss
- uses: actions/cache@v4
  with:
    path: node_modules
    key: node-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
    restore-keys: |
      node-${{ runner.os }}-   # Partial match fallback!
```

When you add a new package, the exact cache key changes (lockfile changed). Without `restore-keys`, you download 490 packages from scratch. With it, you restore the old cache and only download the 1 new package. Much faster!

### Mistake #4: Not caching in the right place

```yaml
# BAD: Caching after npm install runs (cache is empty on first run anyway!)
- run: npm ci
- uses: actions/cache@v4   # TOO LATE! Install already happened
  with:
    path: node_modules
    key: ...

# GOOD: Cache action BEFORE the install step
- uses: actions/cache@v4   # Check cache FIRST
  id: cache
  with:
    path: node_modules
    key: ...
- run: npm ci   # Only runs if cache missed
  if: steps.cache.outputs.cache-hit != 'true'
```

## Before/After: Real Numbers 📊

From a Laravel API project I maintain:

| Step | Before Cache | After Cache (hit) | After Cache (miss) |
|------|-------------|-------------------|---------------------|
| npm install | 3m 42s | 0s (skipped) | 3m 42s |
| Cache restore | — | 8s | 2s (partial) |
| composer install | 2m 28s | 0s (skipped) | 2m 28s |
| Run tests | 1m 15s | 1m 15s | 1m 15s |
| **Total** | **7m 25s** | **1m 23s** | **7m 27s** |

**Cache hit rate** (after the first week): ~85% of runs hit the cache.

**Monthly CI time saved:** ~42 hours across the team.

That's 42 hours developers spent NOT watching progress bars. 🎉

## TL;DR 💡

Your CI pipeline is downloading the same 400MB of packages dozens of times a day. Stop it.

- Use `actions/setup-node` with `cache: 'npm'` (simplest option)
- Use `actions/cache` with `hashFiles('package-lock.json')` as the key for full control
- Always use `npm ci`, never `npm install` in CI
- Add `restore-keys` as a partial cache fallback
- Cache your build artifacts between jobs too

**After countless deployments and CI setups**, caching is the single highest-ROI optimization you can make. 10 minutes of YAML editing saves hours of team time weekly.

Your engineers deserve to see green checkmarks in under 2 minutes. Give them that. ⚡

---

**How slow is your CI right now?** Drop the number in the comments — I've seen 25-minute pipelines that got under 3 minutes with just caching + parallelism.

**More DevOps stuff:** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check my [GitHub](https://github.com/kpanuragh) for real workflow files I use in production.

*Now go add that cache action. Right now. This post will still be here when you get back.* ⚡🚀
