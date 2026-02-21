---
title: "Open Redirect: Congrats, Your Website Is a Phishing Tool Now 🎣"
date: "2026-02-21"
excerpt: "You didn't build a phishing page. But an attacker is using your trusted domain to redirect victims to one. Open redirect — the vulnerability that makes your good reputation work against you."
tags: ["cybersecurity", "web-security", "security", "phishing", "owasp"]
featured: false
---

# Open Redirect: Congrats, Your Website Is a Phishing Tool Now 🎣

Imagine this: You spend years building a trusted brand. Your domain has a green padlock. Users click links to your site without a second thought. Security teams have taught people to "check the URL" before clicking.

Then someone sends this in a phishing email:

```
https://your-totally-legit-company.com/login?next=https://evil-clone-of-your-site.com/steal-passwords
```

Your domain. Their payload. Your users' credentials.

Welcome to **open redirect** — the vulnerability that turns your hard-earned trust into an attacker's free pass.

## What Even Is an Open Redirect? 🤔

It's embarrassingly simple.

An open redirect happens when your application takes a URL from user input — a query parameter, a form field, a cookie — and blindly redirects the browser there. No validation. No allowlist. No questions asked.

The classic example? Login pages with a `next` or `redirect_url` parameter:

```
https://myapp.com/login?next=/dashboard
```

Totally normal, right? You want to send users back where they came from after logging in. Thoughtful UX. Except...

```
https://myapp.com/login?next=https://myapp.com.evil-hacker.com/fake-login
```

Your server reads that `next` parameter, the user logs in, and then your code does:

```php
// The "convenient" code that's quietly ruining your day
return redirect($request->get('next'));
```

Boom. User is now on a fake login page that looks exactly like yours, still thinking they're in a safe flow because they started from your trusted domain. They re-enter their password on the cloned site. You've just helped harvest credentials without writing a line of malicious code.

As someone passionate about security, I've seen this exact scenario play out in bug bounty write-ups more times than I can count. It's one of those vulnerabilities that feels too simple to be real — and that's exactly why it keeps getting missed.

## The "That's Not a Real Vulnerability" Argument 😤

In security communities, we often discuss how open redirect gets dismissed. "It's not RCE. It's just a redirect. What's the big deal?"

Here's the deal.

Modern phishing is not about sending emails from suspicious domains anymore. It's about **borrowing trust**. When a phishing link starts with `https://paypal.com`, users click. When it starts with `https://paypal-account-verify.scam.xyz`, they (might) pause.

Open redirect gives attackers the first URL while delivering the second destination.

In my experience building production systems — especially e-commerce platforms where trust is everything — this distinction matters enormously. A single successful phishing campaign using your domain can:

- Get your domain on phishing blocklists
- Destroy user trust overnight
- Trigger compliance incidents if customer data gets harvested
- Create a legal headache you didn't need

And the vulnerability itself is almost always a one-liner to fix.

## The Vulnerable Code Hall of Shame 💀

**PHP / Laravel:**

```php
// BAD: Just... trusting whatever shows up
public function postLogin(Request $request)
{
    // Authenticate user...

    $next = $request->get('next', '/dashboard');
    return redirect($next); // Goes ANYWHERE. Evil.com? Sure, why not.
}
```

**Node.js / Express:**

```javascript
// BAD: Express doing exactly what you told it, unfortunately
app.post('/login', async (req, res) => {
    // Authenticate user...

    const redirectTo = req.query.redirect || req.body.redirect || '/dashboard';
    res.redirect(redirectTo); // Absolute URL? Cool with me.
});
```

**The even sneakier version — hidden in header parsing:**

```javascript
// BAD: Referer header as redirect target (very common in SSO flows)
const redirectTo = req.headers['referer'] || '/home';
res.redirect(redirectTo); // Attackers control Referer headers too.
```

I've seen this last pattern in production SSO implementations at companies that absolutely knew better. The `Referer` header feels authoritative. It's not. Attackers control every header they send.

## How Attackers Actually Use This 🎯

Let me paint the full picture.

**Step 1:** Attacker discovers `https://yourapp.com/auth/callback?redirect_url=XXXX` during recon (or just by looking at your login flow like a normal user).

**Step 2:** Attacker builds a pixel-perfect clone of your post-login landing page and hosts it on `https://yourapp.com.attacker-controlled.com`.

**Step 3:** Crafts a phishing email: *"Your account has been flagged for suspicious activity. Please verify your identity."* Link goes to `https://yourapp.com/auth/callback?redirect_url=https://yourapp.com.attacker-controlled.com`.

**Step 4:** User clicks the link — it goes to *your* domain first. Looks real. TLS certificate checks out. Then they get bounced to the fake page.

**Step 5:** User types their credentials into the cloned site thinking they're in a normal post-auth flow.

**Step 6:** Attacker has credentials. You have a support ticket backlog.

This is not theoretical. This is exactly how modern credential phishing campaigns work against SaaS companies.

