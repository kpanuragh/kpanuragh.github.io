---
title: "Session Fixation: The Attack That Starts Before You Click 'Login' 🪪"
date: "2026-05-19"
excerpt: "The attacker already knows your session ID before you log in. How? They set it. Session fixation is the overlooked cousin of session hijacking, and the fix is one line of code you're probably not calling."
tags: ["security", "authentication", "session-management", "cybersecurity", "web-security", "php", "nodejs"]
featured: true
---

# Session Fixation: The Attack That Starts Before You Click 'Login' 🪪

Here's a fun thought experiment: what if an attacker didn't need to *steal* your session ID after you log in — what if they just *handed you* the session ID themselves, waited for you to authenticate with it, and then walked right in?

That's session fixation. No XSS required. No network sniffing. No fancy exploits. Just the attacker choosing your session token for you and then patiently waiting while you do the hard part of authenticating.

## How Sessions Are Supposed to Work

When you visit a web app, the server creates a temporary session — a random token stored server-side — and hands you the corresponding ID via a cookie. When you log in, the server associates that session ID with your account. Every request you make from that point on carries the cookie, and the server knows who you are.

The critical assumption baked into this model: the session ID generated *before* login is worthless until the server links it to a real user.

Session fixation attacks that assumption directly.

## The Attack in Slow Motion

1. The attacker visits your app and gets a valid (but anonymous) session ID — say, `SESSIONID=abc123`
2. They send you a crafted URL: `https://yourbank.com/login?SESSIONID=abc123`
3. If the server accepts session IDs from URL parameters and doesn't rotate them on login, you now have a session — `abc123` — that the attacker also knows
4. You log in. The server associates *your* authenticated account with `abc123`
5. The attacker makes requests with `SESSIONID=abc123` and they're you

The server sees two people using the same session ID. One of them is you, authenticated and trusting. The other is the attacker, using a token they picked out themselves.

## A Concrete Example in PHP (The Classic Culprit)

PHP is notorious for this because of how easy it makes session adoption from URL parameters:

```php
<?php
// ⚠️ Vulnerable: accepts session ID from the URL query string
session_start(); // PHP honors ?PHPSESSID=attacker_controlled_value

// User logs in...
if (validCredentials($_POST['user'], $_POST['pass'])) {
    $_SESSION['user_id'] = getUserId($_POST['user']);
    // 🔥 Session ID unchanged — attacker still owns this session
    header('Location: /dashboard');
}
```

The fix is a single call that the PHP docs have been recommending since forever and yet somehow keeps getting skipped:

```php
<?php
session_start();

if (validCredentials($_POST['user'], $_POST['pass'])) {
    // ✅ Regenerate session ID on login — attacker's known token is now invalid
    session_regenerate_id(true); // true = delete the old session server-side
    $_SESSION['user_id'] = getUserId($_POST['user']);
    header('Location: /dashboard');
}
```

`session_regenerate_id(true)` issues a fresh, cryptographically random session ID and invalidates the old one. Even if the attacker had pre-planted `abc123`, after login that token is dead. The user gets a new, secret ID that only their browser knows.

## The Node.js Version of the Same Mistake

Express with `express-session` is just as easy to get wrong:

```javascript
const session = require('express-session');

app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.username, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  // ⚠️ Vulnerable: session ID from before login is reused
  req.session.userId = user.id;
  res.redirect('/dashboard');
});
```

And the fix:

```javascript
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.username, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  // ✅ Regenerate before writing sensitive data to the session
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.userId = user.id;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.redirect('/dashboard');
    });
  });
});
```

Call `regenerate`, *then* write user data. Order matters — writing user data first and regenerating second creates a brief window where the new session exists without user data, which can cause its own bugs.

## The Three Moments You Must Rotate Session IDs

Login is the obvious one, but it's not the only privilege escalation in a user lifecycle:

**1. On login** — most critical, covered above.

**2. On privilege escalation** — if your app has "switch to admin mode," "confirm your password to proceed," or sudo-style re-authentication steps, regenerate again at each of those. The session before the escalation is lower-trust than the session after.

**3. On logout** — destroy the session server-side entirely. Don't just clear the cookie client-side. If the old session record lives on the server, an attacker with a copy of the old session cookie can reuse it even after you "logged out."

We caught this exact pattern during a security review at Cubet — a client's app was clearing the cookie on logout but leaving the server-side session record intact. The session was technically still valid; it just wasn't being sent anymore. An attacker with a network capture from earlier in the session could still use it. One `req.session.destroy()` call fixed it permanently.

## What Session Adoption Actually Requires

Session fixation as an attack vector depends on the server accepting a session ID that was supplied by the client in a way the attacker can control — typically URL parameters (`?SESSID=...`), custom headers, or POST body params that the server promotes into a session.

Modern defaults have gotten much better here:

- PHP's `session.use_only_cookies = 1` (default since PHP 5.3) prevents session adoption via URL
- `express-session` only reads from cookies by default
- Most modern frameworks won't touch session IDs from query strings unless you explicitly configure them to

The real risk today is frameworks or legacy code that explicitly enable URL-based sessions for "compatibility" with clients that can't handle cookies (old mobile apps, some kiosk setups, etc.). If you're running that configuration, you're exposed — and migrating away from it is worth the effort.

## Quick Audit Checklist

Run through these for your current app:

- [ ] Does login call `session_regenerate_id(true)` / `req.session.regenerate()` *before* writing auth data?
- [ ] Does logout call `session_destroy()` / `req.session.destroy()` server-side?
- [ ] Is `session.use_only_cookies` enabled (PHP) or equivalent?
- [ ] Do you accept `?SESSID=` or equivalent URL parameters? If yes, stop.
- [ ] Do privilege escalation flows (admin mode, re-auth prompts) also regenerate?

None of these are exotic requirements. They're checklist items that good session management has demanded since the OWASP Session Management Cheat Sheet was first written. They're also the items most likely to be skipped when a feature ships at 11pm under deadline pressure.

## TL;DR

- Session fixation: attacker pre-sets a known session ID, waits for you to authenticate with it, then hijacks your session without ever stealing anything
- The fix: rotate session IDs at login, privilege escalation, and logout
- Disable session adoption from URL parameters entirely — cookies only
- `session_regenerate_id(true)` in PHP and `req.session.regenerate()` in Express are the relevant calls
- Write session data *after* regenerating, not before

One `regenerate` call is the difference between "the attacker picked my session ID before I even logged in" and "the attacker is holding a token that's been dead since the moment I authenticated."

---

Spotted a session fixation vector in your stack, or want to argue about whether URL-based sessions are ever okay? Find me at [@anuragh_kp on X](https://x.com/anuragh_kp) or [kpanuragh on GitHub](https://github.com/kpanuragh). The comments are open, and I promise I won't fixate on any particular response.
