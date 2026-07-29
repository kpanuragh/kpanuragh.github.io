---
title: "🐘 Stop Testing the Whole Elephant: Path-Based CI for Monorepos"
date: "2026-07-29"
excerpt: "Someone fixed a typo in the docs package and your CI decided to run the full integration suite, rebuild six Docker images, and redeploy a service that hasn't changed since March. Here's how to teach your pipeline what actually changed."
tags:
  - devops
  - ci-cd
  - monorepo
  - github-actions
  - platform-engineering
featured: true
---

# 🐘 Stop Testing the Whole Elephant: Path-Based CI for Monorepos

Picture this. Someone on your team opens a PR that changes one line in `packages/docs/README.md`. Maybe they fixed "recieve" to "receive." Heroic work. And then your CI wakes up like it just heard the fire alarm: lints every package, runs the full test suite for six services, rebuilds four Docker images, and — because someone wired the pipeline with love but not judgment — kicks off a deploy job for the payments service.

The payments service. Because of a typo. In the docs.

If you've worked in a monorepo for more than a month, you've lived this. The first instinct is usually "let's just make CI faster" — more parallelism, bigger runners, caching everything that isn't nailed down. Those all help, but they're treating the symptom. The actual disease is that your pipeline doesn't know what changed. It just knows a commit landed, and it reacts to *the repo*, not *the diff*.

## The naive fix (and why it's not enough)

The obvious first move is a path filter on the workflow trigger:

```yaml
# .github/workflows/payments-ci.yml
on:
  push:
    paths:
      - "packages/payments/**"
      - "packages/shared/**"
```

This works, for exactly one service, until someone adds a seventh package and forgets to update five workflow files. Path filters at the trigger level don't scale because they live in N different YAML files that all need to agree with each other about what "shared" means. The moment `packages/shared` changes, does it cascade to `payments`, `orders`, *and* `notifications`? Somebody has to maintain that dependency graph by hand, in comments, across files nobody reads together.

What you actually want is one place that knows the dependency graph, and a CI job that asks it a single question: "given this diff, what needs to run?"

## Let a build tool own the graph

This is the actual point of tools like Nx, Turborepo, or Bazel's query language in a monorepo — not the fancy remote caching everyone talks about, but the dependency graph itself. You declare once that `payments` depends on `shared`, and the tool can then answer "affected by this diff" correctly, forever, without a human re-deriving it in five workflow files.

```yaml
# One job, not six
- name: Run only what changed
  run: npx nx affected --target=test --base=origin/main --head=HEAD
```

`nx affected` walks the actual import graph, diffs it against the base branch, and only tests the projects that could plausibly be broken by this change — including anything downstream of a shared package. Turborepo's `turbo run test --filter=...[HEAD^1]` does the same trick with its own graph. Either way, you stop encoding "who depends on whom" in YAML comments and start encoding it in the one place that's actually checked at build time: your import statements.

## If you don't have a build tool graph, fake it with dorny/paths-filter

Not every monorepo has (or wants) Nx or Turborepo bolted on. If yours is a looser collection of services, `dorny/paths-filter` gets you 80% of the value with a single reusable action:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      payments: ${{ steps.filter.outputs.payments }}
      shared: ${{ steps.filter.outputs.shared }}
    steps:
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            payments:
              - 'packages/payments/**'
              - 'packages/shared/**'
            shared:
              - 'packages/shared/**'

  test-payments:
    needs: changes
    if: needs.changes.outputs.payments == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: npm test --workspace=payments
```

The difference from the naive trigger-level filter is subtle but matters: this lives in *one* workflow, produces named outputs, and every downstream job just checks a boolean. You're still maintaining the "shared affects payments" relationship by hand, but now it's in one YAML block instead of scattered across the repo — and when someone adds package seven, there's exactly one file to touch.

## The lesson that cost us a Friday afternoon

On my team at Cubet Techno Labs, we ran a monorepo where the "run everything on every push" pipeline had quietly grown to fourteen minutes. Nobody had decided that was fine — it just accreted, one `npm test` at a time, until a config-only change to a package with zero runtime code triggered the same fourteen minutes as an actual payments logic change. The fix wasn't a faster runner. It was admitting the pipeline had no idea what "config-only" meant, because nothing in it distinguished packages by blast radius.

Once we split jobs by `paths-filter` output and set required status checks per package instead of one monolithic "CI" check, the typo-fix PR went from fourteen minutes to ninety seconds. The payments suite still ran fourteen minutes when payments code actually changed — that's correct, that's the suite doing its job. What changed is that irrelevant work stopped happening on irrelevant PRs.

## The part everyone forgets: branch protection

Here's the trap: once jobs are conditional, a PR that skips `test-payments` because it didn't touch payments will show that check as "skipped," not "passed" — and GitHub's required-checks feature is picky about the difference depending on how you configure it. If you require `test-payments` on every PR but it never runs for docs-only changes, you can end up unable to merge at all. The fix is either a cheap "always green" summary job that fans in the conditional results, or requiring checks only on the paths that trigger them via branch protection rules scoped correctly. Test this before you roll it out — nothing kills trust in a new CI setup faster than a green PR that can't merge.

## Try it this week

If your CI runs the same fourteen minutes for a README typo as it does for a real change, that's not a hardware problem — it's a graph problem. Start small: pick your two most expensive jobs, wire them behind `paths-filter` or an `affected` command, and watch how much of your CI minutes bill was just tax on changes that never touched that code. Your Friday afternoons — and your GitHub Actions invoice — will thank you.
