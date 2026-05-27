---
title: "🧨 GitHub Actions Matrix Builds: Combinatorial Explosions and How to Survive Them"
date: "2026-05-27"
excerpt: "Matrix builds are one of GitHub Actions' most powerful features — and one of its most dangerous. Here's how to test across every Node version, OS, and environment without burning your CI minutes and your sanity."
tags:
  - github-actions
  - ci-cd
  - devops
  - platform-engineering
  - testing
featured: true
---

Matrix builds look deceptively simple. You define a grid of variables, GitHub fans them out into parallel jobs, and suddenly you're testing across every Node version, every OS, every database version — all at once. Beautiful.

Then your pipeline spawns 84 jobs, runs for 45 minutes, costs you half your monthly CI budget, and three of those jobs fail on a combination nobody actually ships in production. Less beautiful.

I've been there. At Cubet, we had a library shared across multiple projects that needed to work on Node 16, 18, and 20, across Ubuntu and macOS, in both ESM and CommonJS mode. Someone set up a naive matrix. Three days later, our CI bill looked like a ransom note.

Here's what I learned about taming the beast.

## The Explosion Problem

A matrix build multiplies every axis you give it:

```yaml
strategy:
  matrix:
    node: [16, 18, 20]
    os: [ubuntu-latest, macos-latest, windows-latest]
    module: [esm, cjs]
```

Three versions × three OSes × two module formats = **18 jobs**. Add a database version axis and you're at 54. Add browser targets and you've blown past GitHub's 256-job limit — at which point Actions just silently drops jobs. Yes, silently. Yes, that's terrifying.

The hidden cost isn't just raw minutes either. macOS runners cost 10× more than Ubuntu in GitHub's billing model. Windows runners cost 2×. So a "quick matrix" that hits macOS 20 times is actually burning 200 Ubuntu-equivalent minutes.

## Strategy 1: `exclude` the Combinations Nobody Uses

The most underused feature in matrix builds is `exclude`. Most cross-platform issues don't live in the intersection of every dimension — they're usually OS-specific or version-specific, not both simultaneously.

```yaml
strategy:
  matrix:
    node: [18, 20]
    os: [ubuntu-latest, macos-latest, windows-latest]
    include:
      - node: 20
        os: ubuntu-latest
        experimental: true
    exclude:
      - node: 18
        os: windows-latest
      - node: 18
        os: macos-latest
```

This cuts the matrix from 6 jobs to 4 — and keeps the expensive macOS/Windows runs only on the version that matters most. The `include` key also lets you bolt on extra properties to specific combinations, like marking a job as experimental so its failure doesn't block the PR.

## Strategy 2: Dynamic Matrices — Only Test What Changed

The real power move is generating the matrix at runtime based on what actually changed. Why run your full 18-job matrix when someone edited a single markdown file?

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      packages: ${{ steps.filter.outputs.changes }}
    steps:
      - uses: actions/checkout@v4
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            api: ['packages/api/**']
            worker: ['packages/worker/**']
            shared: ['packages/shared/**']

  test:
    needs: changes
    if: ${{ needs.changes.outputs.packages != '[]' }}
    strategy:
      matrix:
        package: ${{ fromJSON(needs.changes.outputs.packages) }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test --workspace=packages/${{ matrix.package }}
```

This pattern — build the matrix from changed paths — is how monorepos stay fast. Instead of testing all 12 packages every push, you only test the ones that actually changed. The `fromJSON` expression is the glue: it converts a JSON string output from one job into a matrix array in another.

We rolled this out across a monorepo at Cubet that had been running 40-minute CI on every commit. After switching to path-filtered dynamic matrices, average CI time dropped to under 8 minutes. PRs that touched a single package ran exactly one job.

## Strategy 3: `fail-fast: false` — Know When to Use It

By default, if any matrix job fails, GitHub cancels all the remaining jobs. This is usually what you want — no point running 17 more jobs if one already failed.

But not always. When you're doing compatibility testing (does this work on Node 16?), you probably want to see *all* failures, not just the first one. If your Node 20 job fails, you'd still want to know whether Node 18 would have passed.

```yaml
strategy:
  fail-fast: false
  matrix:
    node: [16, 18, 20]
    os: [ubuntu-latest, macos-latest]
```

Set `fail-fast: false` when:
- You're auditing compatibility across versions you don't control
- The job is informational / experimental
- You're hunting a flaky test and want full coverage

Keep `fail-fast: true` (the default) when:
- Any failure blocks the PR anyway
- Jobs are expensive and a fast-fail saves money
- You're running integration tests that share state

## The `max-parallel` Safety Valve

One more lever people forget: `max-parallel`. By default, GitHub runs all matrix jobs simultaneously. If each job spins up a database container or hammers a shared staging environment, you've just DDoSed your own infrastructure.

```yaml
strategy:
  matrix:
    environment: [staging-us, staging-eu, staging-ap]
  max-parallel: 1
```

Setting `max-parallel: 1` turns a matrix into a sequential loop — useful when you're deploying to multiple environments and need them to go one at a time. Setting it to 2 or 3 gives you partial parallelism without overwhelming downstream services.

## What a Clean Matrix Looks Like

Here's a production-ish example that incorporates all of the above — a Node library tested across versions on Linux only (macOS reserved for the latest version), with fail-fast off for full diagnostic coverage:

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    strategy:
      fail-fast: false
      max-parallel: 6
      matrix:
        node: [18, 20, 22]
        os: [ubuntu-latest]
        include:
          - node: 22
            os: macos-latest
        exclude: []
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Upload coverage
        if: matrix.node == '20' && matrix.os == 'ubuntu-latest'
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

Note the `if` condition on the coverage upload: only the "canonical" combination uploads artifacts. Without that gate, you'd get 4 duplicate coverage reports clobbering each other in your artifacts.

## The Mindset Shift

Matrix builds reward intentional design. The temptation is to throw every axis into the grid and call it "thorough." The reality is that most bugs live in one or two dimensions, and a well-designed 4-job matrix catches them just as well as a 48-job matrix — at a fraction of the cost and time.

Ask yourself before adding an axis: do failures in this dimension actually diverge? If your app behaves identically on Node 18 and 20 for 99% of features, you probably want one node version in the matrix and a quarterly compatibility check for the rest.

Test breadth is not a substitute for test quality. A matrix that runs fast, covers real combinations, and gives you actionable signal beats a combinatorial explosion that burns 40 minutes and teaches you nothing new.

---

What's the most out-of-control matrix build you've had to tame? I'm curious whether the dynamic matrix approach or the exclude strategy did more heavy lifting for your team. Hit me up on [GitHub](https://github.com/kpanuragh) — I'm always trading CI war stories.
