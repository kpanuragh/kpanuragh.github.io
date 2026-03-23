---
title: "Open Redirect: Your Login Page Is a Phishing Machine 🎣"
date: "2026-03-18"
excerpt: "That innocent ?redirect_to= parameter in your URL? Hackers are using it to send your users straight to malware sites — and your users will never suspect a thing."
tags: ["\"cybersecurity\"", "\"web-security\"", "\"security\"", "\"owasp\"", "\"phishing\""]
featured: "false"
---

# Open Redirect: Your Login Page Is a Phishing Machine 🎣

You know what's worse than a hacker building a phishing site that looks like yours? A hacker using **your actual domain** to redirect users to their phishing site. No spoofed URLs, no dodgy domain names — just your legit URL doing the dirty work.

Welcome to Open Redirect vulnerabilities. As someone passionate about security, this is the bug I see most consistently overlooked in code reviews, yet it shows up in bug bounty reports week after week.

## What Even Is an Open Redirect? 🤔

You've seen URLs like this a hundred times:

```
https://yourapp.com/login?redirect_to=https://dashboard.yourapp.com
```

Makes sense, right? User tries to access a protected page, gets sent to login, then redirected to where they were trying to go. Totally normal UX pattern.

Now imagine an attacker sends your users this link:

```
https://yourapp.com/login?redirect_to=https://evil-site.com/steal-credentials
```

If your app blindly follows that `redirect_to` parameter without checking where it points? Your users just got teleported to a malware site **via your trusted domain**. And since the link starts with `yourapp.com`, they had zero reason to be suspicious.

That's an Open Redirect. And it's everywhere.

## The "But How Bad Can It Actually Be?" Section 😬

In my experience building production systems, I've had this conversation with developers more times than I can count: "It's just a redirect, it's not like we're executing code." Let me change your mind.

**Scenario 1: Credential Harvesting**

Attacker crafts: `https://yourbank.com/login?next=https://yourbank-security.com/verify`

User clicks, logs in normally, then gets redirected to a near-perfect copy of your site asking them to "re-verify" their details. The user just authenticated on your real domain — they're already in "trust mode."

**Scenario 2: OAuth Token Theft**

This one is spicy. If your OAuth flow uses redirect URIs that can be influenced by user input, an attacker can steal authorization tokens mid-flow. The OAuth spec is explicit about this — validate your redirect URIs. Always.

**Scenario 3: Security Filter Bypass**

Some corporate email filters block known phishing domains. They don't block `yourapp.com`. Open redirect = instant bypass.

## How the Vulnerable Code Looks 💀

**The bad PHP/Laravel pattern:**

```php
// DON'T DO THIS
public function login(Request $request)
{
    // ... authenticate user ...

    $redirect = $request->get('redirect_to', '/dashboard');
    return redirect($redirect); // 🚨 Trusts ANY URL
}
```

**The bad Node.js/Express pattern:**

```javascript
// ALSO BAD
app.post('/login', (req, res) => {
  // ... authenticate ...

  const returnUrl = req.query.returnUrl || '/home';
  res.redirect(returnUrl); // 🚨 Attackers love this
});
```

Both of these will happily redirect to `https://evil.com` because neither checks if the destination is actually yours.

## The Fix: Validate Where You're Sending People 🛡️

**Rule #1: Only redirect to relative paths, or explicitly whitelisted domains.**

```php
// Laravel — the safe version
public function login(Request $request)
{
    // ... authenticate user ...

    $redirect = $request->get('redirect_to', '/dashboard');

    // Only allow relative paths (no scheme = no external domain)
    if (filter_var($redirect, FILTER_VALIDATE_URL)) {
        // It's an absolute URL — reject it or only allow your domain
        $redirect = '/dashboard';
    }

    return redirect($redirect);
}
```

**Better yet, use a whitelist approach:**

