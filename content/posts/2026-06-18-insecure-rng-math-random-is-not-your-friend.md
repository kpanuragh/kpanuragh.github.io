---
title: "🎲 Insecure RNG: Math.random() Is Not Your Friend"
date: 2026-06-18
excerpt: "Using Math.random() for tokens, passwords, or anything security-related is like locking your house with a combination lock and telling everyone the combination follows a predictable pattern. Here's why — and what to use instead."
tags:
  - security
  - cryptography
  - javascript
  - secrets-management
  - web-development
featured: true
---

Let me tell you about the time someone at Cubet generated a "random" password reset token using `Math.random()`. It passed code review. It went to production. It worked fine — until it didn't.

The bug wasn't obvious. It never is with insecure randomness. The token *looked* random. It had numbers and decimal points and everything. But randomness that merely *looks* random and randomness that *is* random are about as similar as a painted padlock and a real one.

## What Math.random() Actually Does

Here's the uncomfortable truth: `Math.random()` does not generate random numbers. It generates *pseudo-random* numbers — values produced by a deterministic algorithm seeded with some initial value.

The V8 engine (Node.js, Chrome) uses an algorithm called **xorshift128+** under the hood. It's fast, it produces numbers that pass statistical randomness tests, and it's completely predictable if you know the internal state.

That last part is the problem.

```js
// This is what you think you're doing:
const token = Math.random().toString(36).substring(2); // "k7f3m2x9"

// This is what you're actually doing:
// Generating a deterministic value from a seed that can potentially be recovered
// by observing enough outputs from the same process.
```

Researchers have demonstrated that observing just a handful of `Math.random()` outputs from a running browser tab is enough to reconstruct the internal PRNG state and predict all future values. Your "random" token is predictable.

## The Attack That Doesn't Get Enough Press

The classic attack against weak PRNGs goes like this:

1. An attacker requests a bunch of password reset emails for throwaway accounts on your site
2. They observe the tokens in those emails
3. They reverse-engineer or brute-force the PRNG seed
4. They predict the next token — the one that happens to belong to your admin account
5. Game over

This sounds theoretical until you read about CVEs where production systems shipped exactly this pattern. It's not exotic. It's embarrassingly common.

At Cubet, we do security reviews before shipping anything auth-adjacent, and `Math.random()` in a token generation path is an instant fail. Not "fix before next sprint" — fix before this PR merges.

## The Right Tool: Cryptographically Secure PRNGs

A Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) is designed specifically so that knowing previous outputs gives you *zero* information about future ones. The internal state is large, seeded from genuine entropy (hardware noise, OS entropy pool), and computationally infeasible to reconstruct.

**In Node.js:**

```js
import { randomBytes, randomUUID } from 'crypto';

// For a random token (URL-safe base64, 32 bytes = 256 bits of entropy)
const secureToken = randomBytes(32).toString('base64url');
// → "Xk3mP9qLwRzV8nYcD4tA7sH2eB5iCfJg0KuNvM1T6oE"

// For a UUID (version 4 — uses crypto.randomUUID internally in modern Node)
const id = randomUUID();
// → "f47ac10b-58cc-4372-a567-0e02b2c3d479"
```

**In the browser:**

```js
// crypto.getRandomValues is available in all modern browsers
const array = new Uint8Array(32);
crypto.getRandomValues(array);

// Convert to hex string
const token = Array.from(array)
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

The difference in complexity is minimal. The difference in security is enormous. There is genuinely no reason to reach for `Math.random()` in any security context.

## How Much Entropy Is Enough?

While we're here: entropy matters, not just the algorithm.

A 6-character alphanumeric token has roughly 36 bits of entropy. Sounds like a lot. It isn't — modern GPUs can brute-force that in seconds. Password reset tokens, CSRF tokens, session identifiers — aim for **at least 128 bits**, and 256 bits if you're paranoid (you should be).

```js
// Too short — 6 chars ≈ ~36 bits — don't do this
const weakToken = randomBytes(4).toString('hex'); // 8 hex chars, 32 bits

// Reasonable — 32 bytes = 256 bits of entropy — do this
const strongToken = randomBytes(32).toString('base64url');
```

The `base64url` encoding keeps tokens URL-safe without the `+`, `/`, and `=` characters that cause encoding headaches in query strings and cookies.

## Quick Reference: When to Use What

| Use Case | Wrong | Right |
|---|---|---|
| Session tokens | `Math.random()` | `randomBytes(32)` |
| Password reset links | `Date.now()` | `randomBytes(32)` |
| CSRF tokens | Sequential counter | `randomBytes(16)` |
| UUID for records | Timestamp-based | `randomUUID()` |
| Shuffle an array for display | `sort(() => Math.random() - 0.5)` | `Math.random()` is fine here |

Note that last row. `Math.random()` is perfectly acceptable for non-security uses — shuffling a playlist, picking a random color, animations. The problem is specifically when the unpredictability of the output has security implications.

## The Linter That Could Save You

Add this to your ESLint config if you're on a security-sensitive codebase:

```json
{
  "rules": {
    "no-restricted-globals": [
      "error",
      {
        "name": "Math",
        "message": "Use crypto.randomBytes() or crypto.randomUUID() instead of Math.random() for anything security-related."
      }
    ]
  }
}
```

Yes, this will be annoying when you want `Math.PI` or `Math.floor`. Fine-tune it to your team's needs — the point is to make the wrong thing require justification.

## The Takeaway

`Math.random()` is great at producing numbers that *look* random for display purposes. It is catastrophically bad at producing numbers that *need to be* unpredictable for security purposes. The fix is one import statement away, costs nothing in performance for token-sized operations, and is the kind of thing that separates "it worked until someone attacked it" from "it actually works."

Treat entropy like a resource. Use the OS entropy pool for anything that needs to be secret. Never let a PRNG designed for games and simulations guard your authentication paths.

---

Found a `Math.random()` lurking in a token generator? Swap it out and drop me a note — I'm [@iamanuragh](https://x.com/iamanuragh) on X or [connect on LinkedIn](https://linkedin.com/in/iamanuragh). The fix takes 30 seconds; the satisfaction lasts longer.
