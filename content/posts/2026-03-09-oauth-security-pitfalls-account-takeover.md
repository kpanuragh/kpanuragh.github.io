---
title: "OAuth 2.0: The 'Login With Google' Button That Can Steal Your Users 🔑"
date: "2026-03-09"
excerpt: "OAuth 2.0 feels like magic — one button and users are authenticated. But misconfigure it and you've just handed attackers the keys to every account. Here's what every developer needs to know."
tags: ["cybersecurity", "oauth", "web-security", "authentication", "api-security"]
featured: true
---

# OAuth 2.0: The 'Login With Google' Button That Can Steal Your Users 🔑

You added "Login with Google" to your app in an afternoon. Slick, right? No passwords to store, no email verification flows, instant trust. You felt like a security genius.

Then you learned about OAuth redirect attacks. And the `state` parameter. And token leakage. And...

Look, OAuth 2.0 is genuinely great. But it's also a minefield with a friendly UI. Let me walk you through the traps developers fall into every single week — and how to dodge them.

## What OAuth 2.0 Actually Is (No PhD Required) 🎓

OAuth isn't authentication. It's **authorization delegation**. The difference matters.

- **Authentication:** "Prove you're Alice."
- **Authorization:** "Alice says you can read her Google Drive."

When you do "Login with Google," you're technically *abusing* OAuth to authenticate — using the fact that Google vouched for the user as proof of identity. It works, but it introduces extra attack surface. OpenID Connect (OIDC) is the proper extension for this, but let's focus on where things go wrong.

The simplified flow looks like this:

```
Your App → "Please authenticate this user" → Google
Google  → "Here's a code, send it back" → Your App
Your App → "Here's the code + my secret" → Google
Google  → "Here's an access token" → Your App
Your App → "Who is this token for?" → Google
Google  → "It's Alice, email: alice@gmail.com" → Your App
```

Each arrow is an opportunity for an attacker. Let's go through the biggest ones.

## Trap #1: Missing the `state` Parameter (Hello, CSRF) 🎣

**What it is:** The `state` parameter is a random nonce you generate, attach to the OAuth request, and verify when Google sends the user back.

**What happens without it:**

```
Attacker initiates OAuth flow → Gets a "half-completed" authorization URL
Attacker tricks YOUR USER into clicking that URL
User authorizes → Google redirects to YOUR callback with the attacker's code
Your app links the attacker's Google account to the victim's account
Attacker logs in as victim. Forever.
```

This is a real attack. It's called **OAuth CSRF** and it's stupidly common.

**The fix is simple:**

```python
import secrets
from flask import session, redirect

def login():
    # Generate a random state and store it in the user's session
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state

    return redirect(
        f"https://accounts.google.com/o/oauth2/auth"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=openid email"
        f"&state={state}"  # <-- This little guy saves your users
    )

def callback():
    returned_state = request.args.get('state')
    stored_state = session.pop('oauth_state', None)

    # If these don't match, someone is messing with you
    if not stored_state or returned_state != stored_state:
        return "CSRF attack detected!", 400

    # Now you can safely exchange the code for a token
    code = request.args.get('code')
    # ... exchange code for token
```

One random string, stored in session, verified on return. That's it. If your OAuth implementation doesn't do this, go fix it right now. I'll still be here.

## Trap #2: Open Redirect in Your Callback URI 🚪

**The scenario:** Your redirect URI is registered as `https://yourapp.com/callback` — but your app also has a redirect parameter somewhere.

```
# Attacker crafts this URL:
https://yourapp.com/callback?code=LEGIT_CODE&next=https://evil.com/steal-tokens
```

If your callback blindly redirects to `next` after processing the OAuth code, the user's session token just went on a field trip to evil.com.

**The rule:** After OAuth callback, only redirect to relative paths or a strict allowlist.

```javascript
// Bad - open redirect
const next = req.query.next;
res.redirect(next); // 💣

// Good - only allow relative URLs
const next = req.query.next;
if (next && next.startsWith('/') && !next.startsWith('//')) {
    res.redirect(next);
} else {
    res.redirect('/dashboard'); // Safe default
}
```

The `//evil.com` trick is why you check for the double slash. `//evil.com` is protocol-relative — browsers treat it as `https://evil.com`. Classic gotcha.

## Trap #3: The Authorization Code is One-Time Use (Treat It That Way) ♻️

