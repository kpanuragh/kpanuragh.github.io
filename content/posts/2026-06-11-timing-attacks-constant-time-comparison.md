---
title: "Timing Attacks: How Your Code Leaks Secrets One Nanosecond at a Time ⏱️"
date: "2026-06-11"
excerpt: "A naive string comparison can leak your secret keys to an attacker who never sees your source code. Here's how timing attacks work, why == is dangerous for secrets, and how constant-time comparison saves you."
tags:
  - security
  - cryptography
  - secrets-management
  - backend
  - nodejs
featured: true
---

Here's a horror story that fits in one line:

```python
if user_token == secret_token:
```

That `==` just made your secret token measurable from the outside. No source code access required.

This is a **timing attack**, and it's one of those vulnerabilities that makes experienced security engineers wince because it's so easy to introduce, so hard to notice in code review, and so elegantly exploitable.

## The Problem: Computers Are Fast and Predictable

When your language runtime compares two strings with `==`, it typically short-circuits: the moment it finds a byte that doesn't match, it stops and returns `false`. That's efficient and completely reasonable for normal string comparisons.

But for secrets, that optimization is a liability.

An attacker sending crafted requests can measure how long your server takes to respond. A token that fails on byte 1 returns faster than one that fails on byte 16. Given enough samples, the attacker can infer correct bytes one at a time — essentially binary-searching your secret key from the outside.

This sounds theoretical until you realize that:
- Modern networking has sub-millisecond consistency in controlled conditions
- The attacker doesn't need your key all at once — they brute-force it incrementally
- Automated tooling for timing attacks has existed for years
- Cloud infrastructure makes it trivial to send thousands of probe requests cheaply

## Seeing It in Slow Motion

Here's what the comparison `"secret123" == "sXXXXXXXX"` looks like byte-by-byte:

```
s == s  ✓ continue
e == X  ✗ return false immediately (fast)
```

Versus `"secret123" == "secXXXXXX"`:

```
s == s  ✓
e == e  ✓
c == c  ✓
r == X  ✗ return false (slower — compared more bytes)
```

The attacker observes that responses to guesses starting with "sec" are ever-so-slightly slower than guesses starting with "sXX". They've just learned the first three bytes without cracking any encryption.

In practice, network jitter makes this noisy, but statistical analysis over thousands of requests smooths that out. It's been demonstrated against real systems, including early HMAC implementations in web frameworks.

## The Fix: Constant-Time Comparison

The solution is to **always compare all bytes**, regardless of where the first mismatch occurs. The result is computed but the early-exit is eliminated.

In Node.js:

```javascript
const crypto = require('crypto');

// WRONG — leaks timing information
function verifyTokenUnsafe(provided, expected) {
  return provided === expected;
}

// RIGHT — constant-time comparison
function verifyToken(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  // timingSafeEqual throws if buffers have different lengths,
  // so check length separately (length itself isn't secret here)
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
```

`crypto.timingSafeEqual` is built into Node's standard library for exactly this reason. Python has `hmac.compare_digest`. Go has `subtle.ConstantTimeCompare` in `crypto/subtle`. Ruby has `Rack::Utils.secure_compare`. Every mature language ecosystem provides this — you just have to reach for it.

## Where This Bites You in Production

The obvious case is token/signature comparison, but timing attacks show up anywhere you compare something secret:

**API key validation:**
```javascript
// Somewhere in your middleware...
if (req.headers['x-api-key'] === process.env.API_KEY) { // ← vulnerable
```

**Password reset token checks** (before you even hit the database):
```javascript
const stored = await db.getResetToken(email);
if (stored === req.body.token) { // ← vulnerable
```

**Webhook signature verification** (ironic, given last month's post on HMAC webhooks):
```javascript
const computed = computeHmac(payload, secret);
if (computed === req.headers['x-signature']) { // ← vulnerable — you did all the hard HMAC work and then fumbled at the finish line
```

That last one is particularly cruel. You went through the trouble of implementing HMAC correctly, and then the comparison itself becomes the attack surface.

At Cubet, we caught exactly this pattern during an internal security review — a webhook handler that computed HMAC correctly but compared the result with `===`. The compute was sound; the comparison wasn't. One-line fix, but it would have been an embarrassing find by an external auditor.

## The Length Check Subtlety

A common mistake when rolling constant-time comparison:

```javascript
// This leaks whether lengths match — usually fine, but be deliberate
if (a.length !== b.length) return false;
return crypto.timingSafeEqual(a, b);
```

For most use cases (API keys, HMAC digests), the length of the expected value isn't secret — it's a well-known format. Returning early on length mismatch is fine and correct. But if the length itself is sensitive information, you'd need to pad both values to a fixed size before comparing.

`timingSafeEqual` throws if lengths differ (rather than returning false), which is why the length pre-check is necessary. Don't skip it or swallow the exception — that exception path would reintroduce timing variance.

## A Dead-Simple Rule

> **Any time you compare a value that an attacker controls against a value that should be secret, use constant-time comparison.**

If you're comparing a hash, a MAC, a token, an API key, or anything derived from a secret: use the constant-time variant. If you're comparing two email addresses to check equality, `==` is fine — the email isn't secret.

The performance difference is negligible for human-scale request rates. The security difference is everything.

## Tooling That Helps

- **Node.js**: `crypto.timingSafeEqual` — built-in, use it
- **Python**: `hmac.compare_digest` (Python 3.3+)
- **Go**: `crypto/subtle.ConstantTimeCompare`
- **PHP**: `hash_equals()` — added specifically for this
- **Ruby**: `Rack::Utils.secure_compare` or `ActiveSupport::SecurityUtils.secure_compare`
- **Rust**: The `subtle` crate provides `ConstantTimeEq`

If you're doing a code review and you see a direct equality comparison on anything that looks like a token, key, signature, or digest — flag it. It takes 30 seconds to fix and potentially avoids a very embarrassing incident report.

---

Timing attacks are one of those vulnerabilities that make you appreciate how much is happening below the abstraction layer you normally work in. Your code isn't just logic — it's a physical process with measurable properties, and those measurements can betray information you thought you were hiding.

Check your token comparisons today. It's a quick grep:

```bash
grep -rn "=== req\|== req\|=== token\|== token" src/
```

Found something suspicious? Drop your language of choice in the comments and I'll point you to the right constant-time function.

---

*Found a timing issue in your own codebase after reading this? I'd love to hear about it — reach me on [X/Twitter](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). And if you want to go deeper on subtle crypto mistakes, follow the blog — there's more coming.*
