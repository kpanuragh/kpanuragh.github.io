---
title: "🔐 JWT Security: Stop Trusting Tokens Like They're Signed by God"
date: 2026-05-04
excerpt: "JWTs are everywhere — and so are the bugs. From the infamous 'alg: none' disaster to leaking secrets in browser storage, here's how developers routinely shoot themselves in the foot with JSON Web Tokens and how to stop."
tags: ["security", "jwt", "authentication", "api", "cybersecurity"]
featured: true
---

JSON Web Tokens. The three letters that appear in every auth tutorial, every "build a REST API" YouTube video, and apparently every security incident post-mortem from the last decade.

JWTs are *brilliantly* simple: encode some claims, sign them, hand them to the client. No server-side session storage. Stateless. Scalable. Elegant.

They're also a footgun of spectacular proportions if you don't know what you're doing.

Let's talk about how developers (lovingly, including past-me) get JWT security catastrophically wrong — and how to fix it before your app ends up on HaveIBeenPwned.

## What Even Is a JWT?

A JWT looks like this: three Base64url-encoded chunks glued together with dots.

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3MTY0MDAwMDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

Decode the middle chunk (the payload) and you get something like:

```json
{
  "sub": "1234567890",
  "name": "John Doe",
  "role": "user",
  "iat": 1716400000
}
```

The server signs this with a secret (HMAC) or a private key (RSA/ECDSA). The client sends it back on every request. The server verifies the signature and trusts the claims. Simple, right?

Right. Until it isn't.

## Disaster #1: The `alg: none` Attack

This one is legendary. Like, "gets its own Wikipedia mention" legendary.

Early JWT libraries had a quirk: the algorithm used to verify the signature was read from... the token itself. So an attacker could craft a token, set `"alg": "none"` in the header, strip the signature, and some libraries would happily accept it as valid. No secret needed. You could just *tell the server* "trust me bro, no signature required."

The fix is brutally simple — **always explicitly specify which algorithms you accept**:

```javascript
import jwt from 'jsonwebtoken';

// WRONG: letting the token dictate the algorithm
const payload = jwt.verify(token, secret);

// RIGHT: lock it down
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
```

Never let the token tell you how to verify itself. That's like letting someone mark their own homework and then trusting the grade.

## Disaster #2: Weak or Leaked Secrets

Your HMAC secret is the entire foundation of trust in your JWT setup. If someone gets it, they can mint valid tokens for any user, any role, any claim they want.

Common mistakes developers make with secrets:

- Using `"secret"` as the secret (yes, really, people do this)
- Hardcoding the secret in source code that gets pushed to a public GitHub repo
- Using a short secret that can be brute-forced offline
- Reusing the same secret across dev, staging, and production

For HMAC-SHA256, use a secret that's **at least 256 bits (32 bytes)** of cryptographically random data. Generate it properly:

```bash
# Generate a secure secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Then put it in an environment variable — never in your code. And rotate it if you ever suspect it's been leaked. Yes, that means all existing tokens become invalid. That's the point.

## Disaster #3: Storing JWTs in localStorage

This one sparks passionate debate in developer circles, usually between people who understand XSS and people who have never dealt with an XSS incident.

`localStorage` is accessible to any JavaScript running on your page. **Any JavaScript.** Including that sketchy third-party analytics script, any injected ad code, and of course any XSS payload an attacker manages to slip in.

If your JWT is in `localStorage`, a single XSS vulnerability lets an attacker steal every user's token and silently impersonate them — from anywhere, at any time, until the token expires.

The safer alternative: store JWTs in **HttpOnly cookies**. These cookies are invisible to JavaScript — they're only sent by the browser on HTTP requests. An XSS attacker can't read them.

```javascript
// Set the token as an HttpOnly, Secure, SameSite cookie
res.cookie('token', jwtToken, {
  httpOnly: true,       // no JS access
  secure: true,         // HTTPS only
  sameSite: 'strict',   // CSRF protection
  maxAge: 15 * 60 * 1000  // 15 minutes
});
```

Yes, this introduces CSRF considerations (which `SameSite: strict` helps with). Security is always tradeoffs — but "anyone with XSS can steal all tokens forever" is a worse tradeoff than "I need to think about CSRF."

## Disaster #4: Tokens That Never Die

JWTs are stateless by design — the server doesn't track them. This is great for scalability. It's terrible for revocation.

If a user logs out, changes their password, or gets their account compromised, the token is still valid until it expires. If you set expiry to 7 days (common in tutorials), you've got a 7-day window where stolen tokens remain usable.

The pragmatic fix: **use short-lived access tokens** (15 minutes is a sweet spot) paired with **refresh tokens** stored securely. When the access token expires, the client silently exchanges the refresh token for a new one. This keeps the UX smooth while limiting the blast radius if an access token is stolen.

For immediate revocation (think: "user reported account compromise"), maintain a server-side denylist of revoked token IDs (`jti` claim). It's a small cache lookup and worth it for sensitive actions.

## The TL;DR Checklist

Before you ship that auth flow, run through this:

- [ ] Algorithm explicitly whitelisted — no `alg: none` possible
- [ ] Secret is 256+ bits, random, stored in env vars, not in git
- [ ] Tokens stored in HttpOnly cookies, not localStorage
- [ ] Access tokens expire in 15-30 minutes max
- [ ] Sensitive operations check token freshness, not just validity
- [ ] You've tested your JWT library for known CVEs recently

JWTs aren't inherently insecure — they're a tool, and like any tool, they'll hurt you if you use them wrong. The good news is that getting them right isn't rocket science. It's mostly just "don't do the obviously dangerous thing that every tutorial glosses over."

---

Found a JWT footgun in your own codebase? Fixed an auth vulnerability that made you lose sleep? I'd love to hear the war story. Drop me a line on [GitHub](https://github.com/kpanuragh) or connect with me on [LinkedIn](https://linkedin.com/in/kpanuragh) — the security horror stories are always the best ones.

Stay paranoid out there. In the good way.
