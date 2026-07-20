---
title: "🍪 CSRF in Modern SPAs: Why SameSite Cookies Won't Save You"
date: "2026-07-20"
excerpt: "Everyone shipped SameSite=Lax and closed the CSRF ticket forever. Except your SPA has a token-based auth bypass, a same-site subdomain nobody trusts, and a login CSRF hole that SameSite was never designed to catch. Let's go find them."
tags:
  - security
  - csrf
  - web-security
  - cybersecurity
  - appsec
featured: true
---

Somewhere in your backlog there's a ticket titled "CSRF protection" that got closed two years ago with the comment "done — cookies are SameSite=Lax now." Nobody's touched it since. Everyone assumes it's handled.

I want to gently ruin that assumption.

CSRF didn't die when browsers shipped `SameSite`. It moved. It's living in your OAuth callback, your subdomain-shared session cookie, and the one form on your app that doesn't require auth in the first place. SameSite is a genuinely great mitigation — it just isn't the whole story, and modern SPA architectures reopen doors it was never built to close.

## Quick refresher on what SameSite actually does

`SameSite=Lax` (the browser default since Chrome 80) stops the browser from attaching your cookie to **cross-site, non-top-level-navigation** requests. So a malicious `<img>`, `fetch()`, or auto-submitting `<form>` on `evil.com` that POSTs to `yourapp.com/transfer` won't carry your session cookie along. Classic CSRF, mostly solved.

Emphasis on "mostly." Here's where it falls apart.

## 1. Same-site isn't the same as same-app

`SameSite` is computed against the **registrable domain** (eTLD+1), not the full origin. That means `blog.yourapp.com`, `admin.yourapp.com`, and `attacker-controlled-subdomain.yourapp.com` are all "same-site" to each other as far as the cookie is concerned.

If your org has ever handed a subdomain to a third-party tool — a marketing CMS, a support widget, a staging environment with looser deploy controls — you've handed that tool the ability to fire same-site requests carrying your users' auth cookies. This is the actual reason "subdomain takeover" bugs are worth real bounty money: the takeover itself isn't the prize, the CSRF/session-riding it unlocks is.

```
# These are all "same-site" for cookie purposes:
app.yourapp.com
blog.yourapp.com          <- runs on a CMS you don't fully control
old-staging.yourapp.com   <- DNS record nobody deleted, points at nothing
```

`old-staging` pointing at a dangling S3 bucket or an expired cloud IP is the classic setup. Someone claims it, hosts a page, and now has a same-site origin to launch requests from — with your `SameSite=Lax` cookie attached and nothing to stop it.

## 2. Token-based auth doesn't get you a free pass

A lot of teams moved auth into an `Authorization: Bearer <token>` header specifically to sidestep CSRF, on the theory that CSRF only exploits *ambient* credentials (cookies) that the browser attaches automatically — and a header has to be set explicitly by your own JS. True, as far as it goes.

Where it breaks: if that token is *also* mirrored into a cookie for SSR hydration, or if there's a `/refresh` endpoint that still runs on cookie auth to reissue tokens, you've quietly reintroduced the ambient-credential problem. I've seen this exact shape in a Next.js app that used bearer tokens for the API but a plain session cookie to gate the `/api/refresh-token` route "just for that one endpoint." That one endpoint was the whole attack surface.

```js
// looks safe: real API calls require an explicit header
fetch('/api/transfer', {
  headers: { Authorization: `Bearer ${accessToken}` },
  method: 'POST',
  body: JSON.stringify({ to: acct, amount: 500 }),
});

// the quiet reintroduction: this route trusts the cookie alone
app.post('/api/refresh-token', (req, res) => {
  const session = req.cookies.session_id; // ambient credential, no CSRF check
  const newToken = mintAccessToken(session);
  res.json({ accessToken: newToken });
});
```

An attacker doesn't need your access token if they can trigger `/api/refresh-token` cross-site and read the response — and if that route doesn't check `SameSite` gaps or a CSRF token, or worse, is misconfigured with a permissive CORS policy plus `credentials: 'include'`, they can. CORS and CSRF are different bugs, but a lax CORS policy on a cookie-authenticated endpoint turns the "attacker can't read the response" assumption CSRF defenses lean on into a lie.

## 3. Login CSRF: the one everyone forgets

SameSite protects state-changing requests on an *authenticated* session. It says nothing about the login form itself, which typically has no session to protect yet. Login CSRF logs the *victim* into the *attacker's* account, silently, via a cross-site auto-submitted form — and then anything the victim subsequently saves (payment details, search history, uploaded files) gets attributed to an account the attacker controls and can read later.

```html
<!-- hosted on evil.com, auto-submits on page load -->
<form action="https://yourapp.com/login" method="POST" id="f">
  <input type="hidden" name="username" value="attacker_account">
  <input type="hidden" name="password" value="known_password">
</form>
<script>document.getElementById('f').submit();</script>
```

Because this is a top-level navigation form POST, `SameSite=Lax` actually *allows* it through — Lax's whole design goal is to keep normal cross-site navigations working. This is the mitigation working exactly as specified and still not helping you.

## What actually closes the gaps

- Keep `SameSite=Lax` (or `Strict` where UX allows) — it's still doing real work, don't remove it.
- Add a synchronizer CSRF token on genuinely state-changing POSTs, especially login and any cookie-authenticated token-refresh endpoint. Belt and suspenders, not either/or.
- Audit `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials` together. If both are permissive on a cookie-authenticated route, you've built a CSRF bypass with extra steps.
- Inventory your subdomains. A `dig` sweep against your own DNS zone for dangling CNAMEs is a fifteen-minute job that closes a same-site bypass class entirely.
- Re-check auth flows specifically at login and token-refresh — the two places "state-changing" doesn't obviously apply, which is exactly why they get skipped in review.

On my team at Cubet, this came up during a routine access-control review of an internal admin panel — not a pentest finding, just someone asking "wait, why does refresh-token trust the cookie" out loud in a PR comment. That's usually how these get caught: not a scanner, a person pausing on a route that looked boring enough to skip.

If your last CSRF review was "we set SameSite, ship it," it's worth another fifteen minutes with the checklist above. What did you find? I'm on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), and [LinkedIn](https://linkedin.com/in/anuraghkp) — come argue with me about it.
