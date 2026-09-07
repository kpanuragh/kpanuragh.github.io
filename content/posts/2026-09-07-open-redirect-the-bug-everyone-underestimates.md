---
title: "↪️ Open Redirect: The Bug Everyone Shrugs Off (Until It Isn't)"
date: 2026-09-07
excerpt: "It's just a redirect, right? No SQL, no XSS, no big deal. Except open redirects are the quiet accomplice in phishing campaigns, OAuth token theft, and SSRF chains — and most triage boards mark them 'informational' and move on."
tags: ["security", "web-security", "appsec", "owasp", "phishing"]
featured: true
---

Every bug bounty hunter has a story about the time they reported an open redirect and got a response that read, more or less, "thanks, but this isn't really a vulnerability." I've written that response myself, early in my career, and I was wrong to be so dismissive about it. Open redirects are the security equivalent of leaving your building's side door propped open with a rock — nobody breaks in *through* it directly, but it's exactly what lets the guy with the fake delivery uniform walk past the front desk without anyone blinking.

Let's talk about why "just a redirect" deserves a real fix instead of a shrug.

## What it actually looks like

An open redirect happens when your app takes a URL from user input and sends the browser there without checking that the destination is somewhere you actually trust:

```javascript
// classic Express example — please don't do this
app.get('/logout', (req, res) => {
  const returnTo = req.query.returnTo;
  // "helpfully" send the user back where they came from
  res.redirect(returnTo);
});
```

Visit `https://yourbank.com/logout?returnTo=https://evi1-bank.com` and the app happily bounces you off to the attacker's clone site. The URL bar shows `yourbank.com` right up until the moment it doesn't — and most people have already stopped reading the address bar by the time they've clicked a link from an email that *said* it was from their bank.

That's the whole vulnerability. No injection, no memory corruption, no clever payload. Just trust, misplaced.

## Why "it's just a redirect" undersells it badly

The reason triage boards downgrade these is that an open redirect, in isolation, doesn't let an attacker read your database or execute code on your server. Fair. But security bugs don't live in isolation — they live in chains, and open redirects are phenomenal middle links.

**Phishing laundering.** Attackers don't send raw phishing links anymore; spam filters and "hover to preview" habits catch those. They send `https://yourtrustedapp.com/redirect?url=https://attacker.com/fake-login`. The link *starts* on your domain, which is enough to survive a lot of email security scanning and enough to convince a skimming human that it's safe.

**OAuth and SSO token theft.** This is the one that should actually scare you. OAuth flows pass tokens or authorization codes back through a `redirect_uri`. If your OAuth provider validates the redirect URI loosely (prefix match instead of exact match, say) and your app *also* has an open redirect sitting on an allowed domain, an attacker can chain the two: get the auth code delivered to your legitimate domain, then have your own open redirect bounce it straight to their server. The token walks right out through a door your own app installed.

**SSRF pivoting.** If a server-side component follows redirects (a webhook fetcher, an image proxy, a "verify this URL" step), an attacker-controlled redirect target can be used to pivot the *server's* request somewhere it shouldn't go — internal metadata endpoints, admin panels on a private network, that sort of thing. The redirect isn't the SSRF; it's the delivery mechanism.

None of those exploits require the open redirect to be "severe" on its own. They require it to exist.

## The fix nobody wants to write because it's boring

The fix is genuinely not clever, which might be why it gets skipped: validate against an allowlist, don't trust the raw parameter.

```javascript
const ALLOWED_REDIRECTS = new Set([
  '/dashboard',
  '/profile',
  '/settings',
]);

app.get('/logout', (req, res) => {
  const returnTo = req.query.returnTo;
  const safePath = ALLOWED_REDIRECTS.has(returnTo) ? returnTo : '/dashboard';
  res.redirect(safePath);
});
```

Notice this allowlists relative *paths*, not domains. That's deliberate — domain allowlisting is the version of this fix that keeps breaking, because "starts with" and "ends with" checks are a minefield:

```javascript
// still broken — attacker registers "yourbank.com.evil.io"
if (returnTo.startsWith('https://yourbank.com')) {
  res.redirect(returnTo); // matches "https://yourbank.com.evil.io" too
}
```

`startsWith('https://yourbank.com')` matches `https://yourbank.com.evil.io` just fine, because strings don't know what a hostname boundary is. If you truly need to redirect across subdomains, parse the URL with `new URL()` and compare `.hostname` against an exact allowlist — never do string matching on a full URL.

```javascript
function isSafeRedirect(target, allowedHosts) {
  try {
    const url = new URL(target, 'https://yourbank.com');
    return allowedHosts.has(url.hostname) && url.protocol === 'https:';
  } catch {
    return false;
  }
}
```

## Where I've seen this bite in practice

At Cubet Techno Labs, one of the more useful things we added to our PR checklist was a one-line question: "does this redirect ever take input from the request?" It sounds almost too simple to matter, but it catches the pattern early — a login flow, a "return to previous page" convenience feature, a webhook confirmation step — before it ships and becomes someone else's incident report six months later. Most of the redirects we found weren't malicious in intent at all; they were just convenience features (`?next=`, `?returnTo=`, `?continue=`) written by someone optimizing for UX, not thinking about who else might supply that parameter.

That's really the pattern worth internalizing: open redirects aren't caused by bad developers, they're caused by *reasonable* developers solving a UX problem ("send the user back to what they were doing") without asking who controls the input.

## The one-line test you can run right now

Grep your codebase for `redirect(` and cross-reference every hit against `req.query`, `req.params`, or `req.body`. If a redirect target ever originates from user input without being checked against an allowlist, you've found one. It won't feel like much. Report it anyway, fix it anyway — because the exploit chain that uses it won't be your problem to see, it'll be your incident responder's problem to explain.

---

Found an open redirect in the wild, or have a war story about one turning into something worse? I'd love to hear it — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp/). And if this saved you from shipping a `?returnTo=` bug, share it with the teammate who's about to add one.