OAuth authorization codes are meant to be exchanged exactly once for an access token, then discarded. They're short-lived (usually 10 minutes max).

**The mistake:** Logging or storing the authorization code anywhere.

```python
# This is in too many production logs right now 😬
logger.info(f"OAuth callback received: code={code}, state={state}")
# ^ Your code is now in your log aggregation system, queryable by anyone
#   with log access
```

**Also bad:** Passing the code through additional redirect hops where it can leak in `Referer` headers.

**The fix:** Exchange the code server-side immediately, never log it, and if exchange fails — treat it as invalid and make the user start over. Don't retry with the same code.

## Trap #4: Trusting Email Without Verifying It's Verified ✉️

This one is subtle and nasty.

When you get user info from Google after OAuth, the response includes an `email` field. Many providers also include an `email_verified` field. **These are not the same thing.**

Some OAuth providers let users register with an email they haven't confirmed. If you automatically link accounts by email address:

```python
# DANGEROUS pattern
user_info = google.get_user_info(access_token)
email = user_info['email']

# What if email_verified is False?!
user = User.query.filter_by(email=email).first()
if user:
    login_user(user)  # Attacker just logged into someone else's account!
```

**The safe version:**

```python
user_info = google.get_user_info(access_token)

# Always check this!
if not user_info.get('email_verified'):
    return "Email not verified with this provider", 400

email = user_info['email']
# Now it's safe to use for account matching
```

This matters even more when you support multiple OAuth providers. If I can create a GitHub account with your email before you do, and you later add "Login with GitHub"... you see where this goes.

## Trap #5: Storing Access Tokens Like They're Cheap 💸

Access tokens are credentials. Treat them like passwords.

**Where developers accidentally leak tokens:**

- URL parameters: `https://yourapp.com/dashboard?token=ya29.abc123` (shows in browser history, server logs, Referer headers)
- `localStorage` (vulnerable to XSS — we've been over this)
- Unencrypted database columns with no audit logging
- Analytics events: `trackEvent('oauth_success', { token: accessToken })` (yes, this happens)

**The right approach:**

1. Store tokens server-side, associated with the user's session
2. If you must store on client, use `httpOnly` cookies
3. Encrypt tokens at rest if storing in a database
4. Scope tokens minimally — don't request `drive.full` if you only need `email`
5. Refresh tokens when they expire; revoke them when users disconnect

## The OAuth Security Checklist 🛡️

Before you ship your OAuth integration:

- [ ] `state` parameter generated per-request and verified on callback
- [ ] Redirect URIs strictly registered with provider (no wildcards!)
- [ ] Authorization codes exchanged immediately and never logged
- [ ] `email_verified` checked before trusting email for account linking
- [ ] Access tokens stored server-side or in `httpOnly` cookies
- [ ] Minimal scopes requested (only what you actually need)
- [ ] Token refresh implemented (access tokens expire)
- [ ] Revocation endpoint called when users disconnect the integration
- [ ] Post-OAuth redirects use allowlist, not open redirect

## Real Talk: Use a Library 📦

Implementing OAuth correctly from scratch is hard. The above covers the main pitfalls, but there are more edge cases lurking. For production apps:

- **Node.js:** `passport.js` + `passport-google-oauth20`
- **Python:** `Authlib`, `python-social-auth`
- **PHP/Laravel:** `Laravel Socialite`
- **Go:** `golang.org/x/oauth2`

These libraries handle the state parameter, token exchange, and refresh flows correctly. Don't reinvent this wheel unless you're writing a security paper about it.

## The Bottom Line

OAuth is powerful, widely supported, and when implemented correctly — genuinely secure. The attacks above aren't theoretical. They show up in bug bounty reports weekly.

The good news: every single one of them has a simple fix.

1. **Always use the `state` parameter** — CSRF protection for free
2. **Validate redirect targets** — no open redirects after callback
3. **Never log authorization codes** — they're short-lived credentials
4. **Check `email_verified`** — not all emails are created equal
5. **Treat tokens like passwords** — server-side storage, minimal scopes

Do these five things and your "Login with Google" button will be the secure, smooth experience your users deserve — not a backdoor for attackers.

---

**Found an OAuth misconfiguration in the wild?** Share your story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the security community learns from these.

**More security deep-dives incoming!** Because there's always another footgun to document. 🔐

*P.S. — If your OAuth callback logs the authorization code "just for debugging," you're one Splunk query away from a bad day. Go fix that.* 🛡️
