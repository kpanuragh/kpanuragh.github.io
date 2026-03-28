---
title: "OAuth 2.0 Security Pitfalls: The Auth Protocol Everyone Uses Wrong 🔓"
date: "2026-03-28"
excerpt: "OAuth 2.0 powers 'Login with Google' on half the internet — and half the internet is implementing it wrong. Here are the most dangerous OAuth mistakes developers make and how to fix them."
tags: ["cybersecurity", "oauth", "web-security", "authentication", "api-security"]
featured: true
---

# OAuth 2.0 Security Pitfalls: The Auth Protocol Everyone Uses Wrong 🔓

You clicked "Add Login with Google" to your app, copied a StackOverflow snippet, tested it once, and shipped it. Relatable? Same. 😅

OAuth 2.0 is the backbone of modern authentication — powering "Sign in with Google/GitHub/Discord" across millions of apps. But it's also one of the most dangerously misunderstood protocols developers interact with every day.

The good news: the mistakes are predictable. The bad news: they're also in your code right now.

Let's fix that.

## Mistake #1: Skipping the `state` Parameter (CSRF on Your Auth Flow) 🎭

This is the classic "I'll add that later" mistake that never gets added.

**The Attack:**
1. Attacker crafts a malicious OAuth link pointing to YOUR app but using THEIR authorization code
2. Tricks your user into clicking it
3. Your app happily exchanges the attacker's code for a token
4. The user's account is now linked to the attacker's identity

**The Vulnerable Flow:**
```javascript
// ❌ Missing state - your app is CSRF-able
app.get('/auth/google', (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/auth
    ?client_id=${CLIENT_ID}
    &redirect_uri=${REDIRECT_URI}
    &response_type=code
    &scope=email profile`;

  res.redirect(authUrl);
});
```

**The Fix — Generate and Verify `state`:**
```javascript
const crypto = require('crypto');

// ✅ Generate a random state, store in session, verify on callback
app.get('/auth/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state; // Store it!

  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'email profile');
  authUrl.searchParams.set('state', state); // Include it!

  res.redirect(authUrl.toString());
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state BEFORE doing anything else
  if (!state || state !== req.session.oauthState) {
    return res.status(403).send('State mismatch. Possible CSRF attack!');
  }
  delete req.session.oauthState; // Use it once, then discard

  // Now safely exchange the code for tokens...
  const tokens = await exchangeCodeForTokens(code);
  // ...
});
```

**Rule of thumb:** No `state` = no protection against CSRF. Always generate it, always verify it.

## Mistake #2: Trusting the `redirect_uri` Too Loosely 🎯

OAuth providers let you whitelist redirect URIs. Some developers... get creative with that whitelist.

**Common misconfigurations that get you pwned:**

| Configuration | Problem |
|---|---|
| `https://myapp.com/*` | Wildcard matches `https://myapp.com/../../evil` |
| `https://myapp.com` | Some providers allow subpath bypasses |
| No validation at all | Attacker redirects tokens to their own server |

**The attack is clean:**
```
https://accounts.google.com/oauth2/auth
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://evil.com/steal-tokens
  &response_type=token
  &scope=email
```

