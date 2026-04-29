---
title: "🔐 JWT Security: Stop Doing It Wrong (Your Tokens Are Probably Broken)"
date: 2026-04-29
excerpt: "JWTs are everywhere, and so are the footguns. From the infamous 'alg: none' exploit to weak secrets and missing expiry, let's walk through how developers get JWTs catastrophically wrong — and how to fix it."
tags: ["security", "jwt", "authentication", "nodejs", "cybersecurity", "api"]
featured: true
---

# 🔐 JWT Security: Stop Doing It Wrong (Your Tokens Are Probably Broken)

Here's a fun game: go to [jwt.io](https://jwt.io), paste any JWT from your app, and hit decode. No password. No secret. Just... everything. Your user ID, email, roles — all there, in plain text, readable by anyone with internet access.

That's by design. And most developers, discovering this for the first time, immediately do something dangerous.

Let's talk about JWTs — what they actually are, how they get abused, and the specific mistakes that have caused real-world breaches.

## What a JWT Actually Is (Not Magic, Not Encryption)

A JSON Web Token is three Base64url-encoded chunks glued together with dots:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   ← Header
.eyJzdWIiOiIxMjM0Iiwicm9sZSI6InVzZXIifQ ← Payload
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c ← Signature
```

The **header** says which algorithm signed it. The **payload** holds your claims (user ID, expiry, roles, etc.). The **signature** proves the token wasn't tampered with — *if* you verify it correctly.

Notice what's missing from that list: **encryption**. A JWT is signed, not encrypted. Anyone can read the payload. Only the server with the secret can *verify* it. This distinction trips up a shocking number of developers.

**Never put sensitive data in a JWT payload.** No passwords. No SSNs. No credit card numbers. No secrets of any kind. The payload is a signed sticky note, not a vault.

## The "alg: none" Attack (Yes, This Was Real)

This is the one that keeps security researchers up at night. The JWT spec originally allowed `"alg": "none"` — meaning "no signature required, just trust me." And some early libraries actually honored it.

The attack is almost comedically simple. An attacker takes a legitimate JWT:

```json
{ "alg": "HS256", "typ": "JWT" }
{ "sub": "456", "role": "user" }
[valid signature]
```

Changes the header to `"alg": "none"`, upgrades their role to `"admin"`, strips the signature, and submits it. Vulnerable libraries would see "alg: none, no signature needed" and happily accept it.

**The fix:** always explicitly specify which algorithms your library should accept, and never accept `none`.

```javascript
// ❌ Dangerous — trusts whatever alg the token claims
jwt.verify(token, secret);

// ✅ Safe — you decide the algorithm, not the attacker
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

One line. That's the difference between secure and compromised.

## Weak Secrets: Your HMAC Is Only As Strong As Your Secret

When you use HS256, the signature is basically `HMAC-SHA256(header + payload, your_secret)`. If your secret is weak, attackers can brute-force it offline. They have your token (it's sent in headers), and they just need to crack the secret.

Tools like `hashcat` can test **billions** of candidates per second against JWT secrets. If your secret is `secret`, `password`, `jwt_secret`, or any dictionary word, it's effectively not there.

Real-world secret strengths I've seen in production code reviews:

- `secret` — cracked in milliseconds
- `mysupersecretkey` — cracked in seconds
- `JWT_SECRET_KEY_2023` — cracked in minutes
- A 256-bit random string — good luck, attacker

```javascript
// ❌ Please stop
const secret = 'myapp_jwt_secret';

// ✅ Generate once, store in env, never commit
// openssl rand -base64 32
const secret = process.env.JWT_SECRET; // "k3Rd9mP2xQzL8nVwYbJ6sA1tFhE4iOcU..."
```

For high-stakes applications, ditch HMAC entirely and use **RS256** (asymmetric signing). Your auth server holds the private key and signs tokens. Any service can verify with the public key, but only the auth server can *issue* tokens. Compromise of a downstream service can't be used to forge tokens.

## Missing or Ignored Expiry (`exp`)

A JWT without an expiration is basically a skeleton key — once issued, it's valid forever. If a user's account gets compromised, if they log out, if you need to revoke access — too bad. The token still works.

Always set a short `exp`, and mean it:

```javascript
// Issuing — always set exp
const token = jwt.sign(
  { sub: user.id, role: user.role },
  process.env.JWT_SECRET,
  { 
    algorithm: 'HS256',
    expiresIn: '15m'  // Short-lived access token
  }
);

// Verifying — the library checks exp automatically, but be explicit
try {
  const payload = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'],
    clockTolerance: 30  // 30 seconds tolerance for clock skew
  });
} catch (err) {
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired, please refresh' });
  }
  return res.status(401).json({ error: 'Invalid token' });
}
```

Pair short-lived access tokens (15 minutes) with longer-lived refresh tokens (7 days, stored in an httpOnly cookie). This gives you the ability to revoke access within a reasonable window without forcing constant logins.

## The Checklist You Actually Need

Before you ship auth, run through this:

- **Explicit algorithm** — `algorithms: ['HS256']` or `['RS256']` in verify options
- **Strong secret** — 32+ bytes of cryptographic randomness, stored in env vars
- **Short expiry** — 15 minutes for access tokens, use refresh tokens for sessions
- **Verify on every request** — middleware that actually rejects bad tokens, not just decodes them
- **No sensitive data in payload** — user ID and role? Fine. SSN? Never.
- **HTTPS only** — a valid JWT sent over HTTP is trivially stolen by a network observer

JWTs are genuinely great for stateless auth when used correctly. The spec is solid. The problem is almost always implementation — a copied Stack Overflow snippet, a library with insecure defaults, or a secret committed to GitHub.

## The Takeaway

The next time you reach for `jwt.sign()`, remember that you're holding a loaded gun that ships with the safety off. The library will happily sign a token with `"role": "admin"` and a 100-year expiry if you tell it to.

Security isn't about avoiding JWTs — it's about understanding exactly what guarantees they provide (tamper-evidence, not secrecy) and where the footguns are (algorithm confusion, weak secrets, missing expiry).

Audit your auth today. Check your secret length. Check your algorithm whitelist. Check your expiry. It takes 15 minutes and might save you from being the next breach headline.

---

*Found a JWT footgun in your own codebase? I'd love to hear about it — [reach out on Twitter/X](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). No judgment, only solidarity. We've all shipped broken auth at least once.*
