---
title: "Laravel Multi-Auth Guards: Stop Building One-Size-Fits-All Authentication 🔐"
date: "2026-03-18"
excerpt: "Your admin and your customer shouldn't share the same front door. Here's how to build proper multi-authentication guards in Laravel — and why I learned this the hard way in production."
tags: ["laravel", "php", "web-dev", "security", "authentication"]
---

# Laravel Multi-Auth Guards: Stop Building One-Size-Fits-All Authentication 🔐

Picture this: your e-commerce app has customers, admins, and vendor partners. You give all three the same login page, the same `auth` middleware, and the same `$request->user()` call. Everything works. You ship it. You go to sleep feeling like a genius.

Then a vendor accidentally sees an admin dashboard. Then a customer somehow hits an admin API endpoint. Then your 3am pager goes off.

Yeah. I've been that guy. Let me save you the sleep deprivation.

## What Are Auth Guards, Anyway? 🤔

Think of guards like separate security checkpoints at an airport. Economy class has one gate. Business class has another. VIP lounge has its own. Each checkpoint validates the same thing (are you allowed in?) but for different people, using different rules.

Laravel's auth system supports multiple guards out of the box. Most tutorials show you exactly one guard — `web` — and call it a day. In production systems I've built, we almost always need at least two.

## The Setup: Three Guards, Three User Types ⚙️

Let's say you have:
- `users` table → your customers
- `admins` table → your staff/admins
- Token-based auth → your mobile API clients

**Step 1: Create your Admin model**

```php
// app/Models/Admin.php
class Admin extends Authenticatable
{
    use HasFactory;

    protected $guard = 'admin';
    protected $fillable = ['name', 'email', 'password'];
}
```

**Step 2: Register your guards in `config/auth.php`**

```php
'guards' => [
    'web' => [
        'driver' => 'session',
        'provider' => 'users',
    ],
    'admin' => [
        'driver' => 'session',
        'provider' => 'admins',  // 👈 separate session
    ],
    'api' => [
        'driver' => 'sanctum',
        'provider' => 'users',
    ],
],

'providers' => [
    'users' => [
        'driver' => 'eloquent',
        'model' => App\Models\User::class,
    ],
    'admins' => [
        'driver' => 'eloquent',
        'model' => App\Models\Admin::class,  // 👈 different model
    ],
],
```

Two config changes. That's it. Now Laravel knows these are completely separate identities.

## Real Talk: The Middleware Part Always Trips People Up 🪤

Here's where most tutorials skip the important bit. You need separate middleware too.

```php
// routes/web.php
Route::prefix('admin')
    ->middleware(['auth:admin'])  // 👈 specify the guard!
    ->group(function () {
        Route::get('/dashboard', [AdminDashboardController::class, 'index']);
        Route::get('/users', [AdminUserController::class, 'index']);
    });

Route::middleware(['auth:web'])
    ->group(function () {
        Route::get('/dashboard', [UserDashboardController::class, 'index']);
        Route::get('/orders', [OrderController::class, 'index']);
    });
```

Notice the `auth:admin` vs `auth:web`. Without specifying the guard, Laravel defaults to `web` — meaning your admin guard is basically decorative.

**Pro Tip:** If you forget the guard name, `Auth::user()` also returns null. I've spent an embarrassing amount of time debugging this exact thing with `dd(Auth::guard('admin')->user())` before realizing I forgot the colon.

## Logging In: Separate Login Controllers ✅

Don't use the same login controller for both. I know it feels like DRY violation. It's not. These are genuinely different flows.

```php
// app/Http/Controllers/Admin/AuthController.php
class AuthController extends Controller
{
    public function login(Request $request)
    {
        $credentials = $request->only('email', 'password');

        if (Auth::guard('admin')->attempt($credentials)) {
            $request->session()->regenerate();
            return redirect()->intended('/admin/dashboard');
        }

        return back()->withErrors(['email' => 'Invalid credentials.']);
    }

    public function logout(Request $request)
    {
        Auth::guard('admin')->logout();
        $request->session()->invalidate();
        return redirect('/admin/login');
    }
}
```

The key is `Auth::guard('admin')->attempt()`. Without specifying the guard, you're authenticating against the wrong provider and wondering why your admin's password isn't working.

## A Pattern That Saved Us in a Real Project 🚨

In an e-commerce backend I built at Cubet, we had vendors who needed a separate portal. They could see their own products and orders but absolutely nothing else.

The naive approach: add a `role` column to users, check `$user->role === 'vendor'` everywhere.

The problem: one missed check, one forgotten middleware, and a vendor sees another vendor's data. Or worse, sees your margin data.

The guard approach: vendors authenticate via `Auth::guard('vendor')`. The second they're not in the vendor guard, they can't access vendor routes. Period. The guard is the enforcement, not your `if` statements scattered across 40 controllers.

```php
// In your controller — no role checks needed, guard handles it
public function dashboard()
{
    $vendor = Auth::guard('vendor')->user(); // Always a Vendor, never null here
    return view('vendor.dashboard', compact('vendor'));
}
```

Cleaner. Safer. Easier to audit.

## Getting the Current User in Controllers 👤

This is the part developers forget to update after adding guards.

```php
// ❌ This only checks the default 'web' guard
$user = auth()->user();
$user = Auth::user();
$user = $request->user();

// ✅ Be explicit about which guard you want
$admin = auth('admin')->user();
$admin = Auth::guard('admin')->user();
$admin = $request->user('admin');
```

As a Technical Lead, I've learned to always be explicit in multi-guard apps. Implicit guard resolution is a bug hiding in plain sight.

## Bonus: A Clean Base Controller Pattern 🎁

Stop repeating `Auth::guard('admin')->user()` in every admin controller. Use a base controller:

```php
// app/Http/Controllers/Admin/BaseController.php
class BaseController extends Controller
{
    protected function currentAdmin()
    {
        return Auth::guard('admin')->user();
    }

    protected function __construct()
    {
        $this->middleware('auth:admin');
    }
}

// Now every admin controller just extends this
class DashboardController extends BaseController
{
    public function index()
    {
        $admin = $this->currentAdmin(); // ✅ clean
    }
}
```

One place to change if you ever rename the guard. One place to add logging or audit trails. Beautiful.

## Bonus Tips Section 🎯

**Check authentication status by guard:**
```php
if (Auth::guard('admin')->check()) {
    // Admin is logged in
}
```

**Redirect unauthenticated users to the right login page:**
In `app/Http/Middleware/Authenticate.php`, override the `redirectTo` method to check the route and send admins to `/admin/login`, users to `/login`.

**Don't forget to clear the right session on logout.** `Auth::logout()` only logs out the `web` guard. `Auth::guard('admin')->logout()` logs out the admin guard.

**Use `auth()->shouldUse('admin')` sparingly.** It changes the default guard for the request. Fine in middleware, dangerous if you forget it's set.

## TL;DR 💡

Multi-auth guards are Laravel's way of saying "different doors for different people." The setup is:

1. Separate models (or at minimum, separate tables)
2. Separate guard configs in `config/auth.php`
3. Explicit `auth:guardname` in your route middleware
4. Explicit `Auth::guard('name')` calls everywhere

Stop sharing one front door between customers, admins, and API clients. Your 3am on-call rotation will thank you.

---

**Built something multi-tenant with Laravel guards?** I'd love to hear about it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the war stories are always the best part. 😄

**Want more Laravel deep dives?** Check out the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and hit that star button!

*Now go build some secure, properly separated auth. Your users (all three types of them) deserve it.* 🔐
