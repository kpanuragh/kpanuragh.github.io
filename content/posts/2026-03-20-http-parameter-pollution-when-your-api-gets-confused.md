---
title: "HTTP Parameter Pollution: When Your API Doesn't Know Which Answer to Give 🤷"
date: "2026-03-20"
excerpt: "What happens when you send the same parameter twice in a URL? Chaos. Beautiful, exploitable chaos. Let me show you how attackers abuse duplicate parameters to bypass your security checks."
tags: ["\"cybersecurity\"", "\"web-security\"", "\"security\"", "\"api-security\"", "\"owasp\""]
featured: "false"
---

# HTTP Parameter Pollution: When Your API Doesn't Know Which Answer to Give 🤷

Here's a fun question: what does your app do when it gets `?role=user&role=admin` in the URL?

If you just said "uh... good question," — congratulations, you've just discovered why **HTTP Parameter Pollution (HPP)** is one of my favourite attacks to explain at security meetups. Because the answer is: *it depends on your framework, your server, your proxy, and sometimes the phase of the moon.*

I'm not joking. Different layers of your stack can disagree on which value "wins," and attackers abuse that disagreement like a toddler who asks both parents for ice cream until someone says yes.

## What Is HTTP Parameter Pollution? 🧪

HPP is what happens when a URL (or POST body) contains the same parameter multiple times:

```
GET /api/transfer?amount=100&to=bob&amount=1000000
```

Which `amount` does your server use? The first? The last? Both in an array? A comma-separated string?

**The terrifying answer: it depends.**

| Framework / Server | Behaviour with duplicates |
|---|---|
| PHP (Laravel) | Last value wins |
| Node.js (Express) | Last value wins |
| ASP.NET | First value wins |
| Python (Flask) | First value wins |
| Java (Spring) | First value wins |
| Ruby on Rails | Last value wins |
| Apache Tomcat | Concatenates with comma |

Now imagine an API gateway sitting in front of your Node.js app. The gateway uses the *first* value for security checks. Your app uses the *last* value for business logic. An attacker just found a gap you can drive a truck through.

## A Real Scenario That Gave Me Trust Issues 🎯

In my experience building production systems, the nastiest HPP bugs live at the boundary between an API gateway and the backend service. Here's a sanitised version of a pattern I've seen in security community discussions (and once, uncomfortably close to a system I was auditing):

```
GET /api/admin/users?role=viewer&role=admin
```

The WAF / API gateway checks: `role = "viewer"` — OK, pass through.

The Laravel backend runs: `$request->input('role')` — returns `"admin"` (last value wins).

The user just gave themselves admin access by duplicating one parameter.

This is not hypothetical. CVEs have been filed for exactly this class of bug in real products.

## How Different PHP/Node Frameworks Handle This 🔍

**Laravel** (PHP):

```php
// Input: ?status=pending&status=approved

// This returns "approved" (last wins)
$status = $request->input('status');

// This returns ["pending", "approved"] — you might not expect an array!
$statuses = $request->input('status');
```

Wait, those look identical. That's because PHP's `$_GET` already resolves duplicates — the last value wins unless you use `?status[]=pending&status[]=approved` array syntax.

But here's where it gets spicy: middleware that checks `$_SERVER['QUERY_STRING']` directly can see the raw string and behave differently from `$request->input()`. Two layers, two answers.

**Express.js** (Node.js):

```javascript
// Input: ?role=user&role=admin

// Without qs: req.query.role === "admin" (last wins)
// With qs (default in Express): req.query.role === ["user", "admin"]

// This check PASSES even though one value is "admin"
if (req.query.role === "user") {
    // Bypassed! Array never strictly equals a string
    allowAccess();
}
```

The `===` check fails silently against an array. No error thrown. Access granted. 🎉 (for the attacker)

## The Fix: Validate Like You Mean It 💪

**Bad (trusting the raw input):**

```javascript
// Express - dangerous!
const role = req.query.role;
if (role === 'admin') {
    // What if role is ["admin", "admin"]? typeof check would fail
    doAdminThing();
}
```

