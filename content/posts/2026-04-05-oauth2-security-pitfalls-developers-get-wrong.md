---
title: "OAuth 2.0 Security: The \"Sign in with Google\" Mistakes That Will Haunt You 👻🔑"
date: "2026-04-05"
excerpt: "You added 'Sign in with Google' in 10 minutes and felt like a genius. But did you validate the state parameter? Check the token audience? Secure your redirect URIs? Didn't think so. Let's fix that."
tags: ["cybersecurity", "oauth2", "security", "web-security", "authentication"]
featured: true
---

# OAuth 2.0 Security: The "Sign in with Google" Mistakes That Will Haunt You 👻🔑

Adding "Sign in with Google" or "Login with GitHub" feels like cheating in the best way — you skip building auth, users are happy, and you pat yourself on the back.

Then six months later, someone chains together three of your misconfigurations and logs into every account on your platform.

OAuth 2.0 is brilliant. But it's also a minefield of subtle security mistakes that are incredibly easy to make and incredibly painful to discover. Let's walk through the big ones before an attacker does it for you.

## The OAuth 2.0 Flow (Real Quick) ⚡

Here's what happens when a user clicks "Sign in with GitHub":

1. Your app redirects them to GitHub with a `client_id`, `scope`, and a `redirect_uri`
2. GitHub asks "Do you trust this app?" — user clicks yes
3. GitHub redirects back to your app with a temporary **authorization code**
4. Your backend exchanges that code for an **access token**
5. You use the access token to fetch the user's profile

Simple, right? The devil is in every single one of those steps. Let's destroy them.

---

## Mistake #1: Skipping the `state` Parameter (CSRF Central) 🎯

The `state` parameter is OAuth's CSRF protection. It's a random value you generate, send with the auth request, and verify when the callback returns.

Most tutorials don't mention it. Most developers skip it.

**Here's the attack without `state`:**
An attacker initiates an OAuth flow with *their own* GitHub account, gets the auth code, but instead of completing the flow on *their* machine — they trick *you* into visiting the callback URL with their code. Now your account is linked to their GitHub. Account takeover, zero phishing required.

**The fix:**

```python
import secrets
import hashlib

# When starting the OAuth flow
state = secrets.token_urlsafe(32)
session['oauth_state'] = state

auth_url = f"https://github.com/login/oauth/authorize" \
           f"?client_id={CLIENT_ID}" \
           f"&redirect_uri={REDIRECT_URI}" \
           f"&state={state}" \
           f"&scope=read:user"

# In your callback handler
def oauth_callback():
    returned_state = request.args.get('state')
    expected_state = session.pop('oauth_state', None)

    if not expected_state or not secrets.compare_digest(returned_state, expected_state):
        abort(400, "State mismatch — possible CSRF attack")

    # Now it's safe to continue
```

Use `secrets.compare_digest()` (or your language's equivalent) to prevent timing attacks. Yes, even for this.

---

## Mistake #2: Open Redirect URIs (The Welcome Mat for Attackers) 🚪

Your OAuth provider only sends the auth code to URIs you've whitelisted. Right?

Right... unless your whitelist is garbage.

**Common bad patterns:**
- `https://yourapp.com/*` — wildcard allows `https://yourapp.com.evil.com`
- `https://yourapp.com/callback?next=https://evil.com` — open redirect chains
- Not registering URIs at all (some providers allow any redirect)

**The nastier attack:** Some providers do prefix matching instead of exact matching. If you register `https://yourapp.com/auth`, an attacker might use `https://yourapp.com/auth/../../../evil-path` and steal the code via a path traversal in the redirect.

**The fix:** Register exact redirect URIs — not wildcards, not patterns. One URI per environment. Be boring. Boring is secure.

---

## Mistake #3: Not Validating the Token Audience 🎪

This one hits hardest if you're using OpenID Connect (which most "Sign in with X" flows use under the hood). You get back a JWT ID token. You decode it, grab the email, and... just use it?

**The problem:** JWTs have an `aud` (audience) claim that says who the token is meant for. If you don't validate it, an attacker can take a valid JWT from a *different app* that uses the same provider and present it to *your* app.

```javascript
// ❌ Wrong - just decoding the token
const payload = jwt.decode(idToken); // decode, not verify!
const email = payload.email;
loginUser(email);

// ✅ Right - verifying signature AND claims
const payload = jwt.verify(idToken, publicKey, {
  algorithms: ['RS256'],
  audience: process.env.GOOGLE_CLIENT_ID,  // Must match YOUR client ID
  issuer: 'https://accounts.google.com',
});
const email = payload.email;
loginUser(email);
```

The `aud` claim should match your app's `client_id`. If it doesn't, reject the token. Someone is trying to replay a token from another app.

---

## Mistake #4: Storing Client Secrets in the Frontend (Yes, Really) 💀

This shouldn't need saying in 2026. And yet.

The OAuth `client_secret` is like your app's password. It must never touch the browser. Not in JavaScript, not in environment variables baked into a React build, not in a mobile app binary you think no one will decompile.

**The Authorization Code flow** — exchange happens server-side. Good.

**The Implicit flow** — no client secret, designed for frontends. Also **deprecated** because it returns tokens in URL fragments that end up in logs, referrer headers, and browser history.

**What to use for SPAs and mobile apps:** Authorization Code flow with **PKCE** (Proof Key for Code Exchange). It replaces the client secret with a cryptographic challenge that's generated fresh for each login attempt.

PKCE means even if someone intercepts your auth code, they can't exchange it for a token without the original code verifier. Use it. It's supported everywhere now.

---

## Mistake #5: Trusting the Email Without Verifying It's Verified ✉️

Some OAuth providers let users sign up with *unverified* email addresses. If you use the email from the OAuth profile as the primary identity key, an attacker can:

1. Create an OAuth account with `victim@company.com` (unverified)
2. Log into your app via OAuth
3. Get matched to the victim's existing account

**Always check the `email_verified` claim:**

```python
user_info = get_user_info(access_token)

if not user_info.get('email_verified'):
    return error("Email not verified. Please verify your email with the provider first.")

# Only now is it safe to use the email for account matching
```

GitHub, Google, and most major providers include this field. Check it.

---

## The Quick Security Checklist 📋

Before you ship that OAuth integration:

- [ ] Generating and validating a random `state` parameter
- [ ] Exact-match registered redirect URIs (no wildcards)
- [ ] Verifying token signature, `aud`, and `iss` claims
- [ ] Using Authorization Code + PKCE for frontends/mobile
- [ ] Client secret stored only on the server
- [ ] Checking `email_verified` before linking accounts
- [ ] Using short-lived access tokens and rotating refresh tokens
- [ ] Logging auth events for anomaly detection

OAuth done right is genuinely secure. OAuth done carelessly is a skeleton key to your users' accounts.

---

## Wrapping Up 🎁

OAuth 2.0 is not a "set and forget" feature — it's a protocol with sharp edges that reward careful implementation. The good news is that every mistake here has a clean fix, and none of them require exotic security knowledge. Just reading the spec (or, y'know, this post) puts you miles ahead.

Ship the social login. Just do it properly.

---

*Found a security bug in your OAuth flow? I'd love to hear the war story — find me on [GitHub](https://github.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). And if this saved your app from a breach, share it with a dev who's about to implement OAuth for the first time.* 🙏
