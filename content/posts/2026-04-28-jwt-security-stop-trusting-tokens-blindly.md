---
title: "🔐 JWT Security: Stop Trusting Tokens Blindly (Your Auth Is Probably Broken)"
date: 2026-04-28
excerpt: "JWTs are everywhere — and so are JWT vulnerabilities. From the 'alg: none' disaster to weak secrets and missing expiry checks, here's what you're almost certainly getting wrong."
tags: ["security", "jwt", "authentication", "api", "owasp"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Tokens Blindly

JWTs (JSON Web Tokens) are the duct tape of modern auth. Everyone uses them, half of us don't fully understand them, and a surprising number of production apps are handling them in ways that would make a pen tester's eyes light up like Christmas morning.

Let's fix that.

## A 30-Second JWT Refresher

A JWT is three base64url-encoded chunks glued together with dots:

```
header.payload.signature
```

- **Header** — algorithm + token type (`{"alg": "HS256", "typ": "JWT"}`)
- **Payload** — your claims (`{"sub": "user_123", "role": "admin", "exp": 1234567890}`)
- **Signature** — the part that actually makes it trustworthy (or not)

The key insight: **the payload is not encrypted, just encoded**. Anyone can base64-decode it and read every claim. The signature only proves the token wasn't *tampered with* — it says nothing about secrecy.

## Vulnerability #1: The "alg: none" Nuclear Option

This is the most embarrassing JWT bug in history and it *still* shows up in the wild.

Early JWT libraries would accept a token where the `alg` header was set to `"none"` — meaning no signature required. An attacker could craft any payload they wanted, claim `"role": "superadmin"`, set `alg` to `"none"`, and some servers would just... accept it.

```javascript
// What an attacker sends (pseudocode):
const fakeHeader = base64url({ alg: "none", typ: "JWT" });
const evilPayload = base64url({ sub: "attacker", role: "admin" });
const token = `${fakeHeader}.${evilPayload}.`; // no signature needed!
```

**The fix:** Explicitly allowlist the algorithms your application accepts. Never let the token's own header decide what algorithm to use.

```javascript
// ✅ The right way with jsonwebtoken
const payload = jwt.verify(token, secret, {
  algorithms: ["HS256"], // explicit — never trust the token's alg claim
});
```

If your library doesn't let you restrict algorithms, find a different library.

## Vulnerability #2: Your Secret Is "secret"

I'm not joking. HS256-signed JWTs are only as strong as the secret used to sign them. A weak secret can be brute-forced offline — an attacker just needs a valid token and a copy of `hashcat`.

Common offenders spotted in real repos:

- `"secret"`
- `"password"`
- `"your-256-bit-secret"` (copied straight from the jwt.io docs and never changed)
- The app name in lowercase

```bash
# An attacker with a token and 10 minutes can do this:
hashcat -a 0 -m 16500 stolen_token.txt wordlists/rockyou.txt
```

**The fix:** Generate a cryptographically random secret of at least 256 bits. In Node.js:

```javascript
// Generate once, store in environment variable, never hardcode
const crypto = require("crypto");
console.log(crypto.randomBytes(32).toString("hex"));
// → "a3f8c2d1e9b4f7a0c6e2d5b8f1a4c7e0d3b6f9a2c5e8b1d4f7a0c3e6b9d2f5"
```

Then load it from environment: `process.env.JWT_SECRET`. Not from your config file. Not from a comment in your README. Environment variable. Done.

## Vulnerability #3: Missing or Ignored Expiry

JWTs are stateless by design — there's no central revocation list. Once you issue one, it's valid until it expires (or until you build a token blocklist, which people rarely do).

So if you're issuing tokens that never expire, or you're not checking the `exp` claim, a stolen token is valid *forever*. That ex-employee whose account you deactivated? Their JWT still works.

```javascript
// ❌ Signing without expiry
const token = jwt.sign({ sub: userId }, secret);

// ✅ Always set a reasonable expiry
const token = jwt.sign({ sub: userId }, secret, { expiresIn: "15m" });
// Use refresh tokens for long sessions — short-lived access tokens + longer-lived refresh tokens
```

The mental model: access tokens should be short-lived (15 minutes to 1 hour). Refresh tokens can live longer but should be rotated on use and stored server-side so they can be revoked.

## Vulnerability #4: Storing JWTs in localStorage

This one's a frontend sin. `localStorage` is accessible to any JavaScript on the page — including injected scripts from XSS attacks. If an attacker finds an XSS vector, they can vacuum up every token in `localStorage` with a one-liner.

The safer default is `httpOnly` cookies. They're inaccessible to JavaScript entirely:

```javascript
// ✅ Set the token as an httpOnly, Secure, SameSite cookie
res.cookie("access_token", token, {
  httpOnly: true,   // no JS access
  secure: true,     // HTTPS only
  sameSite: "strict", // CSRF protection
  maxAge: 15 * 60 * 1000, // 15 minutes
});
```

Yes, you still need CSRF protection. No, cookies aren't perfect either. But "accessible to all JavaScript on the page" is a significantly worse starting point than "accessible to nothing on the page."

## A Quick JWT Security Checklist

Before you ship:

- [ ] Algorithm is explicitly allowlisted (`HS256` or `RS256`, never `none`)
- [ ] Secret is at least 256 bits of randomness, loaded from env
- [ ] Tokens have a short expiry (`exp` claim)
- [ ] You're validating the `exp` claim on every request
- [ ] Tokens are stored in `httpOnly` cookies, not `localStorage`
- [ ] Sensitive data is NOT in the payload (it's readable by anyone)
- [ ] You have a revocation strategy for logout / account compromise

## The Big Picture

JWT vulnerabilities are rarely exotic. They're almost always one of: trusting the token too much, using weak secrets, skipping expiry validation, or storing tokens where JavaScript can reach them. The spec is solid — the bugs are in the implementation.

Read your JWT library's docs. Lock down your algorithm. Generate a real secret. Set an expiry. The tokens will take care of themselves.

---

*Found a JWT bug in your own code after reading this? You're not alone — drop a comment or reach out on [GitHub](https://github.com/kpanuragh). Got a security topic you'd like covered next? Let's talk.*
