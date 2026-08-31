---
title: "CSRF in Modern SPAs: Why SameSite Cookies Won't Save You 🍪🎭"
date: "2026-08-31"
excerpt: "Everyone shipped SameSite=Lax, declared CSRF dead, and moved on. Then they added a subdomain, a CDN, a mobile webview, or a 'helpful' GET endpoint that mutates state — and CSRF quietly walked back in through the side door."
tags: ["security", "csrf", "web-security", "spa", "appsec"]
featured: true
---

Somewhere around 2020, a rumor started going around engineering Slack channels: "CSRF is basically solved now, browsers default cookies to `SameSite=Lax`." Everyone nodded, ripped out their CSRF tokens to simplify the frontend, and moved on to arguing about state management libraries instead.

I want to be the person who ruins that rumor for you, because I've watched it bite real applications — including one at a company I won't name where a `SameSite=Lax` cookie and a "harmless" GET endpoint combined to let an attacker silently downgrade a user's account plan from a link in an email. Nobody got hacked in the dramatic movie-hacker sense. Someone just clicked a link.

## Quick refresher: what CSRF actually exploits

Cross-Site Request Forgery abuses the fact that browsers attach cookies to requests automatically, regardless of which site *triggered* the request. If you're logged into `bank.com` and you visit `evil.com`, and `evil.com` has a form or script that fires a request to `bank.com/transfer`, your browser happily attaches your `bank.com` session cookie. The bank's server sees a authenticated request and has no idea it originated from a page you never meant to trust.

`SameSite` cookies were supposed to fix this at the platform level:

- `SameSite=Strict` — cookie never sent cross-site, full stop.
- `SameSite=Lax` (the modern default) — cookie sent on top-level navigations (clicking a link) but not on cross-site subrequests like `fetch`, images, or iframes.
- `SameSite=None` — old behavior, cookie always sent, requires `Secure`.

`Lax` being the default genuinely killed off a huge class of classic CSRF — the `<img src="bank.com/transfer?to=attacker&amount=1000">` style attacks are mostly dead for POST-only mutating endpoints. That's real progress. It's also where a lot of teams stopped thinking about the problem.

## Where "SameSite is enough" quietly falls apart

**1. GET requests that mutate state.** `SameSite=Lax` still sends cookies on top-level navigation — which includes a user clicking a plain `<a href>` link, or a browser following a redirect. If your app has *any* state-changing action reachable via GET (an "unsubscribe" link, a "confirm" action, a legacy endpoint someone wired up for convenience), Lax does nothing to stop it. This is the exact bug I saw: a downgrade-plan action was originally built as a GET for a one-click email link, and nobody revisited it once "the frontend uses fetch/POST everywhere now."

**2. Subdomain trust.** `SameSite` is scoped to the *site* (registrable domain), not the origin. If your app has `app.example.com` serving the SPA and cookies scoped to `.example.com`, then anything running on `uploads.example.com`, `staging.example.com`, or a forgotten `old-marketing.example.com` that an attacker manages to get script execution on (via an XSS, a misconfigured S3 bucket, or an expired subdomain takeover) is same-site by the cookie's definition. `SameSite` was never designed to protect against your own infrastructure.

**3. `SameSite=None` creeping back in.** SPAs that need cross-site cookies for legitimate reasons — third-party embeds, cross-origin auth flows, iframe widgets sold to other companies — end up setting `SameSite=None; Secure` somewhere in the stack, sometimes just for one endpoint. That one endpoint reintroduces classic CSRF exposure for whatever it touches.

**4. Non-browser and legacy clients.** Mobile app webviews, some in-app browsers, and older Safari/Chromium forks have historically had inconsistent or buggy `SameSite` enforcement. If your API is also consumed by a mobile app's webview, you can't fully rely on the browser doing the right thing for every user.

## What actually holds up: origin checks + tokens, still

The boring, unglamorous defense-in-depth answer is still the right one. `SameSite=Lax` is a good *baseline*, not a replacement for these:

**Verify the request's origin server-side**, independent of cookies:

```javascript
// Express middleware — belt-and-suspenders alongside SameSite
function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin') || req.get('referer');
  const allowed = ['https://app.example.com'];

  if (req.method !== 'GET' && !allowed.some(o => origin?.startsWith(o))) {
    return res.status(403).json({ error: 'Origin not trusted' });
  }
  next();
}
```

**Never let a mutating action be reachable via GET.** This sounds obvious written down, but audit every endpoint that changes state — unsubscribe links, "one-click confirm" emails, webhook-triggered actions — and make sure they either require a POST with a token, or are idempotent read-then-confirm flows instead of raw GET mutations.

**Use a double-submit or synchronizer CSRF token for anything sensitive**, especially money movement, account changes, or admin actions — even in an SPA that's "mostly SameSite protected":

```javascript
// Server issues a token tied to the session, client echoes it back
// in a custom header (which cross-site forms/images cannot set)
app.post('/api/account/downgrade', (req, res) => {
  if (req.headers['x-csrf-token'] !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  // proceed
});
```

That custom-header trick is doing more work than it looks like — a cross-site form submission or `<img>` tag literally cannot set arbitrary request headers, so requiring *any* custom header on mutating requests (even without a fancy token scheme) closes off a huge chunk of the attack surface for free.

## The actual takeaway

`SameSite=Lax` raised the floor for the entire web, and that's genuinely worth celebrating. But it's a cookie attribute solving a cookie-transmission problem — it was never designed to reason about your subdomain sprawl, your legacy GET endpoints, or the webview your mobile team bolted on last quarter. Treat it as one layer, verify origin server-side, keep tokens on anything that moves money or changes account state, and audit your app for GET requests doing things a GET request should never do.

If you've got a "SameSite fixed CSRF, we removed the tokens" line item in a security review from a couple years back, that's worth revisiting — infrastructure and endpoints both drift, and the guarantee you audited against might not be the guarantee you actually have anymore.

---

Found a GET endpoint in the wild doing something it shouldn't? I'd genuinely like to hear about it. Come argue with me:

🐦 [Twitter/X](https://twitter.com/kpanuragh) · 💼 [LinkedIn](https://linkedin.com/in/kpanuragh) · 🐙 [GitHub](https://github.com/kpanuragh)
