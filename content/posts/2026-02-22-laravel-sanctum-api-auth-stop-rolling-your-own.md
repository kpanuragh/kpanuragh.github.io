---
title: "Laravel Sanctum: Stop Rolling Your Own API Auth Like It's 2012 🔐"
date: "2026-02-22"
excerpt: "You're out here writing custom token tables and middleware from scratch while Laravel Sanctum sits in the corner crying. Let's fix that."
tags: ["laravel", "php", "web-dev", "api", "authentication"]
---

# Laravel Sanctum: Stop Rolling Your Own API Auth Like It's 2012 🔐

Let me paint you a picture.

It's 2 AM. A client's mobile app is live next week. You're staring at a `personal_access_tokens` table you hand-rolled at 11 PM, a middleware that may or may not be checking expiry correctly, and a suspicious `sha256` hash function you copied from Stack Overflow in 2019.

Friend, I've been there. Multiple times. And then Laravel Sanctum existed the whole time.

## What Even Is Sanctum? 🤔

Sanctum is Laravel's official lightweight authentication package for two very common scenarios:

1. **API token authentication** — mobile apps, third-party clients, simple SPAs calling your API
2. **SPA authentication** — your own JavaScript frontend authenticating via cookies (the good kind, not the creepy tracking kind)

It's not Passport. Passport is the full OAuth2 server you use when you're building GitHub-level integrations. Sanctum is for the 90% of projects where you just need "this user is who they say they are."

As a Technical Lead, I've learned this the hard way: **always reach for the simpler tool first.** I once spent two weeks setting up Passport for an e-commerce API that had exactly zero third-party OAuth clients. Two weeks. Gone.

## Getting Started ⚡

Sanctum ships with Laravel 11+ out of the box. If you're on an older version:

```bash
composer require laravel/sanctum
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan migrate
```

Then add the `HasApiTokens` trait to your User model:

```php
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;
}
```

That's it. You now have a token system. We're not even 5 minutes in.

## Token-Based Auth: The Bread and Butter 🍞

Here's the classic flow — user logs in, gets a token, uses that token for every API request:

```php
// In your LoginController or AuthController
public function login(Request $request)
{
    $credentials = $request->only('email', 'password');

    if (!Auth::attempt($credentials)) {
        return response()->json(['message' => 'Invalid credentials'], 401);
    }

    $user = Auth::user();
    $token = $user->createToken('mobile-app')->plainTextToken;

    return response()->json([
        'token' => $token,
        'user'  => $user,
    ]);
}
```

The client stores that token, then sends it as a `Bearer` header on every request:

```
Authorization: Bearer 1|abc123xyz...
```

And on your protected routes:

```php
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::post('/orders', [OrderController::class, 'store']);
});
```

**That's the core of it.** Token in, protected routes work. No token, 401 Unauthorized. Clean.

## Token Abilities: Scoped Access 🎯

Here's where Sanctum gets genuinely clever. You can give tokens different abilities (think: permissions at the token level):

```php
// Create a token that can only read orders, not create them
$token = $user->createToken('readonly-client', ['orders:read'])->plainTextToken;

// Create a token with full access
$token = $user->createToken('admin-app', ['*'])->plainTextToken;
```

Then in your controllers:

```php
public function store(Request $request)
{
    if (!$request->user()->tokenCan('orders:create')) {
        abort(403, 'This token cannot create orders.');
    }

    // proceed...
}
```

**In production systems I've built**, we used this heavily for our e-commerce backend at Cubet. Third-party warehouse integrations got read-only tokens. The mobile app got a full-access token. The reporting service got a `reports:read` token. One user, many tokens, each scoped appropriately.

If a token gets compromised? Revoke just that one:

```php
// Revoke the current token
$request->user()->currentAccessToken()->delete();

// Revoke all tokens (nuclear option — user logged out everywhere)
$request->user()->tokens()->delete();
```

