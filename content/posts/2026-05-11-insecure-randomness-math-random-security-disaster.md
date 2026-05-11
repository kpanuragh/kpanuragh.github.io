---
title: "🎲 Math.random() Is Gambling With Your Users' Security"
date: "2026-05-11"
excerpt: "You're using Math.random() to generate password reset tokens? A hacker can predict your 'random' numbers and own every account on your platform. Here's why crypto-insecure randomness is a silent killer — and how to fix it in 5 minutes."
tags: ["cybersecurity", "web-security", "javascript", "nodejs", "cryptography"]
featured: true
---

# 🎲 Math.random() Is Gambling With Your Users' Security

Picture this: you need to generate a password reset token. You reach for the trusty `Math.random()`. It feels right. It's built-in. It's fast. What could go wrong?

Everything. Absolutely everything. 😬

Welcome to **Insecure Randomness** — the vulnerability that's shipped in more production codebases than anyone wants to admit. Let's talk about why your "random" numbers might not be random at all, and why that's catastrophic for security.

## Why Math.random() Is Not Actually Random 🤔

Here's the brutal truth: `Math.random()` is a **pseudorandom number generator (PRNG)**. It uses a deterministic algorithm (typically xorshift128+) seeded with a value — usually something predictable like the current timestamp.

"Deterministic" is just math-speak for "given the same starting point, it produces the same sequence every time." That's great for simulations and games. It is a **disaster** for security tokens.

An attacker who can observe a few of your "random" values (say, from public IDs or session cookies) can reverse-engineer the internal state of the generator and predict every future value it will produce. This is not theoretical — tools like [XorShift128+ predictor](https://github.com/d0nutptr/v8_rand_buster) exist and work against V8 (Node.js's JavaScript engine) in real attacks.

## The Deadly Code Pattern 💀

Here's what insecure token generation looks like in the wild:

```javascript
// 🚨 NEVER DO THIS — this is broken and predictable
function generateResetToken() {
  return Math.random().toString(36).substring(2) +
         Math.random().toString(36).substring(2);
}

// Also broken — still uses Math.random() under the hood
function generateTokenBad() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
```

Both of these look reasonable. Both are completely broken from a security perspective. An attacker who can make a few requests to your reset endpoint can harvest enough output to reconstruct the PRNG state — and then generate the reset token for *any* account before the victim even checks their email.

## The Fix: crypto.randomBytes() 🔐

Node.js ships with a cryptographically secure random number generator. It uses the OS's entropy pool (think: hardware events, timing jitter, and other genuinely unpredictable sources). Use it for *anything* security-related:

```javascript
import { randomBytes, timingSafeEqual } from 'crypto';

// ✅ Cryptographically secure token generation
function generateSecureToken(byteLength = 32) {
  return randomBytes(byteLength).toString('hex');
  // 32 bytes = 64 hex chars = 256 bits of entropy
  // An attacker would need 2^256 guesses. Good luck. 🙂
}

// ✅ Secure comparison to prevent timing attacks
function verifyToken(providedToken, storedToken) {
  const a = Buffer.from(providedToken, 'hex');
  const b = Buffer.from(storedToken, 'hex');
  
  if (a.length !== b.length) return false;
  
  // timingSafeEqual takes the same time regardless of where
  // the comparison fails — prevents timing-based token leakage
  return timingSafeEqual(a, b);
}

// Usage
const resetToken = generateSecureToken(); // safe to send in emails
```

Notice the bonus fix: `timingSafeEqual` instead of `===`. Regular string comparison short-circuits the moment it finds a mismatch — an attacker can measure response times to figure out how many characters of their guess were correct. `timingSafeEqual` always compares all bytes. It's one extra import and it closes a whole class of side-channel attacks.

## Where Else This Bites You 🐍

Insecure randomness isn't just a reset-token problem. Watch out for `Math.random()` sneaking into:

- **Session IDs** — If your session tokens are predictable, attackers can hijack accounts without ever stealing a cookie.
- **CSRF tokens** — A guessable CSRF token is no CSRF token at all.
- **One-time passwords (OTPs)** — Generating a "random" 6-digit OTP with Math.random() is easily brute-forced even without prediction.
- **Cryptographic nonces** — Used incorrectly, a reused or predictable nonce can break an entire encryption scheme.
- **Lottery/gambling logic** — Predictable randomness = someone will always win. (This is also how some online poker sites got cheated.)

A quick audit: `grep -r "Math.random()" src/` in your codebase right now. Anything touching auth, tokens, or IDs should be flagged for immediate review.

## The Entropy Budget — A Mental Model 🧮

Think of security as requiring a **budget of unpredictability**. Every bit of entropy you need for a token has to come from somewhere genuinely unpredictable.

| Source | Bits of entropy | Safe for security? |
|---|---|---|
| `Math.random()` | ~0 (predictable) | ❌ No |
| Timestamp (ms) | ~13 bits (guessable) | ❌ No |
| `crypto.randomBytes(16)` | 128 bits | ✅ Yes |
| `crypto.randomBytes(32)` | 256 bits | ✅ Yes (overkill in a good way) |

For password reset tokens, session IDs, and API keys, **256 bits of cryptographic randomness** is the gold standard. With `crypto.randomBytes(32)`, you're there in one line.

## Real-World Impact 🌍

This isn't just an academic concern. In 2012, researchers showed that weak random number generation in RSA key generation left **0.2% of all public HTTPS keys** factorizable — meaning millions of servers were silently compromised. In 2017, a cryptocurrency wallet generator using a flawed PRNG allowed attackers to drain wallets totaling millions of dollars.

Closer to home: if your SaaS app uses `Math.random()` for reset tokens and an attacker makes 100 requests to your reset endpoint (or just watches your API for public IDs), they can potentially predict and claim reset tokens for *every account on your platform*. Mass account takeover from one overlooked line of code.

## The 5-Minute Fix Checklist ✅

1. `grep -r "Math.random()" .` — find every usage in your project
2. For security contexts (tokens, IDs, secrets): replace with `crypto.randomBytes()`
3. For token comparison: replace `===` with `timingSafeEqual`
4. Store tokens hashed in the database (use `crypto.createHash('sha256')`) — if your DB leaks, raw tokens stay safe
5. Set expiry on all tokens — a stolen 15-minute reset token is far less damaging than one that never expires

## Final Thought 🎯

`Math.random()` is a fantastic tool for picking a random cat GIF or shuffling a playlist. The moment you touch authentication, sessions, or any security-critical path, reach for `crypto.randomBytes()` instead. It's in the standard library. It costs nothing. And it's the difference between "secure by default" and "exploitable by a motivated attacker with a Python script."

Don't gamble with your users' accounts. Leave the dice to board games.

---

**Found a Math.random() in your auth code?** Come roast your past self on [Twitter/X](https://x.com/kpanuragh) or [GitHub](https://github.com/kpanuragh) — you won't be the first, and sharing keeps others from making the same mistake. 🙈
