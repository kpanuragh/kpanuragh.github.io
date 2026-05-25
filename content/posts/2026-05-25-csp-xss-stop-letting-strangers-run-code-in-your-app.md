---
title: "🛡️ CSP in 2026: Stop Letting Strangers Run Code in Your App"
date: "2026-05-25"
excerpt: "Content Security Policy is the seatbelt your web app isn't wearing. Here's how to strap in properly and actually block XSS attacks before they wreck your users."
tags:
  - security
  - web
  - csp
  - xss
  - javascript
featured: true
---

Cross-Site Scripting (XSS) has been on the OWASP Top 10 since the list existed. We've written sanitizers, escaped HTML, and shaken our fists at the sky — and yet, in 2026, XSS is still quietly stealing session tokens and defacing apps on production servers everywhere.

The thing is, sanitization alone is playing whack-a-mole. You miss one `<img onerror>` or a sneaky unicode bypass, and suddenly your app is running someone else's JavaScript. There's a second line of defense most developers under-use: **Content Security Policy (CSP)**. When it's set up correctly, even if an attacker injects a script, the *browser* refuses to run it.

Let's fix that.

## What CSP Actually Does

CSP is an HTTP response header that tells the browser: "Only execute scripts from *these* sources. Anything else? Drop it."

It doesn't replace input sanitization — it's your fallback when sanitization fails. Think of it as a burglar alarm *after* you've already locked the door.

The header looks like this:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.example.com; object-src 'none'; base-uri 'self';
```

That tells the browser:
- Load everything from the same origin by default
- Scripts can come from `self` and one trusted CDN
- No `<object>`, `<embed>`, or `<applet>` (classic XSS vectors)
- `<base>` tags can only point to `self` (prevents base-URI hijacking)

Simple in principle, surprisingly nuanced in practice.

## The Trap: Unsafe Directives That Gut Your Policy

Here's the policy I found in a client codebase when I joined Cubet — not the worst I've seen, but definitely broken:

```
Content-Security-Policy: default-src 'self' 'unsafe-inline' 'unsafe-eval'
```

`'unsafe-inline'` allows inline `<script>` tags and `onclick` attributes. `'unsafe-eval'` allows `eval()`. Together, they make CSP almost completely useless against XSS — you've basically told the browser "run whatever's in the page."

These appear in codebases because some bundler or analytics snippet needed them once, and rather than fixing the root cause, someone just unlocked the whole policy. Classic.

### Using Nonces Instead

The modern fix for inline scripts is nonces. You generate a cryptographically random value per request and stamp it on every legitimate `<script>` tag. CSP only runs scripts with *that* nonce.

```javascript
// Express middleware — generate a nonce per request
import crypto from 'crypto';

app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'nonce-${res.locals.cspNonce}'; object-src 'none';`
  );
  next();
});
```

```html
<!-- In your template — the nonce matches what the server sent -->
<script nonce="<%= cspNonce %>">
  // This runs. An attacker's injected script without the nonce? Blocked.
  initApp();
</script>
```

The attacker can't know the nonce (it changes every request), so their injected `<script>` tag runs without one and the browser drops it cold.

## Hashes: The Static-Script Option

If you have a script that never changes — say, a small inline initialization snippet — you can use a hash instead of a nonce:

```
Content-Security-Policy: script-src 'sha256-abc123XYZ...=='
```

You compute the SHA-256 of the exact script content and put it in the policy. The browser runs the script only if the content matches the hash. Change even a single character and it's blocked.

This is great for static sites (like this blog) where you can't inject a per-request nonce. Generate the hashes at build time and bake them into the policy.

## Report-Only Mode: Deploy Without Breaking Everything

The reason developers avoid strict CSP: they're afraid of breaking the app. The fix is `Content-Security-Policy-Report-Only`.

```
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; report-uri /csp-violations
```

In report-only mode, violations are *logged* but not *blocked*. You get all the signal with zero breakage. Run it for a week, review the violation reports, fix your legitimate sources, then flip it to enforcing.

At Cubet, this is the rollout playbook we use on every brownfield project. Deploy report-only, collect data, tighten the policy over a sprint or two, then switch to enforcement. It turns a scary change into a boring iterative process.

## The 2026 CSP Checklist

Here's the minimum viable strict policy for a modern web app:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{RANDOM}';
  style-src 'self' 'nonce-{RANDOM}';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://api.yourdomain.com;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
```

Key additions beyond the basics:
- `frame-ancestors 'none'` — blocks your page from being iframed (clickjacking prevention, replaces the old `X-Frame-Options` header)
- `upgrade-insecure-requests` — browser upgrades HTTP subrequests to HTTPS automatically
- `connect-src` — locks down `fetch()` and `XMLHttpRequest` so injected scripts can't exfiltrate data to random endpoints

## Common Gotchas

**Third-party scripts**: Google Tag Manager, analytics, chat widgets — they all load more scripts dynamically. You'll need `'strict-dynamic'` in your `script-src` if a trusted script needs to load children. Without it, every dynamically-inserted script is blocked. With it, scripts loaded by a nonced parent are trusted transitively.

**CSS injection**: Don't forget `style-src`. Inline styles can be used for data exfiltration via CSS timing attacks. Lock those down with nonces too.

**Subresource Integrity (SRI)**: Pair CSP with SRI for external CDN scripts. If someone compromises the CDN and swaps the script, the hash mismatch blocks it.

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous"
></script>
```

## The Bottom Line

CSP is not a silver bullet — broken HTML parsers, DOM-based XSS in your own JavaScript, and misconfigured nonce generation can still create holes. But a well-deployed CSP turns XSS from "game over, session tokens exfiltrated" into "blocked, logged, reported."

In 2026, there's no excuse to ship a web app without one. Start in report-only mode today, spend a sprint cleaning up the violations, and you'll have a defense layer that costs almost nothing and stops a whole class of attacks dead.

Your users' cookies will thank you.

---

Got a gnarly CSP violation you can't figure out, or a legacy app full of `unsafe-inline` that you're trying to dig out of? Find me on [Twitter/X](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — always happy to talk security.
