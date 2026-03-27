---
title: "⚡ GitHub Actions: Stop Burning CI Minutes with These Caching Tricks"
date: 2026-03-27
excerpt: "Your CI pipeline shouldn't take longer to run than your morning coffee break. Learn the GitHub Actions caching tricks that cut build times from 12 minutes to under 2 — and keep your team (and your wallet) happy."
tags: ["DevOps", "GitHub Actions", "CI/CD", "Caching", "Productivity"]
featured: true
---

# ⚡ GitHub Actions: Stop Burning CI Minutes with These Caching Tricks

Let me paint you a picture: it's 4:58 PM on a Friday. You've got one tiny bug fix to ship. You push, open GitHub, and watch your CI pipeline spin up — 12 minutes. _Twelve._ You could have brewed a pot of coffee, watched half an episode of something, or contemplated every life choice that led you to this moment.

The worst part? Half of that time is just your pipeline downloading the same 847 npm packages it downloaded yesterday. And the day before. And the day before that.

Good news: GitHub Actions has a caching system that can make this problem completely disappear. Bad news: most people either don't use it or use it wrong. Let's fix that.

## Why Your Pipeline Is Slow (Spoiler: It's Not Your Code)

Every time a GitHub Actions runner spins up, it starts from a clean slate. No node_modules. No pip cache. No Maven local repo. It's like hiring a contractor who shows up on day one, drives to the hardware store to buy tools, and then on day two — does the exact same thing again. Every. Single. Day.

The fix is caching: you serialize the stuff that rarely changes (your dependencies), store it in GitHub's CDN, and restore it on the next run. What used to take 8 minutes now takes 30 seconds.

Here's what a typical Node.js workflow looks like *before* caching:

```yaml
# 🐌 The slow way — don't do this
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci          # Downloads everything. Every. Time.
      - run: npm run build
      - run: npm test
```

On a medium-sized project, that `npm ci` step alone can take 3-5 minutes. Now multiply that by every developer on your team pushing 5-10 times a day. You're burning minutes like you've got a GitHub Actions subscription paid for by someone else... oh wait, _you do_ pay for it.

## The Fix: Cache Your Dependencies

Here's the upgraded version:

```yaml
# ⚡ The fast way — cache that node_modules
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'          # <-- This one line does a LOT of work

      - run: npm ci
      - run: npm run build
      - run: npm test
```

The `cache: 'npm'` option in `actions/setup-node` is a convenience wrapper that automatically:
1. Hashes your `package-lock.json`
2. Checks if a cache exists for that hash
3. Restores it if found, skips `npm ci` download overhead if not changed
4. Saves a new cache if dependencies changed

The result? Cache hit: ~20 seconds. Cache miss (when you actually update packages): ~3 minutes, then cached for every run after.

This same pattern works for Python (`cache: 'pip'`), Ruby (`cache: 'bundler'`), and more. The `setup-*` actions for most major languages have this baked in. Use it.

## Going Deeper: Manual Cache Control

Sometimes the built-in cache isn't enough. Maybe you're building a Docker image, running a Go binary, or have a custom build artifact you want to persist. That's where `actions/cache` shines:

```yaml
- name: Cache Go build artifacts
  uses: actions/cache@v4
  with:
    path: |
      ~/.cache/go-build
      ~/go/pkg/mod
    key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
    restore-keys: |
      ${{ runner.os }}-go-

- name: Build
  run: go build ./...
```

A few things to notice here:

**`key`** — This is the exact cache identifier. If `go.sum` changes, you get a new cache. Perfect: your dependencies changed, you need a fresh build.

**`restore-keys`** — This is your fallback. If no exact key match is found, GitHub will look for any cache that starts with `${{ runner.os }}-go-`. You won't get a perfect hit, but you'll get *something* — which is almost always faster than starting cold.

**`path`** — You can cache multiple directories. Cache everything you'd be sad to redownload.

## Real-World Lessons Learned (The Hard Way)

**Don't cache node_modules directly.** I know, I know — it seems obvious. But caching the `node_modules` folder itself is fragile. The OS, Node version, or native module compilation can differ between runs. Cache the *npm cache directory* and let `npm ci` do the install. The setup actions handle this correctly for you.

**Cache keys need to be specific enough but not too specific.** One team I worked with used the full git SHA as their cache key. Result: zero cache hits, ever. A cache key should change when your inputs change (package files, lockfiles), not every commit.

**Check your cache hit rate in the Actions UI.** When a cache step runs, it logs whether it was a hit or miss. If you're seeing miss after miss, your key is probably too dynamic. If you're seeing hits on stale data (weird bugs, wrong dependencies), your key isn't dynamic enough.

**Caches expire after 7 days of inactivity** in GitHub Actions. For branches that don't get pushed often, you might hit cold starts more than you expect. For monorepos with lots of branches, this can eat into your 10GB cache limit. Clean up stale caches via the GitHub API or the Actions UI.

## The Payoff

After rolling out proper caching on a mid-sized TypeScript monorepo at a previous gig, we went from an average CI time of 11 minutes down to 2.5 minutes. The team's mood improved noticeably — not because we made the software better, but because waiting for CI stopped being a context-switching nightmare.

Faster CI also means faster feedback loops, which means bugs get caught sooner, which means fewer Friday 4:58 PM hotfixes. Everyone wins.

## Your Turn

If you take nothing else from this post, add `cache: 'npm'` (or `pip`, or `bundler`) to your `setup-*` action right now. It's a one-line change and it's almost always a free speedup.

Then take 20 minutes to audit your longest-running workflows. Add `actions/cache` around anything you're building or downloading repeatedly. Check the timing before and after.

I'd bet good money your team will notice the difference before you even announce the change.

What's the slowest step in your pipeline right now? Drop it in the comments — there's probably a cache for that.

---

*Have a DevOps war story or a caching trick I missed? I'm always looking for more ammunition for the eternal battle against slow pipelines.*