**Good (be explicit about what you accept):**

```javascript
// Express - safe
const role = Array.isArray(req.query.role)
    ? req.query.role[0]  // take first, ignore duplicates
    : req.query.role;

if (typeof role !== 'string' || role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
}
```

**Better (validate with a schema at the edge):**

```javascript
import { z } from 'zod';

const querySchema = z.object({
    role: z.string().max(50)  // rejects arrays, rejects long strings
});

const parsed = querySchema.safeParse(req.query);
if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid parameters' });
}
```

**Laravel — use explicit validation:**

```php
// Good: reject if role appears more than once
$request->validate([
    'role' => 'required|string|in:user,moderator,admin',
]);

// Even better: only trust server-side role assignment
// Never accept 'role' as a user-controlled parameter at all!
```

## The API Gateway Trap 🪤

In my experience building serverless e-commerce backends on AWS, the most dangerous HPP scenarios happen across layers:

```
Client → CloudFront → API Gateway → Lambda (Node.js)

Request: GET /orders?status=pending&status=shipped

CloudFront cache key: uses "pending" (first value)
API Gateway auth check: uses "pending" (first value) → passes WAF rule
Lambda handler: req.query.status === ["pending", "shipped"] → business logic confusion
```

Caching gets poisoned, different users get wrong responses, and your WAF rules become Swiss cheese.

**Fix at the gateway level:** Strip duplicate parameters before they reach your app. In AWS API Gateway, request mappings can enforce single-value parameters.

## Pro Tip: The Places HPP Hides 🔬

HPP isn't just GET parameters. Check all of these:

- **POST body** (`Content-Type: application/x-www-form-urlencoded`) — duplicates work here too
- **JSON arrays in POST body** — `{"role": ["user", "admin"]}` if your code does `body.role === 'admin'`
- **HTTP headers** — some headers can be duplicated (Cookie, X-Forwarded-For)
- **Path parameters interpreted by middleware** vs your route handler

As someone passionate about security, I always test these edge cases when reviewing APIs. Burp Suite has a built-in HPP check — run it. You'll be surprised what you find in your own code.

## Real Talk: Why Developers Miss This 🤦

```
Because local testing never sends duplicate parameters.
Your browser form never duplicates fields.
Unit tests only test the happy path.
```

HPP is fundamentally an integration issue — it appears at the boundary between things. The attacker's job is to find where your security layer and your application layer have different opinions about the same parameter.

**In security communities, we often discuss** how the most dangerous bugs aren't about one system being broken — they're about two systems that each work fine individually but interact in unexpected ways. HPP is the textbook example.

## Your HPP Checklist ✅

Before you ship that API:

- [ ] Decide which value wins for duplicates (first/last/array) — document it
- [ ] Add schema validation at the entry point (Zod, Joi, Laravel validate())
- [ ] Explicitly reject requests with duplicate sensitive parameters (role, permission, amount)
- [ ] Test with: `?param=safe&param=evil` for every security-sensitive parameter
- [ ] Check what your API Gateway does with duplicates vs what your backend does
- [ ] Never accept `role`, `isAdmin`, `permissions` as user-supplied query parameters — set them server-side

## TL;DR 🎯

HTTP Parameter Pollution happens when duplicate parameters make different layers of your stack disagree. Your WAF sees `role=user` (safe!), your app sees `role=admin` (oops!). Fix it by:

1. Validating input schemas strictly at the entry point
2. Rejecting duplicate sensitive parameters
3. Never trusting user-supplied values for security-critical fields
4. Testing your API with duplicate parameters — right now, before an attacker does

The best security bugs are the ones you find yourself. Go break your own API. 🔨

---

**Found an HPP bug in your own code?** I'd love to hear about it on [LinkedIn](https://www.linkedin.com/in/anuraghkp). As an active member of security communities like **YAS** and **InitCrew**, the best war stories come from developers who go hunting in their own systems.

**More security content:** Check out [GitHub](https://github.com/kpanuragh) for security tools and writeups. Stay paranoid. 🔐
