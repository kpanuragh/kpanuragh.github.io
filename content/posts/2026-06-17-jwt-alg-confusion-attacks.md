---
title: "🔐 JWT Algorithm Confusion: When Your Signature Means Nothing"
date: "2026-06-17"
excerpt: "JWT alg confusion attacks let attackers forge tokens your server happily accepts. Here's how the none algorithm and RS256-to-HS256 confusion work — and how to shut them down."
tags:
  - security
  - api-security
  - jwt
  - authentication
  - backend
featured: true
---

There's a special kind of humiliation reserved for developers when they discover their authentication system has been accepting **completely forged tokens** for months. Not cracked tokens. Not stolen tokens. Tokens the attacker just... made up.

Welcome to JWT algorithm confusion attacks — where a single overlooked header field turns your cryptographic fortress into a screen door.

## First, a 30-Second JWT Recap

A JWT has three base64-encoded parts separated by dots:

```
header.payload.signature
```

The **header** declares the algorithm used to sign the token. The **payload** carries claims like `{ "sub": "user123", "role": "admin" }`. The **signature** is what proves the payload wasn't tampered with.

The critical thing: **the server decides which algorithm to trust**. Or at least, it should.

## Attack #1: The `alg: none` Exploit

This one is beautifully simple. The JWT spec originally allowed `"alg": "none"` for "unsecured" tokens — no signature required. If your library trusts whatever algorithm the *token header* declares instead of enforcing the one *you* configured, an attacker can do this:

```python
import base64, json

header = base64.urlsafe_b64encode(
    json.dumps({"alg": "none", "typ": "JWT"}).encode()
).rstrip(b"=")

payload = base64.urlsafe_b64encode(
    json.dumps({"sub": "attacker", "role": "admin"}).encode()
).rstrip(b"=")

# No signature needed — just leave it empty
forged_token = f"{header.decode()}.{payload.decode()}."
```

That trailing dot with nothing after it? That's the signature. It's empty. And a shocking number of early JWT libraries (I'm looking at you, pre-2015 Node.js ecosystem) would verify this token as valid.

The server would cheerfully decode it, see `"role": "admin"`, and hand over the keys to the kingdom.

**Fix:** Explicitly enforce the expected algorithm server-side. Never derive the algorithm from the token header.

```python
# Wrong — trusts whatever the token says
decoded = jwt.decode(token, secret, algorithms=None)

# Right — you decide the algorithm, always
decoded = jwt.decode(token, secret, algorithms=["HS256"])
```

## Attack #2: The RS256 → HS256 Confusion

This one is more sophisticated and remains a live issue in production APIs today. We hit a variant of this at Cubet while reviewing an authentication service that used asymmetric keys — RS256 with a private key for signing and a public key for verification.

Here's the elegant evil of the attack:

RS256 uses **asymmetric cryptography** — private key signs, public key verifies. HS256 uses **symmetric cryptography** — one shared secret both signs and verifies.

The public key isn't secret. It's often distributed freely, published at a JWKS endpoint, or embedded in client SDKs.

Now watch what happens when a vulnerable server lets the token header dictate the algorithm:

1. Attacker obtains the server's RSA **public key** (legally, from a public endpoint)
2. Attacker crafts a malicious payload: `{ "sub": "attacker", "role": "admin" }`
3. Attacker signs it with **HS256**, using the RSA public key as the HMAC secret
4. Sends the token with `"alg": "HS256"` in the header

The vulnerable server sees `"alg": "HS256"`, switches to HMAC verification mode, and uses the RSA public key as the HMAC secret. The attacker *also* used the public key to sign. **They match. Token accepted.**

```javascript
// Attacker's forgery script (Node.js)
const jwt = require('jsonwebtoken');
const fs = require('fs');

const publicKey = fs.readFileSync('server-public-key.pem', 'utf8');
const maliciousPayload = { sub: 'attacker', role: 'superadmin' };

// Sign with HS256, using the PUBLIC KEY as the secret
const forgedToken = jwt.sign(maliciousPayload, publicKey, { algorithm: 'HS256' });
console.log(forgedToken);
// Server that doesn't pin algorithms will accept this.
```

The public key is the secret. The secret is the key. And now you've got admin access.

## The Fix: Algorithm Pinning and Library Hygiene

The defense is straightforward, but you have to actually do it:

```javascript
// Express + jsonwebtoken — the right way
const express = require('express');
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    // ALWAYS specify algorithms explicitly. Never read alg from token header.
    const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY, {
      algorithms: ['RS256'], // Pin this. Hard.
    });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

And a few more rules to live by:

- **Use a well-maintained JWT library** that has patched these issues. Check the CVE history before picking one.
- **Disable `alg: none` explicitly** — most modern libraries do this by default, but verify.
- **Rotate your keys.** If your public key gets exposed in a breach alongside a vulnerable endpoint, game over.
- **Validate all claims** — `exp`, `iss`, `aud`. A valid signature on an expired token from a foreign issuer should still be rejected.

## Why This Still Bites People

Algorithm confusion attacks were documented years ago and fixed in major libraries — yet they keep resurfacing in the wild. The reason is usually one of three things: a custom JWT implementation someone wrote "to avoid dependencies", an ancient library version that never got updated, or a developer who assumed that any valid-looking JWT signature is fine without reading the docs.

During a security review last year at Cubet, we found an internal admin API that had been copy-pasted from a 2017 tutorial. The tutorial's verification code used a third-party library that had since published two security advisories. Nobody had updated it. The service handled user role elevation.

These aren't exotic academic attacks. They're in the wild, they're reproducible in five minutes, and they hand over full authentication bypass to anyone who reads a blog post.

Which you're doing right now. You're welcome.

## TL;DR

| Attack | Mechanism | Fix |
|--------|-----------|-----|
| `alg: none` | Token declares no signature needed | Pin algorithms, never trust header alg |
| RS256 → HS256 confusion | Public key used as HMAC secret | Pin to RS256, verify key type matches alg |

Read your JWT library's changelog. Check which algorithms are enabled by default. Then pin them down so no attacker can negotiate a better deal than you intended.

---

Found a JWT footgun in the wild? I'd genuinely love to hear about it — hit me up on [Twitter/X](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh). And if this saved your API from becoming someone's CTF trophy, share it with the dev on your team who's still copy-pasting auth code from 2017.
