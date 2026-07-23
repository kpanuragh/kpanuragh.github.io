---
title: "⏱️ Timing Attacks: The Bug Hiding in Your `===`"
date: "2026-07-23"
excerpt: "Your API key check looks perfectly correct. It's also a side channel that leaks your secret one byte at a time, purely because of how fast `===` bails out. Let's talk about why comparing secrets needs its own rules."
tags:
  - security
  - cryptography
  - secrets-management
  - cybersecurity
  - appsec
featured: true
---

Quick quiz: what's wrong with this code?

```javascript
function isValidApiKey(provided, expected) {
  return provided === expected;
}
```

Functionally? Nothing. It correctly returns `true` when the strings match and `false` when they don't. Any code review would sail this through. And that's exactly the problem — this bug doesn't show up in a code review, a unit test, or a linter. It shows up in a stopwatch.

## The leak nobody's looking for

`===` on strings (in JavaScript, and the equivalent in most languages) is implemented as a **short-circuiting** comparison. It walks both strings character by character and returns `false` the instant it finds a mismatch. That's a perfectly sensible optimization for literally every use case except one: comparing secrets against attacker-supplied input.

If an attacker can measure how *long* your comparison takes, they can learn how many leading characters they got right. Guess a byte, measure the delta, keep the byte that took longest, repeat. It's slow — but it turns "guess a 32-character API key" from an astronomically infeasible `62^32` brute force into 32 independent single-character guesses. That's the difference between "not in this universe" and "a Tuesday afternoon."

This is a real, exploitable class of bug — it has a name (CWE-208), it's been used to steal HMAC signatures and session tokens in the wild, and it's why every serious crypto library ships a "constant-time compare" function that most engineers have never heard of and never call.

## Where it actually bites

The classic target is anything that compares a secret to user input over a network boundary with fine-grained timing available:

- **Webhook signature verification** — comparing an `X-Hub-Signature` HMAC against your computed one
- **API key / bearer token checks** on internal endpoints that skip a "real" auth middleware
- **Password reset token validation** — these are often compared with plain `===` because "it's just a token, not the password"

Notice the pattern: it's never the login form (network jitter usually drowns out a single string compare there). It's the machine-to-machine paths — webhooks, internal APIs, CI callback URLs — where requests can be fired thousands of times in a tight loop with low, consistent latency. That's where the signal rises above the noise.

## The fix: compare in constant time

The fix isn't clever crypto — it's refusing to short-circuit. A constant-time comparison always inspects every byte, regardless of where the first mismatch is, so the timing is the same whether you got byte one wrong or byte thirty-one right.

Node's `crypto` module ships one:

```javascript
const crypto = require('crypto');

function safeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  // Lengths differ up front? Still hash-compare to avoid a length oracle.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, crypto.randomBytes(bufA.length));
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
```

Note the length check: `timingSafeEqual` throws if the buffers aren't the same length, and if you just `return false` immediately on a length mismatch, you've reintroduced a (smaller, but real) timing oracle — attackers can now learn your secret's *length* for free. The dummy comparison above keeps the cost roughly constant either way.

Most languages have the equivalent — Python's `hmac.compare_digest`, PHP's `hash_equals`, Go's `subtle.ConstantTimeCompare`, Java's `MessageDigest.isEqual`. The rule is the same everywhere: if a string is a secret and the other side of the comparison is attacker-influenced, route it through the constant-time function, full stop.

## The one-line trap: HMAC webhook checks

This is the single most common place I see this bug in real code, because it's disguised as "verifying a signature," which sounds like it's already handled correctly:

```javascript
// Looks secure. Isn't.
const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
if (computed === signatureFromHeader) {
  processWebhook(payload);
}
```

Swap that one line:

```javascript
const computed = crypto.createHmac('sha256', secret).update(payload).digest('hex');
if (safeCompare(computed, signatureFromHeader)) {
  processWebhook(payload);
}
```

Same logic, same output — just no side channel. When I set up webhook receivers on my team at Cubet, this line goes into the code review checklist explicitly, because it's the kind of thing that passes every functional test and every "does this work" manual check while quietly being wrong.

## Why it's easy to miss

Timing attacks don't trip any of your normal safety nets. They pass unit tests (the assertion is correct!). They pass a security scanner that checks for SQL injection and XSS but has no model of "how long did this take." They pass a manual pentest unless the tester specifically brings statistical timing analysis to the table, which most don't, because it's genuinely finicky over a real network with jitter.

That's exactly why this class of bug survives in production for years — it needs someone to go looking for it on purpose, and "compare two strings" doesn't feel like the kind of line that deserves a second look.

## The takeaway

Not every `===` is a vulnerability — comparing two non-secret values is fine, that's what it's for. The rule is narrow but absolute: **if one side of a comparison is a secret and the other side comes from the network, the comparison must run in constant time.** It costs you nothing — same result, negligible performance difference — and it closes off an entire attack class that your test suite will never catch on its own.

Go grep your codebase for `=== signature`, `=== token`, `=== apiKey`. It's a five-minute search that might find a five-year-old bug.

---

Found this useful, or found the bug in your own codebase? Come yell at me about it:

- Twitter/X: [@anuragh_kp](https://twitter.com/anuragh_kp)
- GitHub: [kpanuragh](https://github.com/kpanuragh)
- LinkedIn: [anuraghkp](https://linkedin.com/in/anuraghkp)
