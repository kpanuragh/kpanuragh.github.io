---
title: "Laravel Policies & Gates: Authorization That Doesn't Suck 🔐"
date: "2026-02-08"
excerpt: "Stop putting authorization logic everywhere! Let's use Laravel Policies and Gates to keep your code clean and your users in their lane."
tags: ["laravel", "php", "authorization", "security", "web-dev"]
---

# Laravel Policies & Gates: Authorization That Doesn't Suck 🔐

You know what's worse than having no authorization? Having authorization scattered across your entire codebase like confetti at a wedding! 🎊

I've seen codebases where every controller method starts with 5 lines of permission checks. I've written those codebases. We've all been there. Let's fix it!

## The Problem: Authorization Is Everywhere 😱

**Bad way** (aka "How I Used to Do It"):

```php
public function updatePost(Request $request, Post $post)
{
    if (!auth()->check()) {
        abort(403, 'Not logged in!');
    }

    if (auth()->user()->id !== $post->user_id) {
        abort(403, 'Not your post!');
    }

    if ($post->published && !auth()->user()->isAdmin()) {
        abort(403, 'Cannot edit published posts!');
    }

    // Finally, the actual logic...
    $post->update($request->validated());
}
```

Now imagine that in 20 different controllers. Copy. Paste. Repeat. Cry. 😭

**Here's what we're gonna do instead:**

```php
public function updatePost(Request $request, Post $post)
{
    $this->authorize('update', $post);

    $post->update($request->validated());
}
```

ONE LINE. Clean. Beautiful. This is the way. 🚀

## Policies: Your Authorization Rulebook 📋

Think of Policies as a bouncer with a detailed checklist for EACH model. "Can this user edit THIS post? Let me check my list..."

**Create a policy:**

```bash
php artisan make:policy PostPolicy --model=Post
```

Laravel creates `app/Policies/PostPolicy.php` with some helpful methods:

```php
class PostPolicy
{
    public function update(User $user, Post $post): bool
    {
        // As a Technical Lead, I've learned to keep this simple
        return $user->id === $post->user_id;
    }

    public function delete(User $user, Post $post): bool
    {
        // Authors can delete unpublished posts
        // Admins can delete anything
        return $user->id === $post->user_id && !$post->published
            || $user->isAdmin();
    }

    public function publish(User $user, Post $post): bool
    {
        // Only admins can publish
        return $user->isAdmin();
    }
}
```

**Now use it in your controller:**

```php
class PostController extends Controller
{
    public function update(Request $request, Post $post)
    {
        $this->authorize('update', $post);

        $post->update($request->validated());
        return response()->json($post);
    }

    public function destroy(Post $post)
    {
        $this->authorize('delete', $post);

        $post->delete();
        return response()->json(['message' => 'Deleted!']);
    }
}
```

**The magic:** Laravel automatically finds the right policy based on your model! No registration needed (in most cases). 🎩✨

## Real Talk: The Pattern That Saved Us 💡

In production systems I've built, we had different user roles (customer, vendor, admin) with complex permissions. Here's what worked:

```php
class OrderPolicy
{
    public function view(User $user, Order $order): bool
    {
        // Customers can see their orders
        if ($user->id === $order->customer_id) {
            return true;
        }

        // Vendors can see orders for their products
        if ($user->isVendor() && $order->hasProductsFrom($user)) {
            return true;
        }

        // Admins can see everything
        return $user->isAdmin();
    }

    public function cancel(User $user, Order $order): bool
    {
        // Can't cancel shipped orders
        if ($order->status === 'shipped') {
            return false;
        }

        // Customers can cancel their own orders
        // Admins can cancel anything
        return $user->id === $order->customer_id || $user->isAdmin();
    }
}
```

**Pro Tip:** Put complex business logic HERE, not in controllers! Your future self will thank you. 🙏

## Gates: For When You Don't Have a Model 🚪

Sometimes you need to check permissions that aren't tied to a specific model. Enter Gates!

**Define gates in `AuthServiceProvider`:**

```php
use Illuminate\Support\Facades\Gate;

class AuthServiceProvider extends ServiceProvider
{
    public function boot()
    {
        // Simple check
        Gate::define('access-admin-panel', function (User $user) {
            return $user->isAdmin();
        });

        // Check with parameters
        Gate::define('manage-team', function (User $user, Team $team) {
            return $user->id === $team->owner_id;
        });

        // Before hook - runs before all other checks
        Gate::before(function (User $user, string $ability) {
            if ($user->isSuperAdmin()) {
                return true; // Super admin bypasses everything
            }
        });
    }
}
```

**Use gates in your code:**

```php
// In controller
public function adminDashboard()
{
    if (!Gate::allows('access-admin-panel')) {
        abort(403);
    }

    // Or the helper
    $this->authorize('access-admin-panel');

    return view('admin.dashboard');
}

// In Blade templates
@can('access-admin-panel')
    <a href="/admin">Admin Panel</a>
@endcan

// In route definitions
Route::get('/admin', [AdminController::class, 'index'])
    ->middleware('can:access-admin-panel');
```

## Policy Methods You Should Know 🎯

**The "before" method** - runs before ALL policy checks:

```php
class PostPolicy
{
    public function before(User $user, string $ability): ?bool
    {
        // Admins can do anything
        if ($user->isAdmin()) {
            return true;
        }

        // Return null to continue to other methods
        return null;
    }

    // ... other methods
}
```

**The "viewAny" method** - for index pages:

