---
title: "Laravel Sanctum: Stop Rolling Your Own API Auth (You'll Thank Me Later) 🔐"
date: "2026-03-08"
excerpt: "Every developer has written their own token auth system at least once. Every developer has regretted it. Laravel Sanctum exists so you never make that mistake again."
tags: ["\"laravel\"", "\"php\"", "\"api\"", "\"authentication\"", "\"web-dev\""]
---

# Laravel Sanctum: Stop Rolling Your Own API Auth (You'll Thank Me Later) 🔐

Every developer has done it. You need API authentication, you think "how hard can it be?", and three weeks later you've got a `user_tokens` table, a half-baked token hashing scheme, and a security hole you won't discover until your client calls you at 2 AM.

I've been that developer. I am not proud.

After 7+ years building Laravel APIs — including a full e-commerce backend at Cubet that handled real payment flows — I can tell you with complete confidence: **stop building auth from scratch**. Laravel Sanctum solves this and it's glorious.

## What Even Is Sanctum? 🤔

Sanctum is Laravel's lightweight authentication package for:
- **API tokens** — for mobile apps, third-party clients, anything that isn't a browser
- **SPA authentication** — for your Vue/React frontend talking to a Laravel backend
- **First-party tokens** — personal access tokens users can generate themselves (think GitHub PAT tokens)

It's not Passport (that's OAuth2 for complex multi-app setups). Sanctum is the "I just need my API to be secure" package. Which is 90% of use cases.

## The Setup Is Embarrassingly Simple ⚡

```bash
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan migrate
```

Add the `HasApiTokens` trait to your User model:

```php
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
}
```

That's it. Seriously. Your auth system is now more secure than the custom one you were about to write.

## The Part That Actually Matters: Token Abilities 🎯

Here's what I wish someone had told me early on. Plain tokens are fine, but **token abilities** are where Sanctum gets genuinely powerful.

Think of it like AWS IAM — don't give everything full access. Give tokens exactly the permissions they need.

**Issuing a token with specific abilities:**
```php
// Login endpoint
$token = $user->createToken('mobile-app', ['orders:read', 'orders:create']);

return response()->json([
    'token' => $token->plainTextToken
]);
```

**Checking abilities in your controllers:**
```php
// In your controller or middleware
if (!$request->user()->tokenCan('orders:create')) {
    abort(403, 'This token cannot create orders');
}
```

In production systems I've built, this matters enormously. Our mobile app token could read and create orders but couldn't touch user account settings. Our third-party integrations could only read. Different tokens, different powers. If one token leaks, the blast radius is contained.

## Pro Tip: Token Expiry (Don't Skip This) ⏰

By default Sanctum tokens never expire. That's... not ideal for production.

```php
// In config/sanctum.php
'expiration' => 525600, // 1 year in minutes
```

Or issue tokens with explicit expiry for sensitive operations:

```php
$token = $user->createToken(
    'checkout-session',
    ['checkout:process'],
    now()->addHours(2) // expires in 2 hours
);
```

As a Technical Lead, I've learned this the hard way: tokens stolen from decommissioned mobile apps that never expired are a support nightmare. Set expiry. Always.

## The Auth Guard Setup Everyone Forgets 🛡️

Add `sanctum` as your API guard in `config/auth.php`:

```php
'guards' => [
    'api' => [
        'driver' => 'sanctum',
        'provider' => 'users',
    ],
],
```

Then protect your routes:

```php
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/orders', [OrderController::class, 'index']);
    Route::post('/orders', [OrderController::class, 'store']);
    Route::get('/user', fn (Request $request) => $request->user());
});
```

Clean. No custom middleware. No token-parsing logic scattered through your controllers.

## Real Talk: The Pattern That Saved Us in Production 💬

At Cubet, we built an e-commerce backend where mobile clients, a web SPA, and third-party warehouse integrations all needed to talk to the same API. Each had different trust levels.

Our approach with Sanctum:

```php
// Mobile app — can do almost everything, token rotates on each login
$mobileToken = $user->createToken('mobile', ['*']); // all abilities

// Warehouse integration — read-only, long-lived
$warehouseToken = $user->createToken(
    'warehouse-system',
    ['inventory:read', 'orders:read'],
    now()->addYear()
);

// Checkout webhook — single purpose, short-lived
$checkoutToken = $user->createToken(
    'checkout',
    ['checkout:confirm'],
    now()->addMinutes(30)
);
```

We revoke tokens on logout, on password change, and on suspicious activity detection. Sanctum makes all of this dead simple.

**Revoke specific token:**
```php
$request->user()->currentAccessToken()->delete();
```

**Revoke ALL tokens (password reset, account compromise):**
```php
$user->tokens()->delete();
```

## Bonus Tips That Aren't In the Docs 🎁

**1. Rate-limit your token issuance endpoint**
```php
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1'); // 5 attempts per minute
```

Sanctum doesn't do this automatically. You need to add it. Don't forget.

**2. Always hash check your tokens server-side**
Sanctum does this by default, but if you ever store tokens in your own table for any reason — hash them. Never store plain text tokens. Ever. Use `hash('sha256', $token)`.

**3. Use `$request->user()` not `Auth::user()`**
With Sanctum, `$request->user()` respects the token's guard. `Auth::user()` might not. I've seen subtle bugs from this. Stick to `$request->user()`.

**4. Log token creation**
```php
event(new PersonalAccessTokenCreated($token));
```
Create a listener that logs who created what token when. Security audit trails are your friend.

## The Token Auth Flow Simplified 🚀

```
Mobile App                    Laravel API
    |                              |
    |-- POST /login (credentials) ->|
    |<--- { token: "abc123..." } ---|
    |                              |
    |-- GET /orders                |
    |   Authorization: Bearer abc123|
    |<--- [orders list] ---------- |
    |                              |
    |-- POST /logout ------------->|
    |   (token deleted server-side)|
    |<--- 204 No Content ----------|
```

That's the whole flow. No JWT decode logic. No token refresh complexity. No secret key management headaches. Sanctum handles it all.

## When NOT to Use Sanctum ⚠️

Sanctum is perfect for 90% of APIs. Use Passport (OAuth2) instead when:
- You need to authorize **other applications** to act on behalf of your users (real OAuth flows)
- You're building something that third-party developers will integrate with OAuth2 grants
- You need refresh tokens with complex rotation schemes

For your own mobile app talking to your own API? Sanctum. Every time.

## TL;DR 📋

- Install Sanctum in 3 commands
- Add `HasApiTokens` to User model
- Issue tokens with scoped abilities, not blanket access
- Set token expiry — always
- Revoke tokens on logout and password change
- Use `auth:sanctum` middleware to protect routes

Your users' data is safer. Your codebase is simpler. Your 2 AM support calls decrease dramatically.

---

**Got questions about API auth patterns?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've probably debugged your exact issue before.

**Want to see more Laravel deep-dives?** Star the blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and stay tuned!

*Now go delete that `user_tokens` table you built yourself. You know the one.* 😅
