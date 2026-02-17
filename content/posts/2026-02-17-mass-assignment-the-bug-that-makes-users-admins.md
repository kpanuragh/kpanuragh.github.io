---
title: "Mass Assignment: The Bug That Turns Users Into Admins 👑"
date: "2026-02-17"
excerpt: "You built a form for users to update their name. They updated their role to 'admin' instead. Welcome to mass assignment, where blind trust in user input costs you everything."
tags: ["cybersecurity", "web-security", "security", "laravel", "api-security"]
featured: false
---

# Mass Assignment: The Bug That Turns Users Into Admins 👑

I want to tell you about the most embarrassing class of vulnerability in web development.

Not SQL injection (that's the old villain). Not XSS (everyone knows that one now). I'm talking about **mass assignment** — the bug that lets an ordinary user promote themselves to admin, zero out their subscription price, or flip any database column they shouldn't touch. And it happens because you were *too convenient* with your code.

In my experience building production systems, I've seen this bite teams more than almost any other vulnerability. Not because it's hard to understand — it's actually dead simple. But because it hides behind framework magic that *looks* safe.

## What Is Mass Assignment? 🤔

It sounds scary. It's really not complicated.

**Mass assignment** happens when you take user-submitted data and shove it directly into a model without filtering which fields are allowed to be set.

Here's the classic scenario:

```php
// BAD: The "I trust everyone" approach
public function updateProfile(Request $request)
{
    $user->update($request->all()); // 💀 All fields. No exceptions.
}
```

You built a form with `name` and `email` fields. Cool. But HTTP is just key-value pairs. Nothing stops a user from sending this:

```json
{
  "name": "John",
  "email": "john@example.com",
  "role": "admin",
  "is_verified": true,
  "subscription_price": 0
}
```

Your code blindly accepts it. Laravel happily updates every field that exists in the database. John is now an admin with a free subscription. GG.

## The Real-World Story That Still Haunts Me 😬

As someone passionate about security, I follow responsible disclosure write-ups obsessively. One story I keep referencing in security communities involves a SaaS platform — not massive, but real paying customers — where a mass assignment bug let any user set `account_type` to `enterprise` during profile updates.

They had a form for "Update your display name." The endpoint accepted JSON. Someone fuzzing with Burp Suite noticed the User model had an `account_type` column. One extra JSON field and boom — enterprise features for free.

The fix was two lines of code. The breach wasn't catastrophic, but the trust damage? That takes months to recover from.

In security communities, we often discuss how this class of vulnerability is embarrassingly preventable. Yet it keeps showing up in bug bounty reports *constantly*.

## Laravel's Fillable vs. Guarded — Pick Your Side ⚔️

Laravel gives you two weapons. Most people use neither correctly.

### Option 1: `$fillable` (Allowlist — Recommended)

```php
class User extends Model
{
    // ONLY these fields can be mass-assigned
    protected $fillable = [
        'name',
        'email',
        'avatar_url',
    ];
}
```

Explicit allowlist. `role`, `is_admin`, `stripe_price_id` — none of that gets touched, even if an attacker sends it. Clean, safe, obvious.

### Option 2: `$guarded` (Denylist — Risky)

```php
class User extends Model
{
    // These fields are BLOCKED from mass assignment
    protected $guarded = [
        'role',
        'is_admin',
    ];

    // Everything else? Fair game.
}
```

The problem with `$guarded`? You have to *remember* every sensitive field every time you add one. Add a `subscription_tier` column next month? Better remember to guard it. Spoiler: someone won't.

**Pro Tip:** Use `$fillable` always. Allowlists beat denylists in security. Every. Single. Time.

## The Node.js / Express Version Is Even More Dangerous 🟢

Laravel at least has `$fillable` as a concept baked in. Express? You're on your own by default.

```javascript
// BAD: Classic Express mass assignment
app.put('/api/users/:id', async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.params.id,
        req.body,  // 💀 The entire request body. No filter.
        { new: true }
    );
    res.json(user);
});
```

Someone sends `{ "role": "admin" }` in the body. Done. They're an admin.

```javascript
// GOOD: Pick what you actually want to update
app.put('/api/users/:id', async (req, res) => {
    const { name, email, avatarUrl } = req.body; // Destructure ONLY allowed fields

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { name, email, avatarUrl }, // Explicit. Intentional.
        { new: true }
    );
    res.json(user);
});
```

Explicit destructuring is your friend. Don't spread `req.body` anywhere near a database call.

## The API Response Problem: Mass Exposure 📤

Mass assignment has a twin vulnerability nobody talks about enough: **mass exposure** (or "over-fetching").

You guarded mass assignment on input. Did you guard what you send *back*?

```php
// BAD: Sending way too much back
public function show(User $user)
{
    return response()->json($user); // Includes password_hash, stripe_customer_id, 2FA secrets...
}
```

```php
// GOOD: Return only what the client needs
public function show(User $user)
{
    return response()->json([
        'id' => $user->id,
        'name' => $user->name,
        'email' => $user->email,
        'avatar_url' => $user->avatar_url,
    ]);
}
```

Or better yet, use Laravel API Resources:

```php
// UserResource.php — explicit, auditable, safe
public function toArray($request)
{
    return [
        'id' => $this->id,
        'name' => $this->name,
        'email' => $this->email,
    ];
}
```

In my API work at scale, I've found that API Resources aren't just about formatting — they're a security boundary. They force you to consciously decide what leaves your system.

## Real Talk: The "But I Validate First" Trap 🪤

I hear this one constantly:

> "I validate the input with a form request, so I'm safe from mass assignment."

No. Validation and mass assignment protection are different things.

Validation checks: *Is this input formatted correctly?*
Mass assignment protection checks: *Should this input touch the database at all?*

You can validate `role` as a valid string — and still accidentally mass-assign it. They operate at different layers.

Always do both. Validate input. *And* use `$fillable` to gate what hits the model.

## The Audit Checklist 🔍

Before your next deploy, check these:

- [ ] Every Eloquent model has `$fillable` (not `$guarded = []`)
- [ ] No `$request->all()` passed directly to `create()` or `update()`
- [ ] No `$request->all()` spread into Mongoose/Sequelize `update` calls
- [ ] API responses use explicit field selection or API Resources
- [ ] Admin-only fields (`role`, `is_admin`, `plan_id`) are never in `$fillable`
- [ ] Form requests validate AND your model restricts — defense in depth

## The Bounty Report You Don't Want Written About You 🎯

Bug bounty hunters love mass assignment because it's easy to find, easy to reproduce, and the impact is immediately obvious to any triage team. It scores high on CVSS if it touches privilege escalation. It's reported *constantly* on platforms like HackerOne and Bugcrowd.

As someone who's spent time in security communities reading these reports: the fix is always embarrassingly simple. The affected company always sounds sheepish in the disclosure. The reporter always made $500-$5000 for fifteen minutes of fuzzing.

Don't be that company. Two lines of `$fillable` configuration prevent a P1 bug report.

## TL;DR — The Quick Fix 🚀

1. **Add `$fillable` to every model** — explicit allowlist, not a denylist
2. **Never pass `$request->all()`** directly to `create()` or `update()`
3. **Destructure in Node.js** — only extract the fields you need
4. **Use API Resources** for responses — guard what goes out, not just what comes in
5. **Validate + restrict** — they're not the same thing, do both

Mass assignment is the security equivalent of leaving your car unlocked because you figure nobody knows what's inside. The door's right there. Anyone can check.

Lock it.

---

**Questions or found a mass assignment bug in the wild?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love a good responsible disclosure story.

**Check out my other projects on** [GitHub](https://github.com/kpanuragh) — where all the code (hopefully) uses `$fillable`.

*Now go audit your models. I'll wait.* 🔐
