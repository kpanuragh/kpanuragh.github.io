---
title: "CSRF: The Forged Request Attack That Makes Your Users Do Things They Didn't Ask For 🎭🕵️"
date: "2026-02-26"
excerpt: "Imagine someone tricking you into wiring money just by getting you to visit a website. That's CSRF - and it's been silently attacking users for decades. Let's break it down."
tags: ["cybersecurity", "web-security", "owasp", "csrf", "authentication"]
featured: true
---

# CSRF: The Forged Request Attack That Makes Your Users Do Things They Didn't Ask For 🎭🕵️

Picture this: You're logged into your bank. In another tab, you casually browse a meme site. Suddenly - without clicking anything suspicious - your bank just transferred $500 to a stranger's account. You check your history. The request came from YOUR browser. YOUR IP. YOUR session.

Welcome to **CSRF** - Cross-Site Request Forgery - also known as "sea-surf", one-click attack, or session riding. It's the vulnerability that makes browsers betray their users.

## What is CSRF? 🤔

CSRF tricks an authenticated user's browser into sending an unauthorized request to a website they're already logged into.

The attacker doesn't steal your session token. They don't need to. Your browser **helpfully sends your cookies with every request** - including the malicious ones crafted by the attacker.

**The attack chain:**
1. You log into `bank.com` - your browser stores session cookies
2. You visit `evil-memes.com` without logging out
3. The meme site contains hidden HTML that sends a request to `bank.com/transfer`
4. Your browser, wanting to be helpful, attaches your `bank.com` cookies to the request
5. Bank sees valid session + valid request = money gone 💸

Here's the deceptively simple attack code:

```html
<!-- On evil-memes.com - user never sees this -->
<img src="https://bank.com/transfer?to=attacker&amount=500"
     width="0" height="0"
     style="display:none">
```

That's it. An invisible 0x0 image tag. The browser tries to load the "image", sends your cookies, and the bank server processes it as a legitimate transfer request.

For POST requests, attackers just use an auto-submitting form:

```html
<!-- Auto-fires on page load -->
<form id="csrf-form"
      action="https://bank.com/transfer"
      method="POST">
  <input type="hidden" name="to" value="attacker123">
  <input type="hidden" name="amount" value="5000">
</form>

<script>
  document.getElementById('csrf-form').submit();
</script>
```

User visits the page. Form submits in milliseconds. The damage is done before they can blink. 😱

## Real-World CSRF Disasters 💥

This isn't theoretical. CSRF has caused actual carnage:

**Netflix (2006):** A CSRF flaw let attackers change account email addresses and DVD delivery addresses. Researchers could literally redirect people's Netflix DVDs to themselves.

**YouTube (2008):** A CSRF vulnerability allowed attackers to perform any action on behalf of a logged-in user - adding videos to favorites, subscribing to channels, sending messages. The attacker could basically control your YouTube account while you watched cat videos.

**Samy Worm (2005):** Not pure CSRF, but related - Samy Kamkar exploited MySpace to create a self-propagating worm that added him as a friend to over a million profiles in 20 hours. MySpace had to take the whole site down.

If major platforms with security teams got hit, your app is definitely at risk.

## Why Does This Work? 🍪

The root cause: **browsers automatically attach cookies to every request**, regardless of which website triggered it.

This "feature" was designed for convenience - you don't want to re-login on every page load. But it means any page you visit can silently trigger authenticated requests to other sites.

CSRF thrives when an app relies **solely on session cookies** to verify who's making requests. The server sees:
- ✅ Valid session cookie? YES
- ✅ Correct endpoint? YES
- ✅ User authorized? YES (they logged in, right?)
- ❌ Did the actual user intend this? NOT CHECKED

## The Fix: CSRF Tokens 🛡️

The industry-standard defense is the **synchronizer token pattern** (aka CSRF token). Here's the idea:

1. Server generates a random secret token and stores it in the session
2. Server embeds the token in every form as a hidden field
3. When the form is submitted, server compares the submitted token against the session token
4. If they don't match → rejected ❌

