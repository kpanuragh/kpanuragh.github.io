---
title: "Laravel N+1 Queries Are Killing Your App (And You Don't Even Know It) 💀"
date: "2026-02-10"
excerpt: "That 'fast' local app that takes 10 seconds in production? Spoiler: It's N+1 queries. Here's how I hunted them down and made our API 50x faster."
tags: ["laravel", "php", "performance", "eloquent"]
---

# Laravel N+1 Queries Are Killing Your App (And You Don't Even Know It) 💀

Your app runs like a dream on your laptop. Then you deploy to production and suddenly everything's moving like it's stuck in molasses. Users are complaining, your boss is asking questions, and your monitoring dashboard looks like a horror movie.

Congrats! You've got the N+1 problem. 🎉

As a Technical Lead who's debugged this exact issue at 3 AM more times than I care to admit, let me share the battle scars so you don't have to get them.

## What Even IS the N+1 Problem? 🤔

Picture this: You're loading a list of blog posts with their authors.

**What you THINK is happening:**
One query gets posts, another gets all the authors. Done. Two queries total.

**What's ACTUALLY happening:**
One query gets 100 posts. Then 100 MORE queries to get each author individually. That's 101 queries for what should've been 2.

In production with thousands of posts? Your database starts crying. 😭

## The Code That Killed Our API ⚰️

Here's the EXACT code that took down our e-commerce platform during Black Friday (true story, I'm still traumatized):

```php
// Looks innocent, right? WRONG.
public function index()
{
    $orders = Order::latest()->take(100)->get();

    return view('orders.index', [
        'orders' => $orders
    ]);
}
```

Then in the Blade template:

```blade
@foreach($orders as $order)
    <div>
        Order #{{ $order->id }}
        Customer: {{ $order->user->name }}
        Items: {{ $order->items->count() }}
    </div>
@endforeach
```

**The damage:**
- 1 query for orders ✅
- 100 queries for `$order->user` 💀
- 100 queries for `$order->items` 💀
- **Total: 201 queries** 🔥

Each query took ~10ms. That's 2+ seconds just for database queries. Add in network latency, PHP processing, and we were looking at 5-10 second page loads.

Users abandoned carts. Revenue dropped. My phone wouldn't stop ringing.

## The Fix That Saved Black Friday 🚀

**Enter: Eager Loading**

```php
public function index()
{
    // Just add ->with()
    $orders = Order::with(['user', 'items'])
        ->latest()
        ->take(100)
        ->get();

    return view('orders.index', [
        'orders' => $orders
    ]);
}
```

**The damage NOW:**
- 1 query for orders ✅
- 1 query for ALL users ✅
- 1 query for ALL items ✅
- **Total: 3 queries** ⚡

Same functionality. **67x fewer queries**. Page load dropped from 5+ seconds to under 200ms.

I've never been hugged by my boss before that moment. It was awkward but appreciated.

## Real Talk: How I Find These Bastards 🔍

**Tool #1: Laravel Debugbar** (Your new best friend)

```bash
composer require barryvdh/laravel-debugbar --dev
```

It shows you EVERY query. In production systems I've worked on, I've seen pages making 1000+ queries. Debugbar makes them impossible to miss.

**Tool #2: Laravel Telescope**

```bash
composer require laravel/telescope --dev
php artisan telescope:install
php artisan migrate
```

Telescope is like having X-ray vision for your app. It shows slow queries, N+1 problems, and even which line of code caused them.

**Pro Tip:** In production at Cubet, we set up alerts when any request makes >10 queries. Catches issues before users do!

## The Gotchas That WILL Bite You 🐛

### Gotcha #1: Nested Relationships

```php
// This STILL has N+1!
$posts = Post::with('comments')->get();

foreach ($posts as $post) {
    foreach ($post->comments as $comment) {
        // N+1 on comment authors!
        echo $comment->author->name;
    }
}
```

**The fix:**

```php
// Load nested relationships with dot notation
$posts = Post::with('comments.author')->get();
```

Mind = blown. 🤯

### Gotcha #2: Counting Relationships

```php
// Bad: N+1 queries
$users = User::all();
foreach ($users as $user) {
    echo $user->posts->count(); // Queries EVERY time
}
```

