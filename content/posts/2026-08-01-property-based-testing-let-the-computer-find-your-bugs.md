---
title: "🎲 Property-Based Testing: Let the Computer Find Your Bugs For You"
date: "2026-08-01"
excerpt: "Example-based tests only check the inputs you thought of, which is exactly the problem when the bug lives in the input you didn't think of. Property-based testing throws thousands of generated cases at your code and automatically shrinks any failure down to the smallest possible reproduction. Here's how it works, and why it found a bug I'd been shipping for months."
tags: ["testing", "code-quality", "backend", "nodejs"]
featured: true
---

Every test you've ever written has the same blind spot: it only checks the inputs you personally thought to type in. `expect(add(2, 3)).toBe(5)`. Great, `add` works for 2 and 3. Does it work for `-0`? For `Number.MAX_SAFE_INTEGER + 1`? For a string that coerces weirdly? You didn't think of those, so your test suite has no opinion about them, and neither does your CI pipeline — right up until production hands your function an input you never imagined and it falls over in front of a customer.

Property-based testing exists because you are, provably, bad at imagining edge cases. Instead of writing individual examples, you write a *property* — a statement that should hold true for **all** valid inputs — and a library generates hundreds or thousands of random inputs trying to break it. When it finds one that breaks your property, it doesn't just hand you the ugly random value it stumbled on. It **shrinks** the failure, whittling it down through smaller and smaller inputs until it finds the minimal case that still fails. You go from "it broke on `[-847293, 0, 118, -3, 99182]`" to "it broke on `[0, -1]`" without touching a debugger.

## An Example Test That Lies to You

Say you're writing a function to remove duplicates from a sorted array of numbers — a classic warm-up interview question that somehow always makes it into real codebases:

```javascript
function dedupeSorted(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== arr[i + 1]) {
      result.push(arr[i]);
    }
  }
  return result;
}
```

Example-based tests pass without complaint:

```javascript
test('removes duplicates', () => {
  expect(dedupeSorted([1, 1, 2, 3, 3])).toEqual([1, 2, 3]);
  expect(dedupeSorted([])).toEqual([]);
});
```

Looks done. Ship it. Except try `dedupeSorted([1, 2, 2, 2, 3])` by hand and you get `[1, 2, 3]` — correct, lucky. Now try `dedupeSorted([1, NaN, NaN])`. Since `NaN !== NaN` is always `true`, the function thinks every `NaN` is unique and keeps every one of them. Nobody wrote that test case because nobody sits down and thinks "let me specifically try `NaN` today." A generator will, because it doesn't have your assumptions about what a "reasonable" number looks like.

## Writing the Property Instead of the Examples

Here's the same function tested with [fast-check](https://github.com/dubzzz/fast-check), a property-based testing library for JavaScript:

```javascript
const fc = require('fast-check');

test('dedupeSorted never grows the array and only removes adjacent dupes', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer()).map(a => [...a].sort((x, y) => x - y)),
      (sortedArr) => {
        const result = dedupeSorted(sortedArr);
        // property 1: output is never longer than input
        if (result.length > sortedArr.length) return false;
        // property 2: no two adjacent elements in the output are equal
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i] === result[i + 1]) return false;
        }
        return true;
      }
    )
  );
});
```

Note what changed: I'm not asserting a specific output for a specific input anymore. I'm asserting invariants that must hold *no matter what sorted array you throw at it*. `fast-check` will generate hundreds of sorted integer arrays — empty ones, huge ones, ones full of the same repeated value, ones with negative numbers — and if any single one violates either property, the test fails and prints the shrunk minimal counterexample straight to your terminal.

I actually found the `NaN` bug this way at Cubet Techno Labs, except in a real version of this function that deduplicated event timestamps pulled from a message queue. A generator producing `fc.float()` values happily included `NaN` because floats include `NaN`, the property failed instantly, and fast-check shrank a 40-element failing array down to `[NaN, NaN]` before I'd even finished reading the stack trace. That's the entire pitch in one anecdote: it doesn't just find the bug, it hands you the bug pre-minimized.

## The Property That's Always Free: Round-Tripping

If your function has an inverse — serialize/deserialize, encode/decode, compress/decompress — you get a property almost for free, and it's one of the highest signal-to-effort tests you can write:

```javascript
test('JSON round-trip preserves equivalent data', () => {
  fc.assert(
    fc.property(fc.jsonValue(), (value) => {
      const roundTripped = JSON.parse(JSON.stringify(value));
      return JSON.stringify(roundTripped) === JSON.stringify(value);
    })
  );
});
```

This pattern generalizes to almost anything with a symmetric pair of operations: your custom URL query-string encoder, your Base64-ish ID obfuscator, your Redis cache key serializer. If `decode(encode(x))` doesn't equal `x` for *some* generated `x`, you've found a real bug, and you found it before a customer's weirdly-encoded email address did it for you.

## Where It Actually Pays Off (and Where It Doesn't)

Property-based testing is not a replacement for example-based tests — it's a complement. Examples are great documentation: "here's what this function does for the case everyone cares about." Properties are great bug hunters for the cases nobody thought to document. It shines hardest on pure functions with clear invariants: parsers, serializers, validators, sorting and searching, anything doing math on money or dates. It's mostly wasted effort on code whose entire job is orchestrating side effects — there's no interesting "property" of "did this function call the payment gateway," that's still an example-based mock assertion's job.

The setup cost is also real. Writing a good property takes more thought than writing a good example, because you have to actually articulate the invariant instead of just picking a number that feels representative. But that thinking is exactly the thinking you skipped when you wrote `expect(add(2,3)).toBe(5)` and called it done.

If you've got a function anywhere in your codebase that parses, encodes, sorts, or does arithmetic on user-controlled input, it already has an untested edge case sitting in it. Pick one, install `fast-check` or your language's equivalent (Hypothesis for Python, QuickCheck for Haskell, jqwik for Java), write one property, and let the shrinker do the archaeology for you. It'll probably find something.
