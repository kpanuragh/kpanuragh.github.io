---
title: "🔐 JWT Security: The Token You Trust Blindly (But Probably Shouldn't)"
date: "2026-05-16"
excerpt: "JWTs are the backbone of modern auth — but they come with a haunted house of footguns. From the 'none' algorithm attack to algorithm confusion, here's what can go wrong and how to actually get it right."
tags: ["security", "jwt", "authentication", "api", "nodejs", "backend"]
featured: true
---

# 🔐 JWT Security: The Token You Trust Blindly (But Probably Shouldn't)

Here's a fun thought experiment: what if I told you that a popular authentication system — used by millions of apps — has a setting where you can literally tell it "don't verify this signature" and it'll just... agree?

That's not a hypothetical. That was the JWT `none` algorithm attack, and it was real, documented, and exploited in the wild.

JWTs (JSON Web Tokens) are everywhere. They're in your mobile app, your SaaS backend, your microservices talking to each other. They're genuinely great for stateless auth. But they come with a haunted house of footguns that can turn your "secure" auth layer into an open door. Let's walk through the scariest ones — and how to nail the door shut.

---

## Wait, What Even Is a JWT?

Quick refresher. A JWT is three Base64URL-encoded chunks separated by dots:

```
header.payload.signature
```

The **header** says what algorithm signed this token. The **payload** is the actual data (user ID, roles, expiry). The **signature** proves the first two haven't been tampered with — *if* you verify it correctly.

That last part is where developers consistently trip.

---

## The "None" Algorithm Attack (Yes, This Was Real)

The JWT spec originally allowed an `alg: "none"` value — meaning "trust me, I'm already verified, no signature needed." Some libraries dutifully implemented this. The result? Attackers could take a legitimate token, decode the payload, bump their user role from `user` to `admin`, re-encode it, set `alg: "none"`, strip the signature, and submit it. Libraries that didn't block `none` would accept it as valid.

Let me show you what a vulnerable vs. safe implementation looks like in Node.js:

```javascript
// VULNERABLE — never do this
import jwt from 'jsonwebtoken';

function verifyToken(token) {
  // This accepts alg: "none" tokens with no signature
  return jwt.verify(token, secret);
}

// SAFE — explicitly restrict allowed algorithms
function verifyToken(token) {
  return jwt.verify(token, secret, {
    algorithms: ['HS256'], // Whitelist only what you use
  });
}
```

One option. That's the difference between "fine" and "catastrophic." Always pass an explicit `algorithms` array. Never trust the algorithm declared in the token header — your server decides what's acceptable, not the token.

Modern libraries like `jsonwebtoken` 9.x block `none` by default, but the principle stands: be explicit, not permissive.

---

## Algorithm Confusion: HS256 vs RS256

Here's a subtler attack that trips up even experienced developers. Some apps support both HMAC (symmetric, shared secret) and RSA (asymmetric, public/private key) signing.

- **HS256** — signs and verifies with the same secret key.
- **RS256** — signs with a private key, verifies with a public key.

The attack: if a library lets the token's header decide which algorithm to use, an attacker can take your RSA **public key** (which is, by definition, public), craft a token signed with HS256 using that public key as the HMAC secret, and submit it. A naive library will then try to verify an HS256 token using the public key as the secret — and it'll succeed, because it used the right key for the declared algorithm.

The fix is the same: whitelist algorithms server-side and never let the token header pick.

```javascript
// If you use RS256, say so explicitly — and never accept HS256
jwt.verify(token, publicKey, { algorithms: ['RS256'] });

// If you use HS256, say so explicitly — and never accept RS256
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

Your server knows what it signed with. Enforce that. The token's opinion is irrelevant.

---

## The Weak Secret Problem

HMAC-based JWTs (HS256, HS384, HS512) are only as strong as your secret key. If your secret is `secret`, `password123`, or the name of your cat, an attacker who steals a valid JWT can brute-force the secret offline using tools like `hashcat` or `jwt-cracker` — and then forge any token they want.

Rules for JWT secrets:
- Minimum 256 bits (32 bytes) of cryptographically random data
- Never hardcode it — pull from an environment variable
- Rotate it periodically and invalidate old tokens gracefully

Generating a good secret:

```bash
# Generate a 256-bit (32-byte) random secret and base64-encode it
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Output: something like "K7pQ2mX9...very long random string..."
```

Then in your app:

```javascript
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
```

Crash hard at startup if the secret is missing or weak. This is exactly the kind of validation you want at a system boundary.

---

## What About Token Expiry and Revocation?

JWTs are stateless — that's their superpower and their curse. Once issued, a token is valid until it expires. There's no built-in revocation mechanism. If a user logs out, changes their password, or gets their token stolen, that token keeps working until the `exp` claim ticks past.

Practical mitigations:

- **Short expiry times** — access tokens should live for 15 minutes to 1 hour. Refresh tokens can live longer but should be rotated.
- **Token families** — when a refresh token is used, issue a new one and invalidate the old one. If you see a reused refresh token, it may indicate theft — invalidate the entire family.
- **Blocklist for high-stakes events** — password change, account compromise, or admin revocation should write to a small, fast blocklist (Redis works well) that your middleware checks. Accept that this sacrifices some statelessness for security.

You don't have to implement all of these, but you should make a conscious choice about which tradeoffs fit your app's risk profile.

---

## Checklist: JWT Minimum Bar

Before shipping any JWT-based auth to production:

- [ ] Algorithms are whitelisted server-side — never read from the token header
- [ ] Secret is ≥ 32 random bytes, stored in an env variable, never committed to git
- [ ] Tokens have an `exp` claim, and your verifier checks it
- [ ] Access token lifetime is ≤ 1 hour
- [ ] You've explicitly decided how to handle revocation for high-stakes events
- [ ] The library you're using is maintained and recent (check for CVEs)

JWTs aren't dangerous — but treating them as magic black boxes is. Understanding what's inside the dots makes all the difference.

---

## What's Next?

The next step after locking down your JWT implementation is auditing what's in the payload. Over-sharing sensitive data in the payload (PII, internal flags, pricing tiers) creates a different class of problem — even though the signature is valid, that data is just Base64-encoded, not encrypted. Anyone with the token can read it.

Curious about OAuth flows, PKCE, or how to safely implement "login with Google" without accidentally creating a security hole? Drop a comment or find me online — I'm always up for talking about the ways auth can go sideways.

Stay paranoid. Ship securely. 🔒
