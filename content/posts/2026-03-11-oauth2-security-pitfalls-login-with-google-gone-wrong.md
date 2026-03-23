---
title: "OAuth 2.0 Security Pitfalls: When 'Login with Google' Becomes 'Login as Anyone' 🔑💥"
date: "2026-03-11"
excerpt: "You added 'Login with Google' to your app and thought you were done with auth. Spoiler: you just opened 5 new attack vectors. Here's how OAuth 2.0 goes catastrophically wrong in production."
tags: ["\"security\"", "\"oauth\"", "\"authentication\"", "\"api\"", "\"backend\""]
featured: "true"
---

# OAuth 2.0 Security Pitfalls: When 'Login with Google' Becomes 'Login as Anyone' 🔑💥

**Hot take:** "Login with Google" is both the easiest AND the most dangerous thing you'll add to your app.

I've seen developers ship OAuth 2.0 integrations in an afternoon, feeling like security geniuses because they "didn't write their own auth system." Then I watched one of those same apps get completely owned because someone figured out how to swap an authorization code mid-flight and log in as any user they wanted. 😬

After implementing OAuth across multiple production APIs and getting properly humbled by security audits, I can tell you: OAuth 2.0 is brilliant — but it's a *protocol*, not a plug-and-play magic wand. Miss one parameter and you're handing attackers a master key. Let me walk you through the traps.

## The OAuth 2.0 Flow (What You THINK Happens) 🤔

Here's the simplified dance:

```
1. User clicks "Login with Google"
2. Your app redirects → Google login page
3. User approves → Google redirects back with a CODE
4. Your server trades the CODE for an ACCESS TOKEN
5. You use the token to get user info
6. User is logged in! 🎉
```

Looks simple, right? It is — which is exactly why the devil lives in the details.

## Pitfall #1: Missing the `state` Parameter (CSRF on OAuth) 🎣

This is the **most common** OAuth mistake I've seen in the wild, including in apps that had thousands of users.

**The vulnerable flow:**

```javascript
// Bad: No state parameter
app.get('/auth/google', (req, res) => {
  const authUrl = `https://accounts.google.com/o/oauth2/auth
    ?client_id=${CLIENT_ID}
    &redirect_uri=${REDIRECT_URI}
    &response_type=code
    &scope=email profile`;

  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  // Just trust the code... 🚩🚩🚩
  const tokens = await exchangeCodeForTokens(code);
  const user = await getUserInfo(tokens.access_token);
  req.session.userId = user.id;
  res.redirect('/dashboard');
});
```

**The attack (CSRF Login Hijacking):**

```
1. Attacker starts OAuth flow on your app
2. Gets their own Google authorization URL
3. STOPS before clicking "Allow" on Google
4. Tricks VICTIM into visiting that URL (via email, img tag, etc.)
5. Victim's browser completes the flow
6. Victim is now logged into YOUR APP as the ATTACKER
7. Attacker can now use "Forgot Password" to take over victim's email
8. Game over. 💀
```

**The fix — always use `state`:**

```javascript
const crypto = require('crypto');

app.get('/auth/google', (req, res) => {
  // Generate a cryptographically random state token
  const state = crypto.randomBytes(32).toString('hex');

  // Store it in the session
  req.session.oauthState = state;

  const authUrl = `https://accounts.google.com/o/oauth2/auth
    ?client_id=${CLIENT_ID}
    &redirect_uri=${REDIRECT_URI}
    &response_type=code
    &scope=email profile
    &state=${state}`;   // 👈 Include state!

  res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;

  // VERIFY state matches what we stored! 👇
  if (!state || state !== req.session.oauthState) {
    return res.status(403).send('Invalid state parameter. Possible CSRF attack!');
  }

  // Clear the state so it can't be reused
  delete req.session.oauthState;

  const tokens = await exchangeCodeForTokens(code);
  // ... rest of flow
});
```

**The `state` parameter is not optional.** It's in the spec for a reason. Skip it and you hand attackers a login-as-anyone button. 🚫

## Pitfall #2: Open Redirect in `redirect_uri` 🔀

OAuth requires you to register your redirect URIs with the provider. But developers often get lazy with validation.

**The overly permissive setup (BAD):**

```
# Registered with Google (too broad!):
https://myapp.com/*

# This allows:
https://myapp.com/dashboard         ✅ Intended
https://myapp.com/evil-page         ✅ Also allowed 😱
https://myapp.com%2f@evil.com/steal ✅ URL encoding tricks! 💀
```

**The attack:**

```
1. Attacker crafts:
   https://accounts.google.com/o/oauth2/auth
     ?redirect_uri=https://myapp.com/../../evil.com/steal
     &client_id=YOUR_CLIENT_ID
     ...

2. User logs in (trusts Google's interface)
3. Google redirects to the tampered URI
4. Authorization CODE lands on attacker's server
5. Attacker exchanges code for token
6. Attacker owns the account 🎯
```

**The fix — use exact URI matching:**

```javascript
// Always register EXACT redirect URIs, never wildcards!
// In Google Cloud Console:
// ✅ https://myapp.com/auth/google/callback
// ❌ https://myapp.com/*

// Server-side validation too (defense in depth):
const ALLOWED_REDIRECT_URIS = [
  'https://myapp.com/auth/google/callback',
];

app.get('/auth/callback', (req, res) => {
  const redirectUri = req.query.redirect_uri;

  if (redirectUri && !ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
    return res.status(400).send('Invalid redirect URI');
  }
  // ... continue
});
```

