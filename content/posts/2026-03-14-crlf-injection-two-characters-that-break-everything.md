---
title: "CRLF Injection: The Two Characters That Can Hijack Your HTTP Responses 🔪"
date: "2026-03-14"
excerpt: "Meet \\\\\\r\\\\\\n — the two most underrated troublemakers in web security. CRLF injection can split your HTTP responses, inject fake headers, and even pull off XSS. Spoiler: your framework probably saves you, but only if you know when to let it."
tags: ["\\\"cybersecurity\\\"", "\\\"web-security\\\"", "\\\"security\\\"", "\\\"http\\\"", "\\\"owasp\\\""]
featured: "false"
---

# CRLF Injection: The Two Characters That Can Hijack Your HTTP Responses 🔪

Here's a fun party trick: a hacker once told me they found a critical vulnerability in a major e-commerce platform using just two characters. Two. `\r\n`. That's it. No fancy zero-days. No nation-state tooling. Just a carriage return and a line feed buried in a redirect URL.

As someone passionate about security, I have to admit — that story made me immediately audit every single redirect in my own codebase at 11pm. Because **CRLF injection is one of those vulnerabilities that sounds silly until you realize what it actually unlocks**.

## What Even Is CRLF? 🤔

HTTP is a text protocol. Every response your server sends looks something like this:

```
HTTP/1.1 302 Found\r\n
Location: https://example.com/dashboard\r\n
Set-Cookie: session=abc123\r\n
\r\n
<body here>
```

See those `\r\n` pairs? That's **CRLF** — Carriage Return (`\r`, ASCII 13) and Line Feed (`\n`, ASCII 10). They're the separators that define where one HTTP header ends and the next begins. The blank line (`\r\n\r\n`) marks where headers stop and the body starts.

HTTP parsers have trusted these characters for decades. They're load-bearing punctuation in the protocol itself.

Which means if you let user input sneak `\r\n` into a response header... you just handed the attacker the ability to **write their own headers**.

## The Attack in Plain English 🎯

Imagine you have a redirect after login:

```php
// The "where should I redirect after login?" pattern
$redirect = $_GET['next'];
header("Location: " . $redirect);
```

Normal usage: `?next=/dashboard` → safe, sends user to dashboard.

Attacker usage: `?next=/dashboard%0d%0aSet-Cookie:%20session=hacked`

URL-decoded, that `%0d%0a` is... `\r\n`. Your response now looks like:

```
HTTP/1.1 302 Found\r\n
Location: /dashboard\r\n
Set-Cookie: session=hacked\r\n
\r\n
```

The attacker just **injected a header**. They can set cookies. They can inject `Content-Type`. They can add `Access-Control-Allow-Origin: *`. They can even break out of headers into the body and inject HTML — which gives you XSS.

In security communities, we call this **HTTP Response Splitting**. CRLF is the entry point.

## Real Talk: What Can Actually Go Wrong? 💀

In my experience building production systems, I've seen three scary escalation paths:

**1. Session Hijacking via Cookie Injection**

```
GET /login?next=%2Fdashboard%0d%0aSet-Cookie:%20admin=true HTTP/1.1
```

Now any user who hits this link gets an `admin=true` cookie set by *your* server. Your app trusts its own cookies. This is bad.

**2. Cache Poisoning**

If a CDN or reverse proxy sits in front of your app and caches the poisoned response, *every user* who requests that URL gets the attacker's injected headers served to them. One request, mass impact.

**3. XSS via Response Splitting**

With a double `\r\n\r\n`, an attacker can escape the headers entirely and inject body content:

```
?next=/x%0d%0a%0d%0a<script>alert('xss')</script>
```

The HTTP parser sees headers end (blank line), then body starts. If your app reflects this in any way without a full redirect, you've got a reflected XSS from a header injection.

## The "Good" News: Frameworks Save You (Mostly) ✅

The reason this vulnerability isn't in every app today is that modern frameworks sanitize headers.

**Laravel** will throw an exception if you try to inject CRLF via `header()` through the framework's response abstraction:

```php
// Laravel's Response class strips \r\n from header values
return redirect($url); // Safe — Laravel validates the URL

// But this raw PHP call bypasses the framework!
header("Location: " . $userInput); // 💀 Dangerous
```

**Node.js / Express** throws `ERR_INVALID_CHAR` if you try to set a header with `\r\n` in it — since Node.js 10+. But older codebases or custom HTTP servers? Not guaranteed.

**The Rule:** Never bypass your framework's response helpers to call raw header functions with user input. The framework's abstraction is the safety net.

## Bad vs. Good 🔴🟢

**The Dangerous Pattern:**

```php
// ❌ Raw header() with user-controlled input
$next = $_GET['next'];
header("Location: $next");
exit;
```

**The Safe Pattern:**

```php
// ✅ Validate the redirect target first
$next = $_GET['next'];
$allowed = ['/dashboard', '/profile', '/orders'];

if (!in_array($next, $allowed)) {
    $next = '/dashboard'; // Default to safe fallback
}

return redirect($next);
```

**Even Safer — Use URL Parsing:**

```php
// ✅ Only allow same-origin redirects
$parsed = parse_url($next);
if (!empty($parsed['host'])) {
    // Absolute URL pointing somewhere else — reject it
    $next = '/dashboard';
}

return redirect($next);
```

This kills two birds: CRLF injection AND open redirect. Efficient.

## How to Test Your Own App 🔬

As someone who actively pokes at production systems (with authorization, obviously 😅), here's my quick CRLF check:

1. Find any parameter that ends up in a redirect or response header
2. Try: `%0d%0a`, `%0aX-Test:%20injected`, `\r\n`, `%0D%0A`
3. Check the raw response headers in browser DevTools → Network → response headers
4. If you see `X-Test: injected` in the response... you've got a problem

Tools like [Burp Suite](https://portswigger.net/burp) make this trivially easy — intercept the response and scan for injected headers.

## Pro Tip: Security Headers That Help 🛡️

Even if CRLF injection happens, some defenses limit the blast radius:

```
# Prevents browsers from caching sensitive responses
Cache-Control: no-store

# Limits what cookies can be set cross-origin
SameSite=Strict on your session cookies

# CSP limits the impact of injected scripts
Content-Security-Policy: default-src 'self'
```

None of these *prevent* CRLF injection. But they're your seatbelt if the airbag fails.

## The Checklist 📋

- [ ] All redirects use framework helpers (`redirect()`, `Response::redirectTo()`)
- [ ] User-supplied redirect targets are validated against an allowlist
- [ ] No raw `header()` / `res.setHeader()` calls with unvalidated user input
- [ ] Test your login redirect `?next=` param with `%0d%0a` payloads
- [ ] CSP and `SameSite` cookies are set to limit escalation

## TL;DR 🎯

CRLF injection is sneaky because the fix looks trivial (`\r\n`? that's it?) but the impact is real: injected headers, session hijacking, cache poisoning, XSS. Modern frameworks handle this for you — but only if you use them correctly. The moment you drop down to raw header manipulation with user-controlled input, you're on your own.

Trust your framework's response layer. Validate redirect targets. And never underestimate two ASCII characters.

---

*Found a CRLF vuln in the wild? Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love a good war story. Check out more security deep-dives on this blog or star something useful on [GitHub](https://github.com/kpanuragh).* 🔐
