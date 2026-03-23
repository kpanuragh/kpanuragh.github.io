---
title: "OAuth 2.0 Security Mistakes That'll Make You Cringe 😬🔑"
date: "2026-02-24"
excerpt: "OAuth 2.0 is supposed to make authentication safer and easier. So why do so many developers implement it in ways that hand hackers the keys to the kingdom? Let's tour the most cringe-worthy OAuth mistakes — and how to fix them."
tags: ["\"security\"", "\"oauth\"", "\"authentication\"", "\"api-security\""]
featured: "true"
---

# OAuth 2.0 Security Mistakes That'll Make You Cringe 😬🔑

**Hot take:** OAuth 2.0 is one of the most widely used — and most widely misunderstood — security protocols on the internet.

Every major platform runs on it. Google Sign-In? OAuth. "Login with GitHub"? OAuth. That Slack integration your team uses to route alerts? Yep, OAuth.

And yet, developers make the **same preventable mistakes** over and over again. Mistakes that turn your nice, secure "Sign in with Google" button into a front door with no lock. 🚪💨

I've reviewed a lot of codebases. I've seen OAuth implementations that made me want to close my laptop and become a shepherd. Let me save you from that fate.

## The Quick OAuth Refresher (For The People In The Back) 🎙️

Before we roast bad implementations, here's what a correct Authorization Code flow looks like:

```
User clicks "Login with Google"
    ↓
Your app redirects to Google's auth server
    ↓
User authenticates + approves scopes
    ↓
Google redirects BACK to your app with a short-lived `code`
    ↓
Your BACKEND exchanges `code` for an access token (never the browser!)
    ↓
You use the token to call Google's API
```

Sounds simple. Turns out there are about 11 places to screw this up. Let's hit the greatest hits. 🎵

## Mistake #1: Skipping the `state` Parameter (CSRF Bait) 🎣

**What most tutorials show:**

```javascript
// "Login with GitHub" — the naive version
app.get('/auth/github', (req, res) => {
  const authUrl = `https://github.com/login/oauth/authorize
    ?client_id=${CLIENT_ID}
    &redirect_uri=${REDIRECT_URI}
    &scope=read:user`;

  res.redirect(authUrl);
});
```

**The problem:** No `state` parameter. This opens you to a **CSRF attack** where an attacker tricks your user into completing an OAuth flow that was *initiated by the attacker*. The result? The attacker's GitHub account gets linked to your user's account. Your user is now locked out. Attacker is in. 🎩

**The fix — generate and verify a `state` value:**

```javascript
const crypto = require('crypto');

app.get('/auth/github', (req, res) => {
  // Generate a random, unguessable state value
  const state = crypto.randomBytes(16).toString('hex');

  // Store it in the session BEFORE redirecting
  req.session.oauthState = state;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', 'read:user');
  authUrl.searchParams.set('state', state);  // ✅ CSRF protection

  res.redirect(authUrl.toString());
});

app.get('/auth/callback', (req, res) => {
  const { code, state } = req.query;

  // ✅ Verify state matches what we stored
  if (!state || state !== req.session.oauthState) {
    return res.status(403).send('Invalid state parameter. Possible CSRF attack!');
  }

  // Clear state from session after use
  delete req.session.oauthState;

  // Now safely exchange the code for a token...
});
```

**Rule:** If your OAuth flow doesn't have `state`, you don't have OAuth — you have a CSRF vulnerability with a login button painted on top. 🎨

## Mistake #2: Doing the Token Exchange in the Browser 😱

**The crime scene:**

```javascript
// This is in your FRONTEND JavaScript. Dear reader, I am so sorry.
const params = new URLSearchParams(window.location.search);
const code = params.get('code');

// Exchanging code for token IN THE BROWSER 💀
fetch('https://github.com/login/oauth/access_token', {
  method: 'POST',
  body: JSON.stringify({
    client_id: 'abc123',
    client_secret: 'my_secret_is_now_public',  // 😬
    code: code
  })
})
```

**The problem:** Your `client_secret` is now visible to anyone who opens DevTools. The entire point of the client secret is that *only your server knows it*. Once it's in browser JavaScript, it's public. Game over. An attacker can now impersonate your application entirely. 🎭

**The fix:** The code exchange happens **server-side only**. Always.

```javascript
// ✅ BACKEND route — the client_secret never leaves the server
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  // ... validate state first (see Mistake #1) ...

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,  // ✅ Server-side env var
      code: code
    })
  });

  const { access_token } = await tokenResponse.json();

  // Store token server-side, give user a session cookie — never expose raw token
  req.session.accessToken = access_token;
  res.redirect('/dashboard');
});
```

**The golden rule:** `client_secret` lives in environment variables on your server. Full stop. No exceptions. Not even "just for testing." 🔒

## Mistake #3: Open Redirect in the `redirect_uri` 🔀

**The sneaky attack:**

```
https://yourapp.com/auth?redirect_uri=https://evil.com/steal-my-token
```

If your authorization server doesn't strictly validate the `redirect_uri` against a registered allowlist, an attacker can intercept the authorization `code` by pointing the redirect at their own server.

**How it should look in your OAuth provider settings:**

```
# Exact, registered redirect URIs (not wildcards!)
Allowed redirect URIs:
  ✅ https://yourapp.com/auth/callback
  ❌ https://yourapp.com/*
  ❌ https://*.yourapp.com/callback
  ❌ http://yourapp.com/auth/callback  (HTTP, not HTTPS)
```

**And in your code — validate it server-side too:**