## Real Talk: Token Expiry 💬

By default, Sanctum tokens don't expire. That's fine for personal projects. Terrifying for production.

In `config/sanctum.php`:

```php
'expiration' => 60 * 24 * 30, // 30 days in minutes
```

Set it. Don't forget. Your security team will hug you.

**A pattern that saved us in a real project:** we also added a `last_used_at` check in a custom middleware for our high-security admin routes. If a token hadn't been used in 7 days, we forced re-authentication. Paranoid? Yes. Did it prevent a real incident when an admin's laptop got stolen? Also yes.

## SPA Auth: The Cookie Life 🍪

If your frontend is a Vue/React SPA on the **same domain**, use Sanctum's cookie-based auth instead of tokens. It's more secure (no token to steal from localStorage) and honestly simpler.

In `config/sanctum.php`, whitelist your frontend domain:

```php
'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', 'localhost')),
```

Your SPA makes a CSRF cookie request first, then logs in:

```js
// Step 1: Get CSRF cookie
await axios.get('/sanctum/csrf-cookie');

// Step 2: Login
await axios.post('/login', { email, password });

// Step 3: All subsequent requests automatically include the session cookie
const profile = await axios.get('/api/profile');
```

No tokens in localStorage. No `Authorization` headers to manage. The browser handles it. Junior devs cry tears of joy.

## Pro Tips From the Trenches 🛠️

**Don't return the token multiple times.** You get `plainTextToken` exactly once — when you call `createToken()`. After that it's hashed in the database and gone forever. Store it securely or you're showing your user "please log in again" and explaining why.

**Name your tokens meaningfully.** `$user->createToken('token')` is the development equivalent of naming your variables `$x`. Name them `'web-dashboard'`, `'ios-app-v2'`, `'postman-testing'`. Future you will be grateful.

**Use `tokenCan()` over middleware checks for granular control.** It keeps your authorization logic in the code, not scattered across route files.

**Add rate limiting on the login endpoint.** Sanctum handles auth, not brute force protection. Combine with Laravel's built-in rate limiting:

```php
Route::middleware('throttle:5,1')->post('/login', [AuthController::class, 'login']);
```

5 attempts per minute per IP. Done.

## Sanctum vs Passport: When to Use Which? ⚖️

| Use Sanctum if... | Use Passport if... |
|---|---|
| You're building an API for your own app | You need full OAuth2 (authorization codes, client credentials) |
| Mobile app auth | Third-party apps need to auth via YOUR server |
| SPA on same domain | You're building something like "Login with MyApp" |
| Simple token revocation | You need refresh tokens with complex grant flows |

90% of the projects I've seen: Sanctum. The other 10%: they thought they needed Passport and actually needed Sanctum.

## Bonus: Quick Token Listing 🎁

Add a `GET /tokens` route to let users manage their own sessions — which apps are logged in, when they last used the token:

```php
Route::get('/tokens', function (Request $request) {
    return $request->user()->tokens()->select('id', 'name', 'last_used_at', 'created_at')->get();
});
```

Users can see "Oh, that's the token from my old laptop" and delete it themselves. UX win, security win.

## TL;DR 🏁

- **Sanctum = lightweight API auth** for your own apps
- Token-based for mobile/API clients, cookie-based for SPAs
- Add `HasApiTokens`, call `createToken()`, protect routes with `auth:sanctum`
- Use token abilities to scope access
- Set `expiration` in config — always
- Passport is for OAuth2 servers, not for "I need API auth"

Stop writing custom auth middleware at 2 AM. Your users, your security team, and your sleep schedule all deserve better.

---

**Debugging Sanctum issues?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've debugged more Sanctum cookie issues than I care to admit. 😅

**More Laravel deep-dives:** check the [blog archive](/posts) or star the [GitHub repo](https://github.com/kpanuragh/kpanuragh.github.io).

*Now go ship that API.* 🚀