## The Fix: Stop Trusting URLs From Users 🛡️

### The Best Fix: Relative Paths Only

```php
// GOOD: Only allow relative paths, never absolute URLs
public function postLogin(Request $request)
{
    $next = $request->get('next', '/dashboard');

    // Strip anything that's not a relative path
    if (!str_starts_with($next, '/') || str_starts_with($next, '//')) {
        $next = '/dashboard'; // Fallback to safe default
    }

    return redirect($next);
}
```

The `//evil.com` trick is worth knowing — `//evil.com/path` is a protocol-relative URL that browsers treat as absolute. A bare `/` check isn't enough. You need to ensure it starts with `/` and *doesn't* start with `//`.

**Node.js version:**

```javascript
// GOOD: Validate it's a relative path
function getSafeRedirect(url, fallback = '/dashboard') {
    if (!url || !url.startsWith('/') || url.startsWith('//')) {
        return fallback;
    }
    return url;
}

app.post('/login', async (req, res) => {
    const redirectTo = getSafeRedirect(req.query.redirect);
    res.redirect(redirectTo);
});
```

### The Allowlist Approach (For When You Need Absolute URLs)

Sometimes you genuinely need to redirect to external URLs — OAuth flows, federated SSO, multi-tenant setups. In that case, allowlists are your friend:

```php
// GOOD: Only redirect to domains we explicitly trust
$allowedDomains = [
    'app.yourcompany.com',
    'dashboard.yourcompany.com',
    'partner-site.com', // Explicit. Deliberate.
];

$parsedUrl = parse_url($next);
$domain = $parsedUrl['host'] ?? null;

if (!in_array($domain, $allowedDomains)) {
    return redirect('/dashboard');
}

return redirect($next);
```

**Pro Tip:** Don't just check if the domain *contains* your trusted domain. `yourcompany.com.evil.com` contains `yourcompany.com`. Use exact match on the `host` component from `parse_url()`, not a naive `strpos()` check. I've seen this exact bypass work in real bug bounty submissions.

## Real Talk: Where These Hide in Production 🔍

After years of code reviews and security audits, here are the places I keep finding open redirects:

- **Login/logout flows** — `?next=`, `?redirect=`, `?return_url=`, `?goto=`
- **OAuth callback handlers** — the `state` parameter is often URL-encoded and redirected to
- **Email unsubscribe links** — `?redirect=/home` after confirming unsubscribe
- **Payment confirmation pages** — `?success_url=` passed through checkout flow
- **SSO assertion handlers** — redirect after SAML/OIDC assertion validation
- **"Continue shopping" buttons** in e-commerce — `?return=` after adding to cart

That last one bit a platform I was auditing. The cart flow stored a `return` URL in a query parameter and faithfully redirected there after checkout. Someone could craft a link that sent users to a fake "your payment failed, re-enter your card" page after successfully completing a real purchase.

## The Automated Detection Problem 🤖

Open redirects are tricky for scanners because the vulnerability depends on *how* your app uses the redirect, not just that it *accepts* a redirect parameter. Plenty of scanners miss them.

What I've found works better: **grep your own codebase**.

```bash
# Find potential redirect sinks
grep -rn "redirect(" --include="*.php" .
grep -rn "res.redirect(" --include="*.js" .
grep -rn "header('Location:" --include="*.php" .

# Find redirect parameters being pulled from requests
grep -rn "redirect_url\|return_url\|next\|goto\|redirect" --include="*.php" .
```

Then manually trace each one: where does the value come from? User input? Session? Hardcoded? If it touches user input and goes to a redirect, you need a validator.

## The Security Checklist 📋

Before your next deploy:

- [ ] Every redirect that uses user input validates it's a relative path
- [ ] No `//` prefix slips through your relative URL check
- [ ] External URL redirects use an explicit domain allowlist (exact host match)
- [ ] OAuth state parameters are not raw-redirected without validation
- [ ] `Referer` header is never used as a trusted redirect target
- [ ] Ran grep on your codebase for redirect sinks and traced each one
- [ ] Tested with `?next=//evil.com`, `?next=https://evil.com`, `?next=//evil.com/path`

## TL;DR 🚀

**Open redirect** is when your app lets user-supplied URLs drive where it sends the browser — and attackers exploit your domain's reputation to make phishing links look legitimate.

**The fix:**
1. Validate redirect URLs — relative paths only when possible
2. Allowlist specific domains if you genuinely need external redirects
3. Never use `Referer` headers as trusted redirect sources
4. Check for `//` prefix bypass, not just `https://` prefix
5. Grep your codebase — find every redirect sink, trace every input source

It's a one-line vulnerability with a one-line fix. The gap between those two lines is your users' trust.

---

**Questions? Found an open redirect in a bug bounty program?** Let's talk on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — responsible disclosure stories are my favorite kind.

**More security deep-dives on** [GitHub](https://github.com/kpanuragh) — where redirect parameters go through validators, not vibes.

*Your domain has a reputation. Protect it.* 🔐
