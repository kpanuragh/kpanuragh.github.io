---
title: "Laravel Gates & Policies: Stop Scattering Auth Logic Everywhere 🔐"
date: "2026-03-19"
excerpt: "You know that `if ($user->role === 'admin')` check you copied into 12 different controllers? Yeah, that's gotta go. Laravel Gates and Policies are here to save your sanity."
tags: ["\"laravel\"", "\"php\"", "\"web-dev\"", "\"authorization\"", "\"security\""]
---

# Laravel Gates & Policies: Stop Scattering Auth Logic Everywhere 🔐

Here's a fun game: search your codebase for `$user->role === 'admin'`.

Go on, I'll wait.

...

How many hits? Fifteen? Twenty? More? Because I did this on a project I inherited back at Cubet, and the answer was *forty-seven*. Forty. Seven. Scattered across controllers, Blade templates, and one particularly creative `if` statement inside a database migration that I still have nightmares about.

Laravel Gates and Policies exist specifically to stop this madness. Let me show you how.

## The Problem in Plain English 🤔

Authentication is "who are you?" Authorization is "what are you allowed to do?"

Most developers nail authentication (thanks, Sanctum, Breeze, Fortify). But authorization gets treated like an afterthought — random `role` checks duct-taped all over the codebase. When requirements change ("admins can now edit, but only their own posts"), you're doing a full-text search and prayer.

**Gates** are for simple, one-off permission checks.
**Policies** are for permission logic tied to a specific model.

That's really it. The rest is just details.

## Gates: The Bouncer at the Door 🚪

Define a gate in `AuthServiceProvider`:

```php
// app/Providers/AuthServiceProvider.php
Gate::define('manage-settings', function (User $user) {
    return $user->is_admin;
});
```

Use it literally anywhere:

```php
// In a controller
if (Gate::denies('manage-settings')) {
    abort(403);
}

// Cleaner version
Gate::authorize('manage-settings'); // Throws 403 automatically

// In Blade
@can('manage-settings')
    <a href="/settings">Settings</a>
@endcan
```

**Real Talk:** In production systems I've built, Gates work great for things that aren't model-specific — bulk exports, accessing a dashboard section, toggling maintenance mode. Simple boolean checks with a name you can search for later.

## Policies: Where It Gets Powerful 💪

A Policy ties authorization logic to a specific model. Generate one:

```bash
php artisan make:policy PostPolicy --model=Post
```

This creates `app/Policies/PostPolicy.php` with methods like `view`, `create`, `update`, `delete`. Fill them in:

```php
class PostPolicy
{
    public function update(User $user, Post $post): bool
    {
        return $user->id === $post->user_id;
    }

    public function delete(User $user, Post $post): bool
    {
        return $user->id === $post->user_id || $user->is_admin;
    }
}
```

Register it in `AuthServiceProvider`:

```php
protected $policies = [
    Post::class => PostPolicy::class,
];
```

Now use it everywhere — and I mean *everywhere*:

```php
// Controller — before
public function update(Request $request, Post $post)
{
    if ($request->user()->id !== $post->user_id) {
        abort(403);
    }
    // ...
}

// Controller — after
public function update(Request $request, Post $post)
{
    $this->authorize('update', $post); // That's it. One line.
    // ...
}
```

```php
// Blade — before
@if(auth()->user()->id === $post->user_id)
    <button>Edit</button>
@endif

// Blade — after
@can('update', $post)
    <button>Edit</button>
@endcan
```

A pattern that saved us in a real project: when the client added "editors" who could update any post (not just their own), I changed *one* method in `PostPolicy`. Done. Zero controller hunting. Zero "did I miss one?" panic at 2am before launch.

## The `before()` Hook: Admin Override 🦸

Policies have a `before()` method that runs before everything else:

```php
public function before(User $user, string $ability): bool|null
{
    if ($user->is_super_admin) {
        return true; // Super admins can do anything
    }

    return null; // null = continue to the actual policy method
}
```

**Pro Tip:** Return `null` (not `false`) to fall through to the specific policy method. Return `false` to explicitly deny regardless of what the method says. This trips up a lot of devs.

## Policy Without a Model 🎯

Sometimes you need to authorize an action that doesn't have a model instance yet — like creating a new post:

```php
class PostPolicy
{
    public function create(User $user): bool
    {
        return $user->hasVerifiedEmail(); // Only verified users can post
    }
}

// Usage
$this->authorize('create', Post::class); // Pass the class, not an instance
```

## Controller Resource Shortcut ⚡

If you're using resourceful controllers, one line covers all the policy methods:

```php
class PostController extends Controller
{
    public function __construct()
    {
        $this->authorizeResource(Post::class, 'post');
    }

    // All CRUD methods are now automatically authorized!
}
```

Laravel maps `index/create/store/show/edit/update/destroy` to the matching policy methods automatically. As a Technical Lead, I've learned this is the single biggest time-saver when building standard CRUD apps — especially with API resources.

## Real Talk: Common Mistakes 💬

**Mistake #1: Forgetting to register the policy**

Laravel has auto-discovery for policies in Laravel 10+ (if your model and policy follow naming conventions). But explicit registration in `$policies` is never wrong and always clearer.

**Mistake #2: Mixing Gates and Policies randomly**

Use Policies for anything model-related. Use Gates for everything else. Consistency means future-you can find the logic in 6 months.

**Mistake #3: Letting Policy logic grow into a monster**

Seen policies with 200 lines of nested conditions. At that point, extract a dedicated `Authorization` service class and inject it into the policy. Your policy should read like a table of contents, not a legal document.

## Bonus Tips 🎁

**Check without throwing an exception:**
```php
if ($user->can('update', $post)) {
    // ...
}
```

**Check in middleware:**
```php
Route::put('/posts/{post}', [PostController::class, 'update'])
    ->middleware('can:update,post');
```

**Return a Response with a reason:**
```php
public function delete(User $user, Post $post): Response
{
    return $user->id === $post->user_id
        ? Response::allow()
        : Response::deny('You can only delete your own posts.');
}
```

That custom message surfaces in your API's 403 response — no more mystery "you don't have permission" messages that confuse users and flood your support inbox.

## TL;DR ✅

- **Gates** = named permission checks for anything not tied to a model
- **Policies** = model-specific authorization logic, all in one place
- Use `$this->authorize()` in controllers, `@can` in Blade, `can:` in route middleware
- `before()` is your admin override — return `null` to fall through, not `false`
- `authorizeResource()` in your constructor wires up CRUD policies automatically

Stop copy-pasting `if ($user->role === 'admin')`. Your future self — the one doing the emergency deploy at 11pm — will thank you profusely.

---

**Got auth logic that's gotten out of hand?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've untangled some real messes and I'm not judging.

**Want more Laravel deep-dives?** The repo is on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io). Star it so you don't miss the next one!

*Now go centralize that authorization logic. Your codebase will feel 10 pounds lighter.* 🏋️
