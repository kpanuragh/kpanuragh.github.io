---
title: "CSRF: The Attack That Makes Your Users Do Things They Didn't Mean To 🎭"
date: "2026-03-22"
excerpt: "Imagine clicking a random link and accidentally transferring your bank balance to a hacker. That's CSRF in a nutshell — and your app is probably vulnerable right now. Let's fix that."
tags: ["\\\"cybersecurity\\\"", "\\\"web-security\\\"", "\\\"csrf\\\"", "\\\"owasp\\\"", "\\\"security\\\""]
featured: "true"
---

# CSRF: The Attack That Makes Your Users Do Things They Didn't Mean To 🎭

Imagine this: Your user, Bob, logs into his bank, transfers some money, then opens another tab to check Reddit. He clicks a meme link. Nothing happens. Weird.

**But $2,000 just left his account.** 💸

No phishing. No malware. Bob didn't type anything. He just... clicked a link. Welcome to **Cross-Site Request Forgery** — the attack that hijacks your users' browsers to do the attacker's dirty work.

CSRF has been in the OWASP Top 10 for *decades*. It's sneaky, elegant, and deceptively easy to pull off on vulnerable apps. Let's dig in.

## What Is CSRF, Exactly? 🤔

**Cross-Site Request Forgery** tricks a logged-in user's browser into making requests to your app *without the user knowing*.

Here's the magic trick the attacker exploits:

> Browsers automatically attach cookies (including session cookies) to every request made to a domain — even if that request originates from a *different* site.

So if Bob is logged into `bank.com`, his session cookie rides along with **every** request to `bank.com`, including ones triggered by `evil-memes.com`.

The attacker doesn't need Bob's password. They don't need his session token. They just need him to be logged in and visit their page.

**The attack flow:**
1. Bob logs into `bank.com` → session cookie set
2. Bob visits `evil-memes.com` (still logged in to bank)
3. Evil page silently sends a request to `bank.com/transfer`
4. Bank sees valid session cookie → request approved
5. Bob's money is gone. Hacker wins. 🎉

## The Attack in Action 💀

Here's what the attacker's page looks like. It's criminally simple:

```html
<!-- evil-memes.com/free-pizza.html -->
<html>
  <body>
    <h1>You won a free pizza! 🍕</h1>

    <!-- This form auto-submits on page load -->
    <form id="csrf-form"
          action="https://bank.com/transfer"
          method="POST"
          style="display:none">
      <input name="to_account" value="hacker-account-9999" />
      <input name="amount" value="2000" />
    </form>

    <script>
      // Fires immediately when Bob visits this page
      document.getElementById('csrf-form').submit();
    </script>
  </body>
</html>
```

Bob visits the page. The hidden form submits. `bank.com` receives a POST request with Bob's session cookie. Transfer approved.

**No passwords stolen. No malware installed. Just vibes.** 😅

GET requests are even scarier — you don't even need a form:

```html
<!-- A single image tag can trigger a GET request -->
<img src="https://bank.com/transfer?to=hacker&amount=2000"
     width="0" height="0" />
```

Bob's browser fetches the "image." The bank processes the transfer. This is why **GET requests must NEVER change state** — it's not just REST best practice, it's security.

## Why Your "Fix" Probably Doesn't Work 🙈

### "But I check the HTTP Referer header!"

```javascript
// ❌ Unreliable — Referer can be:
// - Stripped by privacy tools
// - Faked in some browsers
// - Missing entirely on HTTPS → HTTP transitions
if (req.headers.referer?.startsWith('https://myapp.com')) {
  // "secure"... but not really
}
```

Referer checks are a suggestion, not a defense.

### "But my API uses JSON!"

```javascript
// ❌ JSON doesn't save you if you accept other content types
fetch('https://bank.com/transfer', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' }, // bypasses CORS preflight!
  body: JSON.stringify({ to: 'hacker', amount: 2000 }),
  credentials: 'include'
});
```

If your server parses the body regardless of `Content-Type`, you're still vulnerable. Don't assume JSON = safe.

## The RIGHT Way to Stop CSRF 🛡️

### Option 1: CSRF Tokens (The Classic, Battle-Tested Fix)

Generate a secret, unpredictable token per user session. Embed it in every state-changing form. Validate it on the server.

```javascript
// Express.js with csurf middleware
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

// Attach token to forms
app.get('/transfer', csrfProtection, (req, res) => {
  res.render('transfer', {
    csrfToken: req.csrfToken() // unique per session
  });
});

// Validate token on submission
app.post('/transfer', csrfProtection, (req, res) => {
  // If token is missing or wrong, csurf throws an error automatically
  processTransfer(req.body);
  res.json({ success: true });
});
```

```html
<!-- In your form -->
<form method="POST" action="/transfer">
  <!-- Hidden CSRF token — evil-memes.com can't read this! -->
  <input type="hidden" name="_csrf" value="<%= csrfToken %>" />
  <input name="amount" />
  <button type="submit">Transfer</button>
</form>
```

**Why this works:** The attacker's page can't read the CSRF token from `bank.com` (same-origin policy blocks cross-site reads). Without the correct token, the server rejects the request. ✅

### Option 2: SameSite Cookies (The Modern, Elegant Fix)

This one's beautiful in its simplicity — just add an attribute to your session cookie:

