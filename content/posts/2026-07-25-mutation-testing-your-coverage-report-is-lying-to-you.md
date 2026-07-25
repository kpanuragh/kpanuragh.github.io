---
title: "🧟 Mutation Testing: Your 100% Coverage Report Is Lying to You"
date: "2026-07-25"
excerpt: "Code coverage tells you which lines ran. It says nothing about whether your assertions would notice if the logic on those lines were wrong. Mutation testing fixes that by breaking your code on purpose — here's how it works and why your 'green' suite might be a green screen of nothing."
tags: ["testing", "code-quality", "backend", "nodejs", "microservices"]
featured: true
---

Here's a sentence that should terrify you more than it does: a test suite can hit 100% code coverage and still not catch a single real bug. Not hypothetically — reliably, in production code, right now, in your repo.

Coverage counts which lines *executed* during a test run. It says absolutely nothing about whether the test would have *failed* if the logic on those lines were subtly wrong. Those are two completely different claims, and the industry has spent a decade treating them as the same one.

I found this out the expensive way at Cubet Techno Labs, reviewing a payment-reconciliation service that proudly reported 100% coverage. I deleted a `>=` and replaced it with `>` as an experiment. Every single test still passed. The suite had exercised that comparison thousands of times across its test run — it had just never once *checked* the boundary that comparison existed to protect.

## The Test That Executes Everything and Asserts Nothing

Here's the toy version of what I found, an overdraft check:

```javascript
function canWithdraw(balance, amount) {
  return balance >= amount;
}
```

And the "thorough" test that earned it 100% coverage:

```javascript
test('canWithdraw checks the balance', () => {
  expect(canWithdraw(100, 50)).toBe(true);
  expect(canWithdraw(50, 100)).toBe(false);
});
```

Looks reasonable. It even covers both branches of intuition — enough money, not enough money. But swap `>=` for `>` and run it again: both assertions still pass, because neither test exercises the case where `balance === amount`. The line ran. The bug shipped. Coverage was green the entire time.

This is the exact class of bug that ships in distributed systems constantly — off-by-one boundaries in retry limits, rate limiter thresholds, pagination cursors, timeout comparisons. Coverage tools are structurally blind to all of them, because "did this line run" and "did we assert anything meaningful about it" are unrelated questions.

## What Mutation Testing Actually Does

Mutation testing flips the whole exercise around. Instead of asking "did my tests run this code," it asks "if I deliberately broke this code, would my tests notice?"

A mutation testing tool (Stryker is the standard for JS/TS, PIT for the JVM world) parses your source, and for every line generates small deliberate corruptions — "mutants." Flip `>=` to `>`. Flip `&&` to `||`. Delete a line. Change `+` to `-`. Replace a return value with a hardcoded constant. Then it reruns your entire test suite against each mutant version of the code.

Three outcomes per mutant:

- **Killed** — a test failed. Good. Your suite noticed the corruption.
- **Survived** — everything still passed. Bad. That mutant is proof some behavior in your code has zero test coverage that actually matters, coverage-report be damned.
- **Timeout/no-coverage** — the mutated line never ran at all, which your coverage tool would've caught anyway.

Your real quality number isn't "% lines covered." It's "% mutants killed" — your **mutation score**. A codebase can sit at 100% coverage and 40% mutation score simultaneously, and that gap is exactly the bugs waiting to happen.

Running it on a small Node service with Stryker looks like this:

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner
npx stryker init   # generates stryker.conf.json, pick jest as the test runner
npx stryker run
```

The report it spits out reads like a bug bounty against your own suite: file by file, mutant by mutant, showing you the exact line, the exact corruption, and whether anything caught it.

## Why This Matters More in Microservices, Not Less

You'd think mutation testing matters less once you've split a monolith into a dozen services — smaller surface area per service, right? Backwards. In a microservices world, each service's unit tests are frequently the *only* verification that ever runs against its internal logic before a contract test or an integration test takes over at the boundary. If the unit-level assertions are hollow — asserting "no error was thrown" instead of "the correct value came back" — nothing downstream is positioned to catch it either. Contract tests verify shape, not arithmetic. A rate-limiter service with a survived mutant on its threshold comparison will happily pass every consumer contract test while quietly letting one extra request through per window, forever, undetected, because nothing anywhere in the pipeline was ever asked to check that specific boundary.

The failure mode compounds with scale: more services means more places for a hollow assertion to hide, and a smaller blast radius per service makes each individual gap look less urgent — right up until three of them line up on the same request path.

## Where This Actually Pays Off (and Where It Doesn't)

Don't run mutation testing on your whole monorepo on every commit — it's computationally expensive by design, since it means running your entire suite once per mutant, and a mid-size service can generate hundreds of mutants. Nobody's CI budget wants that on every push.

Where it earns its cost:

- **Run it locally or in a scheduled nightly job**, not on every PR.
- **Target the modules where a silent logic bug is expensive** — billing, auth, rate limiting, anything with numeric boundaries or state transitions. Skip it for glue code and config loaders.
- **Treat a survived mutant as a prompt to write one sharper assertion, not a mandate to hit some arbitrary score.** Chasing 100% mutation score is exactly as pointless as chasing 100% coverage — some mutants are functionally equivalent to the original code and can never be killed no matter how good your tests are.
- **Use it to review PRs that add "obvious" logic.** The overdraft check above looked obvious. That's precisely why nobody double-checked the boundary.

Coverage answers "did we run it." Mutation testing answers "would we know if it broke." Only one of those questions is the one you actually care about at 3am when the pager goes off. Go point Stryker at whatever module in your codebase has the scariest boundary condition and see what survives — I'd bet real money something does.