The attacker can't forge the request because they can't read the token from your session (same-origin policy prevents cross-site JavaScript from reading another site's responses).

**In Laravel**, this is built in and dead-simple:

```php
// In your Blade form - @csrf generates the hidden token field
<form method="POST" action="/transfer">
    @csrf
    <input type="text" name="to" placeholder="Recipient">
    <input type="number" name="amount" placeholder="Amount">
    <button type="submit">Transfer</button>
</form>

// Laravel's middleware automatically validates it
// Just ensure VerifyCsrfToken middleware is active (it is by default)
```

**In Express.js**, use the `csurf` package (or the newer `csrf-csrf`):

```javascript
import { doubleCsrf } from 'csrf-csrf';

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    secure: true,
  },
});

// Apply protection to all state-changing routes
app.use('/api', doubleCsrfProtection);

// Send token to frontend
app.get('/csrf-token', (req, res) => {
  res.json({ token: generateToken(req, res) });
});
```

Your frontend then sends the token in a custom header:

```javascript
// Fetch with CSRF token
const response = await fetch('/api/transfer', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': await getCsrfToken(), // grabbed from cookie or endpoint
  },
  body: JSON.stringify({ to: 'recipient', amount: 100 }),
});
```

The attacker can't set custom headers from another origin - that's blocked by CORS. Token in a custom header = CSRF-safe. ✅

## The SameSite Cookie Defense 🍪

Modern browsers added `SameSite` cookie attribute, which tells the browser when to send cookies:

```javascript
// The gold standard setup
res.cookie('session', sessionId, {
  httpOnly: true,    // No JavaScript access
  secure: true,      // HTTPS only
  sameSite: 'Strict', // NEVER sent on cross-site requests
});
```

**`SameSite=Strict`**: Cookie never sent on cross-site requests. Maximum protection. May break some OAuth flows.

**`SameSite=Lax`**: Cookie sent on "safe" cross-site navigations (top-level GET requests). Default in modern browsers. Protects against most CSRF.

**`SameSite=None`**: Always sent (with `Secure` flag required). Use only for cross-site embeds you explicitly allow.

`SameSite=Lax` is the browser's new default, which is why CSRF is *less* catastrophic than it was in 2008. But "less catastrophic" isn't the same as "not a problem". Don't skip CSRF tokens just because browsers are doing some heavy lifting.

## What CSRF Doesn't Do 📋

Knowing the limitations helps you threat-model correctly:

- **Can't read responses** - the attacker fires a request blind; they get no data back
- **Can't bypass CORS for API calls** - CORS preflight blocks custom headers from other origins
- **Can't forge requests if cookies use `SameSite=Strict`** - browser refuses to attach them
- **Doesn't work against pure API tokens** (Bearer tokens, API keys in headers) - those aren't auto-sent by browsers

This is why REST APIs that use `Authorization: Bearer <token>` headers instead of cookies are naturally CSRF-resistant. The attacker can't forge that header from another origin.

## The Checklist ✅

Don't ship without these:

- [ ] CSRF tokens on every state-changing form (POST, PUT, DELETE, PATCH)
- [ ] Validate the CSRF token server-side on every mutation
- [ ] Set `SameSite=Lax` or `Strict` on session cookies
- [ ] Set `HttpOnly` and `Secure` on session cookies
- [ ] Use `Authorization` headers (not cookies) for API endpoints where possible
- [ ] Check `Origin` and `Referer` headers as a secondary defense
- [ ] Never use GET for state-changing operations (that "0x0 image" trick only works on GET)

## Common Mistakes That Get People Hacked 🤦

**"My API uses JSON, so it's safe!"**
Partially true. A JSON Content-Type with a preflight check does add friction. But if your server accepts `text/plain` or `application/x-www-form-urlencoded` fallbacks, you might still be vulnerable. Test it.

**"I check the Referer header!"**
Referer can be stripped by privacy browsers and tools. Never rely on it alone.

**"Users are logged in with OAuth so it's fine!"**
OAuth gives you the *authorization* code - but the final session is still cookie-based. CSRF applies to the session, not the OAuth flow itself.

**"We only get attacked by sophisticated hackers."**
CSRF attacks are literally two HTML tags. Any 15-year-old with a text editor can pull this off once they know about it.

## The Bottom Line 🎯

CSRF is the attack where your users become unwitting accomplices. They didn't do anything wrong - they just had your site open in another tab.

The good news: fixing it properly takes about 30 minutes with a modern framework. The bad news: ignoring it can mean forged password changes, unauthorized purchases, account deletions, and very angry users.

**Your action items:**
1. Check if `SameSite` cookies are set (they probably are if you're on a modern framework)
2. Verify CSRF middleware is active on all state-changing routes
3. Run a quick test: can you trigger a POST action from a different domain's page?
4. Add the CSRF header check to your API security review checklist

Stay paranoid. Your users are counting on it. 🔐

---

**Had a CSRF close call or war story?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I love hearing from developers who've found these in the wild.

**Building something secure?** Check out my [GitHub](https://github.com/kpanuragh) for security-focused projects and code examples. 🛡️

*Remember: your session cookies are loyal little dogs - they'll follow anyone home if you let them.* 🐕🍪
