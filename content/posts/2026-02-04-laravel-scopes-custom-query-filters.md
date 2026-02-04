---
title: "Laravel Scopes: Stop Writing the Same Query Over and Over 🔍"
date: "2026-02-04"
excerpt: "If you're copy-pasting the same WHERE clauses everywhere, Laravel scopes are about to change your life. Clean, reusable query filters that actually make sense!"
tags: ["laravel", "php", "eloquent", "web-dev"]
---

# Laravel Scopes: Stop Writing the Same Query Over and Over 🔍

Have you ever found yourself writing `where('status', 'active')` for the 47th time this week? Yeah, me too. Let's fix that!

As a Technical Lead who's architected multiple e-commerce backends at Cubet Techno Labs, I've seen codebases where the same query logic is duplicated everywhere. It's like having 15 different remotes for your TV when you could just have one good one.

## What the Hell Are Scopes? 🤔

Think of scopes as reusable query filters you can chain onto your Eloquent models. Instead of writing the same `where()` clauses everywhere, you define them once and use them anywhere.

It's like creating a shortcut on your phone. Instead of typing "On my way! Be there in 5 minutes" every time, you just tap a saved message. Same energy!

## The Before Times (aka The Dark Ages) 😱

Here's what your code probably looks like right now:

```php
// In your UserController
$users = User::where('status', 'active')
            ->where('email_verified', true)
            ->get();

// In your AdminController (exact same logic!)
$users = User::where('status', 'active')
            ->where('email_verified', true)
            ->get();

// In your API Controller (seriously?)
$users = User::where('status', 'active')
            ->where('email_verified', true)
            ->get();
```

Copy-paste hell! And what happens when your boss says "Actually, we need to check if they're subscribed too"? You gotta update it in 37 places. Good luck! 🎰

## Enter Scopes: Your New Best Friend ⚡

Here's how scopes save your sanity:

**In your User model:**
```php
class User extends Model
{
    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeVerified($query)
    {
        return $query->where('email_verified', true);
    }
}
```

**Everywhere else (so clean!):**
```php
// One method call. That's it!
$users = User::active()->verified()->get();

// Still chainable with other stuff
$premiumUsers = User::active()
                   ->verified()
                   ->where('plan', 'premium')
                   ->get();
```

See that? One change in the model, and BOOM - it updates everywhere. That's the power of abstraction, baby! 💪

## Real-World Example: E-Commerce Order Filtering 🛒

In production systems I've built at Cubet, we deal with complex order states. Here's how scopes saved us:

**Before (nightmare fuel):**
```php
// In 10+ different controllers
$orders = Order::where('status', '!=', 'cancelled')
              ->where('payment_status', 'paid')
              ->where('created_at', '>=', now()->subDays(30))
              ->get();
```

