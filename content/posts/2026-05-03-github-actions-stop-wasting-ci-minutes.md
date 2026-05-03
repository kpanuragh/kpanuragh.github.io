---
title: "🚀 GitHub Actions: Stop Burning CI Minutes Like It's Free Money"
date: 2026-05-03
excerpt: "Your GitHub Actions pipelines are probably wasting half their time re-installing the same npm packages, re-building unchanged Docker layers, and running tests that have nothing to do with the files you touched. Let's fix that."
tags: ["devops", "github-actions", "ci-cd", "productivity"]
featured: true
---

Every month, thousands of developers stare at a 12-minute CI pipeline and think *"this is fine."* It is not fine. Your pipeline is downloading `node_modules` from scratch on every single push, spinning up fresh containers just to run two tests that haven't changed in six months, and quietly draining your organization's CI budget while you refresh the page hoping something will magically go faster.

I've been that developer. I've waited 15 minutes for a pipeline to confirm I fixed a typo. I've seen teams burn through their free GitHub Actions minutes by mid-month. Let me save you the pain.

## The Three Sins of Slow CI

Before we fix anything, let's name the culprits:

1. **No caching** — installing dependencies from scratch every run
2. **No concurrency controls** — running 10 pipelines when you only care about the latest one
3. **No path filtering** — running the entire test suite when you changed a README

These three sins account for the majority of wasted CI time I've seen in the wild. They're also embarrassingly easy to fix.

## Sin #1: You're Installing node_modules Like It's 2015

Here's what most pipelines look like:

```yaml
# The "I don't care about speed" workflow
- name: Install dependencies
  run: npm ci
```

This downloads every single package on every single run. Even if your `package-lock.json` hasn't changed in three weeks. That's like driving to the grocery store every morning to buy the same breakfast you already have in the fridge.

Here's the fix:

```yaml
# The "I've read the docs" workflow
- name: Cache node modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-

- name: Install dependencies
  run: npm ci
```

The `hashFiles` function generates a cache key based on the contents of your lockfile. If `package-lock.json` changes, you get a fresh install. If it doesn't, you get a cache hit and skip straight to running your tests.

In a mid-sized Node.js project, this alone can drop install time from 2-3 minutes to 10-15 seconds. That's not an exaggeration — that's a 90% reduction for one configuration block.

The same pattern works for Python (cache `~/.cache/pip`), Ruby (cache `vendor/bundle`), Go (cache `~/go/pkg/mod`), and Maven (cache `~/.m2`). The framework changes; the principle doesn't.

## Sin #2: You're Running 10 Pipelines When You Need 1

You push a commit. Your pipeline starts. Thirty seconds later you spot a typo, push a fix. Now you have two pipelines running, and only the second one matters. The first is burning minutes for no reason.

```yaml
# Add this at the top level of your workflow file
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Two lines. That's it. Now when you push a new commit to a branch, any in-progress pipeline for that branch gets cancelled automatically. You only ever run the pipeline that matters — the latest one.

One gotcha: don't use `cancel-in-progress: true` on your `main` branch if you have deployment steps. Cancelling a half-finished deployment is worse than waiting. You can handle this with a conditional:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

Feature branches get aggressive cancellation. Main branch runs to completion. Everyone's happy.

## Sin #3: You're Running All Tests When You Changed the Docs

This one requires a bit more setup but pays dividends on large monorepos. If you update `README.md`, you do not need to run your entire test suite. If you change a file in `/frontend`, you probably don't need to run backend tests.

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      frontend: ${{ steps.filter.outputs.frontend }}
      backend: ${{ steps.filter.outputs.backend }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            frontend:
              - 'frontend/**'
            backend:
              - 'backend/**'
              - 'shared/**'

  test-frontend:
    needs: changes
    if: ${{ needs.changes.outputs.frontend == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Running frontend tests..."

  test-backend:
    needs: changes
    if: ${{ needs.changes.outputs.backend == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Running backend tests..."
```

On a documentation-only PR, this skips both test jobs entirely. On a frontend-only change, it runs frontend tests and skips backend. You run exactly as much as you need to — nothing more.

## The Real-World Impact

I applied all three of these patterns to a client's pipeline last year. Their baseline was 18 minutes per push. After caching: 11 minutes. After concurrency controls: same time per run, but fewer wasted runs. After path filtering: frontend-only changes went from 11 minutes to 3 minutes.

The team went from "we'll check CI tomorrow" to "CI is done before I switch tabs." That change in feedback loop speed meaningfully changed how they worked — smaller commits, faster iteration, less context switching.

## Bonus: Check Your Runner Size

Most workflows default to `ubuntu-latest` with 2-core runners. For CPU-intensive builds — compiling TypeScript, running a large test suite, building Docker images — upgrading to a 4-core or 8-core runner can cut your build time in half. GitHub charges more per minute for larger runners, but if you're spending 10 minutes on a 2-core runner, 5 minutes on a 4-core runner often costs the same or less.

Do the math for your specific pipeline before assuming bigger is always better. For I/O-bound workflows (mostly waiting on npm downloads), extra cores don't help much. For CPU-bound workloads, they can be transformative.

## Where to Start

If your pipelines are slow, pick one thing: add caching for your dependency manager. It takes five minutes to implement and delivers the biggest bang for your buck. Then add concurrency controls. Then, if you're on a monorepo, explore path filtering.

Small changes, compounding results. Your future self — the one not watching a progress bar spin for 15 minutes — will thank you.

What's the slowest part of your CI pipeline right now? The answer probably lives in one of these three categories. Go fix it.
