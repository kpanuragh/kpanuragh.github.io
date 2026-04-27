---
title: "🔐 JWT Security: Stop Trusting Tokens Blindly (They Lie)"
date: 2026-04-27
excerpt: "JWTs look secure — they're signed! But 'alg: none', weak secrets, and missing claim validation have leaked millions of accounts. Here's how attackers break JWTs and how to make yours bulletproof."
tags: ["security", "jwt", "authentication", "api", "cybersecurity"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Tokens Blindly (They Lie)

Here's a fun game: take any JWT, paste it into [jwt.io](https://jwt.io), and read the payload. Go ahead. I'll wait.

Welcome to the club of people who just realized their "secure token" is base64-encoded JSON that literally anyone can read. The signature prevents *tampering* — it doesn't hide anything. And that's just the beginning of where JWT security gets spicy.

JWTs are everywhere. They authenticate API calls, carry user sessions, authorize microservice requests. They're also the source of some of the most embarrassing security bugs in modern web development — bugs that let attackers forge tokens, escalate privileges, and walk into admin panels without a password.

Let's break down exactly how JWTs get exploited, and how to stop it.

---

## The "alg: none" Attack (A Hall of Fame Bug)

This one is legendary. The JWT spec allows an algorithm value of `"none"` — meaning "this token is not signed, just trust it." Some early JWT libraries actually honored this field from the token itself, rather than hardcoding it on the server.

The attack is devastatingly simple:

1. Grab your valid JWT: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoidXNlciJ9.signature`
2. Decode the header, change `"alg"` to `"none"`, re-encode
3. Change `"role": "user"` to `"role": "admin"` in the payload, re-encode
4. Drop the signature entirely
5. Send: `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYWRtaW4ifQ.`

Vulnerable libraries would look at the `alg` header, see `"none"`, skip signature verification, and decode the payload as valid. Congratulations, you're admin now.

**The fix:** Never read the algorithm from the token. Hardcode the algorithm on the server side.

```javascript
// ❌ Dangerous — trusting the token's own algorithm claim
const payload = jwt.verify(token, secret); // some libraries default to reading alg from header

// ✅ Safe — we decide the algorithm, not the token
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

One line. That's it. Hardcode your allowed algorithms and never let the token dictate how it should be verified.

---

## The Weak Secret Problem (Crackable in Minutes)

HMAC-signed JWTs (HS256/HS384/HS512) are only as strong as the secret used to sign them. If your secret is `"secret"`, `"password123"`, or the name of your app — an attacker who gets hold of one valid token can crack it offline with a dictionary attack.

Here's what that looks like with `hashcat`:

```bash
# An attacker captures a token from your API response headers
# They run this locally — no rate limiting, no lockouts, zero noise
hashcat -a 0 -m 16500 captured_token.txt wordlist.txt

# With a GPU and rockyou.txt, weak secrets crack in under a minute
```

There's no network request. No login attempt to log. They brute-force the HMAC locally against a wordlist, and once they have your secret, they can forge any token they want — any user ID, any role, any expiry.

**The fix:** Use a cryptographically random secret of at least 256 bits. Better yet, switch to RS256 (RSA asymmetric signing) so the signing key is a private key that never leaves your auth server.

```javascript
import crypto from 'crypto';

// Generate a proper secret (do this once, store in your secrets manager)
const secret = crypto.randomBytes(64).toString('hex');
// → "a3f9c2e1d8b74a6f..." (128 hex chars = 512 bits)

// Or use RS256 with a key pair — the public key verifies, private key signs
// Your API servers only need the public key to verify tokens
const token = jwt.sign({ sub: userId, role: 'user' }, privateKey, {
  algorithm: 'RS256',
  expiresIn: '15m',
});
```

With RS256, even if an attacker compromises your API servers, they can't forge tokens — they don't have the private key. That's a meaningful security boundary.

---

## Missing Claims Validation (The Subtle Killer)

Signature verification passes. You're done, right? Not quite. A valid signature only proves the token wasn't tampered with *after* it was issued. It says nothing about whether the token is appropriate to use *right now*.

Here are the claims that actually matter and are routinely skipped:

```javascript
// ❌ Only checking signature — missing critical claim validation
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
// payload.exp? Not checked manually — but jwt.verify does handle this one.
// payload.iss? Not checked. Anyone with a HS256 token from another service passes.
// payload.aud? Not checked. Token meant for your mobile app works on your admin API.
// payload.nbf? Not checked. Pre-issued tokens work before they should.

// ✅ Full claim validation
const payload = jwt.verify(token, secret, {
  algorithms: ['HS256'],
  issuer: 'https://auth.yourapp.com',     // reject tokens from other issuers
  audience: 'api.yourapp.com',            // reject tokens meant for other services
  clockTolerance: 30,                     // 30s leeway for clock skew between servers
});

// Then validate your own business logic claims
if (!payload.sub) throw new Error('Missing subject claim');
if (!['user', 'admin'].includes(payload.role)) throw new Error('Invalid role claim');
```

The `iss` (issuer) and `aud` (audience) checks are what prevent **token substitution attacks** — where a valid token issued for one service gets reused against a different service that shares the same signing key. This shows up in microservice architectures constantly.

---

## The Token Revocation Problem (JWTs Are Stateless... Until They Aren't)

Here's the uncomfortable truth about JWTs: you can't truly revoke them. A user changes their password? Their old tokens still work until they expire. You ban a user? Their token still grants access. Someone's laptop gets stolen? The attacker has a valid token for however long it remains active.

The standard mitigations:

1. **Short expiry times** — 15-minute access tokens. Annoying? Yes. Limits blast radius? Also yes.
2. **Refresh token rotation** — long-lived refresh tokens stored server-side (in Redis/DB), short-lived JWTs. Revoke the refresh token to cut off access.
3. **Token blocklist** — store revoked `jti` (JWT ID) claims in Redis. Check on every request. You've just made your JWT stateful, which is ironic but sometimes necessary.

```javascript
// Add a unique ID to every token
const token = jwt.sign(
  { sub: userId, jti: crypto.randomUUID() },
  secret,
  { algorithm: 'HS256', expiresIn: '15m' }
);

// On every request, check the blocklist (fast Redis lookup)
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
const isRevoked = await redis.get(`revoked:${payload.jti}`);
if (isRevoked) throw new Error('Token has been revoked');
```

---

## Quick Reference: JWT Security Checklist

Before you ship that auth endpoint, verify:

- [ ] Algorithm hardcoded on the server (`algorithms: ['RS256']` or `['HS256']`)
- [ ] Secret is 256+ bits of cryptographic randomness (or use RS256/ES256)
- [ ] `exp`, `iss`, and `aud` claims are validated on every request
- [ ] Access tokens expire in 15 minutes or less
- [ ] Refresh tokens are stored server-side and can be revoked
- [ ] `jti` claim added for blocklist support when needed
- [ ] JWT payload contains no sensitive data (remember: it's just base64)

JWTs are a great tool when used correctly. The spec is solid. The ecosystem has improved enormously. But they're still regularly misused in ways that result in authentication bypasses and privilege escalation bugs.

The attackers who find these issues aren't sophisticated — they're running `jwt.io` and a wordlist. Don't make it easy for them.

---

Audit your JWT implementation today. If you're not hardcoding the algorithm and validating `iss`/`aud`, you have work to do — and now you know exactly what to fix.

Found a JWT footgun in your own codebase? Or want to nerd out about token architecture? Drop a comment or find me on GitHub. Security horror stories always welcome.
