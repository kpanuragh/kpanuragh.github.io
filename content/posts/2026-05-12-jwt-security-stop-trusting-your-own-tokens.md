---
title: "🔑 JWT Security: You've Been Trusting Tokens You Shouldn't"
date: "2026-05-12"
excerpt: "JWTs are everywhere — and so are the critical mistakes developers make with them. Algorithm confusion attacks, leaked secrets, and 'none' algorithm exploits have burned real companies. Here's how to use JWTs without shooting yourself in the foot."
tags: ["cybersecurity", "jwt", "authentication", "web-security", "api-security"]
featured: true
---

# 🔑 JWT Security: You've Been Trusting Tokens You Shouldn't

JSON Web Tokens are the duct tape of modern auth — everyone's using them, they mostly work, and nobody really understands why they're sticky. You slap one on your API, ship to prod, and call it a day.

Then six months later you read a post-mortem about how an attacker bypassed authentication entirely by flipping one field in a header.

That could be you. Let's make sure it isn't. 🛡️

## What Even Is a JWT? (Quick Refresher)

A JWT is three Base64URL-encoded chunks separated by dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   ← Header
.eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ  ← Payload
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c  ← Signature
```

The header says *how* the token is signed. The payload carries your claims (user ID, roles, expiry). The signature proves neither was tampered with — **if you verify it correctly**.

That last part is where things go sideways.

## Attack #1: The "alg: none" Nuclear Option 💣

In the early JWT spec, `"alg": "none"` was a valid algorithm meaning "unsigned, trust me bro." No signature required.

Some libraries — including early versions of popular ones — would happily accept an unsigned token if the header declared `alg: none`. An attacker could take any valid JWT, decode the payload, change `"role": "user"` to `"role": "admin"`, re-encode without a signature, and walk right through your front door.

This is not theoretical. This vulnerability was exploited against multiple real services.

**The fix:** Explicitly specify which algorithms you accept. Never allow `none`.

```javascript
// 🚨 VULNERABLE — trusts whatever algorithm the token claims
const decoded = jwt.verify(token, secret);

// ✅ SAFE — you decide the algorithm, not the attacker
const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

One line. Massive difference. Add it.

## Attack #2: RS256 → HS256 Algorithm Confusion 🤯

This one is sneaky. Imagine your service uses RS256 (asymmetric — private key signs, public key verifies). Your public key is, well, *public* — maybe even published in a JWKS endpoint.

Here's the attack: the attacker crafts a token with `"alg": "HS256"` (symmetric) and signs it using your **public key** as the HMAC secret. If your library auto-detects the algorithm from the token header and you use the same key variable for both cases, it will verify the signature against the public key — which the attacker already has.

Authentication bypassed. Not because you made an obvious mistake, but because you trusted the token to tell you how to verify itself.

```python
# 🚨 VULNERABLE — algorithm comes from token header
payload = jwt.decode(token, public_key)

# ✅ SAFE — algorithm is hardcoded on your side
payload = jwt.decode(token, public_key, algorithms=["RS256"])
```

Never let inbound data dictate your cryptographic choices. The token is user-controlled input. Treat it like one.

## Attack #3: Leaking Secrets in the Payload 🙈

Here's a quieter, grimmer failure mode. JWTs are *encoded*, not *encrypted*. Anyone with the token can decode the payload — they just can't forge a new valid one without your secret.

Decoded, that middle chunk above reveals:

```json
{
  "userId": "123",
  "role": "admin"
}
```

So if you're storing things like `email`, `phoneNumber`, `ssn`, or `internalAccountBalance` in the payload because "it's convenient," you're broadcasting that data to any JavaScript running in the browser, any proxy logging requests, any XSS attacker who steals the token from localStorage, and any future you who forgets this ever happened.

**Rule of thumb:** JWTs are identity assertions, not profile objects. Put in the minimum needed for authorization — typically a user ID and role. Fetch sensitive data from your database on the server side where it belongs.

## The Weak Secret Problem 🔐

If you're using HS256, your signing secret is a symmetric key — it's used to both sign and verify. If it's weak (e.g., `"secret"`, `"jwt_secret"`, or any dictionary word), an offline dictionary attack against a captured token can crack it in minutes.

Tools like `hashcat` can brute-force JWT secrets from captured tokens with no network access required.

```bash
# An attacker with your token runs something like this offline
hashcat -a 0 -m 16500 captured.jwt rockyou.txt

# They don't need to hit your server at all
```

**Use a cryptographically random secret of at least 256 bits:**

```bash
# Generate a proper secret
openssl rand -base64 32
```

Store it in your secrets manager or environment variable. Never hardcode it. Never commit it. You know the drill.

## Quick JWT Security Checklist ✅

Before shipping any JWT-based auth, run through these:

- [ ] **Pin the algorithm** — `algorithms: ['HS256']` (or RS256, never `none`)
- [ ] **Check expiry** — always validate `exp`; short-lived tokens (15 min) limit blast radius
- [ ] **Minimal payload** — user ID and role only, no PII
- [ ] **Strong secret** — 256-bit random, stored in secrets manager
- [ ] **Validate `aud` and `iss`** — prevent tokens from one service being accepted by another
- [ ] **Revocation strategy** — JWTs are stateless, so have a plan (blocklist, short TTL + refresh tokens)

## The Real Talk 💬

JWTs are powerful and convenient, but "it generates a token and the frontend stores it" is not a security architecture. The spec has nuances that bit real companies — Auth0, Okta, and plenty of others have published CVEs related to JWT misuse.

The good news: every one of these issues has a simple, well-documented fix. You don't need to be a cryptographer. You just need to read the `algorithms` option in your library docs and set it explicitly.

That's it. That's the post. Go lock down your tokens. 🔒

---

Have a JWT horror story from your own codebase? Found a misconfigured service in the wild? Let's talk — connect with me on [GitHub](https://github.com/kpanuragh) or drop a comment below. Security gets better when we share what we've learned.
