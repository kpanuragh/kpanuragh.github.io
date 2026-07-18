---
title: "🎲 Flaky Tests: Schrödinger's CI Pipeline"
date: "2026-07-18"
excerpt: "A test that passes 9 times out of 10 isn't 90% reliable — it's 100% untrustworthy. Here's how to actually find your flaky tests, prove they're flaky instead of just suspecting it, and quarantine them without quietly deleting your safety net."
tags: ["testing", "ci-cd", "code-quality", "backend", "devops"]
featured: true
---

You know the ritual. A PR fails CI. You didn't touch anything near the failing test. You click "re-run," go get coffee, come back, and it's green. You merge. You never think about it again.

Except somewhere, a little counter ticks up. That test just taught your entire team a lesson: **red doesn't mean broken.** And once your engineers learn that lesson, they apply it universally — to the flaky test, sure, but also to the real failure sitting three commits later that actually caught a bug. Nobody stops to check which is which anymore. They just click re-run and hope.

This is how flaky tests kill a test suite. Not by failing — by teaching everyone to stop trusting failure.

## First, Prove It's Actually Flaky

Before you quarantine anything, resist the urge to eyeball a test and declare it flaky because it failed once near a network call. "Flaky" is a specific claim: same code, same input, different result. If you can't reproduce that, you might just have a real bug wearing a disguise.

The cheap way to get proof is to run the suspect test in a loop, isolated from the rest of the suite, and count outcomes:

```bash
# Run a single test 50 times in isolation, count failures
for i in $(seq 1 50); do
  npx jest tests/checkout.test.ts -t "applies discount code" --silent \
    && echo "PASS" || echo "FAIL"
done | sort | uniq -c
```

If that comes back `47 PASS / 3 FAIL`, congratulations — you've got proof, not a hunch. A 94% pass rate sounds reassuring until you remember CI runs this suite dozens of times a day across a team. At that rate, someone hits red for no reason at least once daily, and every one of those is a tiny withdrawal from the "trust the pipeline" account.

## Detecting Flakiness at Scale, Not One Test at a Time

Running a `for` loop against a test you already suspect doesn't scale to a suite with three thousand tests. What actually works is tracking pass/fail history per test over time and flagging anything with a non-deterministic signature — passed and failed across otherwise-identical commits, or flipped result on an immediate re-run with zero code changes.

A rough version of the idea, storing outcomes in whatever your CI already writes to (a JSON artifact, a database row, doesn't matter):

```javascript
// crude flaky-score calculator over recent CI runs
function flakyScore(testName, runs) {
  const results = runs
    .filter(r => r.test === testName)
    .slice(-20) // last 20 runs
    .map(r => r.status);

  const flips = results.reduce((count, status, i) => {
    if (i > 0 && status !== results[i - 1]) count++;
    return count;
  }, 0);

  // more flips relative to sample size = more suspicious
  return flips / Math.max(results.length - 1, 1);
}
```

A test with a `flakyScore` near 0 is stable — it either always passes or always fails (the latter is just broken, not flaky, and deserves a different kind of attention). A test with a score creeping toward 0.3+ is flipping constantly and is your quarantine candidate. Tools like this exist off-the-shelf too — most CI platforms (BuildKite, CircleCI, and GitHub Actions via third-party apps) now ship flaky-test analytics. Don't feel obligated to build this from scratch if your CI vendor already tracks it; the calculation above is mainly useful when you're stuck stitching signal together from raw logs.

## Quarantine, Don't Delete

Here's the part teams get wrong under deadline pressure: they find a flaky test and just delete it, or comment it out "temporarily." Six months later nobody remembers it existed, and the bug it used to catch ships straight to production.

Quarantine means the test still runs, its failures are visible, but it can't block the pipeline while someone investigates. In most JS test runners this is a tag plus a separate CI job, not a special framework feature:

```javascript
// tests/checkout.test.ts
describe('checkout flow', () => {
  it('applies discount code', async () => {
    // ...
  });

  it.skip('handles concurrent inventory decrement [FLAKY-QUARANTINE-2841]', async () => {
    // Quarantined 2026-07-18, ticket #2841.
    // Fails ~15% of runs — suspected race in the test's own setup,
    // not the code under test. Do not delete without closing the ticket.
    // ...
  });
});
```

Then run a second CI job — non-blocking, reports to Slack or a dashboard instead of failing the build — that runs *only* the quarantined tests:

```yaml
# .github/workflows/ci.yml (excerpt)
quarantine-watch:
  runs-on: ubuntu-latest
  continue-on-error: true # never blocks merge
  steps:
    - run: npx jest --testPathPattern=quarantine --runInBand
```

This keeps the test alive as a signal without letting it hold the rest of the team hostage. The ticket number in the skip reason isn't decoration — a quarantined test with no linked ticket is a test that will still be skipped two years from now, "fixed" only in the sense that nobody complains about it anymore.

## Where Flakiness Actually Comes From

Once you've got a few quarantined tests, patterns show up fast, and they're rarely "the code under test is broken." The usual suspects, in roughly descending order of how often I've seen each one:

1. **Shared mutable state between tests** — a global counter, a database row, an in-memory cache that one test leaves dirty for the next.
2. **Real time, not mocked time** — `Date.now()`, `setTimeout` races, anything that assumes an operation finishes within an arbitrary window.
3. **Unawaited async work** — a promise that resolves after the assertion already ran, so the test passes or fails depending on scheduler mood.
4. **Test order dependency** — a suite that only works when run in the order it was written, which any parallel test runner will happily violate.

Notice none of these are exotic. They're boring, mechanical bugs *in the tests themselves*. That's actually good news — it means fixing flakiness is usually a Tuesday-afternoon task, not a redesign.

On my team at Cubet, we run the quarantine job as a weekly digest instead of a live dashboard nobody checks — every Monday, whoever's on rotation picks one quarantined test off the top of the list and either fixes the root cause or, if it's genuinely testing something no longer true, deletes it deliberately with a commit message explaining why. Slow and unglamorous, but the quarantine list actually shrinks instead of becoming a graveyard.

## The Payoff

The goal was never a zero-flake test suite — that's not realistic in any system with real I/O. The goal is a suite where **red always means something**, so people stop reflexively re-running failures and start reading them again. That single behavior change is worth more than any coverage number you could chase.

If you've got a test suite right now where "just re-run it" is a known team incantation, that's your answer key. Go find out which tests earned that reputation, run them in a loop fifty times, and get the proof before you decide what to do about them.