**The fix:**

```php
// Good: Just count in the query
$users = User::withCount('posts')->get();
foreach ($users as $user) {
    echo $user->posts_count; // No extra queries!
}
```

This one saved us on a dashboard that shows user statistics. Went from 500+ queries to 1.

### Gotcha #3: Conditional Eager Loading

Sometimes you only need related data IF something is true:

```php
// Loads comments even if we don't need them
$posts = Post::with('comments')->get();

if ($request->has('show_comments')) {
    // Use comments...
}
```

**The fix:**

```php
// Only load when needed
$posts = Post::when($request->has('show_comments'), function ($query) {
    $query->with('comments');
})->get();
```

## The Advanced Moves 💪

### Lazy Eager Loading (When You Forgot Earlier)

```php
// Already loaded posts without comments
$posts = Post::all();

// Oops, now we need comments
// Don't loop and query! Do this:
$posts->load('comments');
```

**Translation:** If you forgot to eager load, you can still fix it before looping. Crisis averted!

### Selecting Specific Columns (Because Why Load Everything?)

```php
// Bad: Loads EVERY column from users table
$posts = Post::with('author')->get();
```

If the users table has 30 columns but you only need name and email:

```php
// Good: Only load what you need
$posts = Post::with('author:id,name,email')->get();
```

**Important:** You MUST include the foreign key (`id`) or Laravel gets confused!

In a project where the users table had profile photos stored as blobs (don't ask, legacy system), this cut our memory usage by 80%.

## The Performance Checklist ✅

Before deploying ANY feature, I run through this:

- [ ] Install Debugbar/Telescope in local environment
- [ ] Load the page and check query count
- [ ] Any >10 queries? Investigate!
- [ ] Eager load relationships with `->with()`
- [ ] Use `->withCount()` for counting relationships
- [ ] Nested relationships? Use dot notation `'comments.author'`
- [ ] Loading full models when you only need IDs? Use `->pluck()`
- [ ] Set up query monitoring in production

## Bonus: The Nuclear Option 🚨

If you've got a REALLY complex page with tons of relationships:

```php
// Disable lazy loading in local/staging
Model::preventLazyLoading(!app()->isProduction());
```

This throws an exception if you try to lazy load. Forces you to eager load everything. It's brutal but effective!

I added this to our staging environment and found 47 N+1 issues we didn't know existed.

## Real-World Impact 📊

In production systems I've optimized:

**E-commerce dashboard:**
- Before: 847 queries, 12s load time
- After: 9 queries, 380ms load time
- **32x faster** ⚡

**API endpoint for mobile app:**
- Before: 203 queries per request
- After: 4 queries per request
- AWS RDS costs dropped 40% 💰

**User profile page:**
- Before: Timeout errors under load
- After: Handles 10x traffic no sweat
- Actually made it through Black Friday 🎉

## The Bottom Line 🎯

N+1 queries are like a slow leak in your boat. You don't notice until you're sinking.

**The pattern:**
1. Any time you loop over Eloquent models
2. And access relationships inside the loop
3. You probably have N+1

**The solution:**
1. Use Debugbar/Telescope (seriously, install them NOW)
2. Eager load with `->with()`
3. Count relationships with `->withCount()`
4. Monitor queries in production

Your database will thank you. Your users will thank you. Your 3 AM self will DEFINITELY thank you.

## Pro Tips From the Trenches 🛠️

**Use Database Query Logging:**

```php
// In AppServiceProvider boot() method (LOCAL ONLY!)
if (app()->environment('local')) {
    DB::listen(function ($query) {
        if ($query->time > 100) { // Queries over 100ms
            logger()->warning('Slow query', [
                'sql' => $query->sql,
                'time' => $query->time
            ]);
        }
    });
}
```

**Set Up Alerts:**

In production, we use CloudWatch to alert if:
- Any request makes >20 queries
- Any query takes >500ms
- Database connections exceed 80%

Catches issues before they become incidents!

---

**Got N+1 horror stories?** I want to hear them on [LinkedIn](https://www.linkedin.com/in/anuraghkp). Misery loves company! 😄

**Want more Laravel performance tips?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) - I'm dropping knowledge bombs weekly!

*Now go forth and eager load everything!* 🚀✨
