---
title: "🎲 Property-Based Testing: Stop Writing Examples, Start Writing Rules"
date: "2026-07-04"
excerpt: "Example-based tests only catch the bugs you already imagined. Property-based testing throws thousands of inputs you'd never think of at your code — and it's shockingly easy to bolt onto an existing Node.js test suite."
tags:
  - testing
  - nodejs
  - code-quality
  - javascript
  - backend
featured: true
---

Here's a confession every backend engineer eventually makes: most of our unit tests are just us writing down the three inputs we already thought of, asserting the output we already expected, and calling it "coverage." We test `add(2, 2)` equals `4`, maybe throw in `add(-1, 5)` for good measure, ship it, and move on. Then production sends `add(NaN, Infinity)` and everything catches fire.

Example-based tests have a fundamental blind spot: they can only catch bugs you already imagined when you wrote them. Property-based testing flips the script. Instead of picking specific inputs, you describe a **rule that should always hold**, and a library generates hundreds or thousands of random inputs trying to break it. It's less "here's an example" and more "here's an invariant — now go prove me wrong."

## The Mental Shift: From Examples to Properties

An example-based test says: "when I call this function with X, I expect Y." A property-based test says: "no matter what I call this function with, this *property* should always be true."

Classic properties to look for:

- **Round-trip**: `decode(encode(x)) === x`
- **Invariant**: sorting a list never changes its length
- **Idempotence**: calling `normalize()` twice gives the same result as calling it once
- **Commutativity**: `merge(a, b)` produces the same result as `merge(b, a)` (when it should)

If you can phrase a rule about your function without naming a specific input, you've found a property worth testing.

## A Real Example: The Pagination Cursor Bug

At Cubet, we had a cursor-encoding utility that base64-encoded a `{ id, timestamp }` pair for pagination. The example tests all passed — a handful of realistic IDs and timestamps round-tripped cleanly. Then a customer with a self-hosted deployment sent us IDs containing unicode characters from a legacy import script, and the cursor decoding silently corrupted them.

Here's the property-based version using [`fast-check`](https://fast-check.dev/), which would have caught it in about four seconds of CI time:

```js
const fc = require('fast-check');
const { encodeCursor, decodeCursor } = require('./cursor');

test('cursor round-trips for any id and timestamp', () => {
  fc.assert(
    fc.property(fc.string(), fc.integer({ min: 0 }), (id, timestamp) => {
      const decoded = decodeCursor(encodeCursor({ id, timestamp }));
      expect(decoded).toEqual({ id, timestamp });
    })
  );
});
```

`fc.string()` doesn't just generate "abc" and "hello" — it deliberately throws empty strings, emoji, surrogate pairs, and control characters at your function, because that's exactly the kind of input that breaks naive base64/JSON assumptions. When it finds a failure, `fast-check` doesn't just report the ugly 40-character string that broke things — it **shrinks** the failing case down to the smallest input that still reproduces the bug. In our case it shrunk a garbled unicode string down to a single lone surrogate character, which made the root cause obvious in seconds instead of an hour of bisecting.

## Where This Pays Off Most in Backend Code

Property-based testing isn't a replacement for your whole test suite — it's a scalpel for the places where "there are too many cases to enumerate" is exactly the problem:

1. **Serialization/deserialization** — any encode/decode pair, especially across service boundaries or database columns.
2. **Parsers and validators** — anything that accepts untrusted strings (query params, headers, config files).
3. **Data transformations** — dedup logic, merge functions, diffing algorithms, anything with a "this should be equivalent regardless of order" claim.
4. **Numeric/date math** — timezone conversions, currency rounding, rate-limiting windows. This is where `NaN`, negative zero, and DST boundaries live to embarrass you.

Here's a small one worth stealing directly — testing that a `dedupe` function is idempotent and order-independent, using arrays instead of hand-picked fixtures:

```js
test('dedupe is idempotent regardless of input order', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const once = dedupe(arr);
      const twice = dedupe(once);
      expect(twice).toEqual(once);
      expect(new Set(once).size).toBe(once.length);
    })
  );
});
```

No fixture file, no hand-crafted array of "tricky" numbers — `fast-check` will happily generate duplicates, empty arrays, and arrays of length 200 on its own.

## The Honest Trade-offs

Property-based testing isn't free lunch:

- **Properties are harder to write than examples.** You need to actually understand the invariant your code is supposed to uphold, which is sometimes the hard design work you were avoiding by writing example tests in the first place.
- **Flaky-looking failures.** A property test that fails intermittently because of a bad generator range (say, floats near `Number.MAX_SAFE_INTEGER`) can look like flakiness when it's actually a legitimately rare edge case. Pin the failing seed (`fast-check` prints one) and replay it deterministically rather than shrugging it off.
- **Slower CI runs.** Running 100 generated cases per test adds up. Most teams cap `numRuns` lower in CI (50–100) and crank it higher for a nightly "fuzz" job that runs against the same test files with `numRuns: 10000`.

## Where to Start

You don't need to rewrite your test suite. Pick the one function in your codebase that scares you the most — the one where you keep adding one-off regression tests every time someone finds a new edge case — and give it a single property test instead. If it's a round-trip function, that's a five-minute win. If `fast-check` immediately shrinks a failure down to something embarrassing, you'll be hooked.

Have a function you'd bet your properties couldn't survive `fast-check` for more than a minute? Try it and report back — I promise the shrunk-down counterexample will be more interesting than whatever example you would've written by hand.
