---
title: "🔐 JWT Security: Stop Trusting Tokens Blindly"
date: "2026-04-22"
excerpt: "JWTs are everywhere — and so are the rookie mistakes that let attackers waltz right through your auth layer. Let's fix that before someone signs their own admin token."
tags: ["security", "jwt", "authentication", "api", "nodejs", "cybersecurity"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Tokens Blindly

Here's a horror story that plays out in production more often than anyone admits:

A developer adds JWT authentication to their API. They feel good about it. "I'm using industry-standard tokens!" They ship it. Then, six months later, a security researcher drops into their inbox with a report showing they could sign their own tokens as `admin` — using the algorithm `"none"`.

Yes. The algorithm `"none"`. As in, *no signature required*. And some libraries just... accepted it.

JWTs are powerful, but they're also a loaded gun that a surprising number of developers aim at their own feet. Let's go through the common traps and how to dodge them.

---

## What a JWT Actually Is

A JSON Web Token is three Base64-encoded chunks glued together with dots:

```
header.payload.signature
```

The **header** says what algorithm was used to sign it. The **payload** carries claims (user ID, roles, expiry, etc.). The **signature** is what makes it trustworthy — it's a cryptographic proof that the token was issued by someone who holds the secret key.

The critical insight: **the server must verify the signature every single time**. If it skips that step, or does it wrong, the "payload" is just... whatever the attacker typed.

---

## Mistake #1: The `alg: none` Attack

The JWT spec (infamously) allows an algorithm value of `"none"`, which means "unsigned." Some older libraries would parse a token, read the algorithm from the *header* (which the attacker controls), and proceed accordingly.

An attacker could craft a token like this:

```json
// Header (Base64 decoded)
{ "alg": "none", "typ": "JWT" }

// Payload (Base64 decoded)
{ "sub": "1337", "role": "admin", "exp": 9999999999 }

// Signature: empty string
```

Result: a perfectly "valid" admin token with no secret key required.

**The fix:** Always explicitly specify which algorithms you accept. Never let the token header decide.

```javascript
// ❌ Dangerous — trusts the token's own alg claim
jwt.verify(token, secret);

// ✅ Safe — you decide the algorithm, period
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

One line. That's the difference between secure and catastrophically broken.

---

## Mistake #2: Weak or Hardcoded Secrets

Your HMAC-signed JWT is only as strong as the secret used to sign it. If your secret is `"secret"`, `"password"`, or — and I've seen this — `"jwt_secret"`, congratulations, an attacker with a wordlist will crack it offline in seconds.

JWT tokens are stateless and public. Anyone who intercepts one can attempt a brute-force attack against the signature without ever hitting your server. There's no rate limiting. No lockout. Just math.

**The fix:**

```bash
# Generate a cryptographically random 256-bit secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it in an environment variable, rotate it periodically, and for anything sensitive, switch to RS256 (asymmetric keys) so even if the public key leaks, nobody can forge tokens.

```javascript
// RS256: sign with private key, verify with public key
const token = jwt.sign({ sub: userId }, privateKey, {
  algorithm: 'RS256',
  expiresIn: '15m',
});

// The public key can be safely distributed to other services
jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

---

## Mistake #3: Tokens That Live Forever

Developers often set `expiresIn: '1y'` because "it's easier for the client." Convenient? Yes. Secure? Absolutely not.

JWTs are stateless — you can't revoke them. If a user's token is stolen, that attacker has access for however long the token lives. A year-long token is basically a password that never expires and can't be reset.

**The fix:** Short-lived access tokens + refresh tokens.

- **Access token:** 15 minutes. Used for API calls. If stolen, limited blast radius.
- **Refresh token:** Longer-lived (days/weeks), stored in an `HttpOnly` cookie, and exchanged for new access tokens. This one *can* be revoked by deleting it server-side.

```
Client                    Server
  |-- POST /auth/login -------->|
  |<-- { accessToken (15m),     |
  |      refreshToken cookie } --|
  |                              |
  |-- GET /api/data (15m later)->|
  |   accessToken expired        |
  |-- POST /auth/refresh ------->|
  |<-- { new accessToken } ------|
```

This way you get the performance of stateless tokens *and* the ability to log users out when you need to.

---

## Bonus: Don't Store JWTs in localStorage

This one isn't about JWT internals, but it kills me every time I see it. `localStorage` is accessible to any JavaScript running on the page. That includes your code, your npm dependencies' code, and any XSS payload an attacker managed to inject.

Store access tokens in memory (a variable). Store refresh tokens in `HttpOnly; Secure; SameSite=Strict` cookies. The browser manages the cookie — JavaScript never sees it.

---

## Quick Security Checklist

Before you ship your next JWT implementation, run through this:

- [ ] Algorithm is explicitly whitelisted (`algorithms: ['RS256']`)
- [ ] Secret is at least 256 bits of random entropy, stored in env vars
- [ ] Access tokens expire in 15–60 minutes max
- [ ] Refresh tokens are revocable and stored server-side
- [ ] Tokens live in memory or `HttpOnly` cookies, not `localStorage`
- [ ] You're validating all claims: `exp`, `iss`, `aud`

---

## The Bottom Line

JWTs aren't inherently insecure — they're just frequently *misused*. The spec has landmines (looking at you, `alg: none`), and the defaults in many libraries are not safe defaults. You have to opt into security deliberately.

Spend 20 minutes auditing your current JWT implementation against this list. The most dangerous vulnerabilities are usually the ones that are already in production, quietly waiting.

Found a bad config in your own code? Fix it today. Your future self — and your users — will thank you.

---

*Got questions or horror stories of your own? Find me on [GitHub](https://github.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). Security conversations are always welcome.*
