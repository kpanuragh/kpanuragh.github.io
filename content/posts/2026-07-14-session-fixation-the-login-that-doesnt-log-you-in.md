---
title: "🎭 Session Fixation: The Login That Doesn't Actually Log You In"
date: "2026-07-14"
excerpt: "You built login, logout, password reset, even MFA. But if you never rotate the session ID at the right moments, an attacker can hand a victim a 'logged in' session before they even type a password. Let's fix that."
tags:
  - security
  - web-security
  - authentication
  - sessions
  - cybersecurity
featured: true
---

Quick riddle: what's a vulnerability where the attacker doesn't need to steal your password, doesn't need to guess your session token, and doesn't even need you to click a malicious link with a payload in it — they just need you to log in *at all*?

That's session fixation. And it's one of those bugs that survives in codebases for years because everything *looks* fine. Login works. Logout works. The session cookie is `HttpOnly` and `Secure`. MFA is enabled. Nobody notices the one missing step: **rotating the session identifier at the moment privilege changes.**

## The setup: sessions that never change their name

Here's the mental model most people carry around: "a session ID is created when the user's browser first hits the site, and it just... represents that browser session." Fine so far. The bug shows up in what happens *next*.

A shockingly common (and broken) pattern:

```js
// BROKEN: session id issued before auth, never rotated after
app.use(session({
  secret: process.env.SESSION_SECRET,
  genid: () => crypto.randomUUID(),
  resave: false,
  saveUninitialized: true, // <-- issues a session cookie to anonymous visitors
}));

app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.username, req.body.password);
  if (!user) return res.status(401).send('nope');

  req.session.userId = user.id; // same session ID as before login
  res.redirect('/dashboard');
});
```

See it? The session ID exists *before* the user logs in — `saveUninitialized: true` hands out a cookie to every anonymous visitor. Login just flips `req.session.userId` from `undefined` to a real value, inside the *same* session container, with the *same* session ID.

Now the attack: I visit the site myself, get handed session ID `abc123` in a cookie. I don't log in. Instead, I trick you — via a link, a shared kiosk, a subdomain that can set cookies for the parent domain, whatever — into using that exact session ID (`Set-Cookie: sid=abc123`) in your browser. You then log in normally, with your real credentials, on your own device, over HTTPS, with MFA and everything. Congratulations, you just authenticated *my* session. I refresh my tab and I'm you.

No token theft. No XSS needed, though XSS makes it easier. No password cracking. The whole "attack" is: get the victim to adopt a session ID I already know, then wait for them to log in.

## Why this keeps happening

Two design habits create the opening, and both feel completely reasonable in isolation:

1. **Issuing a session before authentication**, because you want to track anonymous carts, CSRF tokens, or A/B test buckets pre-login.
2. **Never rotating the session identifier on privilege transitions** — login, MFA completion, and role/permission changes (admin impersonation, account switching) are the big three people forget.

Individually these are normal, useful patterns. Together, they mean "the session ID" and "the authenticated identity" are decoupled in exactly the way an attacker needs.

## The fix: rotate on every trust boundary crossing

The rule of thumb: **any time the privilege level of a session changes, the session identifier changes too.** Not the session *data* — you can keep the cart, the CSRF token, whatever — just the ID that a cookie could have pinned in advance.

```js
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.username, req.body.password);
  if (!user) return res.status(401).send('nope');

  const oldData = { ...req.session }; // preserve cart, CSRF token, etc.

  req.session.regenerate((err) => {
    if (err) return res.status(500).send('session error');

    Object.assign(req.session, oldData, { userId: user.id });
    req.session.save(() => res.redirect('/dashboard'));
  });
});
```

`session.regenerate()` (this is the `express-session` API, but every mature session library has an equivalent — Rails' `reset_session`, Django's `cycle_key()`, Laravel's `Session::regenerate()`) issues a brand new session ID and invalidates the old one server-side. Any cookie value an attacker planted before login is now pointing at a dead session.

Do this at every one of these moments, not just plain login:

- **Post-authentication** (password accepted).
- **Post-MFA** (second factor accepted) — a lot of teams rotate at step one and forget step two, leaving a window where a "partially authenticated" session is fixation-able before MFA completes.
- **Privilege elevation** — admin switching into a "view as user" mode, or vice versa.
- **Password reset / change** — this one doubles as session hijacking mitigation: if an attacker had a live session as the victim, forcing rotation on password change kicks them out.

## The other half: don't forget logout

Rotation on login is the famous half of the fix. The half people skip is that logout should **destroy** the session server-side, not just clear the cookie client-side:

```js
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie('sid');
    res.redirect('/');
  });
});
```

If logout only tells the browser to forget the cookie, the session itself is still alive server-side. Anyone who captured the cookie value earlier (proxy logs, browser history sync, a shared machine) can keep using it after the "owner" thinks they've logged out.

## Where I've seen this bite in practice

On a team I worked with at Cubet Techno Labs, we picked up a session-fixation finding during a routine pentest on an internal admin panel — the kind of tool built fast because "it's internal, only staff use it." Staff-only auth had been bolted onto an existing anonymous session mechanism used for feature flags, and nobody had added a `regenerate()` call because the login flow "worked" in every functional test. Functional tests check that the right user ends up logged in; they don't check *whether the session ID changed underneath them*. That's the trap — this bug is invisible to almost every test you'd normally write, because from the legitimate user's point of view, everything behaves correctly.

The fix was two lines of `regenerate()` calls (login + MFA completion) plus switching logout from `clearCookie`-only to `session.destroy()`. Fifteen minutes of code, caught only because someone was explicitly looking for it.

## The checklist version

If you want the TL;DR to paste into a PR description or a security checklist:

- [ ] Session ID rotates on login success (not just on data mutation).
- [ ] Session ID rotates again after MFA/second-factor completion.
- [ ] Session ID rotates on any privilege-level change (role switch, impersonation).
- [ ] Session ID rotates on password change/reset.
- [ ] Logout calls a server-side destroy, not just a cookie clear.
- [ ] Pre-auth sessions (anonymous carts, CSRF tokens) are never trusted for authorization decisions after the ID should have rotated.

None of this requires a new library or a framework migration — it's a handful of `regenerate()`/`cycle_key()`/`reset_session` calls in the right places. The hard part isn't the code, it's remembering that "login works" and "login is safe" are two different test suites.

---

Found a session-handling gap like this in something you're building, or have war stories about a pentest that turned up something equally invisible? I'd love to hear about it — find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