Register exact URIs. Multiple if needed for dev/staging/prod environments. Never wildcards. Never. 🚫

## Pitfall #3: Authorization Code Interception (PKCE for Public Clients) 🕵️

Authorization codes are single-use and short-lived — but they travel through the browser (URL bar, referrer headers, logs). In mobile/SPA apps without a backend secret, this is a big deal.

**The problem for SPAs and mobile apps:**

```javascript
// SPA: You can't securely store a client_secret here!
// Anyone can open DevTools and steal it.
// So you might think: "I'll just use Implicit Flow!"
// This is the WRONG answer. Implicit flow is deprecated!

// Old (BAD) implicit flow:
const authUrl = `https://provider.com/auth
  ?response_type=token  // Returns token directly in URL 😱
  &client_id=${CLIENT_ID}
  ...`;
// Token is now in browser history, server logs, referrer headers
```

**The modern fix — PKCE (Proof Key for Code Exchange):**

```javascript
// PKCE adds a one-time secret that proves YOU started the flow
const crypto = require('crypto');

function generatePKCE() {
  // Step 1: Generate random code_verifier (secret)
  const codeVerifier = crypto.randomBytes(32)
    .toString('base64url');

  // Step 2: Hash it to create code_challenge (public)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

// Start the flow
const { codeVerifier, codeChallenge } = generatePKCE();
sessionStorage.setItem('pkce_verifier', codeVerifier);  // Keep secret local

const authUrl = `https://provider.com/auth
  ?response_type=code
  &code_challenge=${codeChallenge}
  &code_challenge_method=S256  // SHA-256 hash
  &client_id=${CLIENT_ID}
  ...`;

// Exchange the code (must provide the original verifier!)
const response = await fetch('https://provider.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authorizationCode,
    code_verifier: sessionStorage.getItem('pkce_verifier'),  // 👈 Proves it's you!
    client_id: CLIENT_ID,
  })
});
// If attacker intercepted your code, they don't have code_verifier → request fails ✅
```

PKCE makes intercepted codes useless. Use it for every public client (SPAs, mobile apps). Most providers support it. Many now require it! 🛡️

## Pitfall #4: Not Validating the ID Token (JWT Claims) 🪪

When using OpenID Connect (OAuth + identity), you get back an ID token (a JWT). Many developers just... decode it and trust it. Wrong move.

```javascript
// BAD: Just decoding without verification
const payload = JSON.parse(
  Buffer.from(idToken.split('.')[1], 'base64').toString()
);
// Attacker can forge any payload they want!
// userId: 'admin', email: 'ceo@company.com' 🎭

// GOOD: Verify signature AND claims
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(CLIENT_ID);

async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: CLIENT_ID,  // Must match YOUR app's client ID
  });

  const payload = ticket.getPayload();

  // These checks happen automatically via the library,
  // but know what's being verified:
  // ✅ Signature (cryptographically signed by Google)
  // ✅ iss (issuer must be accounts.google.com)
  // ✅ aud (audience must be YOUR client_id)
  // ✅ exp (token must not be expired)
  // ✅ iat (issued-at must be recent)

  return payload;  // Now safe to use! 🎉
}
```

**Never trust an ID token you haven't verified.** Always use a library designed for this. Never decode-and-trust. 🔒

## The OAuth 2.0 Security Checklist ✅

Before going live with any OAuth integration:

- [ ] `state` parameter generated, stored in session, verified on callback
- [ ] Redirect URIs registered as exact matches (no wildcards)
- [ ] Server-side redirect URI validation as defense-in-depth
- [ ] PKCE implemented for SPAs and mobile apps
- [ ] ID tokens verified cryptographically (not just decoded)
- [ ] Authorization codes single-use, short TTL (check provider defaults)
- [ ] Access tokens stored securely (httpOnly cookies, not localStorage)
- [ ] Refresh tokens rotated on use (RFC 6749 §10.4)
- [ ] Scopes requested are minimal (only what you actually need!)
- [ ] No Implicit Flow (deprecated — use Authorization Code + PKCE)

## The Bottom Line 🎯

OAuth 2.0 is one of the most elegant security protocols ever designed — and one of the most misimplemented. The protocol is solid; the footguns come from skipping the "boring" parameters like `state`, from being too permissive with redirect URIs, and from trusting tokens without verifying them.

The golden rule: **treat every parameter in the OAuth flow as security-critical.** That random-looking `state` string? It's your CSRF defense. That exact redirect URI? It's the guardrail preventing code theft.

Don't let "Login with Google" become "Login as Anyone." Your users trusted you with their accounts. Return the favor. 🔐

---

**Building OAuth integrations?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love talking auth security and will absolutely nerd out with you.

**Want to see secure auth implementations?** Check out my [GitHub](https://github.com/kpanuragh) for real production patterns.

*P.S. — If you just checked your OAuth callback handler and realized you're not validating `state`, stop reading and go fix it. Seriously. I'll be here when you get back.* 🛡️

*P.P.S. — "We'll add PKCE later" is how you explain a breach to your users. Later is now.* 😅