```javascript
const ALLOWED_REDIRECT_URIS = new Set([
  'https://yourapp.com/auth/callback',
  'https://yourapp.com/auth/callback/mobile'  // If you have multiple clients
]);

app.get('/auth/start', (req, res) => {
  const redirect = req.query.redirect_uri || 'https://yourapp.com/auth/callback';

  if (!ALLOWED_REDIRECT_URIS.has(redirect)) {
    return res.status(400).send('Invalid redirect URI');
  }

  // ... proceed with auth flow
});
```

**Remember:** The spec requires exact URI matching. Any flexibility you add is a vulnerability you're adding. 🎯

## Mistake #4: Using the Implicit Flow (It's Deprecated For Good Reason) 🪦

You might see old tutorials using `response_type=token`. This is the **Implicit Flow**, and it was officially deprecated in RFC 9700 because it returns the access token directly in the URL fragment.

**The dangers:**
- Access token leaks via browser history
- Access token leaks via HTTP `Referer` headers
- No way to verify the token wasn't tampered with
- Zero protection against token injection attacks

**What to use instead:**

```
# Instead of:
response_type=token  ❌ (Implicit — deprecated)

# Use:
response_type=code   ✅ (Authorization Code)

# And for public clients (mobile, SPA):
response_type=code + PKCE  ✅✅ (Authorization Code with PKCE)
```

**For SPAs and mobile apps — use PKCE:**

```javascript
// PKCE (Proof Key for Code Exchange) — the modern way for public clients

function generatePKCE() {
  // 1. Generate a random code_verifier
  const verifier = crypto.randomBytes(32).toString('base64url');

  // 2. Hash it to create code_challenge
  const challenge = crypto.createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

const { verifier, challenge } = generatePKCE();
sessionStorage.setItem('pkce_verifier', verifier);  // Store verifier

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
// ... other params

// On callback, include verifier in token exchange:
// code_verifier = sessionStorage.getItem('pkce_verifier')
```

**Why PKCE works:** Even if an attacker intercepts the `code`, they can't exchange it without the `code_verifier` — which never left the client. 🔐

## Mistake #5: Storing Tokens in `localStorage` 🗄️❌

This one is so common it's practically a tradition.

```javascript
// The localStorage Hall of Shame
localStorage.setItem('access_token', token);  // ❌ XSS will steal this
localStorage.setItem('refresh_token', token); // ❌ Even worse!
```

**The problem:** Any JavaScript on your page — including third-party scripts, browser extensions, and XSS payloads — can read `localStorage`. Tokens stored there are one `document.cookie` alternative-style XSS away from being stolen.

**Better options:**

| Storage | XSS Safe | CSRF Safe | Use For |
|---------|----------|-----------|---------|
| `localStorage` | ❌ No | ✅ Yes | Nothing sensitive |
| `sessionStorage` | ❌ No | ✅ Yes | Short-lived, low-risk |
| `HttpOnly` Cookie | ✅ Yes | ❌ No (use SameSite) | Auth tokens ✅ |
| `HttpOnly + SameSite=Strict` | ✅ Yes | ✅ Yes | Best option |

```javascript
// ✅ Store token in HttpOnly cookie (server-side)
res.cookie('access_token', token, {
  httpOnly: true,     // JS cannot read this
  secure: true,       // HTTPS only
  sameSite: 'strict', // No cross-site sending
  maxAge: 3600000     // 1 hour
});
```

**The tradeoff:** HttpOnly cookies require CSRF protection (use `SameSite` + a CSRF token). But that's a much better problem to have than "attacker has all my users' tokens." 🛡️

## The OAuth Security Checklist You Actually Need ✅

Before shipping that "Login with GitHub" button:

```
□ state parameter generated (random, cryptographically secure)
□ state verified on callback (reject if missing or mismatched)
□ redirect_uri validated against explicit allowlist
□ code exchange happens SERVER-SIDE only
□ client_secret is in env vars, never in frontend code
□ Using Authorization Code flow (not Implicit)
□ PKCE enabled for SPAs and mobile apps
□ Access tokens NOT stored in localStorage
□ Tokens in HttpOnly, Secure, SameSite cookies
□ Scopes are minimal (only request what you need!)
□ Token expiration is enforced (short-lived access tokens)
□ Refresh tokens are rotated on use
```

If you check all of these, you're doing better than 80% of OAuth implementations in the wild. That's not me being hyperbolic — that's the result of actual audits. 😬

## The Bottom Line 💡

OAuth 2.0 is not magic. It's a protocol with sharp edges, and the spec is long for a reason. The good news is the attack surface is well-understood and the fixes are not complicated — they just require you to actually read the spec (or at least this blog post).

**The three things that'll save you 90% of the pain:**
1. Always use and verify the `state` parameter
2. Never touch `client_secret` in the browser
3. Use Authorization Code + PKCE and HttpOnly cookies

OAuth done right is genuinely great. OAuth done wrong is a phishing-as-a-service platform you accidentally built yourself. 🙃

---

**Found an OAuth horror story in your own codebase?** Come commiserate on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've heard them all and I will judge you zero percent.

**Want to see these patterns in real code?** Check out [GitHub](https://github.com/kpanuragh) for working OAuth examples with PKCE and proper state handling.

*Now go lock down those OAuth flows — your users' accounts are counting on you!* 🔑🔒✨

---

**P.S.** If you're using a library like Passport.js, NextAuth, or Laravel Socialite — read the docs for the `state` parameter. Most libraries support it but don't enable it by default. Classic. 🙄
