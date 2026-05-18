---
title: "Tabnabbing: The Attack Nobody Warned You About When You Used target=\"_blank\" 🎣"
date: "2026-05-18"
excerpt: "You added target=\"_blank\" to open links in new tabs. Somewhere out there, an attacker just smiled. Here's how tabnabbing turns your innocent HTML into a phishing weapon."
tags: ["security", "web-vulnerabilities", "tabnabbing", "phishing", "javascript", "cybersecurity"]
featured: true
---

# Tabnabbing: The Attack Nobody Warned You About When You Used target="\_blank" 🎣

Let me describe something you've definitely written:

```html
<a href="https://some-external-site.com" target="_blank">Read more</a>
```

Totally innocent, right? Opens in a new tab. User stays on your page. Clean UX.

Except there's an attack — called **tabnabbing** — that weaponizes exactly this. And it's been lurking in the HTML spec since the early days of the web.

Go ahead and open twelve browser tabs to audit your codebase. I'll be here when you get back.

## How Tabnabbing Works

When a link opens with `target="_blank"`, the newly opened tab gets a JavaScript reference to the page that opened it via a global called `window.opener`. That reference is live and writable, which means the new tab can silently change where the original tab is pointing.

Here's the attack, step by step:

1. User is logged into `mybank.com` and clicks an external link
2. A new tab opens — looks harmless
3. That external tab runs `window.opener.location = "https://mybank-login.evil.com"`
4. Your **original** tab navigates silently to the phishing page while the user is reading the new tab
5. User finishes reading, switches back — sees "Your session expired, please log in"
6. User assumes that's normal, enters credentials
7. Credentials sent directly to the attacker

The genius of it — if you can call it that — is that the user's original tab had your real URL in it. They trust it. The phishing page loads after they look away, so they never notice the redirect. If the fake login page is a pixel-perfect clone of yours, they're done.

## The Attack Code Is Embarrassingly Simple

The attacker doesn't need a zero-day. They don't need to hack your server. They just need a site you link to — or a user-submitted link that gets displayed on your platform — and this:

```javascript
// Runs on the attacker's site the moment the tab opens
if (window.opener) {
  window.opener.location = "https://totally-your-bank.evil.com/session-expired";
}
```

That's the entire exploit. A dozen characters of JavaScript abusing a perfectly legal browser API. No magic, no exploit kit, just the DOM doing what it was designed to do.

## The Fix Takes Three Seconds

Add `rel="noopener noreferrer"` to every external link you open in a new tab:

```html
<!-- Vulnerable -->
<a href="https://external.com" target="_blank">Read more</a>

<!-- Safe -->
<a href="https://external.com" target="_blank" rel="noopener noreferrer">Read more</a>
```

- **`noopener`** sets `window.opener` to `null` in the new tab. Attack is dead on arrival.
- **`noreferrer`** also strips the `Referer` header for bonus privacy, and in modern browsers it implies `noopener` — but declare both for belt-and-suspenders coverage.

In React/JSX it's the same deal:

```jsx
<a
  href="https://external.com"
  target="_blank"
  rel="noopener noreferrer"
>
  External Link
</a>
```

If you use ESLint, the `react/jsx-no-target-blank` rule flags every dangerous `target="_blank"` automatically. Add it once and the whole codebase stays clean forever with zero ongoing mental overhead.

## Who Should Actually Be Worried

Tabnabbing is most dangerous in specific scenarios. Ask yourself:

**Does your app display user-submitted links?** Forums, comment sections, social platforms, project management tools — anywhere a user can post a URL. Any of those links could point to an attacker's server. Doesn't matter how clean your own codebase is; if you render their link with `target="_blank"`, they control what that tab does to your page.

**Does your site handle anything sensitive?** Banking, e-commerce, admin dashboards, anything with a login. The more valuable the session, the more worth it is for an attacker to build a convincing phishing page.

**Do your users tab-hop?** Power users who keep dozens of tabs open are the ideal target. They switch between tabs constantly and are more likely to accept "session expired, please log in again" as completely normal.

I've seen this in production more than once during security reviews at Cubet. Internal admin dashboards — handling billing, user accounts, sensitive configuration — linking to vendor documentation with raw `target="_blank"`. One compromised documentation host away from a very bad Tuesday.

## Let's Be Honest About the Risk Level

Tabnabbing isn't remote code execution. The attacker doesn't get into your server, your database, or your infrastructure. What they get is an opportunity to show your user a fake login page while the user's guard is completely down. That's still credential theft. That's still account takeover. That's still a very bad time for you and your users.

The attack shines in phishing campaigns where convincing the user is the whole game.

## Audit Your Codebase Right Now

One grep to find every vulnerable link:

```bash
grep -rn 'target="_blank"' src/ | grep -v 'noopener'
```

Empty output? Good. You're done. Non-empty output? You now have a prioritized list of things to fix before you get coffee.

For ongoing prevention, add `react/jsx-no-target-blank: "error"` to your ESLint config. From that point on, your CI/CD will catch any new vulnerable link before it ships.

## What About Modern Browsers?

Chrome 88+, Firefox 79+, and Safari 12.1+ silently apply `noopener` behavior for cross-origin `target="_blank"` navigations, even without the attribute. So most of your users are protected by default — in theory.

In practice, you still have users on older browsers, embedded webviews inside mobile apps, and automation tools that don't share Chrome 88's opinions about security defaults. More importantly, not writing `rel="noopener noreferrer"` when you mean it is just sloppy. Explicit intent in code is always better than "the browser might handle it." Write the attribute.

## TL;DR

- `target="_blank"` gives the new tab a live `window.opener` reference to your page
- Malicious (or compromised) sites can redirect that reference to a phishing page while you're reading their tab
- Users switch back to find a convincing fake login screen
- **Fix:** always use `rel="noopener noreferrer"` with `target="_blank"`
- **Automate it:** `react/jsx-no-target-blank` in ESLint catches it at the lint stage

This one takes thirty seconds to fix globally and seconds to audit. Go grep your codebase. I'll wait.

---

Found a tabnapping vector hiding in your codebase, or want to argue about whether your link is actually "external enough" to care? I'm [@anuragh_kp on X](https://x.com/anuragh_kp) and [kpanuragh on GitHub](https://github.com/kpanuragh). Come find me — preferably not via a spoofed tab.
