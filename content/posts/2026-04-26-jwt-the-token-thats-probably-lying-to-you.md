---
title: "🔑 JWT: The Token That's Probably Lying to You"
date: "2026-04-26"
excerpt: "JWTs are everywhere — auth headers, cookies, URL params. They look secure. They feel secure. But a shocking number of apps verify them wrong, sign them weakly, or don't verify them at all. Let's talk about that."
tags: ["security", "jwt", "authentication", "api-security", "cybersecurity", "web-security", "backend"]
featured: true
---

# 🔑 JWT: The Token That's Probably Lying to You

Quick quiz: what does this JWT header mean?

```json
{ "alg": "none", "typ": "JWT" }
```

If you said "that's perfectly fine, I trust it" — we need to talk.

If you said "that's a catastrophic security hole that lets anyone forge tokens" — you're ahead of most developers shipping to production right now.

JSON Web Tokens have become the default auth mechanism for SPAs, mobile apps, and microservices. They're elegant, stateless, and self-contained. They're also one of the most consistently misimplemented security primitives in the modern web stack. The bugs aren't subtle. They're *spectacular*.

Let's walk through how JWTs are supposed to work, how they go spectacularly wrong, and what actually-secure implementation looks like.

## What a JWT Actually Is 🧩

A JWT is three base64url-encoded chunks separated by dots:

```
header.payload.signature
```

The **header** says what algorithm was used to sign it. The **payload** contains your claims — user ID, roles, expiry. The **signature** is a cryptographic proof that a trusted party created it and the contents haven't been tampered with.

The whole point of the signature is that *you can't fake it without the secret key*. Decode a JWT on [jwt.io](https://jwt.io) — you can read the payload just fine. It's not encrypted, it's just encoded. The security comes entirely from the signature verification step.

Which means if you skip that step — or do it wrong — the token's payload is just a polite suggestion from whoever sent it.

## The "algorithm confusion" attack 💀

This one deserves its own horror movie. Here's how it works:

Most JWT libraries support two families of algorithms: **HMAC** (like `HS256`) uses a *shared secret* to both sign and verify. **RSA/ECDSA** (like `RS256`) uses a *private key* to sign, and a *public key* to verify.

The public key is meant to be public — you often publish it at a `.well-known/jwks.json` endpoint. Everybody can see it.

Now here's the trick. A vulnerable server configured for `RS256` verification might do something like:

```javascript
// DON'T DO THIS — vulnerable pseudocode
const algorithm = jwt.header.alg; // 👈 trusting the token's own header
jwt.verify(token, publicKey, { algorithms: [algorithm] });
```

An attacker takes the *public* key (which they have, since it's public), crafts a token with `"alg": "HS256"`, and signs it using the public key as the HMAC secret.

The server reads `alg: HS256`, grabs the "secret" (which is... the public key), and verifies the signature with it. It matches. Token accepted. Attacker is now `{ "role": "admin" }`.

The fix is dead simple: **never trust the `alg` field from the token itself**. Hardcode the expected algorithm on the server side:

```javascript
// DO THIS INSTEAD
jwt.verify(token, publicKey, { algorithms: ['RS256'] }); // explicit, hardcoded
```

One line. Closes the attack completely.

## The `alg: none` attack (yes, really)

Remember that header from the intro? The JWT spec once allowed a "none" algorithm, meaning "unsigned, trust me bro." Some libraries still accept it by default.

An attacker strips the signature, sets `"alg": "none"`, and submits the bare token. Vulnerable servers skip verification entirely because the spec *said they should*. The RFC has since been clarified, but old libraries linger in old `package.json` files.

Always explicitly specify allowed algorithms. If your library's default `verify()` call accepts `alg: none` without extra configuration — that's a library bug, and you should update it or configure it explicitly.

## Weak secrets and the "secret" that isn't

HMAC-signed JWTs are only as strong as the secret key. And developers have a *gift* for terrible secrets:

- `secret`
- `your-256-bit-secret` (literally from the jwt.io example)
- The app name: `myapp`
- An empty string: `""`

If an attacker gets your token, they can brute-force a weak HMAC secret offline with tools like `hashcat` in under a minute. Then they can sign arbitrary tokens with your key.

Use a cryptographically random secret of at least 256 bits. Generate it once, store it in your secrets manager, rotate it on a schedule:

```bash
# Generate a proper secret
openssl rand -base64 32
# → 3D9kX2mN7pQrLvBwYtHcEsAuZjFgId8oMnCxK1WlP4=
```

Treat it like a production database password — not a git-committed config value.

## Don't put secrets in the payload

The payload is **not encrypted**. It is base64url-encoded, which is reversible with one command:

```bash
echo "eyJ1c2VySWQiOiIxMjMifQ" | base64 -d
# → {"userId":"123"}
```

Developers sometimes stuff JWTs with email addresses, PII, internal system IDs, or (in the wildest cases) passwords. Every service that receives the token can read all of it. Every log that captures the auth header now has your user's email. Every bug tracker screenshot leaks role information.

Put only what's necessary for authorization in the payload: a user ID, roles, expiry. If you need private data in the token, use JWE (JSON Web Encryption) — or reconsider whether a stateless token is the right tool at all.

## The expiry problem

JWTs are stateless, which means **you can't revoke one before it expires**. Log a user out, and their token still works until `exp`. Rotate your signing keys, and old tokens still verify against the old key.

This is a real architectural constraint, not a fixable bug. The mitigations are:
- Keep `exp` short (15 minutes for access tokens, use refresh tokens for longevity)
- Maintain a small revocation blocklist for high-value events (password change, account ban)
- Use audience (`aud`) and issuer (`iss`) claims to scope tokens tightly

There's no perfect answer here. Understand the trade-off before you pick stateless auth.

## The secure checklist 📋

- Hardcode the expected algorithm server-side, never read it from the token
- Reject tokens with `alg: none` unconditionally
- Use a 256-bit+ random secret for HMAC, or RS256/ES256 with a proper key pair
- Keep payloads small and PII-free
- Set short expiry times (`exp`) and implement refresh token rotation
- Validate `iss`, `aud`, and `nbf` claims — don't just check the signature
- Update your JWT library — the CVE history for popular libraries is a graveyard of `alg: none` bypasses

JWTs aren't broken. They're just easy to break if you trust the token more than your own configuration.

---

**Found this useful?** Pass it along to whoever owns your auth service. Or come debate stateless auth vs. sessions with me on [GitHub](https://github.com/kpanuragh) — I have strong opinions and a surprisingly good test suite.
