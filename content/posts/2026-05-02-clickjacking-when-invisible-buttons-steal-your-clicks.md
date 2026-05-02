---
title: "🖱️ Clickjacking: When Invisible Buttons Steal Your Clicks"
date: 2026-05-02
excerpt: "Your users think they're clicking 'Play Video' but they're actually approving a bank transfer. Clickjacking is sneaky, underrated, and embarrassingly easy to fix — if you know it exists."
tags: ["Security", "Web Security", "OWASP", "Frontend", "HTTP Headers"]
featured: true
---

Picture this: your user visits a sketchy website promising free Netflix. They see a big "Click here to continue" button. They click it. Nothing happens on the sketchy site — but somewhere else, an action just fired on their bank's website, your SaaS dashboard, or their social media account.

They clicked a button they couldn't see. You shipped a button that could be weaponized.

Welcome to **clickjacking** — the attack that turns your legitimate UI into an invisible hitman.

## How It Actually Works

Clickjacking is deceptively simple. An attacker embeds your website in an invisible `<iframe>` overlaid on top of their own page. They position a juicy-looking fake button on their page *exactly* where your "Delete Account" or "Approve Transaction" button lives in the hidden iframe.

User clicks their button. Your button actually fires.

Here's the minimal attack setup — don't deploy this, just understand it:

```html
<!-- attacker's evil page -->
<style>
  iframe {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    opacity: 0;          /* invisible to the victim */
    z-index: 999;        /* on top of everything */
    pointer-events: all;
  }
  #fake-button {
    position: absolute;
    top: 312px; left: 180px; /* carefully aligned with victim's button */
    z-index: 1;
  }
</style>

<button id="fake-button">▶ Play Free Movie</button>
<iframe src="https://your-legitimate-app.com/account/delete"></iframe>
```

The attacker measures where your "Confirm" button appears on the page (easy — they just load your site in their browser), sets the iframe opacity to 0, and positions their fake button over yours. The user sees the fake button. Their click lands on yours.

The opacity can even be set to `0.01` — technically "transparent" but enough to defeat some basic defenses. Some attackers animate the iframe to drift under the cursor as the mouse moves. The creativity here is genuinely unsettling.

## Who Gets Hit

You might think "my app isn't that important." But clickjacking doesn't need you to be a bank. Real-world attack scenarios:

- **Social media**: tricking users into liking pages, following accounts, or sharing posts
- **Email clients**: confirming "delete all emails" or forwarding rules to an attacker
- **SaaS dashboards**: approving invites, changing billing plans, deleting data
- **OAuth flows**: authorizing an attacker's app with the victim's account
- **Video cameras**: some older browsers exposed camera/microphone permission dialogs — attackers used clickjacking to get users to "accept" access

Facebook paid out bug bounties for clickjacking vulns that let attackers auto-like their own pages. Adobe had a Flash clickjacking issue that enabled webcam access. This is real.

## The Fix: One Header

Here's the beautiful part. The fix is almost insultingly simple. One HTTP response header, and you're done:

```
X-Frame-Options: DENY
```

That's it. When a browser sees this header on your page's response, it refuses to render your page inside any `<iframe>`, `<frame>`, or `<object>`. No iframe embedding = no clickjacking.

You have two options:

- `DENY` — nobody can frame your page, ever
- `SAMEORIGIN` — only pages from your own origin can frame you (useful for legitimate same-site iframes)

The modern, more flexible way is via Content Security Policy:

```http
Content-Security-Policy: frame-ancestors 'none';
```

Or if you want to allow same-origin framing:

```http
Content-Security-Policy: frame-ancestors 'self';
```

`frame-ancestors` wins over `X-Frame-Options` when both are present in modern browsers, and it lets you whitelist specific domains:

```http
Content-Security-Policy: frame-ancestors 'self' https://trusted-partner.com;
```

This is perfect if you legitimately embed your own app in a dashboard — you can allow just that one trusted origin.

## Setting It in Your Stack

In **Express.js**, use the `helmet` package which sets sensible defaults including this header:

```javascript
import helmet from 'helmet';

app.use(helmet()); // sets X-Frame-Options: SAMEORIGIN by default

// or explicitly:
app.use(helmet.frameguard({ action: 'deny' }));
```

In **Laravel**, add it to your middleware or global response:

```php
// In a middleware or AppServiceProvider
public function boot(): void
{
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: frame-ancestors 'none'");
}
```

Or configure it in your web server. **Nginx**:

```nginx
add_header X-Frame-Options "DENY" always;
add_header Content-Security-Policy "frame-ancestors 'none'" always;
```

The `always` flag ensures the header is sent even on error responses — important because attackers don't only target 200 OK pages.

## The Browser-Side Defense (That Isn't Enough)

You may have heard of "frame-busting" JavaScript — the old technique of checking if your page is in an iframe and redirecting out:

```javascript
// Old school, DO NOT rely on this
if (window.top !== window.self) {
  window.top.location = window.self.location;
}
```

This sounds clever but it fails completely against the `sandbox` iframe attribute:

```html
<iframe src="https://victim.com" sandbox="allow-forms allow-scripts"></iframe>
```

The `sandbox` attribute prevents the framed page's JavaScript from navigating the parent. Your frame-buster runs, tries to navigate, and silently fails. The attacker still wins.

**Always use HTTP headers. JavaScript frame-busting is a false sense of security.**

## Check Yourself Right Now

Open your browser DevTools on your production app. Go to the Network tab, click your main page request, and look at the Response Headers. Do you see `X-Frame-Options` or a `Content-Security-Policy` with `frame-ancestors`?

No? Go fix that before you finish reading this sentence.

You can also use [securityheaders.com](https://securityheaders.com) to scan your domain and get a report card. Aim for an A. An F means you're one crafty iframe away from your users clicking things they didn't intend to.

## The Bottom Line

Clickjacking is one of those vulnerabilities that feels almost unfair — your code is perfectly correct, your logic is sound, and you still get exploited because someone wrapped you in an invisible iframe. The attack lives at the browser level, not the application level.

The good news: the fix is a single HTTP header. Literally one line of configuration. The OWASP recommended approach fits in a tweet.

There's no excuse for shipping without `X-Frame-Options: DENY`. Add it today, add it to your security checklist, and add it to your PR review template. Your users' invisible clicks will thank you.

---

Found this helpful? Found a clickjacking vulnerability in the wild? Come argue about `DENY` vs `SAMEORIGIN` with me on [GitHub](https://github.com/kpanuragh) or drop your thoughts below. Stay paranoid out there.