```php
public function viewAny(User $user): bool
{
    // Can this user see the list of posts at all?
    return $user->hasVerifiedEmail();
}

// In controller
public function index()
{
    $this->authorize('viewAny', Post::class);

    return Post::paginate();
}
```

**Handling guests** - sometimes you want to allow unauthenticated users:

```php
public function view(?User $user, Post $post): bool
{
    // Published posts are public
    if ($post->published) {
        return true;
    }

    // Drafts only visible to author
    return $user && $user->id === $post->user_id;
}
```

Notice the `?User` - that allows null (guest users)!

## Blade Directives: Clean Authorization in Views 🎨

**Instead of this mess:**

```blade
@if(auth()->check() && auth()->user()->id === $post->user_id)
    <button>Edit Post</button>
@endif
```

**Do this:**

```blade
@can('update', $post)
    <button>Edit Post</button>
@endcan

@cannot('delete', $post)
    <p>You can't delete this post</p>
@endcannot

@canany(['update', 'delete'], $post)
    <div class="post-actions">
        <!-- Show action menu -->
    </div>
@endcanany
```

**For non-model checks:**

```blade
@can('access-admin-panel')
    <a href="/admin">Admin</a>
@endcan
```

Clean. Readable. Beautiful. 😌

## Resource Controllers: Automatic Authorization 🤖

Laravel can authorize ALL resource methods automatically!

**In your controller:**

```php
class PostController extends Controller
{
    public function __construct()
    {
        // Automatically authorize all methods
        $this->authorizeResource(Post::class, 'post');
    }

    // Methods like index(), show(), update(), destroy()
    // are automatically authorized!
}
```

**Laravel maps methods to policy methods:**

- `index()` → `viewAny()`
- `show()` → `view()`
- `create()` → `create()`
- `store()` → `create()`
- `edit()` → `update()`
- `update()` → `update()`
- `destroy()` → `delete()`

Set it and forget it! 🎯

## API Responses: Better Error Messages 📱

**Default 403 is boring:**

```php
public function update(User $user, Post $post): Response
{
    return $user->id === $post->user_id
        ? Response::allow()
        : Response::deny('You do not own this post.');
}
```

**Now in your API:**

```php
try {
    $this->authorize('update', $post);
    // Update logic
} catch (AuthorizationException $e) {
    return response()->json([
        'error' => $e->getMessage() // "You do not own this post."
    ], 403);
}
```

**Or use Laravel's built-in handling** - it just works!

## Testing Policies: Don't Skip This! 🧪

A pattern that saved us in a real project:

```php
class PostPolicyTest extends TestCase
{
    public function test_author_can_update_their_post()
    {
        $author = User::factory()->create();
        $post = Post::factory()->create(['user_id' => $author->id]);

        $this->assertTrue($author->can('update', $post));
    }

    public function test_other_users_cannot_update_post()
    {
        $author = User::factory()->create();
        $otherUser = User::factory()->create();
        $post = Post::factory()->create(['user_id' => $author->id]);

        $this->assertFalse($otherUser->can('update', $post));
    }

    public function test_admin_can_update_any_post()
    {
        $admin = User::factory()->admin()->create();
        $post = Post::factory()->create();

        $this->assertTrue($admin->can('update', $post));
    }
}
```

**Trust me:** These tests will save you when you refactor permissions!

## The Authorization Checklist ✅

Before you ship:

- [ ] Created policies for all models with authorization
- [ ] Moved authorization logic OUT of controllers
- [ ] Used `@can` directives in Blade (not manual checks)
- [ ] Added `authorizeResource()` to resource controllers
- [ ] Tested policies with PHPUnit
- [ ] Used Gates for non-model permissions
- [ ] Added meaningful deny messages for APIs

## Common Mistakes (I've Made Them All) 🤦‍♂️

**Mistake #1: Checking auth in multiple places**

```php
// DON'T do this
if ($user->can('update', $post)) {
    if ($user->id === $post->user_id) {  // Already checked in policy!
        // ...
    }
}
```

**Mistake #2: Forgetting the `?` for guest users**

```php
// This breaks for guests
public function view(User $user, Post $post): bool

// This works for guests
public function view(?User $user, Post $post): bool
```

**Mistake #3: Not using `Response::deny()` for better errors**

```php
// Meh
return false;

// Better!
return Response::deny('This post is archived.');
```

## Bonus: Policy Filters for Super Admins 🦸‍♂️

**Want one user to bypass ALL checks?**

```php
class PostPolicy
{
    public function before(User $user): ?bool
    {
        if ($user->email === 'ceo@company.com') {
            return true; // CEO can do anything
        }

        return null; // Continue to normal checks
    }
}
```

**Or in `AuthServiceProvider` for ALL policies:**

```php
Gate::before(function (User $user, string $ability) {
    if ($user->isSuperAdmin()) {
        return true;
    }
});
```

## The Bottom Line 🎯

Authorization is like setting rules for a game:

1. **Define the rules** (Policies/Gates)
2. **Enforce them** (`$this->authorize()`)
3. **Show/hide UI** (`@can` directives)
4. **Test them** (PHPUnit tests)

Stop scattering `if ($user->id === $thing->user_id)` everywhere! Centralize it in Policies. Your codebase will be cleaner, your bugs will be fewer, and you'll sleep better at night. 💤

**Remember:** Authorization isn't just about security—it's about organization. When all your permission logic lives in one place, changing it is easy. When it's scattered across 50 controllers? Good luck! 🎰

---

**Want to chat about Laravel architecture?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). I love discussing real-world patterns!

**Found this useful?** Star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) for more Laravel wisdom!

*Now go write some clean authorization code!* 🔐✨