If your provider accepts this (it shouldn't, but misconfigured ones do), your user's access token just went to `evil.com`.

**Fix: Register exact URIs, not patterns**

In your OAuth provider's console:
```
# ✅ Register exact URLs only
https://myapp.com/auth/callback
https://staging.myapp.com/auth/callback

# ❌ Never register wildcards
https://myapp.com/*
https://*.myapp.com/callback
```

And on your server, double-validate:
```javascript
const ALLOWED_REDIRECT_URIS = new Set([
  'https://myapp.com/auth/callback',
  'https://staging.myapp.com/auth/callback',
]);

app.get('/auth/google/callback', (req, res) => {
  const redirectUri = req.query.redirect_uri || process.env.REDIRECT_URI;

  if (!ALLOWED_REDIRECT_URIS.has(redirectUri)) {
    return res.status(400).send('Invalid redirect URI');
  }
  // ...
});
```

## Mistake #3: Storing Access Tokens Like They're Pokémon Cards 🃏

Developers love to collect tokens. In localStorage. In cookies with no flags. In URLs. In logs. In Slack messages. The horror.

**The Hall of Shame:**
```javascript
// ❌ LocalStorage - accessible to any JavaScript on the page (XSS = game over)
localStorage.setItem('access_token', token);

// ❌ URL fragments - end up in browser history, server logs, referrer headers
res.redirect(`/dashboard?token=${accessToken}`);

// ❌ console.log in production - ends up in your monitoring tool
console.log('User authenticated, token:', accessToken);
```

**The Right Way — HttpOnly Cookies:**
```javascript
// ✅ HttpOnly + Secure + SameSite cookies
app.get('/auth/callback', async (req, res) => {
  const tokens = await exchangeCodeForTokens(req.query.code);

  // Store the refresh token server-side (in your DB), not in the browser
  await db.storeRefreshToken(userId, encrypt(tokens.refresh_token));

  // Only send the short-lived access token in a secure cookie
  res.cookie('session', tokens.access_token, {
    httpOnly: true,   // JavaScript cannot read this
    secure: true,     // HTTPS only
    sameSite: 'lax',  // CSRF protection
    maxAge: 3600000,  // 1 hour - matches token expiry
    path: '/',
  });

  res.redirect('/dashboard');
});
```

**The golden rule:** Refresh tokens belong in your database (encrypted). Access tokens belong in HttpOnly cookies. Neither belongs in localStorage.

## Mistake #4: Not Validating the ID Token Properly 🪪

When using OpenID Connect (OAuth's auth layer), you get an `id_token` — a JWT proving the user's identity. Skipping validation is like accepting any ID card without checking if it's real.

**What you MUST verify:**

```javascript
const jose = require('jose'); // Use a proper library, not manual JWT parsing!

async function validateIdToken(idToken, expectedClientId) {
  // Fetch Google's public keys (cache these!)
  const JWKS = jose.createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs')
  );

  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: 'https://accounts.google.com',  // ✅ Verify issuer
    audience: expectedClientId,              // ✅ Verify YOUR client ID
  });

  // ✅ Check expiry (jose handles this, but be explicit)
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  // ✅ Verify the email is confirmed (for Google)
  if (!payload.email_verified) {
    throw new Error('Email not verified by provider');
  }

  return payload;
}
```

**Never do this:**
```javascript
// ❌ Just decoding without verifying - anyone can forge this!
const decoded = Buffer.from(idToken.split('.')[1], 'base64').toString();
const { email } = JSON.parse(decoded);
// "Great, the user is elon@tesla.com!" — said no verified user ever
```

## The OAuth Security Checklist 🛡️

Before you deploy that social login button:

- [ ] `state` parameter generated (cryptographically random) and verified on callback
- [ ] Redirect URIs registered as exact matches — no wildcards
- [ ] Access tokens in HttpOnly cookies, NOT localStorage
- [ ] Refresh tokens encrypted and stored server-side
- [ ] ID tokens verified with provider's public keys (use a library!)
- [ ] Token expiry is checked and respected
- [ ] Using PKCE for public clients (mobile apps, SPAs)
- [ ] No tokens in URL parameters, logs, or error messages
- [ ] HTTPS-only (tokens in plaintext = free tokens for attackers)
- [ ] Revoke tokens on logout — don't just delete the cookie

## Quick PKCE Reference (For SPAs and Mobile Apps) 📱

If you're building a single-page app or mobile app, use PKCE (Proof Key for Code Exchange). It prevents authorization code interception attacks where there's no secure place to store a client secret:

```javascript
// Generate a code verifier and challenge
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Store verifier, send challenge in auth request
sessionStorage.setItem('pkce_verifier', codeVerifier);

const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
// ... rest of params
```

No client secret needed — the math does the work.

## The Bottom Line

OAuth 2.0 is powerful, but it's a protocol with a lot of moving parts. The security model only works when **every step is done correctly**. Miss one check, and attackers have a path in.

Use a battle-tested library (`passport.js`, `next-auth`, `authlib`) rather than rolling your own implementation. These libraries handle the edge cases you'll inevitably forget.

And please — stop putting tokens in localStorage. Your future self, your users, and your security team will thank you. 🙏

---

**Securing auth flows?** Let's talk on [LinkedIn](https://www.linkedin.com/in/anuraghkp)! I'm active in the **YAS** and **InitCrew** communities and always down to nerd out about security.

**Want more?** Check out my posts on [JWT Security Mistakes](/posts/2026-01-21-jwt-security-mistakes), [Session Hijacking](/posts/2026-01-21-session-hijacking-the-silent-account-takeover), and [Two-Factor Authentication](/posts/2026-01-28-two-factor-authentication-why-passwords-suck)!

*Now go audit your OAuth flows. I'll wait.* 🔐✨