**After (chef's kiss 👨‍🍳):**
```php
// In the Order model
public function scopeFulfillable($query)
{
    return $query->where('status', '!=', 'cancelled')
                 ->where('payment_status', 'paid');
}

public function scopeRecent($query, $days = 30)
{
    return $query->where('created_at', '>=', now()->subDays($days));
}

// Now everywhere in the codebase
$orders = Order::fulfillable()->recent()->get();

// Need 7 days instead? No problem!
$weekOrders = Order::fulfillable()->recent(7)->get();
```

A pattern that saved us in a real project: When we needed to add "not refunded" to the fulfillable logic, we changed ONE line in ONE place. Not 10+ controllers. That's the difference between 5 minutes and 5 hours of work!

## Dynamic Scopes: When You Need Parameters 🎯

Sometimes you need to pass values to your scopes. Easy peasy:

```php
public function scopeStatus($query, $status)
{
    return $query->where('status', $status);
}

public function scopeCreatedBetween($query, $start, $end)
{
    return $query->whereBetween('created_at', [$start, $end]);
}

// Usage
$posts = Post::status('published')
            ->createdBetween('2026-01-01', '2026-01-31')
            ->get();
```

**Pro Tip:** The first parameter is ALWAYS `$query` - Laravel injects it automatically. Don't forget it or you'll get weird errors (ask me how I know 😅).

## Global Scopes: The Nuclear Option 🚀

Sometimes you want a scope to ALWAYS apply. Like soft deletes, but for your own logic.

**Warning:** Use these sparingly! They apply to EVERY query on that model. Great power, great responsibility, blah blah.

```php
namespace App\Models\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class ActiveScope implements Scope
{
    public function apply(Builder $builder, Model $model)
    {
        $builder->where('status', 'active');
    }
}

// In your model
protected static function booted()
{
    static::addGlobalScope(new ActiveScope);
}

// Now this ONLY gets active users automatically
$users = User::all();

// Need inactive too? Remove the scope
$allUsers = User::withoutGlobalScope(ActiveScope::class)->get();
```

In production systems I've built, we used global scopes for multi-tenancy. Every query automatically filtered by `organization_id`. Saved us from a MASSIVE security bug where we almost showed one company's data to another. Close call! 😰

## Real Talk: When NOT to Use Scopes 💬

**Don't scope yourself into a corner!**

❌ **Bad:** Super specific one-off filters
```php
public function scopeCreatedOnJanuary15th2026($query)
{
    return $query->whereDate('created_at', '2026-01-15');
}
```
This is too specific. Just use a regular `where()`.

❌ **Bad:** Overly complex logic
```php
public function scopeSuperComplexBusinessLogic($query)
{
    // 50 lines of nested queries, joins, and subqueries
}
```
If it's this complex, make a repository method or service class instead.

✅ **Good:** Reusable, clear filters
```php
public function scopePopular($query)
{
    return $query->where('views', '>', 1000);
}

public function scopePublished($query)
{
    return $query->whereNotNull('published_at');
}
```

## The Scope Naming Convention 📝

Laravel has ONE rule: Start with `scope`, then use camelCase.

- `scopeActive` → call with `->active()`
- `scopeVerified` → call with `->verified()`
- `scopeRecentPosts` → call with `->recentPosts()`

Mess this up and Laravel won't find your scope. It's not magic, it's just a naming convention!

## Pro Tips from the Trenches 🎖️

**1. Chain scopes like a boss:**
```php
Post::published()
    ->popular()
    ->recent()
    ->withAuthor()  // This can be a scope too!
    ->get();
```

**2. Scopes work with relationships:**
```php
$user->posts()->published()->recent()->get();
```

**3. Combine with regular queries:**
```php
User::active()
    ->where('email', 'LIKE', '%@gmail.com')
    ->orderBy('created_at', 'desc')
    ->paginate(20);
```

**4. Make them readable:**
```php
// This reads like English!
Order::fulfillable()
     ->recent()
     ->forCustomer($customer)
     ->needsShipping()
     ->get();
```

As a Technical Lead, I've learned that code clarity matters more than clever tricks. These scope names make code reviews SO much easier.

## Bonus: Local Scopes vs Query Builders 🎁

**Question:** "Why not just use query builder classes?"

**Answer:** You can! But scopes are simpler for 80% of cases:

- **Scopes:** Quick, chainable, live on the model
- **Query Builders:** Better for complex, multi-step queries

Don't overcomplicate. Start with scopes. Graduate to query builders when you need them.

## The Scope Checklist ✅

Use scopes when:
- [ ] You're writing the same `where()` clause multiple times
- [ ] The filter has business meaning ("active", "verified", "premium")
- [ ] You want chainable, readable queries
- [ ] The logic might change and you want one place to update

Don't use scopes when:
- [ ] It's a one-off, super specific query
- [ ] The logic is crazy complex (use a service class)
- [ ] You're just being lazy about a single `where()` clause

## The Bottom Line 🎯

Scopes are like having a TV remote instead of walking to the TV every time. They're:

1. **DRY** - Don't Repeat Yourself
2. **Readable** - Code that reads like sentences
3. **Maintainable** - Change once, update everywhere
4. **Chainable** - Mix and match like LEGO blocks

In production systems I've built, scopes have saved us HOURS of refactoring when requirements change (and they always do).

Stop copy-pasting queries. Start using scopes. Your future self will thank you! 🙏

---

**Got scope questions?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). I've been scopin' for 7+ years!

**Want more Laravel wisdom?** Star this blog repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and never miss a post!

*Now go scope like a pro!* 🎯✨
