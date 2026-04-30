---
title: "🔐 JWT Security: Stop Trusting Your Own Tokens (They're Lying to You)"
date: "2026-04-30"
excerpt: "JSON Web Tokens are everywhere — and so are the footguns. From the infamous 'alg: none' exploit to weak secrets that crack in seconds, here's how JWTs go wrong and how to do them right."
tags: ["security", "jwt", "authentication", "cybersecurity", "backend"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Your Own Tokens (They're Lying to You)

Picture this: you've just shipped a shiny new API with JWT authentication. Users log in, get a token, and your `verifyToken()` middleware sits at the top of every protected route like a vigilant bouncer. You feel secure. You feel *good*.

Then a security researcher slides into your DMs and sends you a token they just forged themselves — granting them admin access to every account on your platform. No password. No brute force. They just... asked nicely in the right encoding.

Welcome to the wild world of JWT security, where the most dangerous bugs are the ones that look like features.

## Quick Recap: What's in a JWT?

A JWT (JSON Web Token) is three Base64URL-encoded chunks separated by dots:

```
header.payload.signature
```

The **header** says what algorithm was used to sign it. The **payload** carries your claims (user ID, roles, expiration). The **signature** is supposed to prove neither was tampered with.

Key word: *supposed to*.

## The "alg: none" Disaster

Here's the most famous JWT footgun in history. At one point, the JWT spec actually defined `"alg": "none"` as a valid algorithm — meaning *no signature required*. Some libraries honored this faithfully.

The attack is almost comically simple. Take any valid JWT, decode the header, change `"alg"` to `"none"`, modify the payload to give yourself admin privileges, drop the signature entirely, and re-encode. If the server doesn't explicitly reject unsigned tokens, you're in.

```javascript
// ❌ NEVER do this — accepts ANY algorithm the token claims
const decoded = jwt.verify(token, secret); // trusts the header's alg claim

// ✅ Do this — lock down the algorithm explicitly
const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

Always hardcode the expected algorithm. Never let the token tell you how to verify itself — that's like letting a suspect tell the detective how their alibi should be checked.

## Weak Secrets Are Crackable in Minutes

HS256 — the most common JWT algorithm — is a symmetric HMAC. The same secret that signs the token also verifies it. Which means if your secret is weak, an attacker who gets hold of a valid token can crack it offline with tools like `hashcat` or `jwt-cracker`, then sign anything they want.

Secrets like `secret`, `password`, `mysupersecretkey`, or anything under 32 characters are toast. Modern GPUs can tear through millions of candidates per second.

```bash
# An attacker with your token can run this locally, no network needed
hashcat -a 0 -m 16500 your.jwt.token wordlist.txt
```

The fix is brutally simple: use a cryptographically random secret of at least 256 bits (32 bytes). Generate it once, store it in your secrets manager, rotate it periodically.

```bash
# Generate a proper secret — do this once and store it safely
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If you need asymmetric signing (e.g., a third party needs to verify your tokens without being able to issue them), reach for RS256 or ES256. The private key signs, the public key verifies — and publishing the public key doesn't compromise your security.

## The Clock Is a Liar Too

Expiration (`exp`) and issued-at (`iat`) claims are just numbers in the payload — they don't enforce themselves. Your verification code has to check them, and it has to check them *correctly*.

Clock skew is real: distributed systems have clocks that drift, and a token issued on Server A might arrive at Server B a few milliseconds before Server B's clock catches up. Most libraries handle this with a configurable `clockTolerance`. What libraries *don't* automatically handle: tokens with no `exp` claim at all.

A JWT without an expiration is valid forever. Forever is a long time. If that token leaks — in a log file, a browser history, a GitHub commit — it never stops working.

```javascript
// ✅ Always set expiry, and keep it short for sensitive tokens
const token = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,
  { algorithm: 'HS256', expiresIn: '15m' } // 15 minutes for API tokens
);
```

For long-lived sessions, use short-lived access tokens paired with refresh tokens. The refresh token lives in an httpOnly cookie (not localStorage — that's XSS bait), and gets rotated on every use. Leaked access tokens expire fast; leaked refresh tokens can be detected and revoked.

## The Token Invalidation Trap

Here's the philosophical crisis at the heart of JWTs: they're *stateless*. Your server doesn't store them. So when a user logs out, changes their password, or gets their account suspended — how do you invalidate their existing tokens?

The honest answer: you can't, natively. Short expiry times are your first line of defense. For anything requiring true revocation (password changes, security events, admin bans), you need a token blocklist — typically a Redis set of revoked `jti` (JWT ID) claims checked on each request.

This adds a network lookup per request, which is why many teams keep it scoped to high-stakes operations. Know the tradeoff you're making.

## The Security Checklist

Before you ship that auth system, run through this:

- [ ] Algorithm explicitly pinned in verification (`algorithms: ['HS256']`)
- [ ] Secret is 256+ bits, randomly generated, stored in a secrets manager
- [ ] Every token has an `exp` claim with a short lifetime
- [ ] Refresh tokens in httpOnly cookies, rotated on use
- [ ] Token revocation strategy exists for security-sensitive events
- [ ] JWTs not stored in localStorage (vulnerable to XSS)
- [ ] HTTPS everywhere — JWTs in transit are signing credentials

JWTs are a solid tool when used correctly. The problem isn't the spec — it's that the spec has too many sharp edges, and most tutorials skip straight to "here's how to issue a token" without covering how badly it can go wrong.

Trust but verify. Actually, scratch that: **verify, then trust**.

---

*Building something with JWT auth and want a second pair of eyes? Hit me up on [X/Twitter](https://x.com/kpanuragh) or drop a question on my [GitHub](https://github.com/kpanuragh). Security reviews are always more fun before the breach.*
