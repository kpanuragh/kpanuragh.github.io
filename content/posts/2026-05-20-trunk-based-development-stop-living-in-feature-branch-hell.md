---
title: "🌳 Trunk-Based Development: Merge to Main Every Day (or Stop Calling It CI)"
date: "2026-05-20"
excerpt: "Long-lived feature branches aren't just inconvenient — they're actively sabotaging your CI/CD pipeline. Here's how trunk-based development fixes the merge hell most teams are living in."
tags:
  - devops
  - ci-cd
  - git
  - trunk-based-development
  - platform-engineering
featured: true
---

# 🌳 Trunk-Based Development: Merge to Main Every Day (or Stop Calling It CI)

Let me describe a scene you've probably lived through.

A developer finishes a two-week feature branch. They open a pull request. GitHub helpfully informs them: **"This branch is 847 commits behind main."** A chill runs down their spine. They click "Update branch." The merge conflict storm begins. Three hours later they're resolving conflicts in files they never touched, half the tests are broken, and the standup question "what are you blocked on?" has a very long answer.

Congratulations. You have "Continuous Integration" in your company's engineering values doc. You have not, however, been doing continuous integration.

## What Trunk-Based Development Actually Is

Trunk-Based Development (TBD) is simple to describe and apparently very hard to accept: **everyone commits to a single shared branch (main/trunk) at least once a day.** No long-lived feature branches. No "I'll merge when it's done." Done is a spectrum, and your branch being isolated from your teammates' work is not a feature — it's technical debt accumulating hourly.

The "continuous" in Continuous Integration was always about this. The original XP/Agile community meant "integrate with the rest of the team's code continuously." CI pipelines came later to automate the verification. But somewhere along the way, teams started running a CI pipeline on a branch that diverged from main two weeks ago and calling it CI. That's just automated testing on a parallel universe.

## The Merge Queue Problem Nobody Talks About

Here's the concrete problem with long-lived branches and CI.

Your CI pipeline passes on branch `feature/new-checkout`. Your colleague's CI pipeline also passes on `feature/payment-refactor`. You both merge to main on the same afternoon.

Main is now broken.

Both branches were green. Both passed every test. But they were tested against *different versions of main* — neither included the other's changes. When they combine, something breaks. You've discovered what's sometimes called the **integration window** problem, and it's why the "CI pipeline is green" becomes less meaningful the older the branch gets.

At Cubet, we hit this constantly on a microservices project where three teams were working on overlapping services. Each team's pipeline was pristine. Main was a weekly dumpster fire.

The fix wasn't better tests. It was merging more often.

## Feature Flags: The Enabling Trick

The most common objection to TBD: "But my feature isn't ready to ship to users!"

This is where **feature flags** become load-bearing infrastructure rather than a nice-to-have.

```typescript
// Simple environment-based feature flag
const FLAGS = {
  newCheckoutFlow: process.env.FEATURE_NEW_CHECKOUT === 'true',
  experimentalSearch: process.env.FEATURE_SEARCH_V2 === 'true',
};

export function CheckoutPage() {
  if (FLAGS.newCheckoutFlow) {
    return <NewCheckout />;
  }
  return <LegacyCheckout />;
}
```

Half-finished code ships to main, hidden behind a flag that's `false` in production. Your code gets integrated and tested against everyone else's changes daily. Users see nothing. Your merge conflicts stay tiny. When the feature is ready, you flip the flag.

This isn't just for UI features. Database migrations, API changes, new service dependencies — all of it can be wrapped in flag-aware code paths that keep main deployable even while big changes are in flight.

## Short-Lived Branches Are Fine. One Rule.

TBD doesn't mean "commit directly to main every single time" (though some teams do, with good guardrails). It means branches live for **hours, not weeks**.

A practical rule that works well: **if your branch is older than two days, something has gone wrong.** Either the task is too large (slice it), you're blocked (escalate), or you're afraid to merge because main has drifted (the very problem TBD solves).

Your CI pipeline changes too:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run tests
        run: npm test

      - name: Check branch age
        if: github.event_name == 'pull_request'
        run: |
          BASE_DATE=$(git log --format="%ci" origin/main -1)
          BRANCH_DATE=$(git log --format="%ci" HEAD -1)
          # Warn if branch diverged more than 48 hours ago
          echo "Branch base: $BASE_DATE"
          echo "Latest commit: $BRANCH_DATE"
```

The branch age check is optional but sends a useful cultural signal: stale branches are worth a conversation.

## What Your Pipeline Looks Like in a TBD World

The pipeline topology changes. Instead of "branch pipeline + main pipeline," you get one fast pipeline that runs on every commit to main, plus lightweight pre-merge checks on short-lived PRs.

Because main is always releasable, deployment becomes boring. You can deploy from main to production at any point — not "when the release branch is ready," not "after the merge window," just... when you want to. Teams that get here often discover they can ship to production multiple times a day without it being a special event.

The deployment pipeline stops being the scary moment at the end of a sprint and becomes a routine background process that nobody watches because it just works.

## The Cultural Part (the Hard Part)

TBD requires trust and some changed habits:

1. **Tasks must be small enough to complete in a day or two.** This forces better story slicing, which is a skill that pays dividends everywhere.
2. **"Done" means merged to main, not "local tests pass."** The definition shift matters.
3. **The main branch must always be deployable.** If you break main, fixing it is the highest priority. No exceptions.

The last point is where teams struggle most. In a feature-branch world, breaking main is someone else's problem until review time. In TBD, breaking main is everyone's problem right now, which means people are more careful and faster to fix issues.

## Is This for Everyone?

Honestly, no. TBD works best with:
- Fast test suites (under 10 minutes)
- A feature flag system (even a simple env-var one)
- A team that's bought into the workflow

A 45-minute test suite on a team of 20 creates a merge queue nightmare that'll make TBD feel worse than branches. Fix the test speed first.

But if your team is spending significant time on merge conflicts, if "the branch diverged" is a phrase you hear weekly, or if your CI is green but main is regularly broken — trunk-based development is almost certainly worth the adjustment period.

Merge small. Merge often. Let the pipeline tell you the truth about your actual integrated code, not a parallel universe where your feature exists in isolation.

Your future self, untangling a 900-commit merge conflict at 5pm on a Friday, will thank you.

---

*Migrating a team to TBD? The hardest conversations are usually about feature completeness vs. releasability — drop a comment if you've found good ways to frame that shift.*
