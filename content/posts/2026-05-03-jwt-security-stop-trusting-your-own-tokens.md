---
title: "🔐 JWT Security: Stop Trusting Your Own Tokens (Yes, Really)"
date: "2026-05-03"
excerpt: "JWTs are everywhere — and so are the mistakes that make them catastrophically insecure. From the 'alg:none' disaster to secret key leaks, here's what developers get wrong and how to fix it."
tags: ["security", "jwt", "authentication", "api", "owasp"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Your Own Tokens (Yes, Really)

JSON Web Tokens are the duct tape of modern authentication. They're in your mobile app, your API, your microservices, probably your smart fridge if it has a REST API. And like most duct tape solutions, they work great — right up until they don't.

The terrifying part? The most dangerous JWT vulnerabilities aren't obscure memory corruption bugs. They're logic errors that developers introduce themselves, often by misreading documentation or copy-pasting a Stack Overflow answer from 2015.

Let's go through the greatest hits of JWT footguns so you can stop shooting yourself in the foot.

---

## What Even Is a JWT?

Quick refresher: a JWT is three Base64URL-encoded chunks separated by dots.

```
header.payload.signature
```

The **header** says what algorithm was used. The **payload** is your claims (user ID, roles, expiry). The **signature** proves it wasn't tampered with — *if* you verify it correctly.

That last part is where developers lose the plot.

---

## The Hall of Shame: Common JWT Vulnerabilities

### 1. The `alg: none` Attack — The Most Embarrassing Bug in Auth History

This one is so bad it has its own CVE. Some JWT libraries, when they see `"alg": "none"` in the header, skip signature verification entirely. The logic was: *"If there's no algorithm, there's nothing to verify."*

The actual result: **anyone can forge any token**.

```js
// An attacker crafts this header + payload:
const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({ sub: "1", role: "admin" })).toString("base64url");
const fakeToken = `${header}.${payload}.`; // empty signature — and some libraries accept this
```

**The fix:** Always explicitly specify which algorithms you accept. Never allow `none`.

```js
// ✅ With jsonwebtoken in Node.js
jwt.verify(token, secret, { algorithms: ["HS256"] });

// ❌ Never do this — leaves you open to alg confusion
jwt.verify(token, secret); // accepts whatever alg the token claims
```

Lock it down. Be explicit. Treat `alg: none` like a radioactive waste site.

---

### 2. RS256 vs HS256 Confusion — When the Algorithm Lies to Your Server

This one is sneakier. Some systems use asymmetric signing: the server signs with a **private key** (RS256) and clients verify with the **public key**. The public key is, well, *public* — maybe in a JWKS endpoint or even in your README.

Here's the attack: an attacker takes your **public key**, switches the token's `alg` header from `RS256` to `HS256`, and signs the token using the public key as an HMAC secret. If your library blindly trusts the algorithm in the header and uses the same key material for verification, it'll accept the forged token.

```js
// ✅ Always pin the expected algorithm on the server side
const publicKey = fs.readFileSync("public.pem");

// Bad — trusts the alg claim in the token header
jwt.verify(token, publicKey);

// Good — enforces RS256, rejects anything else
jwt.verify(token, publicKey, { algorithms: ["RS256"] });
```

The pattern: **never let the token tell you how to verify the token**.

---

### 3. Weak Secrets and "Secret" Defaults

HS256 is only as strong as your secret. And developers are... creative... with their secrets.

Real secrets found in production JWTs (from research scans and breach dumps):

- `secret`
- `your-256-bit-secret` ← literally the example from jwt.io
- `changeme`
- The app name in lowercase
- An empty string `""`

An attacker who knows you're using HS256 can brute-force a weak secret offline using tools like `hashcat` or `jwt-cracker`. They grab one of your valid tokens (from a login response), crack the secret, and can now mint tokens for any user they want.

```bash
# Attackers use tools like this against your tokens
# (shown for awareness — don't use this maliciously)
# hashcat -a 0 -m 16500 captured.jwt wordlist.txt
```

**The fix is boring but non-negotiable:** use a cryptographically random secret of at least 256 bits.

```js
// Generate a proper secret (do this once, store it securely)
// node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// → something like: a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1
```

Store it in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.). Not in your `.env` file committed to GitHub. Not in a Slack message. Not in a Post-it note. A secrets manager.

---

## Bonus: Don't Forget Expiry

JWTs are stateless by design, which means your server has no way to invalidate them before they expire — unless you build a token blocklist (which somewhat defeats the purpose). This is why short expiry times matter.

```js
// ✅ Reasonable token lifetimes
const accessToken = jwt.sign(payload, secret, { expiresIn: "15m" }); // short-lived
const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: "7d" }); // longer, but rotated
```

A 15-minute access token that gets stolen is annoying. A 30-day access token that gets stolen is a nightmare. Keep `exp` short, rotate refresh tokens, and revoke on logout by invalidating the refresh token server-side.

---

## The TL;DR Checklist

Before you ship your next JWT implementation, run through this:

- [ ] Explicitly allowlist accepted algorithms (`algorithms: ["HS256"]`)
- [ ] Use a cryptographically random secret (≥256 bits), stored in a secrets manager
- [ ] Set short `exp` times on access tokens (15 minutes is a common sweet spot)
- [ ] Validate `iss` and `aud` claims if you have multiple services
- [ ] Use HTTPS — a JWT over plain HTTP is just a logged credential waiting to be stolen
- [ ] Rotate secrets periodically and have a revocation plan

---

JWT security isn't rocket science — it's mostly "don't trust the token to tell you how to trust the token" and "use a real secret." But the footguns are real, widely deployed, and have caused production breaches at companies that should've known better.

Now you know better.

---

*Found this useful? Share it with the dev who copy-pasted that JWT example from the docs and never looked back. You might save a production incident.*

*Hit me up on [GitHub](https://github.com/kpanuragh) or drop a comment — I'm always down to talk auth war stories.*
