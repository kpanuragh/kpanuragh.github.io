---
title: "🧬 Mutation Testing: Your Tests Pass, But Do They Actually Test Anything?"
date: "2026-06-27"
excerpt: "100% code coverage and a green CI pipeline — yet silent logic bugs still sneak into production. Mutation testing is the brutal honesty your test suite has been avoiding."
tags: ["testing", "mutation testing", "code quality", "backend", "node.js"]
featured: true
---

# 🧬 Mutation Testing: Your Tests Pass, But Do They Actually Test Anything?

Here's a scenario that should make you uncomfortable: your CI pipeline is green, your coverage report shows 87%, and you're feeling genuinely good about your codebase. Then production goes sideways because of a logic bug that your tests technically *executed* — they just never *checked* the result.

Welcome to the dirty secret of code coverage metrics. They measure which lines ran, not whether you verified anything meaningful about those lines. You can hit 100% coverage with tests that assert nothing of substance.

Mutation testing is the answer to that problem. It's also slightly terrifying, which is probably why most teams avoid it.

## What Is Mutation Testing?

The idea is elegantly brutal: take your source code, introduce a small deliberate bug (called a **mutant**), then run your test suite. If at least one test fails, the mutant is **killed** — your tests caught the bug. If all tests still pass with a bug sitting in your code, the mutant **survived** — and you have a real gap in your test suite.

A mutation testing tool does this thousands of times, generating mutations like:

- Changing `>` to `>=` (boundary condition flip)
- Changing `+` to `-` (arithmetic swap)
- Replacing `&&` with `||` (logical operator flip)
- Negating a boolean return (`return true` → `return false`)
- Removing a function call entirely

Your **mutation score** is `killed mutants / total mutants`. A score of 80%+ is generally considered healthy. Below 50% means your test suite is basically decorative.

## The Green Test Suite That Lies

Here's a canonical example. Suppose you have a discount calculation function:

```typescript
// src/pricing.ts
export function calculateDiscount(orderTotal: number, customerTier: string): number {
  if (customerTier === 'premium' && orderTotal > 100) {
    return orderTotal * 0.2;
  }
  if (orderTotal > 50) {
    return orderTotal * 0.1;
  }
  return 0;
}
```

And here are tests that give you "coverage":

```typescript
// src/pricing.test.ts
import { calculateDiscount } from './pricing';

test('calculates discount for premium customer', () => {
  const result = calculateDiscount(200, 'premium');
  expect(result).toBeGreaterThan(0); // 🚩 weak assertion
});

test('calculates discount for regular customer', () => {
  const result = calculateDiscount(75, 'regular');
  expect(result).not.toBeNull(); // 🚩 even weaker
});

test('returns zero for small order', () => {
  const result = calculateDiscount(30, 'regular');
  expect(result).toBe(0); // this one's actually fine
});
```

This achieves 100% branch coverage. But a mutation testing tool like **Stryker** will have a field day. It'll flip `orderTotal > 100` to `orderTotal >= 100`, change `0.2` to `0.1`, swap `&&` to `||` — and most of those mutants will *survive* because `toBeGreaterThan(0)` doesn't care about the exact value. Your tests are passing; they're just not doing anything useful.

## Running Stryker on a Node.js Project

[Stryker Mutator](https://stryker-mutator.io) is the standard mutation testing framework for JavaScript and TypeScript.

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/jest-runner
```

```json
// stryker.config.json
{
  "testRunner": "jest",
  "reporters": ["html", "clear-text"],
  "coverageAnalysis": "perTest",
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"]
}
```

Run it with `npx stryker run`. The HTML report it generates is genuinely sobering — each surviving mutant is highlighted with exactly what change was introduced and which tests ran without catching it.

After running this on the pricing example, you'd see something like:

```
Survived mutant in pricing.ts (line 2):
  - customerTier === 'premium' && orderTotal > 100
  + customerTier === 'premium' || orderTotal > 100

  Tests ran:
    ✓ calculates discount for premium customer
    ✓ calculates discount for regular customer
    ✓ returns zero for small order
  All passed — mutant survived 🧟
```

Now you know exactly where your tests are lying to you.

## Writing Tests That Actually Kill Mutants

The fix isn't complicated — it's just discipline. Pin your assertions to specific values and explicitly cover boundary conditions:

```typescript
test('applies 20% discount for premium customers over $100', () => {
  expect(calculateDiscount(200, 'premium')).toBe(40); // 200 * 0.2 exactly
});

test('does NOT apply premium discount below the $100 threshold', () => {
  expect(calculateDiscount(99, 'premium')).toBe(9.9); // falls to 10% tier
});

test('applies 10% discount for orders between $50 and $100', () => {
  expect(calculateDiscount(75, 'regular')).toBe(7.5);
});

test('boundary: $100 exactly is NOT premium-eligible (> not >=)', () => {
  expect(calculateDiscount(100, 'premium')).toBe(10); // 10%, not 20%
});
```

Notice that last test. It exists specifically to verify the boundary condition on `orderTotal > 100`. Without mutation testing nudging you, you'd almost certainly never write it. With it, you catch the kind of off-by-one bug that causes a support ticket three months later when someone's $100.00 order gets the wrong discount tier.

## Practical Advice: Don't Boil the Ocean

At Cubet, we don't run mutation testing on every PR — the feedback loop is too slow for that. A full Stryker run on a large service can take 20+ minutes, which is a CI death sentence. Instead we use it strategically:

**On critical business logic.** Pricing engines, authorization checks, financial calculations. These are the places where a surviving `>` vs `>=` mutant costs real money or creates a security hole.

**As a periodic audit.** Run it once a month on your core domain modules and use the HTML report to prioritize test improvements as a team. The "survived mutants" list is a remarkably actionable backlog.

**When reviewing thin tests.** If a PR adds complex logic but the tests look like they just poke the happy path, running Stryker on the changed files in a few seconds of local testing tells you immediately whether the tests are load-bearing.

You can scope Stryker to specific files to keep it fast:

```bash
npx stryker run --mutate "src/pricing.ts"
```

Targeted runs finish in seconds and fit naturally into a pre-commit check on modified files.

## The Real Value: Changing How You Think About Tests

The biggest impact mutation testing has had on my work isn't the tooling — it's the mental model shift. Before writing a test now, I ask: *what mutations in this code would this test catch?* That question naturally pushes you toward specific assertions over vague ones, toward boundary conditions over happy-path-only coverage, and toward tests that document *intent* rather than just touching code paths.

There's a useful corollary too: if you can't describe what mutation your test would kill, the test probably isn't testing anything. It might be executing code, but execution isn't verification.

Code coverage will tell you your tests ran. Mutation testing will tell you if they *worked*. The difference becomes very apparent when you're refactoring a payment calculation at 11pm and you need to actually trust that your test suite has your back.

## Try It This Week

Pick the most critical module in your codebase — the one where a bug would hurt most. Install Stryker, run it, look at your mutation score without flinching. I'll bet there's at least one `&&` to `||` swap that sails right through your tests undetected.

Your tests should be the thing that makes you confident to ship. Make sure they've actually earned that trust.