```javascript
// Express.js session setup
app.use(session({
  secret: process.env.SESSION_SECRET,
  cookie: {
    httpOnly: true,
    secure: true,        // HTTPS only
    sameSite: 'strict'   // THE MAGIC RIGHT HERE
  }
}));
```

**`SameSite: Strict`** — Cookie is NEVER sent on cross-site requests. Period. Evil-memes.com triggers a POST to bank.com? No cookie attached. Server sees no session. Request rejected.

**`SameSite: Lax`** — Cookie sent on top-level navigation (clicking a link) but NOT on cross-site form POSTs or AJAX. Good balance for most apps.

**`SameSite: None`** — Old behavior. Cookie always sent. Only use this if you have a legitimate cross-site need (e.g., embedded iframes), and you MUST pair it with `Secure`.

```
# What your Set-Cookie header should look like
Set-Cookie: sessionId=abc123; HttpOnly; Secure; SameSite=Strict
```

Modern browsers support `SameSite` well, and Chrome defaults to `Lax` even when you don't specify it. But don't rely on browser defaults — be explicit!

### Option 3: Double Submit Cookie Pattern (For Stateless APIs)

No server-side session? Use this:

```javascript
// 1. Server sets a random token in a cookie
res.cookie('csrf-token', generateRandomToken(), {
  secure: true,
  sameSite: 'strict'
});

// 2. Client reads the cookie and sends it as a header
fetch('/api/transfer', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': getCookie('csrf-token'), // JS reads cookie, sets header
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ amount: 100 })
});

// 3. Server validates cookie value === header value
app.post('/api/transfer', (req, res) => {
  const cookieToken = req.cookies['csrf-token'];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }

  processTransfer(req.body);
});
```

**Why this works:** The attacker can set form fields, but they can't set custom request headers from a cross-site request (CORS blocks it). Reading your cookie from their domain is also blocked. So they can't replicate the cookie+header match. ✅

## The CSRF Security Checklist 📋

Before you ship:

- [ ] `SameSite=Strict` or `SameSite=Lax` on all session cookies
- [ ] CSRF tokens on ALL state-changing forms (POST, PUT, DELETE, PATCH)
- [ ] Validate CSRF tokens server-side — not just client-side
- [ ] GET/HEAD/OPTIONS requests NEVER change state
- [ ] `HttpOnly` and `Secure` flags on session cookies
- [ ] CORS policy is as restrictive as possible
- [ ] Using a framework? Check if CSRF protection is enabled (many disable it for APIs!)

## Framework Defaults: The Gotchas 😬

**Laravel:** CSRF protection is ON by default for web routes. But if you're building an API and excluded routes from `VerifyCsrfToken`... did you add `SameSite` cookies? 🤔

**Django:** `CsrfViewMiddleware` is in `MIDDLEWARE` by default. Don't remove it. If you're using `@csrf_exempt`, make sure you have a very good reason.

**Express:** Does NOT include CSRF protection by default. You must add `csurf` or handle it yourself.

**Next.js/React SPA + API:** Your API is stateless with JWTs? You're mostly safe from classic CSRF because JWTs are stored in `localStorage` (not cookies) and aren't auto-attached by browsers. But if you store JWTs in cookies... see everything above.

## Real-World CSRF Disasters 💀

- **Gmail (2007):** CSRF vulnerability let attackers create email filters to silently forward all of a victim's email to the attacker. Just by visiting a page.
- **Netflix (2006):** CSRF allowed attackers to change account details including the primary email — effectively stealing the account.
- **ING Direct (2008):** Banking CSRF that allowed unauthorized money transfers. A bank. In 2008.
- **YouTube (2008):** CSRF let attackers add videos to playlists, add friends, and change settings — all by visiting a malicious page.

These weren't obscure apps. These were major platforms. And they all got hit by a vulnerability with a straightforward fix.

## Quick Test: Is Your App Vulnerable? 🔍

1. Log into your app in one browser tab
2. Open your browser's DevTools → Network tab
3. Submit a state-changing form, note the request
4. Try replaying that exact request from a different origin (Burp Suite, curl, or a simple HTML page)
5. If it succeeds without a CSRF token check → you're vulnerable

```bash
# Quick curl test (replace with your actual endpoint/cookie)
curl -X POST https://yourapp.com/api/transfer \
  -H "Cookie: session=your-session-id" \
  -H "Content-Type: application/json" \
  -d '{"to": "test", "amount": 1}' \
  -v

# If this returns 200 without a CSRF token... fix it immediately!
```

## The Bottom Line

CSRF is one of those attacks that feels like a magic trick the first time you see it. The browser does all the work. The attacker doesn't need credentials. The user doesn't click anything suspicious.

**Your defense checklist:**
1. **`SameSite=Strict` cookies** — stops 99% of CSRF cold
2. **CSRF tokens** — belt + suspenders for sensitive operations
3. **Never change state with GET requests** — this one's non-negotiable
4. **Validate on the server** — client-side checks are decorative

Modern browsers have made CSRF harder to pull off, but "harder" isn't the same as "impossible." Don't wait for an incident report to add two lines to your cookie config.

---

**Worried about CSRF in your app?** Share your setup on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm happy to talk through your specific architecture!

**More security deep-dives on [GitHub](https://github.com/kpanuragh)** — because understanding attacks is the first step to stopping them.

*P.S. — Go add `SameSite=Strict` to your session cookie right now. Seriously. It takes 30 seconds and it'll save Bob's $2,000.* 🎭🔐
