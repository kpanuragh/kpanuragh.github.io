---
title: "🧨 CSP vs. XSS: The Policy That Keeps Getting Outsmarted (And How to Actually Win in 2026)"
date: "2026-08-03"
excerpt: "You added a Content-Security-Policy header, checked the XSS box, and moved on. Except your policy probably still has 'unsafe-inline' hiding in it, or a JSONP endpoint that lets attackers smuggle scripts right past your allowlist. Here's how nonces, strict-dynamic, and Trusted Types actually close the gaps."
tags:
  - security
  - web-security
  - xss
  - csp
  - appsec
featured: true
---

# 🧨 CSP vs. XSS: The Policy That Keeps Getting Outsmarted (And How to Actually Win in 2026)

Somewhere in your `next.config.ts` or your Express middleware, there's a `Content-Security-Policy` header that someone added during a security audit two years ago, everyone nodded, the ticket got closed, and nobody has looked at it since. I'd bet actual money that policy still has `script-src 'self' 'unsafe-inline'` in it. And if it does, I have bad news: you don't have a CSP. You have a header-shaped placebo.

`unsafe-inline` is the "allow all scripts" of CSP directives. It exists purely for backwards compatibility with the era before CSP, and it defeats the entire point of the header — which is to stop an attacker's injected `<script>` tag from executing even after they've successfully gotten it into your page. If your policy allows inline scripts, an XSS payload doesn't need to bypass your CSP. It just runs. You built a fence and left the gate open.

## Why "just add CSP" isn't a fix, it's a starting line

CSP was never meant to stop XSS from happening — that's still input sanitization and output encoding's job. CSP is your *second* layer: if a payload somehow gets injected (a stored comment field, a reflected query param, a third-party widget that got compromised), CSP is what stops the browser from actually executing it. That distinction matters because it changes how you think about "did we ship CSP" — the header existing is not the same as the header doing anything.

The classic honest policy looks like this, and it's already better than 90% of what's in production:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
```

No `unsafe-inline`, no `unsafe-eval`, no wildcard `*` on `script-src`. This alone kills a huge chunk of reflected and stored XSS, because the attacker's injected `<script>alert(document.cookie)</script>` simply won't run — it's not from `'self'`, full stop.

## The bypass nobody warns you about: JSONP and open redirects on your own allowlist

Here's the part that gets teams burned even after they "did CSP right." Say your `script-src` includes a CDN or an API domain you legitimately use — `script-src 'self' cdn.example.com`. If `cdn.example.com` happens to host a JSONP endpoint (`cdn.example.com/callback?cb=alert(1)`), an attacker can inject `<script src="https://cdn.example.com/callback?cb=alert(document.cookie)">` and your own allowlist just handed them a bypass. Your policy trusted the domain, not the specific file. This is one of the most common real-world CSP bypasses, and it's why scoped, self-hosted script sources beat trusting entire third-party origins whenever you can manage it.

## The fix: nonces + strict-dynamic, not domain allowlists

The 2026-era answer to "but I need some inline scripts / third-party tags" isn't loosening `script-src` to a domain list — it's nonces plus `strict-dynamic`. A nonce is a random, per-request token the server generates and stamps on both the CSP header and the specific `<script>` tags it trusts:

```
Content-Security-Policy:
  script-src 'nonce-r4nd0mPerRequestToken' 'strict-dynamic';
  object-src 'none';
  base-uri 'self';
```

```html
<script nonce="r4nd0mPerRequestToken" src="/app.js"></script>
```

`strict-dynamic` tells the browser: any script loaded *by* a nonce-trusted script is also trusted, but domain allowlists in the same directive are ignored entirely by browsers that support it. That neatly sidesteps the JSONP-bypass problem above, because there's no domain to abuse — trust flows from the nonce, not from "is this URL on our list." The catch, and it's a real one: the nonce has to be generated fresh per request on the server and threaded into your templates, which means static-export or heavily cached pages need a different strategy (hash-based CSP, where you allowlist a SHA-256 hash of each specific inline script's content, works well when your inline scripts are few and stable).

## Trusted Types: closing the DOM-sink hole CSP doesn't cover

Even a tight `script-src` doesn't stop DOM-based XSS through sinks like `innerHTML`, `document.write`, or `eval`-adjacent APIs, because those don't load a "script resource" — they just execute a string as markup or code. This is where `Trusted Types` comes in, and it's worth adopting if you're not already:

```
Content-Security-Policy: require-trusted-types-for 'script';
```

```js
// Without a policy, this now throws instead of silently executing attacker HTML
const policy = trustedTypes.createPolicy('app', {
  createHTML: (input) => DOMPurify.sanitize(input),
});
el.innerHTML = policy.createHTML(userSuppliedContent); // forced through sanitization
```

Once `require-trusted-types-for 'script'` is set, the browser refuses to assign a raw string to a dangerous sink unless it went through a registered policy. Any code path that skipped sanitization just breaks loudly in dev instead of quietly shipping an XSS in prod — which, if you've ever had to explain a stored-XSS incident during an on-call retro, is a much better failure mode.

At Cubet, rolling this out on a client dashboard surfaced about a dozen legacy `innerHTML` assignments we didn't know still existed — some from a jQuery plugin nobody had touched in years. Trusted Types didn't stop an active attack for us; it did something arguably more useful, which was turning "we assume this is safe" into "we can prove this is safe," one enforced policy at a time.

## The one-line summary

`script-src 'self'` is table stakes. Nonces plus `strict-dynamic` is how you handle third-party and dynamically loaded scripts without reopening the JSONP hole. Trusted Types is how you stop the DOM sinks CSP was never designed to see. Ship all three, run in `Content-Security-Policy-Report-Only` first, and actually read the violation reports before you flip enforcement on — because the fastest way to learn your policy is wrong is watching it break your own analytics script in production.

---

Got a CSP bypass story, or a `strict-dynamic` migration that went sideways? I want to hear it. Find me on [GitHub](https://github.com/kpanuragh), [Twitter/X](https://twitter.com/anuragh_kp), or [LinkedIn](https://linkedin.com/in/anuraghkp).
