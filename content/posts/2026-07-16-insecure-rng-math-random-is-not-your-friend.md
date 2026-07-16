---
title: "🎲 Insecure RNG: Math.random() Is Not Your Friend"
date: "2026-07-16"
excerpt: "Math.random() is great for shuffling a UI animation and catastrophic for generating a password-reset token. Here's why 'random-looking' and 'unpredictable' are completely different properties, and how to tell which one your code actually needs."
tags:
  - security
  - cryptography
  - secrets-management
  - cybersecurity
  - javascript
featured: true
---

Here's a sentence that should make every engineer flinch: "we generate the reset token with `Math.random()`." I've seen it in production code more times than I'd like to admit, and every single time the reasoning was the same — it looked random, the tests passed, nobody complained. Then someone points out that `Math.random()` output can be *predicted*, and the room goes quiet.

Let's talk about why "looks random to a human" and "is unpredictable to an attacker" are two completely different bars, and why mixing them up is one of the more forgivable-sounding, actually-quite-bad mistakes in application security.

## PRNGs aren't broken, they're just doing their job

`Math.random()` is a pseudo-random number generator (PRNG). It's deterministic: seed it with the same internal state, and it produces the same sequence of numbers every time. That's not a bug — it's exactly what you want for things like procedurally generated game levels, dithering an image, or picking which of ten loading messages to show. Reproducibility and speed are the design goals.

The problem is that most JS engines implement `Math.random()` with algorithms like xorshift128+ (V8's current choice). These are fast and statistically well-distributed, but they are **not cryptographically secure** — meaning if an attacker observes a handful of outputs, they can often reconstruct the internal state and predict every future (and sometimes past) value the generator will produce. Researchers have published working state-recovery attacks against V8's `Math.random()` using as few as a couple dozen consecutive outputs.

So the moment you use it for anything an attacker benefits from guessing — a password reset token, a session ID, an API key, a CSRF token, an OTP — you've handed them a tractable math problem instead of a wall.

## What this actually looks like in code

```js
// Looks reasonable. Is not.
function generateResetToken() {
  return Math.random().toString(36).substring(2, 15);
}
```

This "works" in the sense that it produces a token, the email gets sent, the link resolves, QA signs off. Nothing about the feature *looks* broken. But an attacker who can observe even a few tokens your app has generated — maybe from their own account, from a leaked log, from a public support forum where someone pasted a reset link — has enough signal to start narrowing down the PRNG's internal state and predicting tokens for other users.

The fix is not "add more entropy to the string," it's "use a different primitive entirely":

```js
// Node.js / server-side
const crypto = require('crypto');

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex'); // 256 bits, CSPRNG-backed
}
```

```js
// Browser / edge runtime
function generateResetToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes); // Web Crypto API, CSPRNG-backed
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
```

Both `crypto.randomBytes` and `crypto.getRandomValues` are backed by the operating system's CSPRNG (cryptographically secure pseudo-random number generator) — `/dev/urandom` on Linux, `CryptGenRandom`/`BCryptGenRandom` on Windows. These are specifically designed so that observing outputs gives you no practical way to predict future ones. That's the actual property you need for a security token, and `Math.random()` was never designed to provide it.

## The rule of thumb that actually scales

You don't need to memorize a list of "sensitive" use cases. Ask one question: **if an attacker predicted this exact value, would that let them do something they shouldn't?**

- Shuffling a playlist? No harm in a predictable shuffle. `Math.random()` is fine.
- Picking a random loading quote? Fine.
- Generating a session ID, API key, password reset token, invite code, CSRF token, or any value used as a secret or a capability? If someone predicts it, they impersonate a user, bypass a check, or take over an account. Use a CSPRNG, full stop.

A useful gut check I've started applying on code review at Cubet Techno Labs: any `Math.random()` call where the result gets stored in a database column named something like `token`, `key`, `secret`, or `code` gets an automatic second look. It's a cheap grep-able signal — `grep -rn "Math.random()" src/ | grep -iE "token|secret|key|otp|code"` — that's caught more than one of these before it shipped.

## It's not just tokens — watch for "random enough" IDs too

The other place this sneaks in is places that don't *feel* like security code:

```js
// "Just" a unique-ish order ID... that's also used to look up order status
// without requiring login, because "it's basically a secret URL."
const orderId = Math.random().toString(36).substring(2, 10);
```

Nobody labeled this a security control, but functionally it is one — anyone who can predict `orderId` values can enumerate other customers' orders. This is the classic IDOR-adjacent trap: the moment an "internal-ish" identifier doubles as an access-control mechanism, it inherits all the requirements of a real secret, whether or not anyone wrote that down.

## The takeaway

`Math.random()` isn't insecure in the abstract — it's insecure *for the job people keep giving it*. It was built for speed and statistical distribution, not unpredictability, and those are genuinely different engineering problems with different correct tools. When the value you're generating is standing in for "something an attacker must not be able to guess," reach for `crypto.randomBytes` or `crypto.getRandomValues` and move on with your day. It costs you nothing — same API shape, marginally more typing — and it closes a class of bug that's invisible in code review until someone specifically knows to look for it.

---

Spotted a `Math.random()`-flavored token generator in the wild, or have your own "it passed every test but was still predictable" story? I'd genuinely like to hear it — find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
