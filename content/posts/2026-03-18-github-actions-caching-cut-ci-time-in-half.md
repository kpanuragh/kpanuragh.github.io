---
title: "GitHub Actions Caching: Cut Your CI Time in Half (Seriously) ⚡🗂️"
date: "2026-03-18"
excerpt: "Your CI pipeline takes 15 minutes to run but only does 30 seconds of real work? After watching too many progress bars spin on dependency installs, I learned how to cache everything in GitHub Actions — and you should too."
tags: ["\"devops\"", "\"github-actions\"", "\"ci-cd\"", "\"optimization\""]
featured: "true"
---

# GitHub Actions Caching: Cut Your CI Time in Half (Seriously) ⚡🗂️

Let me paint you a picture. It's 4:45 PM on a Friday. You push a one-line typo fix. CI kicks off. You watch the progress bar crawl through `npm install` for the **eleventh time today**. It downloads 847 packages. Again. The same 847 packages it downloaded yesterday. And the day before.

Fifteen minutes later, all tests green. You merge. The weekend begins. But somewhere deep in your soul, a little piece of you died watching npm re-download `lodash` for the 847th time.

**There is a better way.** It's called caching, it's built into GitHub Actions, and most developers completely ignore it.

## The Problem: Your CI Is Doing Busywork

Every time a GitHub Actions workflow runs on a fresh runner, it starts from zero. No node_modules. No pip packages. No Maven local repo. No Gradle cache. Just a clean slate and a very long to-do list.

For a typical Node.js project, `npm install` might take 3-5 minutes. Your actual test suite? Maybe 45 seconds. You're spending **80% of your CI time reinstalling the same dependencies** that haven't changed since last Tuesday.

That's not CI — that's a very expensive `rm -rf node_modules && npm install` on repeat.

## The Fix: `actions/cache` to the Rescue

GitHub Actions ships with a first-party caching action that persists directories between runs. The magic ingredient: a **cache key** that invalidates automatically when your dependencies actually change.

Here's a complete workflow for a Node.js project that caches `node_modules` based on your `package-lock.json`:

```yaml
name: CI

on: [push, pull_request]

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
        id: cache-node
        with:
          path: node_modules
          key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install dependencies
        if: steps.cache-node.outputs.cache-hit != 'true'
        run: npm ci

      - name: Run tests
        run: npm test
```

The `hashFiles('package-lock.json')` part is the clever bit. The cache key changes **only when your lockfile changes**. Same lockfile = instant cache hit = skip `npm install` entirely. You just shaved 4 minutes off every single CI run.

## The Pattern Works Everywhere

Node is just the beginning. This same approach applies across the entire ecosystem:

```yaml
# Python (pip)
- uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}

# Ruby (bundler)
- uses: actions/cache@v4
  with:
    path: vendor/bundle
    key: ${{ runner.os }}-gems-${{ hashFiles('Gemfile.lock') }}

# Java (Gradle)
- uses: actions/cache@v4
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*') }}

# Rust (cargo)
- uses: actions/cache@v4
  with:
    path: |
      ~/.cargo/registry
      ~/.cargo/git
      target/
    key: ${{ runner.os }}-cargo-${{ hashFiles('Cargo.lock') }}
```

In fact, for common languages, `actions/setup-*` actions now have **built-in caching** via a simple `cache` input:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'   # <-- that's it. One line.
```

This handles the cache action, key generation, and restore logic automatically. Less code, same gains.

## Real-World Lessons Learned (The Hard Way)

**Lesson 1: Cache keys must be specific enough.** Early on I used `${{ runner.os }}-node` as my key (no hash). The cache never invalidated. We upgraded a major dependency, CI still used the stale cache, tests passed locally but failed in production. The hash is not optional.

**Lesson 2: `restore-keys` are your fallback.** When there's no exact cache hit (first run after a lockfile update), `restore-keys` lets you restore a *partial* cache from the closest previous key. You still run `npm install`, but it only installs the *diff* — much faster than starting cold.

**Lesson 3: Don't cache things that build fast.** Caching has overhead — uploading and downloading the cache itself takes time. If your dependency install only takes 20 seconds, caching might not be worth the complexity. Profile first, optimize second.

**Lesson 4: GitHub's cache limit is 10GB per repo.** It's generous, but if you have many branches all building large artifacts, you'll hit it. GitHub automatically evicts LRU caches, so it usually manages itself — but be aware if you're caching `target/` in a large Rust monorepo.

## The Numbers Don't Lie

After adding caching to a mid-size Node.js monorepo at work, our CI times dropped from an average of **14 minutes to 4 minutes** on cache hits (which is about 85% of runs). That's:

- **~3,000 minutes saved per month** across the team
- Faster feedback loops on pull requests
- Fewer "is CI broken or is it just slow?" Slack messages

That's free performance sitting on the table. All it costs is 10 lines of YAML.

## Your Turn

Go look at your most-run GitHub Actions workflow right now. Find the step that installs dependencies. Check if there's a `actions/cache` action before it. If not — you have homework.

Start with one workflow, one cache. Measure the before and after. Then go add it to every workflow that touches dependencies.

Your future self — the one watching a Friday afternoon deploy progress bar — will thank you.

**Have a caching win story (or a horror story from a bad cache key)?** Drop it in the comments or share it on GitHub Discussions. Misery loves company, and so do fast CI pipelines. 🚀
