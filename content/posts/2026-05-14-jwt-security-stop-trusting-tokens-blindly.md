---
title: "🔐 JWT Security: Stop Trusting Tokens Blindly (Your Auth Is Probably Broken)"
date: 2026-05-14
excerpt: "JWTs are everywhere — and so are the catastrophic mistakes developers make with them. From the infamous 'alg: none' attack to leaking secrets in localStorage, here's what's actually going wrong in your auth layer."
tags: ["security", "jwt", "authentication", "web-security", "backend"]
featured: true
---

# 🔐 JWT Security: Stop Trusting Tokens Blindly (Your Auth Is Probably Broken)

JSON Web Tokens are the duct tape of modern authentication. Everyone uses them. Few people truly understand them. And a surprising number of production apps have auth vulnerabilities that would make a security auditor cry into their coffee.

Here's the fun part: JWTs look secure. They're cryptographically signed! There's a signature right there in the token! And yet, developers manage to completely neutralize that security on a daily basis through a handful of classic mistakes.

Let's go through the greatest hits of JWT failure — with code examples — so you can audit your own app before someone else does it for you.

---

## What a JWT Actually Is (Real Quick)

A JWT is three Base64-encoded chunks separated by dots:

```
header.payload.signature
```

The **header** says which algorithm was used. The **payload** holds your claims (user ID, roles, expiry). The **signature** is a cryptographic proof that nobody tampered with the first two parts.

The operative word there is *proof* — but only if you verify it correctly. And that's where things get spicy.

---

## The "alg: none" Attack (Yes, This Was Real)

The JWT spec originally allowed `"alg": "none"` — meaning no signature at all. Some early libraries would happily accept a token with no signature if the header said `alg: none`. An attacker could craft a token claiming to be an admin, strip the signature, set `alg: none`, and waltz right in.

Here's what that malicious token looks like when decoded:

```json
// Header (decoded)
{
  "alg": "none",
  "typ": "JWT"
}

// Payload (decoded) — attacker-crafted
{
  "sub": "1337",
  "role": "admin",
  "iat": 1716672000
}
// Signature: (empty string)
```

**The fix:** Explicitly specify which algorithms your server accepts. Never let the token itself dictate the algorithm.

```javascript
// ❌ Dangerous — accepts whatever algorithm the token claims
jwt.verify(token, secret);

// ✅ Safe — you decide the algorithm, not the client
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

This one-line change has saved countless apps from trivial admin bypasses. If your JWT library doesn't force you to specify the algorithm, treat that as a red flag.

---

## The RS256 vs HS256 Confusion Attack

This is the sneaky cousin of the `alg: none` attack, and it trips up even experienced developers.

Imagine your server uses RS256 (asymmetric — signed with a private key, verified with a public key). Your public key is... public. An attacker downloads it.

Now they forge a token, sign it with your **public key** using HS256 (symmetric — same key for signing and verifying), and submit it. If your server sees `alg: HS256` and naively uses the RSA public key as the HMAC secret, it verifies successfully. The attacker is in.

```javascript
// ❌ Wrong — accepts any algorithm the token claims, uses same key
const decoded = jwt.verify(token, publicKey);

// ✅ Correct — explicitly locks to RS256, rejects HS256 attempts
const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
```

The pattern is the same: **always hardcode the expected algorithm on the server side.** The token is untrusted input. Treat it accordingly.

---

## Storing JWTs in localStorage Is a Bad Time

This isn't a JWT flaw per se — it's a flaw in where developers stash their tokens. `localStorage` is accessible to any JavaScript running on your page. Every third-party analytics script, every npm package with a supply-chain compromise, every XSS vulnerability becomes a direct path to stealing your users' auth tokens.

```javascript
// ❌ XSS attack grabs this trivially
localStorage.setItem('token', jwt);

// ✅ HttpOnly cookies are inaccessible to JavaScript entirely
// Set this on the server response:
res.cookie('token', jwt, {
  httpOnly: true,   // JS cannot read this
  secure: true,     // HTTPS only
  sameSite: 'strict' // CSRF protection
});
```

HttpOnly cookies can't be read by JavaScript at all — not by your code, not by an attacker's injected script. Yes, you'll need to think about CSRF, but that's a much more manageable problem than having every XSS vulnerability become an instant account takeover.

---

## The Expiry Problem: Tokens That Live Forever

JWTs are stateless by design — the server doesn't remember them. That's a feature. It's also a footgun when developers skip setting an expiry, or set it to something absurd like "30 days" with no refresh token rotation.

If a token leaks (and at scale, tokens will leak), it's valid until expiry. There's no "log out all sessions" unless you maintain a server-side blocklist — which partially defeats the point of JWTs.

**Practical guidance:**
- Set short access token expiry: 15 minutes is common
- Use refresh tokens with rotation (each use issues a new one)
- Implement a blocklist for high-value scenarios like "log out everywhere" or password resets
- Always set `exp` and validate it

```javascript
// Signing with expiry
const token = jwt.sign(
  { sub: user.id, role: user.role },
  secret,
  { expiresIn: '15m', algorithm: 'HS256' }
);
```

A 15-minute window limits the blast radius of any token compromise dramatically.

---

## Quick Audit Checklist for Your App

Before you go, here's a fast sanity check:

- **Algorithm pinned on verify?** Specify `algorithms: ['HS256']` or `['RS256']` explicitly.
- **Tokens in HttpOnly cookies?** If not, understand and accept the XSS risk.
- **Expiry set and checked?** Every token should have an `exp` claim.
- **Secrets are actual secrets?** `secret123` is not a secret. Use a 256-bit random value.
- **HTTPS only?** Tokens over HTTP can be intercepted trivially.

---

## The Real Lesson

JWTs aren't broken — they're actually a solid mechanism when used correctly. The problem is the spec is permissive enough that it's easy to accidentally leave a gaping hole. The fix for almost every attack here is the same: be explicit, be opinionated, and never let untrusted input dictate how you verify trust.

Your auth layer is the front door. Spend the extra 20 minutes auditing it.

---

Found a JWT footgun in your own codebase? Come argue with me about refresh token strategies on [Twitter/X](https://x.com/kpanuragh) or [GitHub](https://github.com/kpanuragh). I promise I won't judge — I've shipped the same mistakes.
