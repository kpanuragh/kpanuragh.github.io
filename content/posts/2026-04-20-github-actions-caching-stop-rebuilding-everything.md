---
title: "GitHub Actions Caching: Stop Rebuilding the Universe Every CI Run ⚡"
date: 2026-04-20
excerpt: "Every time your CI pipeline reinstalls 847 npm packages from scratch, a DevOps engineer cries. Here's how to use GitHub Actions caching properly so your builds go from 12 minutes to 2."
tags: ["devops", "github-actions", "ci-cd", "performance", "caching"]
featured: true
---

Let me paint you a picture. It's 4:47 PM on a Friday. You pushed a one-line typo fix. Your CI pipeline fires up. You watch the progress bar crawl as it downloads `node_modules` for the 847th time this week — packages that haven't changed since Tuesday. Seventeen minutes later, your fix is deployed.

This is the DevOps equivalent of driving to the grocery store, buying milk, driving home, and then immediately driving back to return the milk because you forgot the receipt. Every. Single. Day.

GitHub Actions caching exists to end this madness. Let's fix it.

## Why Your CI Pipeline Is Slow (It's Not What You Think)

Most developers assume slow pipelines are about complex test suites or heavy builds. Sometimes true. But more often, the culprit is **reinstalling identical dependencies every single run**.

Here's a rough breakdown of where time actually goes in a typical Node.js CI run:

- `npm ci` — 4–8 minutes (downloading packages you downloaded yesterday)
- Running tests — 45 seconds
- Building the app — 2 minutes
- Deploying — 30 seconds

You're spending 70% of your CI time downloading the internet. The `actions/cache` action is your escape hatch.

## The Basics: Cache Your Dependencies

Here's a minimal example that caches `node_modules` based on your `package-lock.json`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Cache node_modules
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: npm-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            npm-${{ runner.os }}-

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
```

The magic is in the `key`. It's built from two things: the OS (in case you run on multiple platforms) and a hash of your `package-lock.json`. Change a dependency? Hash changes, cache misses, fresh install. Change only your source code? Hash stays the same, cache hits, deps restored in ~10 seconds instead of 6 minutes.

The `restore-keys` field is your fallback. If there's no exact match, GitHub will try a partial match and restore whatever cache is closest. Still faster than starting cold.

## Level Up: Multi-Layer Caching

Here's where it gets fun. You can cache multiple things at different granularities. This is the setup I use for a full-stack TypeScript monorepo:

```yaml
name: CI

on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'  # Built-in shorthand for npm caching

      - name: Cache Next.js build
        uses: actions/cache@v4
        with:
          path: |
            ${{ github.workspace }}/.next/cache
          key: nextjs-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}-${{ hashFiles('**/*.ts', '**/*.tsx') }}
          restore-keys: |
            nextjs-${{ runner.os }}-${{ hashFiles('**/package-lock.json') }}-
            nextjs-${{ runner.os }}-

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Test
        run: npm test
```

Two caches here:
1. **npm cache** via `setup-node`'s built-in shorthand — handles the `~/.npm` directory automatically
2. **Next.js build cache** — Next.js stores compilation artifacts in `.next/cache`, and reusing them can cut build time by 60–80%

The Next.js cache key includes both the lockfile hash AND a hash of all TypeScript files. If your source changes, the build cache invalidates. If only your lockfile changes, the build cache also invalidates (new deps might change compilation output). This layered key strategy is the pattern you want.

## The Gotcha That Burned Me (Learn From My Pain)

I once spent three hours debugging a mysterious CI failure that only happened on the second run of a pipeline. The first run would pass. The second would fail with cryptic errors about mismatched binary formats.

The culprit? I was caching `node_modules` directly (not `~/.npm`) across different OS runners. Some packages compile native binaries. A binary compiled on `ubuntu-latest` is not compatible with `macos-latest`. I had cached the compiled binaries and then tried to reuse them on a different architecture.

**The fix:** Cache `~/.npm` (the npm content cache, which stores tarballs) rather than `node_modules` (which contains compiled artifacts). Let `npm ci` do the installation from the cached tarballs — it's still way faster than downloading from the registry, and you avoid the binary mismatch problem entirely.

If you *must* cache `node_modules` for some reason, include the OS and Node version in your cache key:

```
key: node-modules-${{ runner.os }}-node${{ matrix.node-version }}-${{ hashFiles('**/package-lock.json') }}
```

## Real Results

After implementing proper caching on a mid-sized monorepo:

| Before | After |
|--------|-------|
| 14 min average CI time | 3 min average CI time |
| 2.1 GB downloaded per run | ~50 MB downloaded per run |
| Developer rage-quits: many | Developer rage-quits: fewer |

The cache hits about 85% of the time (dependency changes are rare; code changes are constant). That 85% is the gold.

## A Few More Tips Before You Go

**Cache invalidation is the second hardest problem in computer science** (the first is naming things, obviously). If you ever get into a weird state with a stale cache, you can bust it by changing your cache key — add a `v2-` prefix or bump a version number.

**GitHub gives you 10 GB of cache storage per repo.** Caches that haven't been accessed in 7 days are automatically evicted. You're not going to run out, but don't cache gigabytes of build artifacts you don't need.

**Use `setup-*` actions when they exist.** `actions/setup-node`, `actions/setup-python`, `actions/setup-go` — these all have built-in caching that's pre-configured correctly for each ecosystem. Use the `cache:` parameter before rolling your own.

## Stop Paying the Reinstall Tax

Every minute your CI spends downloading packages it already downloaded is a minute your team spends waiting. At 20 CI runs per day on a 10-person team, shaving 10 minutes per run is **1,400 developer-minutes saved per week**. That's nearly a full day of productivity, recovered just by being smart about caching.

Set it up once, forget about it, and enjoy the dopamine hit of watching your pipeline go green in under 3 minutes.

Now go ship something. Your CI will actually let you this time.
