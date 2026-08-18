---
title: "🪪 Session Fixation: The Login That Was Never Really Yours"
date: "2026-08-18"
excerpt: "Most session bugs happen after login. Session fixation happens before — an attacker hands you a session ID, you log in with it, and congratulations, you just authenticated their session, not yours. Here's how it works and the renewal pattern that kills it."
tags:
  - security
  - session-management
  - authentication
  - web-security
featured: true
---

Everyone worries about session hijacking — stealing a cookie after someone's already logged in. Fewer people worry about the sneakier cousin: what if the attacker gives you the session *before* you log in, and just waits for you to make it valid?

That's session fixation, and it's the kind of bug that survives in codebases for years because it doesn't look like a bug at all. Login works. Logout works. Every manual QA pass is green. The vulnerability only shows up when you ask a very specific question: *does the session ID change when the user's privilege level changes?* If the answer is no, you have a problem, and it's been sitting there quietly since the framework's default config was written.

## How the Attack Actually Works

The mechanics are almost insultingly simple, which is part of why the bug persists:

1. Attacker visits your site, gets handed a session ID by the server — say, `sess=abc123` — before ever logging in.
2. Attacker forces that session ID onto the victim. This used to mean a URL like `yoursite.com/login?PHPSESSID=abc123`; these days it's more often a cookie set via a subdomain takeover, a misconfigured `Set-Cookie` domain, or just a shared/kiosk browser where the attacker logged out but the session cookie never rotated.
3. Victim logs in normally, using their real credentials. Crucially, **the server keeps using the same session ID** — `abc123` — and just attaches "authenticated" and the victim's user ID to it server-side.
4. Attacker, who already knows `abc123`, uses it too. Same session, same authenticated state. They're now logged in as the victim without ever touching a password.

Nothing here required stealing a cookie mid-flight, cracking a token, or defeating TLS. The attacker supplied the credential (the session ID) and the *victim* did the authenticating on their behalf. It's phishing, but for session state instead of passwords.

## Why This Still Shows Up in 2026

You'd think every framework fixed this by default by now — and mostly, yes, modern session middleware does regenerate the session ID on login. But the bug creeps back in through a few very specific gaps:

- **Custom auth flows that bypass the framework's login hook.** SSO callbacks, magic-link consumption, OAuth redirect handlers — any code path that sets `req.session.userId = user.id` directly instead of going through the framework's "log this user in" helper often skips the regeneration step entirely, because nobody wired it up for the new flow.
- **Privilege escalation without re-authentication.** A user goes from "logged in as regular user" to "switched into admin view" via an internal impersonation feature, and the session ID stays exactly the same across that boundary. Now fixing pre-login fixation doesn't even help — the same bug exists at the privilege-elevation boundary.
- **Session stores that silently no-op regeneration under load.** I've seen this with Redis-backed session stores where a regenerate call raced against a concurrent request on the same session and got dropped — the old ID kept working right alongside the new one for a window of time.

Here's the fix, expressed the way it should look in any login handler, using Express as the example since it's the most common place I've seen this missed:

```js
app.post('/login', async (req, res) => {
  const user = await verifyCredentials(req.body.email, req.body.password);
  if (!user) return res.status(401).send('Invalid credentials');

  // The step people skip when they hand-roll auth for SSO/magic links:
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Login failed');

    req.session.userId = user.id;
    req.session.authenticatedAt = Date.now();
    res.redirect('/dashboard');
  });
});
```

`regenerate()` issues a brand-new session ID and destroys the old one server-side. Whatever pre-login session an attacker planted becomes worthless the moment the victim authenticates — it simply stops existing. The victim's browser gets a fresh cookie they never chose, which is exactly the point.

## The Renewal Pattern That Actually Closes the Gap

Regenerating on login is table stakes. The pattern that actually holds up in production also regenerates on any privilege boundary crossing — not just the initial login:

```js
function requireRegenerationOn(events, sessionStore) {
  return async function elevate(req, res, next) {
    const oldSessionData = { ...req.session };
    req.session.regenerate((err) => {
      if (err) return next(err);
      Object.assign(req.session, oldSessionData, { elevatedAt: Date.now() });
      next();
    });
  };
}

// used at every trust boundary, not just /login:
app.post('/login', requireRegenerationOn(), loginHandler);
app.post('/admin/impersonate/:userId', requireAdmin, requireRegenerationOn(), impersonateHandler);
app.post('/mfa/verify', requireRegenerationOn(), mfaVerifiedHandler);
```

The mental model that makes this click: a session ID should be treated as **scoped to a trust level**, not just to a user. Anonymous browsing, authenticated-but-no-MFA, authenticated-with-MFA, and impersonating-another-user are four different trust levels, and crossing between any of them should mint a new session ID — carrying forward the data you want to keep (cart contents, locale preference) but never the identifier itself. At Cubet, we ended up writing this as a single `elevateSession()` helper that every auth-adjacent route had to call explicitly, specifically because "the framework probably handles it" is exactly the assumption that let this bug live undetected in a legacy SSO integration for longer than anyone wants to admit.

## The Takeaway

Session fixation doesn't need a sophisticated exploit — it needs one missing `regenerate()` call at exactly the moment your app decides someone is more trusted than they were a second ago. If you only check this at `/login`, you've covered the obvious case and left every SSO callback, magic link, MFA step-up, and impersonation feature as an open question. Go find every place your code writes `session.userId = ...` and ask whether it's also generating a fresh session ID first. If the answer is "I'm not sure," that's your next audit.

Found a fixation gap in your own auth flow, or have a session-renewal pattern that's saved you? I'd genuinely like to hear about it — find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