```javascript
// Node.js — explicit allowlist
const ALLOWED_HOSTS = ['yourapp.com', 'dashboard.yourapp.com'];

function isSafeRedirect(url) {
  // Relative paths are always safe
  if (!url.startsWith('http')) return true;

  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

app.post('/login', (req, res) => {
  const returnUrl = req.query.returnUrl || '/home';
  const safeUrl = isSafeRedirect(returnUrl) ? returnUrl : '/home';
  res.redirect(safeUrl);
});
```

**Pro Tip 🎯** The most bulletproof approach? Don't put the redirect destination in the URL at all. Store the intended destination in the session server-side before the login redirect. Then pop it from the session after auth. No URL parameter = nothing for attackers to manipulate.

```php
// Store it before redirecting to login
session(['intended_url' => $request->path()]);
return redirect('/login');

// After successful login
$intended = session()->pull('intended_url', '/dashboard');
return redirect('/' . $intended);
```

Laravel actually does this for you with `redirect()->intended()`. Use the framework!

## Real Talk: How I Find These in the Wild 🔍

In security communities, we often discuss how open redirects are categorized as "low severity" by some bug bounty programs — and honestly, that's a mistake. When chained with other bugs, they become critical.

Here's my quick grep pattern for auditing a codebase:

```bash
# Find potential open redirect patterns
grep -r "redirect(" --include="*.php" . | grep -v "//"
grep -r "res.redirect(" --include="*.js" . | grep "req\."
```

Any redirect that takes direct user input without validation is a candidate. Review each one.

When I was doing a security review on an e-commerce backend I built, I found three of these in the checkout flow alone. All in "innocent" UX helpers designed to send users back to the right product page after login. All of them would have happily redirected to external domains. Fixed them all before launch — but it's a reminder that this stuff hides in features that feel totally normal.

## The Sneaky Bypass Tricks Attackers Use 🧠

Think your validation is solid? Attackers are creative. Common bypasses:

```
# Protocol-relative URLs (works in older validation)
//evil.com/phishing

# Unicode tricks
https://yourapp.com%40evil.com

# Subdomain abuse (if you allow *.yourapp.com)
https://evil.yourapp.com.attacker.com

# Open redirect chains
https://yourapp.com/redir?to=https://trusted-partner.com/redir?to=https://evil.com
```

**Always parse the URL properly.** String matching is not enough. Use `new URL()` in JavaScript or `parse_url()` in PHP, then check the `hostname` property explicitly.

## The OWASP Angle 📚

Open Redirect was in the OWASP Top 10 for years and was consolidated into "Security Misconfiguration" in later versions. That doesn't mean it went away — it means it's now considered a basic implementation mistake that any well-configured app shouldn't have.

In security assessments I've been part of, open redirects show up in about 1 in 3 production web apps. It's genuinely one of the most common issues that passes code review because "it's just a redirect."

## Your Open Redirect Checklist ✅

Before shipping any redirect functionality:

- [ ] Does this redirect trust user input directly? If yes, add validation
- [ ] Are absolute URLs ever allowed? Only if the domain is explicitly whitelisted
- [ ] Is the redirect destination stored server-side instead of in the URL?
- [ ] Have you tested with `//evil.com` and `https://evil.com` as inputs?
- [ ] Does your OAuth flow validate redirect URIs against a registered whitelist?
- [ ] Have you grepped your codebase for redirect patterns that accept request parameters?

## TL;DR 🎯

Open Redirect is the vulnerability that turns your good reputation against your users. That `?redirect_to=` parameter is a loaded gun if you're not validating where it points.

The fix is simple: **never trust user-supplied redirect destinations**. Use relative paths, server-side session storage, or explicit domain allowlists. Your users trust your domain — don't let attackers exploit that trust.

---

Found an open redirect in your app? Fix it today. Seriously, it takes 10 minutes and it's the kind of thing that ends up in breach reports.

**Want to talk security?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my projects on [GitHub](https://github.com/kpanuragh). As someone active in security communities, I love chatting about this stuff.

*Stay paranoid. Validate your redirects.* 🔒
