---
title: "JWT Security: Stop Trusting Your Own Tokens 🔐"
date: 2026-05-17
excerpt: "JWTs are everywhere — and so are the ways developers get them catastrophically wrong. From the 'alg: none' nightmare to signing key confusion, let's walk through the JWT pitfalls that have burned real production apps (and how to not be next)."
tags: ["security", "jwt", "authentication", "api", "cybersecurity"]
featured: true
---

# JWT Security: Stop Trusting Your Own Tokens 🔐

JSON Web Tokens are the duct tape of modern authentication — they're everywhere, they kind of work, and there's a 40% chance yours has a security hole you don't know about.

JWTs promise a beautiful life: stateless auth, no session store, easy to share across services. And they deliver! But they also come with a small print longer than a mortgage document. Developers have been shot by the same foot-guns repeatedly, and the vulnerabilities are creative enough to be almost impressive.

Let's talk about the top JWT security blunders, how they get exploited, and how to fix them before someone else does it for you.

## The Token That Signs Itself: `alg: none`

This one deserves its own horror movie. The JWT spec originally allowed an algorithm value of `none` — meaning the signature is omitted entirely. The idea was for "unsecured" tokens used in contexts where integrity doesn't matter. Nobody told attackers to only use it there.

A JWT has three parts: `header.payload.signature`. If you craft a header with `"alg": "none"` and drop the signature, some libraries will happily accept it as valid. No crypto. No verification. Just vibes.

```javascript
// What an attacker sends you (no signature, just a trailing dot)
const maliciousToken = 
  btoa(JSON.stringify({ alg: "none", typ: "JWT" })) + "." +
  btoa(JSON.stringify({ sub: "admin", role: "superuser" })) + ".";

// A vulnerable verifier that doesn't explicitly disallow "none":
jwt.verify(maliciousToken, SECRET_KEY); // might just... work
```

The fix is brutally simple: **explicitly whitelist the algorithms you accept.**

```javascript
// Node.js / jsonwebtoken
const payload = jwt.verify(token, SECRET_KEY, {
  algorithms: ['HS256'], // ONLY accept HMAC-SHA256. Period.
});

// Never do this:
// jwt.verify(token, SECRET_KEY) — no algorithm check = trusting the token
```

If you're not specifying `algorithms`, you're letting the token tell you how to verify it. That's like letting a suspect choose whether they need a fingerprint check.

## RS256 vs HS256: The Algorithm Confusion Attack

This one is sneaky and still catching people. Here's the setup:

- Your server uses **RS256** (asymmetric): signs tokens with a private key, verifies with a public key.
- Your public key is, well, *public* — your clients might even fetch it from a JWKS endpoint.

Now an attacker grabs your public key and creates a token signed with **HS256** using that public key as the HMAC secret. If your server doesn't pin the expected algorithm and uses the public key for *both* RS256 verification and (accidentally) HS256 verification, it will happily accept the attacker's token as valid.

The attacker used your own public key against you. Poetic, honestly.

```javascript
// The fix: always specify the exact algorithm server-side
// If you issue RS256 tokens, verify ONLY RS256 tokens

const payload = jwt.verify(token, publicKey, {
  algorithms: ['RS256'], // RS256 only — HS256 won't sneak in
});
```

And never expose your secret key anywhere a client could read it. This seems obvious but JWKS endpoints have been misconfigured to include private key material more than once in the wild.

## Storing JWTs in localStorage: A Gift for XSS

This isn't a JWT flaw per se — it's a "where you put it" flaw. And it's extremely common.

`localStorage` is accessible to any JavaScript running on your page. Any JavaScript. Including injected scripts from an XSS attack. Store your JWT there and any XSS vulnerability in your app becomes an instant account takeover.

```javascript
// BAD: XSS can read this
localStorage.setItem('token', jwt);

// BETTER: HttpOnly cookie — JS can't touch it
// Set server-side:
res.cookie('token', jwt, {
  httpOnly: true,   // JS cannot read this cookie
  secure: true,     // HTTPS only
  sameSite: 'Strict', // CSRF protection
  maxAge: 15 * 60 * 1000, // 15 minutes
});
```

`HttpOnly` cookies can't be read by JavaScript at all — not by your code, not by injected code. You trade some flexibility for a meaningful security boundary.

The common pushback is "but then I can't read the token in my frontend." You usually don't need to. You need to *send* it, which the browser does automatically with cookies. If you genuinely need to read token metadata (like expiry time), store only the non-sensitive claims in localStorage and keep the actual token in an `HttpOnly` cookie.

## Short-Lived Tokens and Refresh Token Rotation

JWTs are stateless, which means you can't easily revoke them. If an access token is stolen, it's valid until it expires. So: **keep access tokens short-lived.**

15 minutes is a reasonable access token lifetime. Use refresh tokens (stored in `HttpOnly` cookies) to get new access tokens silently. And implement refresh token rotation — each time a refresh token is used, invalidate it and issue a new one.

```javascript
// Refresh token rotation: detect reuse attempts
async function refreshAccessToken(refreshToken) {
  const stored = await db.getRefreshToken(refreshToken);

  if (!stored) {
    // Token not found — possible reuse of a revoked token
    // Invalidate the entire token family (paranoid mode: log out the user)
    await db.revokeTokenFamily(refreshToken);
    throw new Error('Refresh token reuse detected. Please log in again.');
  }

  await db.revokeRefreshToken(refreshToken); // old one is gone
  const newRefreshToken = generateRefreshToken();
  await db.saveRefreshToken(newRefreshToken);

  return {
    accessToken: generateAccessToken(),
    refreshToken: newRefreshToken,
  };
}
```

If an attacker steals a refresh token and uses it, the legitimate user's next refresh attempt will see a "token not found" error — a red flag you can act on. Not perfect, but it collapses the attack window dramatically.

## The Quick JWT Security Checklist

Before you ship that auth system, run through this:

- [ ] `algorithms` is explicitly set in your verify call (no `none`, no open list)
- [ ] Access tokens expire in 15 minutes or less
- [ ] Tokens are in `HttpOnly` cookies, not `localStorage`
- [ ] You validate `iss`, `aud`, and `exp` claims on every request
- [ ] Refresh tokens are rotated and stored hashed in the database
- [ ] Your JWKS endpoint exposes only public keys

JWTs aren't broken — they're just unforgiving of configuration mistakes. The spec is complex, the libraries vary in defaults, and the attack surface is wider than it looks from the outside. The good news: every one of these vulnerabilities has a straightforward fix once you know what to watch for.

---

*Found a JWT footgun I missed? Hit me up on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — I genuinely want to hear about the weird ones. And if this saved your auth system from a bad day, share it with the dev who's about to ship localStorage tokens to prod.* 🔒
