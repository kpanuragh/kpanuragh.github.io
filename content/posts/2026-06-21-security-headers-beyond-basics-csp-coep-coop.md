---
title: "🛡️ Security Headers Beyond the Basics: CSP, COEP, COOP and the Art of Browser Lockdown"
date: "2026-06-21"
excerpt: "You added Strict-Transport-Security and called it a day. Cute. Let's talk about the headers that actually stop modern browser-level attacks — Content Security Policy, Cross-Origin Embedder Policy, and Cross-Origin Opener Policy."
tags:
  - security
  - web-security
  - http-headers
  - csp
  - defensive-engineering
featured: true
---

You deployed your app. You added `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`. You ran it through a security scanner, got a green badge, and felt good about yourself.

Then a researcher DMed you with a Spectre-style timing attack demo running in a browser tab.

Not cute.

The web platform has evolved. Attacks have evolved. And the security headers landscape has quietly grown a second floor that most developers never visit. Let's go upstairs.

---

## Floor 1: The Basics Everyone Knows (and Forgets to Actually Configure)

Before we go exotic, a quick checkpoint. These should be on every response by default:

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

If any of these are missing, stop reading and go add them. I'll wait.

Okay, welcome back. Now for the fun stuff.

---

## Floor 2: Content Security Policy — The One Everyone Gets Wrong

CSP is the most powerful and most cargo-culted header in existence. I've seen production apps with:

```http
Content-Security-Policy: default-src *; script-src * 'unsafe-inline' 'unsafe-eval'
```

That's not a Content Security Policy. That's a content *freedom* policy. You might as well hang a sign that says "XSS Welcome."

A proper CSP restricts where resources can be loaded from. Here's a realistic baseline for a modern SPA:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{RANDOM_NONCE}';
  style-src 'self' 'nonce-{RANDOM_NONCE}';
  img-src 'self' data: https://cdn.yourdomain.com;
  font-src 'self';
  connect-src 'self' https://api.yourdomain.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
```

A few things that matter here:

**`'nonce-{RANDOM_NONCE}'`** — Instead of allowing all inline scripts with `'unsafe-inline'`, generate a cryptographically random nonce per request and stamp it on your `<script>` tags. Attackers injecting scripts won't know the nonce. This is the modern way.

**`frame-ancestors 'none'`** — This is the CSP replacement for `X-Frame-Options`. More expressive, and it can take a list of allowed origins instead of just deny-all.

**`form-action 'self'`** — Stops form hijacking attacks where a CSRF or XSS payload could redirect form submissions to an attacker's server.

**`base-uri 'self'`** — Prevents `<base>` tag injection, which can redirect all relative URLs to an attacker's domain. A weirdly underappreciated attack vector.

At Cubet, we use a middleware layer that injects the nonce into both the CSP header and the rendered HTML during SSR. Sounds annoying to wire up — it is, once. After that, CSP violations get reported to a `/csp-report` endpoint and show up in our observability stack, which means we find third-party script misbehavior before users do.

---

## Floor 3: COOP and COEP — Cross-Origin Isolation Is a Thing Now

After Spectre and Meltdown broke the internet's mental model of hardware-level isolation, browser vendors responded by restricting access to high-resolution timers and shared memory. The APIs that got hit: `SharedArrayBuffer`, `performance.measureUserAgentSpecificMemory()`, and parts of `Atomics`.

To get them back — and to properly isolate your origin from cross-origin side-channel attacks — you need two headers working together:

### Cross-Origin-Opener-Policy (COOP)

```http
Cross-Origin-Opener-Policy: same-origin
```

This severs the browsing context group between your page and any window it opens (or that opens it) from a different origin. Without this, a cross-origin page can hold a reference to your `window` object and use timing to infer memory contents.

`same-origin` is the strict setting. `same-origin-allow-popups` is the middle ground if you legitimately need to open cross-origin popups (OAuth flows, payment SDKs) and still get some protection.

### Cross-Origin-Embedder-Policy (COEP)

```http
Cross-Origin-Embedder-Policy: require-corp
```

This one requires that every resource loaded by your page either:
- Comes from the same origin, or
- Explicitly opts in via the `Cross-Origin-Resource-Policy` header

This means if you embed an image, iframe, or script from a third party, that third party needs to say `Cross-Origin-Resource-Policy: cross-origin` on their response. This stops you from accidentally loading data from a cross-origin resource and having it be accessible to speculative-execution attacks.

Together, COOP + COEP give you **cross-origin isolation**, which the browser exposes via:

```js
console.log(crossOriginIsolated); // true — you're now in a locked-down context
```

Only then can you safely use `SharedArrayBuffer` again.

The catch? If any embedded third-party resource doesn't send `Cross-Origin-Resource-Policy`, your page breaks. Auditing this in a large app with multiple CDNs, embedded widgets, and legacy iframes is... character-building. We spent an afternoon last quarter at Cubet replacing a handful of external image embeds with proxied versions just to get COEP working cleanly.

### The Third Sibling: CORP

```http
Cross-Origin-Resource-Policy: same-origin
```

This one goes on your *resources*, not your pages. It tells the browser "only my own origin can load this." Use `cross-origin` when you intentionally serve assets (fonts, images) to other origins. Use `same-origin` or `same-site` for APIs and internal assets that should never be embedded elsewhere.

---

## Putting It All Together

Here's a quick mental checklist for header hardening:

| Goal | Header |
|---|---|
| Prevent XSS resource injection | `Content-Security-Policy` with nonces |
| Kill clickjacking | `frame-ancestors 'none'` inside CSP |
| Prevent MIME sniffing | `X-Content-Type-Options: nosniff` |
| Isolate your browsing context | `Cross-Origin-Opener-Policy: same-origin` |
| Enable cross-origin isolation | `Cross-Origin-Embedder-Policy: require-corp` |
| Lock down your static assets | `Cross-Origin-Resource-Policy: same-origin` |
| Stop form hijacking | `form-action 'self'` in CSP |

Use [securityheaders.com](https://securityheaders.com) to grade your current setup. The gap between an A and an A+ is usually COOP + COEP — most apps never get there.

---

## The Real Takeaway

Security headers are free. They're a few lines in your reverse proxy config, a middleware function, or an `_headers` file if you're on Netlify/Vercel. The cost is nearly zero. The protection surface they add covers entire categories of browser-level attacks that no amount of input sanitization will stop.

Floor 1 is table stakes. Floor 2 (CSP done right) requires some upfront investment in nonce plumbing. Floor 3 (COOP/COEP) requires buy-in from your third-party dependencies. None of them are optional if you're serious about defense.

The attacker doesn't need root. They just need a browser tab and a header you forgot to set.

---

Found a gap in your own headers? Hit me up on [Twitter/X](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh) — always happy to talk browser security, CSP gotchas, and the fun of auditing third-party embeds at 11pm.
