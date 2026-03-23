---
title: "Web Cache Poisoning: When Your CDN Becomes the Villain 🎭"
date: "2026-03-12"
excerpt: "You set up a CDN to make your app faster. Congratulations — you may have also set up a global attack delivery network. Let's talk about web cache poisoning before a security researcher does it for you."
tags: ["\"cybersecurity\"", "\"web-security\"", "\"security\"", "\"cdn\"", "\"cache-poisoning\""]
featured: "false"
---

# Web Cache Poisoning: When Your CDN Becomes the Villain 🎭

Picture this: you've spent weeks optimising your app, slapped CloudFront in front of it, and now your pages load in milliseconds. You're a performance hero. Users are happy. Your boss is happy.

Then a security researcher drops a report in your inbox. Your CDN has been faithfully serving a poisoned response — with attacker-controlled content — to *every single visitor* for the past three days.

Your CDN didn't fail. It did exactly what you told it to do. That's the terrifying part.

I've seen this pattern come up repeatedly in security communities, and in my experience building production systems with AWS CloudFront and Varnish caches, it's one of those vulnerabilities that's embarrassingly easy to introduce and deceptively hard to spot.

## What Even Is Web Cache Poisoning? 🤔

A cache sits between users and your server. It stores responses and hands them to future visitors so your server doesn't have to work as hard. Beautiful.

Web cache poisoning is when an attacker tricks the cache into storing a **malicious response** and serving it to everyone who visits that URL. Instead of one user getting hurt, *every cached user* gets the poisoned payload.

The anatomy is simple:
1. Attacker sends a specially crafted request with an **unkeyed input** (a header the cache ignores but your server processes)
2. Your server includes attacker-controlled content in the response
3. Cache stores that response
4. Every subsequent visitor gets the attacker's payload served at lightning-fast CDN speeds

Think of it like poisoning a restaurant's central soup pot instead of one bowl. Much more efficient. Much more devastating.

## The Unkeyed Input: The Real Culprit 🔑

Caches decide what to store based on a **cache key** — typically the URL and maybe a few headers. Everything outside the cache key is "unkeyed."

The classic example: the `X-Forwarded-Host` header.

