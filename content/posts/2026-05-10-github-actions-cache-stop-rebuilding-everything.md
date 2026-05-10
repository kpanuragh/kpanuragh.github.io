---
title: "GitHub Actions Cache: Stop Rebuilding the World on Every Commit ⚡"
date: 2026-05-10
excerpt: "Your CI pipeline is downloading 847 npm packages on every single commit. There's a better way. Learn how GitHub Actions caching can slash your build times from 8 minutes to under 90 seconds."
tags: ["devops", "github-actions", "ci-cd", "performance"]
featured: true
---

# GitHub Actions Cache: Stop Rebuilding the World on Every Commit ⚡

Picture this: you push a one-line typo fix. Your CI pipeline kicks off. You watch as it dutifully downloads all 847 of your npm packages... again. The same packages it downloaded yesterday. And the day before. And every single time since you joined this project three years ago.

Meanwhile, your coffee is getting cold and you're quietly questioning every career decision you've ever made.

There's a better way, and it's embarrassingly simple.

## Why Your CI Is Doing So Much Unnecessary Work

GitHub Actions runners are ephemeral — every job starts fresh with a clean slate. No disk cache, no memory of the past, no loyalty whatsoever. It's a brand new VM every single time, and it has absolutely no idea that you've already downloaded React 18 approximately 3,000 times this month.

Without caching, a typical Node.js project might spend:
- 2–3 minutes downloading `node_modules`
- 1–2 minutes on compilation and transpilation
- Another minute on test setup and warmup

That's 5+ minutes of setup before your actual tests even run. Multiply that across your team's push frequency and you're burning hundreds of pipeline-minutes — and real cloud dollars — every week on redundant downloads.

## Enter: `actions/cache`

GitHub's official `actions/cache` action lets you persist directories between workflow runs. The magic lives in the cache key: a hash that tells GitHub "if this exact combination of files matches, restore the cached directory."

Here's the classic Node.js setup:

```yaml
- name: Cache node_modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

The `hashFiles('**/package-lock.json')` is the clever bit. It generates a hash from your lockfile — so the cache is only reused when your exact dependencies haven't changed. Push a typo fix? Cache hit, blazing fast. Add a new package? Cache miss, fresh install, new cache saved for next time. Elegant.

After adding this to one project I worked on, CI dropped from 8 minutes per run down to 90 seconds. The team stopped dreading pull requests. CI became... not soul-crushing. That's a win.

## Going Deeper: Multi-Layer Caching

For larger projects, you can stack multiple caches. Here's a more complete example for a Python Django project, caching both pip dependencies and pre-commit hooks separately:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Cache pip dependencies
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('requirements*.txt') }}
          restore-keys: |
            ${{ runner.os }}-pip-

      - name: Cache pre-commit hooks
        uses: actions/cache@v4
        with:
          path: ~/.cache/pre-commit
          key: ${{ runner.os }}-precommit-${{ hashFiles('.pre-commit-config.yaml') }}

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run tests
        run: pytest
```

Two separate caches, each keyed to the file that controls their contents. Update a pre-commit hook config but leave requirements alone? Only the pre-commit cache misses. Maximum granularity, maximum efficiency.

## The `restore-keys` Trick Nobody Tells You About

That `restore-keys` field is massively underrated. Here's how it actually works:

1. GitHub first looks for an **exact match** for your `key`
2. If none found, it falls back through `restore-keys` in order, matching by prefix
3. It restores the most recent cache that matches

This means on a cache miss — say you added a new package — your pipeline doesn't start completely from zero. It restores the *closest* previous cache and then only installs the delta. For projects with a stable core and frequent additions, this saves 70–80% of install time even on a cache miss.

Think of it as "approximately cached." Better than nothing. Way better than nothing.

## Lessons Learned the Hard Way

**Don't cache `node_modules` directly.** Cache `~/.npm` instead. `node_modules` varies by OS and Node version in ways that will haunt you — mysterious failures that vanish the moment you clear the cache but return on the next runner. Use the npm cache directory, let `npm ci` do the final install.

**Watch your cache size.** GitHub gives you 10 GB of cache storage per repository. If you cache build artifacts that balloon over time, old caches get silently evicted and your hit rate quietly drops toward zero. Audit what you're caching and how large it actually is.

**Cache keys must be deterministic.** I once saw a pipeline using `${{ github.sha }}` as a cache key — meaning every single commit was a guaranteed cache miss. The caching infrastructure was completely decorative. Don't do that.

**Separate install caches from build caches.** Dependencies change rarely; compiled output changes constantly. Mixing them into one key with a commit hash defeats the entire purpose.

## Is It Actually Worth the Effort?

Let's do the math. If your CI runs 50 times a day (modest for an active team) and you save 5 minutes per run:

- 250 minutes saved daily
- ~1,750 minutes saved weekly
- That's nearly 29 hours of pipeline time per week

At typical compute rates, that's a meaningful cloud bill reduction. More importantly, it's real developer time — the difference between pushing a fix and immediately context-switching, versus pushing a fix and waiting 8 minutes, drifting to Twitter, and completely losing the thread of what you were doing.

Fast feedback loops are one of the most underrated productivity multipliers in software development. When CI takes 90 seconds, you stay in flow. When it takes 8 minutes, you don't.

## Do This Today

Add the cache step to your most-used workflow right now. It is a 10-line change with a measurable, immediate, and lasting impact. Your teammates will notice within the first few PRs. Your future self will be grateful. Your cloud bill will quietly shrink.

And for the love of all that is holy, stop downloading lodash 900 times a day.

---

*What's the wildest CI optimization you've shipped? I'm always hunting for new pipeline tricks — drop it in the comments below.*
