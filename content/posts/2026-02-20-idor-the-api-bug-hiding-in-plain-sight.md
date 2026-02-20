---
title: "IDOR: The API Bug That's Hiding in Plain Sight 🔓👀"
date: "2026-02-20"
excerpt: "You built an API. You added authentication. You feel safe. But one tiny URL like /api/orders/1337 could hand all your users' data to a random stranger. Welcome to IDOR - the embarrassingly simple bug that breaks into Fortune 500 companies daily."
tags: ["cybersecurity", "api-security", "owasp", "idor", "web-security"]
featured: true
---

# IDOR: The API Bug That's Hiding in Plain Sight 🔓👀

Here's a fun game. Open any web app you built, find a URL that looks like this:

```
/api/orders/42
```

Now change `42` to `43`. Or `1`. Or `99999`.

Did you get someone else's data? Congratulations — you just found an **IDOR vulnerability**. Go make yourself a coffee and come back, because we need to talk. ☕

## What Even Is IDOR? 🤔

**IDOR** stands for **Insecure Direct Object Reference**. The name sounds academic, but the concept is hilariously simple:

> Your app hands users a reference to an object (like an ID), and then blindly trusts them when they reference a *different* object.

That's it. That's the whole bug.

You check "is this user logged in?" but you never check "does this user **own** what they're asking for?"

It's like a hotel that checks if you have *a* keycard, then opens *any* door you point it at. "Authentication? Yes, you're a guest. Authorization? Lol what's that?" 🏨🚪

## The Classic IDOR: Your API Endpoint

Here's code that developers write every single day without realizing the danger:

```php
// The vulnerable version - spot the problem!
public function getOrder(Request $request, int $orderId): JsonResponse
{
    // ✅ We authenticate the user
    $user = $request->user();

    // ❌ But we never check if this order BELONGS to them
    $order = Order::findOrFail($orderId);

    return response()->json($order);
}
```

Seems fine at a glance. The user is authenticated. The order exists. Ship it!

Except now ANY logged-in user can grab ANY order by just incrementing the ID. User #5 can read User #500's entire purchase history, shipping address, credit card last four digits — the works.

Here's the **fixed version**:

```php
// The secure version - one line makes all the difference
public function getOrder(Request $request, int $orderId): JsonResponse
{
    $user = $request->user();

    // ✅ Scope the query to the authenticated user's records
    $order = Order::where('id', $orderId)
                  ->where('user_id', $user->id)  // 👈 THIS line
                  ->firstOrFail();

    return response()->json($order);
}
```

One `where` clause. That's it. That's the entire fix. And yet IDOR is in the **OWASP Top 10** every single year because developers keep missing it.

## Why IDOR Is So Sneaky 🕵️

IDOR is uniquely evil because it **hides behind your authentication**. Your logs show authenticated requests. Your monitoring sees normal traffic. Your security scanner reports no issues.

Meanwhile, a bored teenager is iterating through every user ID with a simple script:

```python
# Don't do this (for educational purposes only!)
import requests

headers = {"Authorization": "Bearer my_valid_token"}

for user_id in range(1, 10000):
    r = requests.get(f"https://target.com/api/users/{user_id}", headers=headers)
    if r.status_code == 200:
        print(f"Got data for user {user_id}: {r.json()['email']}")
```

In under a minute, they've downloaded your entire user database. And your logs just show "200 OK" over and over.

This is exactly how **Facebook, Instagram, Venmo, USPS, and dozens of other major companies** have been breached in real bug bounty reports. IDOR isn't exotic — it's routine.

## IDOR Goes Deeper: Not Just GET Requests 📦

Here's where developers get tripped up — IDOR isn't just about *reading* other people's data. It's about *any* action on an object you don't own.

**The evil variants:**

```
GET    /api/invoices/1337          → Read someone's invoice
PUT    /api/invoices/1337          → Edit someone's invoice
DELETE /api/invoices/1337          → Delete someone's invoice
POST   /api/invoices/1337/send     → Email someone's invoice to yourself
GET    /api/users/1337/export      → Download someone's data dump
```

And it's not always in the URL. Sometimes it hides in the request body:

```json
// User sends this POST to /api/messages
{
  "recipient_id": 1337,
  "folder_id": 9999,    // 👈 Does THIS folder belong to the sender?
  "message": "Hello!"
}
```

If you only check `recipient_id` but not `folder_id`, an attacker can drop messages into folders they don't own. Sneaky!

## The Fix: Always Authorize, Never Just Authenticate 🛡️

The golden rule:

> **Authentication = who you are. Authorization = what you're allowed to do.**

Most developers nail authentication. Authorization is where they slip up.

Here's a clean pattern for Laravel that makes IDOR nearly impossible to accidentally introduce:

```php
// Use Laravel Policies to centralize authorization logic
class OrderPolicy
{
    public function view(User $user, Order $order): bool
    {
        return $user->id === $order->user_id;
        // Admins can do: return $user->isAdmin() || $user->id === $order->user_id;
    }

    public function update(User $user, Order $order): bool
    {
        return $user->id === $order->user_id && $order->status === 'pending';
    }
}

// Then in your controller, authorization is explicit and impossible to forget:
public function getOrder(Request $request, Order $order): JsonResponse
{
    $this->authorize('view', $order);  // Throws 403 if unauthorized

    return response()->json($order);
}
```

With Route Model Binding + Policies, you get clean code AND security by default. The `authorize()` call is so obvious that code reviewers immediately notice if it's missing.

## Quick Checklist to Find IDOR in Your App 🔍

Go through every endpoint and ask:

- [ ] Does this URL or body contain an ID of any kind?
- [ ] Do I verify the authenticated user **owns** that ID?
- [ ] Is the query scoped to the current user, or does it fetch globally?
- [ ] Does the response include data belonging to other users?
- [ ] Can I perform write/delete actions on other users' resources?

If any answer makes you nervous, you've got work to do.

**Bonus:** Use UUIDs instead of sequential integers for object IDs. `/api/orders/a3f8c2d1-...` is harder to enumerate than `/api/orders/42`. It's not a *fix* for IDOR (authorization is still required!), but it raises the bar for lazy attackers.

## Real-World Impact 💥

Some of the biggest IDOR bugs from public bug bounty disclosures:

- **Shopify**: IDOR allowed reading any store's private metafields — $500 bounty (minor by their standards)
- **Facebook**: Researchers could delete anyone's photos via IDOR in the media API
- **Venmo**: Transaction history of any user was accessible by enumeration — before they added privacy controls
- **T-Mobile**: Customer account details accessible by changing a subscriber ID

And those are just the ones that got *reported*. The ones that got silently exploited? We'll never know the count.

## The Bottom Line 🎯

IDOR is embarrassing in the best possible way. It doesn't require advanced exploitation, custom shellcode, or a sophisticated attack chain. It's just... changing a number in a URL.

The fix is equally simple: **scope every database query to the authenticated user**. Make it a habit. Make it a code review checklist item. Make it muscle memory.

Your users trusted you with their data. Don't let a one-line oversight hand it to anyone with a browser and a modicum of curiosity.

Now go audit your endpoints. I'll wait. 🕐

---

**Found an IDOR in the wild (or in your own code)?** I'd love to hear about it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — responsibly disclosed stories are the best kind.

**More security deep-dives on the way.** Follow along on [GitHub](https://github.com/kpanuragh) and never ship vulnerable code again. 🔐

*Stay paranoid, stay authorized.* 👊
