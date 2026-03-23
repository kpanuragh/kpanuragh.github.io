---
title: "CSRF: The Attack That Makes Your Users Do Things They Didn't Mean To 🎭"
date: "2026-03-17"
excerpt: "Your users are logged in, authenticated, and trusting your app with their data. Now imagine a malicious website quietly making requests on their behalf — transferring money, changing passwords, deleting accounts — without them ever clicking anything suspicious. Welcome to CSRF, the sneaky impersonation attack that's been around forever and still bites developers daily."
tags: ["\\\"security\\\"", "\\\"csrf\\\"", "\\\"web-security\\\"", "\\\"authentication\\\"", "\\\"owasp\\\""]
featured: "true"
---

# CSRF: The Attack That Makes Your Users Do Things They Didn't Mean To 🎭

**Picture this:** Your user opens their bank's web app, logs in, and checks their balance. They don't log out (because nobody does). Then they click a link from an email — "You won't believe this cat video!" — and suddenly $2,000 moves out of their account. They never clicked "Transfer." They never saw a form. They just watched a cat video. 😿

Welcome to **Cross-Site Request Forgery (CSRF)** — one of the most elegant (and infuriating) attacks on the web.

It's been on the OWASP Top 10 for years. Frameworks have built-in protections for it. And developers *still* ship apps vulnerable to it in 2026. Let's fix that today. 🎯

## How CSRF Actually Works 🧠

Your browser has a feature that feels helpful: it automatically attaches cookies to every request made to a domain — even if that request originates from a *completely different website*.

Here's the evil genius of CSRF in three acts:

**Act 1 — The Setup:** Your user logs into `yourbank.com`. The server sets a session cookie. Browser stores it.

**Act 2 — The Trap:** The attacker hosts this innocent-looking HTML on `evil.com`:

```html
<!-- This lives on evil.com -->
<html>
  <body onload="document.forms[0].submit()">
    <form action="https://yourbank.com/transfer" method="POST">
      <input type="hidden" name="to_account" value="attacker-account-123" />
      <input type="hidden" name="amount" value="2000" />
    </form>
    <h1>You won a prize! 🎉</h1>
  </body>
</html>
```

**Act 3 — The Punchline:** The user visits `evil.com` while still logged into `yourbank.com`. The form auto-submits. The browser dutifully sends the session cookie along with the POST request. The bank server sees a valid authenticated request and happily transfers $2,000. 💸

The user sees a "You won a prize!" heading for half a second before the redirect. By then, it's done.

**The terrifying part?** The server has NO idea this request didn't come from the user's own browser tab. It just sees: valid session cookie ✅, valid POST body ✅, process request ✅.

## Real-World Impact — This Isn't Theoretical 💥

CSRF has caused some spectacular breaches:

- **Netflix (2006):** A CSRF flaw let attackers add DVDs to victims' queues, change shipping addresses, and alter account settings.
- **YouTube (2008):** Attackers could add videos to your favorites and subscribe to channels — at scale, great for fake engagement fraud.
- **ING Direct:** A bank account was used to illegally create a new account to transfer money into.

Modern frameworks have mostly killed the easy cases, but **custom APIs, mobile backends, and misconfigured SPAs** are still ripe targets. 🎯

## The Fix: CSRF Tokens 🛡️

The standard defense is a **synchronizer token** — a random, secret value tied to the user's session that must be included in every state-changing request. The attacker on `evil.com` can't read this token (same-origin policy blocks cross-origin reads), so they can't forge a valid request.

Here's how it looks in a Node.js/Express app using the `csurf` middleware (or its modern replacement `csrf-csrf`):

```javascript
import { doubleCsrf } from "csrf-csrf";
import cookieParser from "cookie-parser";

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: "__Host-psifi.x-csrf-token",
  cookieOptions: {
    sameSite: "strict",
    secure: true, // HTTPS only
    httpOnly: true,
  },
});

// Generate a token and send it to the client
app.get("/csrf-token", (req, res) => {
  res.json({ csrfToken: generateToken(req, res) });
});

// Protect all state-changing routes
app.use(doubleCsrfProtection);

app.post("/transfer", (req, res) => {
  // If we get here, the CSRF token was valid
  processTransfer(req.body);
  res.json({ success: true });
});
```

Your frontend includes the token in every mutating request:

```javascript
// Fetch the token once on page load
const { csrfToken } = await fetch("/csrf-token").then(r => r.json());

// Include it in every POST/PUT/DELETE
await fetch("/transfer", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrfToken, // <-- the magic
  },
  body: JSON.stringify({ to: "friend@example.com", amount: 50 }),
});
```

The attacker on `evil.com` can't read your `/csrf-token` endpoint (blocked by CORS) and doesn't know the secret value — so their forged request gets a 403. 🚫

## The Modern Shortcut: SameSite Cookies 🍪

If you're building a modern app, `SameSite=Strict` or `SameSite=Lax` on your session cookie is your first line of defense:

```
Set-Cookie: session=abc123; SameSite=Strict; Secure; HttpOnly
```

- **Strict:** Cookie is *never* sent on cross-site requests. Locks down CSRF completely. May break OAuth flows.
- **Lax:** Cookie is sent on top-level navigations (clicking a link) but NOT on cross-site sub-requests (forms, iframes, images). Blocks the classic CSRF pattern.

Most modern browsers default to `Lax` now — which is why CSRF is less catastrophic than it was in 2006. But "less catastrophic" isn't "gone." You still need CSRF tokens for `Lax` mode, since `GET` requests with side effects (yes, some devs still do this 😬) and certain `POST` navigation patterns remain exploitable.

## The Checklist: Don't Skip These ✅

- **Use CSRF tokens** for all state-changing endpoints (POST, PUT, PATCH, DELETE)
- **Set `SameSite=Strict`** on session cookies (use `Lax` only if you have a reason)
- **Set `Secure` and `HttpOnly`** on all auth cookies
- **Check the `Origin`/`Referer` header** as a secondary validation layer
- **Never use GET for state changes** — this violates REST principles *and* is a CSRF nightmare
- **Framework protections are on by default — don't turn them off.** (I've seen `@csrf_exempt` sprinkled everywhere in Django apps. Don't.)

```python
# Django example — the right way
from django.views.decorators.csrf import csrf_protect

@csrf_protect  # Explicit is better than implicit
def transfer_funds(request):
    if request.method == "POST":
        # Django already validates the CSRF token here
        process_transfer(request.POST)
```

## The Bottom Line 🎯

CSRF is one of those attacks that feels theoretical until it happens to your users. The defenses are well-understood, battle-tested, and built into every major framework. There's no excuse for shipping CSRF-vulnerable code in 2026.

The recipe is simple:
1. CSRF tokens on every state-changing endpoint
2. `SameSite=Strict` (or at minimum `Lax`) on your session cookie
3. HTTPS everywhere (so cookies can be `Secure`)
4. Never trust the browser's implicit authentication alone

Your users are trusting you to protect them — even from attacks they don't know exist and wouldn't recognize if they saw one. That's a serious responsibility. Take it seriously. 🔐

---

**Found this useful?** Share it with a dev friend who's still setting their session cookies without `SameSite`. You might save them from a very awkward phone call. 📞

**Follow me on GitHub** [@kpanuragh](https://github.com/kpanuragh) for more security write-ups, or drop your CSRF war stories in the comments below. I promise I'll be horrified and entertained in equal measure. 😅