**The vulnerable server code (DON'T do this):**
```javascript
// Express — using a header to build URLs for scripts/stylesheets
app.get('/', (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  res.send(`
    <html>
      <script src="https://${host}/app.js"></script>
    </html>
  `);
});
```

The cache key is just the URL `/`. But the response changes based on `X-Forwarded-Host`. Attacker sends:
```
GET / HTTP/1.1
Host: yoursite.com
X-Forwarded-Host: evil.attacker.com
```

Server happily renders `<script src="https://evil.attacker.com/app.js"></script>`. Cache stores it. Now *every visitor* loads JavaScript from the attacker's domain. Game. Over.

As someone passionate about security, I'll tell you — in security communities, we often discuss how this vulnerability has a special cruelty to it: your infrastructure is the attack vector. You're the one paying for the CDN that distributes the payload.

## Real-World Variants That Get People 🎯

It's not just `X-Forwarded-Host`. There's a whole family of unkeyed inputs that cause headaches:

**1. `X-Forwarded-Scheme` or `X-Forwarded-Proto`**
Servers that use these to build redirect URLs can be coaxed into caching redirects to attacker-controlled destinations.

**2. Fat GET requests**
Some servers process the body of a GET request. Caches almost never key on it. Attacker smuggles a payload in the body, server reflects it, cache stores it.

**3. Query string parameter caching quirks**
`/search?q=hello` and `/search?q=hello&utm_source=evil` might produce the **same cache key** but different responses if your server reflects UTM params.

**4. HTTP Request Smuggling + Cache Poisoning (the nightmare combo)**
In my experience building high-traffic APIs, this one causes the most gray hairs. Request smuggling desynchronises the connection between the load balancer and backend, letting an attacker inject responses into another user's cache slot. We'll save the deep dive on smuggling for another post — but just know it exists and it's brutal.

## Pro Tip: Audit Your Unkeyed Inputs 🔍

Before you panic-audit your entire stack at 2am, here's a systematic approach:

**Step 1: Know what your cache keys on**

For CloudFront, check your cache policy. By default it keys on the URL. If you've added headers to the key — great, those are safe. Everything else is potentially unkeyed.

```bash
# Check your CloudFront cache policy via AWS CLI
aws cloudfront list-cache-policies --type custom
```

**Step 2: Look for header reflection in your responses**

Search your codebase for places where request headers are used to build response content:

```bash
# Find places where forwarded headers influence output
grep -r "x-forwarded\|x-original-host\|x-host" src/ --include="*.js"
```

**Step 3: Check your web framework's host detection**

In Laravel:
```php
// This is fine — uses validated Host header
$url = request()->url();

// This could be dangerous if X-Forwarded-Host isn't validated
$host = request()->header('X-Forwarded-Host');
$redirectUrl = "https://{$host}/callback";  // 🚨 Don't do this
```

In Node/Express with a reverse proxy:
```javascript
// SAFE — trust proxy configured explicitly
app.set('trust proxy', 1); // Trust first proxy only
const host = req.hostname; // Uses validated host

// UNSAFE — directly reading forwarded headers without validation
const host = req.headers['x-forwarded-host']; // 🚨 Attacker-controlled
```

## Real Talk: How I Found One in Production 💬

A few years back while doing an internal security review on an e-commerce backend I'd built, I noticed our product page template was using `$_SERVER['HTTP_X_FORWARDED_HOST']` to construct canonical URLs for SEO. We had Varnish caching in front of it.

I sent a test request with `X-Forwarded-Host: evil.example.com` from my laptop. The canonical URL in the cached page changed. I stared at it for a moment, then immediately filed a P0 ticket, killed the cache, and fixed the template to use the configured `APP_URL` instead.

Nobody exploited it — we caught it internally. But the fact that it was sitting there, in production, in code *I had reviewed*, is a reminder that this class of bug is genuinely sneaky.

## The Fixes That Actually Work 🛡️

**1. Validate the Host header server-side**

Never trust user-supplied host headers for building URLs. Use your application's configured base URL:

```javascript
// Node.js — use configured URL, not request header
const BASE_URL = process.env.APP_URL; // https://yourapp.com

// Good
const canonicalUrl = `${BASE_URL}${req.path}`;

// Bad
const host = req.headers['x-forwarded-host'];
const canonicalUrl = `https://${host}${req.path}`; // 🚨
```

**2. Add unkeyed headers to your cache key**

If your app legitimately behaves differently based on a header, add it to the cache key. For CloudFront this means updating your cache policy to include that header as a "header to include in cache key."

**3. Vary header — use it, but carefully**

```
Vary: Accept-Encoding, Accept-Language
```

The `Vary` header tells caches to include those headers in the cache key. But be careful — `Vary: *` effectively disables caching, and varying on too many headers causes cache fragmentation.

**4. Audit your framework's trusted proxy config**

```php
// Laravel — set trusted proxies explicitly
// In TrustProxies middleware:
protected $proxies = ['10.0.0.0/8']; // Your actual load balancer range
protected $headers = Request::HEADER_X_FORWARDED_FOR |
                     Request::HEADER_X_FORWARDED_HOST |
                     Request::HEADER_X_FORWARDED_PORT |
                     Request::HEADER_X_FORWARDED_PROTO;
```

**5. Purge caches aggressively during incidents**

If you suspect poisoning, purge first, investigate second. Every second the poisoned response sits in cache, more users are affected.

## Testing Your Own App 🧪

The best tool for this is [Param Miner](https://github.com/PortSwigger/param-miner) — a Burp Suite extension by James Kettle (who basically wrote the book on web cache poisoning with his PortSwigger research). It automatically discovers unkeyed inputs.

A quick manual check you can run right now:

```bash
# Send a request with a modified forwarded host and check the response
curl -s -H "X-Forwarded-Host: canary.attacker.com" https://yoursite.com/ | grep "canary"

# If you see "canary" in the response, you have a reflection issue
# Now check if the response was cached with Cache-Control headers:
curl -s -I https://yoursite.com/ | grep -i "cache\|age\|x-cache"
```

If you see a `Cache-Control: public` or `Age:` header alongside the reflection, that's the combination that turns a reflection into poisoning.

## The Bigger Picture 🌐

In security communities, we often discuss how cache poisoning sits at an uncomfortable intersection: it's an infrastructure-level vulnerability that requires application-level fixes. Your DevOps team set up the CDN correctly. Your developers wrote the header-reflection "feature." The security team found the exploit. Everyone did their job, and somehow the vulnerability still happened.

This is why **threat modelling your caching layer** is as important as securing your database. When I architect new systems now, caching is explicitly on the security review checklist — not just the performance review.

## TL;DR 📋

- Web cache poisoning = tricks the cache into storing attacker-controlled content served globally
- Root cause: **unkeyed inputs** (headers your server reads but the cache ignores)
- Common sources: `X-Forwarded-Host`, `X-Forwarded-Scheme`, reflected query params
- Fix: never use request headers to build response content; add necessary headers to cache keys
- Test with Param Miner or manual `curl` checks
- In Laravel, configure `TrustProxies` explicitly; in Node, set `trust proxy` carefully

Your CDN is a superpower — but only if you control what it's amplifying.

---

Spotted a cache poisoning issue or want to geek out about CDN security? Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my projects on [GitHub](https://github.com/kpanuragh). In security communities, the best way to learn is to share — so if you've found (and fixed) something like this, write it up! 🔐
