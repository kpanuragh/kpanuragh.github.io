---
title: "🔐 JWT Security: The Token You Trust (But Probably Shouldn't)"
date: 2026-05-06
excerpt: "JWTs are everywhere — auth systems, microservices, mobile apps. They're also riddled with footguns. From the 'alg: none' disaster to secret-less HS256 setups, here's what actually goes wrong and how to stop it."
tags: ["security", "jwt", "authentication", "api", "cybersecurity", "owasp"]
featured: true
---

There's a moment in every developer's career where they discover JWTs and think: *this is genius*. Stateless auth! Self-contained tokens! No more session tables! You slap `jsonwebtoken` into your package.json and feel like you've solved authentication forever.

Then, six months later, you read a post-mortem about a breach caused by `"alg": "none"` and realize you may have handed out signed blanks without checking what was written on them.

Welcome to **JWT security** — where the spec is fine, the libraries are mostly fine, and the implementations are a crime scene.

## What Is a JWT, Really?

A JSON Web Token is three base64url-encoded blobs joined by dots:

```
header.payload.signature
```

The **header** says what algorithm signed this. The **payload** is the claims — user ID, roles, expiry. The **signature** proves the header and payload haven't been tampered with, assuming you do it right.

Decode the header of a typical JWT and you get something like:

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

That `alg` field is where things start to go wrong. Because it's *in the token itself*, and a lot of implementations naively trust it.

## The "Algorithm None" Disaster

In 2015, Tim McLean published a vulnerability affecting multiple JWT libraries: the `alg: none` attack.

The JWT spec originally allowed `"alg": "none"` to mean "this token is unsecured — no signature required." Sounds like a niche edge case. Turns out, some libraries would accept this algorithm if you just... asked for it. In the token header. Which the attacker controls.

The attack flow:

1. Receive a legitimate JWT from the server
2. Decode the header and payload (they're just base64 — anyone can decode them)
3. Modify the payload to claim you're an admin: `"role": "admin"`
4. Re-encode with `"alg": "none"` and an empty signature
5. Send it to the server
6. Some servers say: "Algorithm is none, no signature needed — looks good to me!"

You just became admin without knowing the signing secret. This is the JWT equivalent of a bouncer who checks your ID and then waves you through without actually reading it.

**The fix:** Never derive which algorithm to use from the token itself. Hardcode the expected algorithm server-side:

```javascript
// ❌ Wrong — algorithm comes from the token, attacker controls it
jwt.verify(token, secret);

// ✅ Right — algorithm is enforced by the server
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

One line. That's it. The algorithm must be a server-side configuration decision, not a client-supplied hint.

## The Weak Secret Problem

HS256 (HMAC-SHA256) is symmetric — the same secret signs and verifies the token. If that secret is weak, an attacker who intercepts JWTs can crack it offline with a tool like [hashcat](https://hashcat.net/) in seconds.

Common offenders:

- `secret` (yes, literally the string "secret")
- `password123`
- The app name + "2023"
- The default value from whatever tutorial the developer followed

Real-world projects have been broken this way. JWT secrets should be treated like database passwords: randomly generated, at least 256 bits, stored in environment variables or secrets managers — never in source code.

```javascript
// Generating a safe secret (do this once, store the output securely)
const crypto = require('crypto');
console.log(crypto.randomBytes(64).toString('hex'));
// → something like: a3f91c2b7e4d...
```

If you're on RS256 (asymmetric), you sign with a private key and verify with the public key. The public key being public doesn't help an attacker forge tokens. This is often the better choice for microservices where multiple services need to verify tokens but only one should issue them.

## The Confused Deputy: RS256 → HS256 Downgrade

Here's a subtler attack that's bitten real systems.

Your auth server uses **RS256**: signs with a private key, publishes the public key. Services verify tokens using the public key — which, by definition, is public.

An attacker notices the verification endpoint accepts multiple algorithms. They take a legitimate JWT, switch the header to `"alg": "HS256"`, and sign it with... the server's *public key*. Because the public key is public.

A vulnerable server, when it sees `"alg": "HS256"`, uses the configured key as the HMAC secret. That configured key is the RS256 *public key* — which the attacker already has. The verification passes. Forged token accepted.

Again: **enforce the algorithm server-side.** Accept exactly the algorithms you expect. Reject everything else.

```javascript
// If you issue RS256 tokens, only verify RS256 tokens
const publicKey = fs.readFileSync('public.pem');

jwt.verify(token, publicKey, { algorithms: ['RS256'] }, (err, decoded) => {
  if (err) return res.status(401).json({ error: 'Invalid token' });
  req.user = decoded;
  next();
});
```

## What Your JWT Validation Checklist Should Look Like

Most JWT bugs come from skipping verification steps that seem unnecessary until they're not:

```javascript
const EXPECTED_ISSUER = 'https://auth.yourapp.com';
const EXPECTED_AUDIENCE = 'api.yourapp.com';

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
    algorithms: ['RS256'],          // enforce algorithm — no negotiation
    issuer: EXPECTED_ISSUER,        // reject tokens from other issuers
    audience: EXPECTED_AUDIENCE,    // reject tokens meant for other services
    clockTolerance: 30,             // allow 30s clock skew, nothing more
  });
  // jwt.verify throws on expiry (exp), not-before (nbf), and bad signature
  // so no need to check those manually if you're using the library correctly
}
```

The `issuer` and `audience` checks matter more than they sound. If you have multiple services accepting the same signing key, a token issued for service A (low-privilege) could be replayed against service B (high-privilege) without those checks. This is the "confused deputy" class of bug.

## The "JWTs Are Stateless So I Can't Revoke Them" Trap

This one isn't a cryptographic flaw — it's an architectural footgun.

JWTs are valid until they expire. If a user logs out, changes their password, or gets compromised, you cannot make their existing tokens invalid without some server-side state... which defeats the "stateless" selling point.

The pragmatic solutions:

1. **Short expiry + refresh tokens.** Access tokens expire in 15 minutes. Refresh tokens (stored server-side with a revocation list) issue new access tokens. You get short-lived statelesness with revocation capability on the refresh layer.
2. **Token blocklist.** A Redis set of revoked JTIs (JWT IDs). On every request, check if the JTI is in the blocklist. Fast, but you're maintaining server state again.

There's no free lunch. Pick the model that matches your security requirements. A banking app needs different tradeoffs than a developer tool.

## The Bottom Line

JWTs are a solid building block when used correctly. The problems are almost never in the cryptography — they're in the implementation details that seem unimportant until an attacker finds them first.

The non-negotiable rules:

- **Lock down the algorithm.** Hardcode it server-side. Never trust the header's `alg` claim.
- **Use a strong, random secret** (or asymmetric keys — prefer RS256/ES256 for multi-service setups).
- **Validate issuer and audience** if more than one service touches your tokens.
- **Plan for revocation** before you ship, not after the first incident.

The irony of JWTs is that the failure modes aren't complicated — they're just easy to skip when you're moving fast and everything seems to work. Until it doesn't.

---

Spotted a JWT footgun in your own code? Been burned by one of these in production? Commiserate or ask questions over on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — the more we share these stories, the fewer post-mortems we write.

Keep your tokens short-lived and your secrets longer.
