---
title: "🔐 JWT Security: Stop Trusting That Base64 Like It's a Signed Contract"
date: 2026-05-13
excerpt: "JWTs are everywhere, misunderstood by most, and broken in production more often than you'd like to know. Let's fix your auth before someone else does it for you."
tags: ["security", "jwt", "authentication", "backend", "api"]
featured: true
---

# 🔐 JWT Security: Stop Trusting That Base64 Like It's a Signed Contract

Here's a scene: a developer Googles "how to implement JWT auth," copies the top Stack Overflow answer, ships it to production, and goes home proud. Six months later, someone discovers they can set `"alg": "none"` in the header and log in as literally any user.

This is not a hypothetical. This happened. Multiple times. At real companies. With real users.

JSON Web Tokens are one of those technologies that *look* simple on the surface — three base64 strings separated by dots, how hard can it be? — but hide enough footguns to make you wish you'd just used sessions.

Let's go through the most dangerous JWT mistakes developers make and how to stop making them.

## First, the 30-Second JWT Refresher

A JWT has three parts: `header.payload.signature`. The header says which algorithm was used. The payload is your data (user ID, roles, expiry). The signature cryptographically proves the first two parts weren't tampered with.

The critical word is **signature**. The payload is just base64-encoded — anyone can decode it. The signature is what you trust. If you don't validate the signature properly, the whole system collapses.

```javascript
// This is NOT secret. Anyone can read this.
const payload = Buffer.from(token.split('.')[1], 'base64').toString();
console.log(JSON.parse(payload)); // { userId: 1, role: "admin", iat: 1746000000 }

// The signature validates INTEGRITY, not secrecy.
// Never put passwords, credit cards, or sensitive PII in a JWT.
```

Got it? Good. Now here's where developers blow it.

## Mistake #1: The "alg: none" Nightmare

The JWT spec allows an algorithm value of `"none"` — meaning "trust me bro, no signature needed." Some libraries, when they see this, skip signature verification entirely.

An attacker changes their token header to `{"alg": "none"}`, strips the signature, makes themselves an admin, and walks right in. You couldn't design a worse default.

**The fix:** Never let the algorithm come from the token itself. Pin it in your verification code.

```javascript
import jwt from 'jsonwebtoken';

// ❌ WRONG: trusting whatever algorithm is in the token
const decoded = jwt.verify(token, secret); // vulnerable if alg: none

// ✅ RIGHT: explicitly specify the expected algorithm
const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });

// For RS256 with public/private key pairs (better for distributed systems):
const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

One line. That's it. Ship it.

## Mistake #2: Weak Secrets That a Toddler Could Guess

HMAC-signed JWTs (HS256, HS384, HS512) use a shared secret. If that secret is `"secret"`, `"password"`, or `"jwt_secret"`, congratulations — it's in every wordlist attackers use for offline cracking.

Here's the thing: because JWTs are stateless, an attacker can grab a valid token, take it offline, and brute-force the secret at millions of attempts per second with no rate limiting, no lockout, no way for you to even know it's happening.

**The fix:** Use a secret long enough to make brute-forcing heat-death-of-the-universe expensive.

```bash
# Generate a proper secret (do this once, store in env vars, never commit it)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Output: 3f8a2c1e9d7b4f6a0e2c8d1f5b3a7e9c2f4d6b8a0e1c3f5d7b9a2c4e6f8b0d2...
```

Then store it in an environment variable (`JWT_SECRET`) and load it at runtime. Never hardcode it. Never commit it. Set up secret scanning in your CI pipeline so a sleep-deprived future-you doesn't accidentally push it.

## Mistake #3: Tokens That Live Forever

Access tokens with no expiry — or a 10-year expiry (yes, people do this) — mean that if a token is ever stolen, the attacker has permanent access. The user changes their password? Doesn't matter. Token still works.

```javascript
// ❌ Tokens that outlive civilizations
const token = jwt.sign({ userId: user.id }, secret);

// ✅ Short-lived access tokens + refresh token pattern
const accessToken = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }  // 15 minutes is reasonable for most apps
);

const refreshToken = jwt.sign(
  { userId: user.id },
  process.env.REFRESH_SECRET,
  { expiresIn: '7d' }   // Stored server-side so it can be revoked
);
```

The refresh token lives in your database. When you need to revoke a user's access (logout, password change, account compromise), you delete the refresh token. The access token will naturally expire in 15 minutes. Not perfect, but vastly better than "forever."

## Mistake #4: Storing JWTs in localStorage

`localStorage` is accessible by any JavaScript on your page. Every third-party script, every ads SDK, every analytics tracker. If you get XSS'd, attacker scripts can steal every JWT from every logged-in user in one go.

Store JWTs in `HttpOnly` cookies instead. `HttpOnly` means JavaScript can't read them — only the browser sends them automatically with requests. Pair with `SameSite=Strict` or `SameSite=Lax` to neutralize CSRF.

```
Set-Cookie: access_token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/api
```

Yes, this requires a bit more backend wiring. Yes, it's worth it.

## The Quick Security Checklist

Before you ship that JWT implementation:

- [ ] Algorithm is pinned server-side (`algorithms: ['HS256']`)
- [ ] Secret is 256+ bits of random entropy, stored in env vars
- [ ] Access tokens expire in 15-60 minutes
- [ ] Refresh tokens are stored server-side and can be revoked
- [ ] Tokens stored in `HttpOnly` cookies, not `localStorage`
- [ ] Sensitive data is NOT in the payload
- [ ] You're using a maintained library (jsonwebtoken, jose, python-jose)

## The Real Talk

JWTs aren't bad. The spec isn't bad. The ecosystem of "copy this snippet and go" tutorials that skip the security details is bad. The auth stuff is the part you can't half-ass — it's the front door to everything.

Take an extra hour, read your library's security docs, and pin those algorithms. Future-you (and your users) will be grateful.

---

Found a JWT footgun I missed? Roast me on [Twitter/X](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). I read every reply, even the painful ones.
