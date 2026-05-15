---
title: "🔐 JWT Security: Stop Trusting Your Tokens (Yes, Even the Signed Ones)"
date: 2026-05-15
excerpt: "JWTs are everywhere — and so are the ways developers get them catastrophically wrong. From the 'alg: none' classic to signing key leaks, here's the field guide to not turning your authentication into a welcome mat."
tags: ["security", "jwt", "authentication", "api", "cybersecurity"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Your Tokens (Yes, Even the Signed Ones)

JSON Web Tokens have become the default handshake of the modern web. They're compact, stateless, and widely supported. They're also one of the most consistently misconfigured pieces of auth infrastructure in production systems today.

The good news: JWT vulnerabilities are well-understood and fixable. The bad news: a surprising number of production APIs are still vulnerable to attacks that were published a decade ago.

Let's break down the greatest hits of JWT failure — and how to not star in one.

---

## First, a Quick Anatomy Lesson

A JWT looks like three base64url-encoded blobs separated by dots:

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIiwicm9sZSI6InVzZXIifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Those three parts are: **Header** . **Payload** . **Signature**

The header says what algorithm was used to sign the token. The payload contains your claims (user ID, roles, expiry). The signature is what makes the whole thing trustworthy — *in theory*.

Here's the thing that trips everyone up: **the client controls the header**. And that's where chaos lives.

---

## Attack #1: The `alg: none` Trick

This one is legendary. Some JWT libraries, when told the algorithm is `none`, will skip signature verification entirely. No joke — a token signed with `alg: none` would be accepted as valid.

An attacker could take a real token, decode it, modify the payload (say, bumping `"role": "user"` to `"role": "admin"`), set `alg: none` in the header, strip the signature, and present it as fully valid.

Here's how a vulnerable library might look in the wild:

```javascript
// ❌ Never do this
const payload = jwt.verify(token, secret, { algorithms: ['HS256', 'none'] });

// ✅ Always explicitly pin to your algorithm
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

The fix is one line — whitelist exactly the algorithms you expect, and reject everything else. Modern libraries like `jsonwebtoken` (Node.js) handle this correctly by default, but older versions and some lesser-known libraries still allow `none` unless you explicitly opt out.

---

## Attack #2: The RS256-to-HS256 Confusion Attack

This one is sneakier and has bitten real applications. Here's the setup:

Your server signs tokens with RS256 (asymmetric — private key signs, public key verifies). The public key is, well, public. Anyone can see it.

A vulnerable library might accept the *algorithm field in the token header* at face value. An attacker takes your public key, creates a new token signed with **HS256** using that public key as the secret, and sets the header to `alg: HS256`.

The server sees HS256, grabs the "secret" (which is actually the public key you published for everyone), and... validates successfully. Instant auth bypass.

```python
# ❌ Algorithm confusion waiting to happen
decoded = jwt.decode(token, public_key)  # trusts the token's alg header

# ✅ Pin the algorithm explicitly — always
decoded = jwt.decode(token, public_key, algorithms=["RS256"])
```

The rule: **never let the token tell you how to verify it**. Your server decides the algorithm; the token just has to conform.

---

## Attack #3: Weak Secrets and Secret Leaks

HS256 is a symmetric algorithm — the same secret signs and verifies. If an attacker gets your secret, they can forge unlimited tokens with any claims they want.

Common ways secrets escape into the wild:

- Hardcoded in source code pushed to a public GitHub repo
- Leaked through environment variables in Docker images
- Present in `.env` files committed to version control
- Exposed in error messages or stack traces

And here's the uncomfortable reality: HS256 JWT secrets can be brute-forced offline. If your token is intercepted and your secret is `secret`, `changeme`, `jwt_secret`, or any common string, tools like `hashcat` will crack it in seconds.

A genuinely secure HS256 secret needs at minimum 256 bits of entropy — that's 32 random bytes, not 32 characters of a memorable phrase.

```bash
# Generate a proper secret
openssl rand -hex 32
# → a4f8c3b7e9d1204f6a85c2e0b3f7a91d4e6c8b0f2a9d3e5c7b1f4a0e8d2c6b4
```

Store it in a secrets manager (AWS Secrets Manager, Vault, GCP Secret Manager). Not in your `.env`. Not in your codebase. Not in a Slack message labeled "just for now."

---

## The Checklist You Actually Need

Before you ship that JWT-based auth system:

- **Pin algorithms** — whitelist exactly `['RS256']` or `['HS256']`, never both, never `none`
- **Validate `exp`** — always check the expiry claim, don't assume your library does it automatically
- **Validate `iss` and `aud`** — confirm the token was issued by your server and intended for your service
- **Keep secrets secret** — 256-bit random secrets, stored in a proper secrets manager
- **Short expiry + refresh tokens** — access tokens expire in 15 minutes, refresh tokens are rotated on use
- **Maintain a revocation list** — for logout and account compromise scenarios, you need some server-side state

JWTs' statelessness is a feature until someone's account gets compromised and you can't invalidate their tokens. Build your revocation story before you need it.

---

## The Bigger Picture

JWT vulnerabilities are a perfect illustration of why "it's an industry standard" doesn't mean "it's safe by default." The standard is fine. The implementations are where things go sideways — usually because a library version was outdated, a config option was misread, or a secret was treated like a password instead of a cryptographic key.

The fix is always the same: understand what you're using, pin your algorithms, validate your claims, and treat your secrets like secrets.

Your users are trusting you with their identity. Make sure the thing standing between them and an attacker isn't a hardcoded string called `my_jwt_secret`.

---

Found a JWT misconfiguration in your own codebase? You're in good company — now go fix it. Share this post if it saved you from a bad day, and find me on [GitHub](https://github.com/kpanuragh) if you want to talk auth, security, or the many creative ways developers accidentally give admin access to strangers.
