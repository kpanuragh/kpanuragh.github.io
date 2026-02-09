---
title: "Laravel Cache: Stop Hitting the Database Every Single Time 🚀💾"
date: "2026-02-09"
excerpt: "Your database is crying. Every page load = 47 queries. Let me show you how caching saved our production API from melting down and cut response times by 80%."
tags: ["laravel", "php", "performance", "web-dev"]
---

# Laravel Cache: Stop Hitting the Database Every Single Time 🚀💾

Your users just complained that the app is slow. You check New Relic. 47 database queries. PER PAGE LOAD. Your database is sweating harder than me at the gym. 💦

Let me guess - you're fetching the same categories/settings/user permissions on every single request? Yeah, we've all been there. Time to talk about caching.

## The Problem: Death by a Thousand Queries 🐌

Here's what I see in code reviews ALL THE TIME:

```php
// This runs on EVERY page load
public function index()
{
    $categories = Category::with('subcategories')->get();
    $settings = Setting::all();
    $activeUsers = User::where('active', true)->count();

    return view('dashboard', compact('categories', 'settings', 'activeUsers'));
}
```

Looks innocent, right? Wrong. This data probably changes once a week, but you're hitting the database 100+ times a day for it. Your database hates you. Your users hate you. Your hosting bill hates you. 😅

## Real Talk: The Production Meltdown 💬

In production systems I've built at Cubet, we had an e-commerce API serving 10k+ requests/hour. Every product listing page was querying categories, brands, filters, settings - the same data, over and over.

**Before caching:**
- Response time: 800ms average
- Database CPU: 85% constantly
- Server costs: Too embarrassing to mention

**After implementing smart caching:**
- Response time: 150ms average
- Database CPU: 15% normal operation
- Server costs: Cut in HALF

We literally saved thousands of dollars per month. That's the power of caching done right. 💰

## The Cache Facade: Your New Best Friend 🎯

Laravel makes caching stupidly simple. Here's the basic pattern:

```php
use Illuminate\Support\Facades\Cache;

// Store something
Cache::put('key', 'value', $seconds);

// Get something
$value = Cache::get('key');

// Get with default if not found
$value = Cache::get('key', 'default');

// Store forever (until manually cleared)
Cache::forever('key', 'value');

// Remove from cache
Cache::forget('key');
```

Easy, right? But the REAL magic is in how you use it.

## Pattern #1: Remember Forever (Until You Don't) 🔄

For data that rarely changes:

```php
// Before (hits DB every time)
public function getCategories()
{
    return Category::with('subcategories')->get();
}

// After (hits DB once, then cached)
public function getCategories()
{
    return Cache::remember('categories', 3600, function () {
        return Category::with('subcategories')->get();
    });
}
```

The `remember()` method is GORGEOUS:
1. Check if 'categories' exists in cache
2. If yes → return it (fast!)
3. If no → run the closure, cache the result, return it

One method. One line change. Massive performance boost. This is why I love Laravel. ❤️

## Pattern #2: Cache Tags (The Organized Hoarder) 🏷️

As a Technical Lead, I've learned that cache invalidation is the hardest part. You can't just cache everything forever - data gets stale.

Enter cache tags (requires Redis or Memcached):

```php
// Cache with tags
Cache::tags(['products', 'featured'])->put('featured_products', $products, 3600);
Cache::tags(['products', 'sale'])->put('sale_products', $products, 3600);

// Flush all product-related caches at once
Cache::tags(['products'])->flush();

// Or just flush featured items
Cache::tags(['featured'])->flush();
```

A pattern that saved us in a real project: When a product was updated, we flushed ALL product caches by tag. No need to remember every cache key. Just `Cache::tags(['products'])->flush()` and boom - all product caches gone. 🎯

## Pattern #3: The Model Observer Hook 🪝

Want automatic cache invalidation? Hook into model events:

```php
// app/Observers/CategoryObserver.php
namespace App\Observers;

use App\Models\Category;
use Illuminate\Support\Facades\Cache;

class CategoryObserver
{
    public function saved(Category $category)
    {
        // Clear cache whenever category changes
        Cache::forget('categories');
        Cache::tags(['categories'])->flush();
    }

    public function deleted(Category $category)
    {
        Cache::forget('categories');
        Cache::tags(['categories'])->flush();
    }
}

// Register in AppServiceProvider
Category::observe(CategoryObserver::class);
```

Now your cache AUTOMATICALLY stays fresh. Update a category? Cache clears. Delete a category? Cache clears. You literally don't have to think about it anymore. Set it and forget it! 🔥

## Pattern #4: The Atomic Lock (Race Condition Savior) 🔐

Ever had two requests hit your cache at the EXACT same time when it's empty? Both start rebuilding the cache. Both hit the database. Chaos ensues.

Laravel has you covered:

```php
// Only ONE request builds the cache
$value = Cache::lock('expensive-operation')->get(function () {
    return Cache::remember('expensive-data', 3600, function () {
        // This only runs ONCE even if 1000 requests hit simultaneously
        return $this->veryExpensiveCalculation();
    });
});
```

I've seen this save production systems during traffic spikes. Without the lock, we'd have 100 concurrent requests all rebuilding the same cache. With the lock? One request does the work, 99 wait a few milliseconds. Beautiful. 😍

## Pro Tips from the Trenches 💡

**1. Cache Driver Matters**

```php
// .env
CACHE_DRIVER=redis  // FAST (use in production)
// CACHE_DRIVER=file     // Okay for local dev
// CACHE_DRIVER=database // Why would you do this?
```

In production, use Redis or Memcached. File/database caching defeats the purpose. You're trying to AVOID hitting the database, remember?

**2. Don't Cache User-Specific Data Globally**

```php
// BAD - caches for ALL users
Cache::remember('user_settings', 3600, function () {
    return auth()->user()->settings;
});

// GOOD - cache per user
Cache::remember("user_settings_{$userId}", 3600, function () use ($userId) {
    return User::find($userId)->settings;
});
```

Made this mistake once. User A saw User B's settings. That was a fun bug report. 🤦‍♂️

**3. Cache Warming**

Don't wait for users to hit empty cache:

```php
// artisan command to warm up cache
public function handle()
{
    Cache::remember('categories', 3600, fn() => Category::all());
    Cache::remember('settings', 3600, fn() => Setting::all());
    Cache::remember('popular_products', 3600, fn() => Product::popular()->get());

    $this->info('Cache warmed successfully!');
}

// Run after deployment
php artisan cache:warm
```

**4. Remember to Clear Cache on Deployment**

```bash
# In your deployment script
php artisan cache:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

I've debugged SO many "why isn't my change showing?" issues that were just cached config. Clear that cache! 🧹

## The "Cache Everything" Anti-Pattern ⚠️

Don't cache EVERYTHING just because you can:

**Don't cache:**
- User-specific real-time data (notifications, messages)
- Frequently changing data (stock prices, live scores)
- Small, fast queries (single row lookups by ID)
- Data that MUST be real-time (payment status, inventory counts)

**DO cache:**
- Navigation menus, categories
- Site settings, configurations
- Computed aggregations (counts, stats)
- External API responses
- Complex queries with joins

As a rule: If the query takes < 10ms, caching might not be worth the complexity. If it takes > 100ms, DEFINITELY cache it.

## Real-World Example: Product Listing Page 🛍️

Here's a before/after from an actual e-commerce project:

**Before:**
```php
public function index(Request $request)
{
    $categories = Category::all(); // Query 1
    $brands = Brand::all(); // Query 2
    $filters = Filter::with('options')->get(); // Query 3+
    $products = Product::with('images', 'variants')
        ->where('active', true)
        ->paginate(24); // Query 4+

    return view('products.index', compact('categories', 'brands', 'filters', 'products'));
}
// Total: ~15 queries, 300ms response time
```

**After:**
```php
public function index(Request $request)
{
    $categories = Cache::remember('categories', 3600,
        fn() => Category::all()
    );

    $brands = Cache::remember('brands', 3600,
        fn() => Brand::all()
    );

    $filters = Cache::remember('filters', 3600,
        fn() => Filter::with('options')->get()
    );

    // Don't cache paginated results (they change per page)
    $products = Product::with('images', 'variants')
        ->where('active', true)
        ->paginate(24);

    return view('products.index', compact('categories', 'brands', 'filters', 'products'));
}
// Total: ~3 queries (first hit), ~1 query (cached), 80ms response time
```

80% faster. Same functionality. Five minutes of work. 🚀

## Monitoring Your Cache 📊

Track cache hit rates to know if caching is working:

```php
// Custom middleware to track hits/misses
public function handle($request, Closure $next)
{
    $key = "page_cache_{$request->path()}";

    if (Cache::has($key)) {
        Log::info('Cache HIT', ['key' => $key]);
    } else {
        Log::info('Cache MISS', ['key' => $key]);
        Cache::put($key, true, 60);
    }

    return $next($request);
}
```

If you're seeing mostly misses, your TTL is too short or you're caching the wrong things.

## The Bottom Line

Caching isn't just about speed - it's about scalability. A cached app can handle 10x the traffic without breaking a sweat (or your bank account).

**Your Cache Action Plan:**
1. Identify slow, repeated queries (check your logs!)
2. Cache them with appropriate TTLs
3. Set up cache invalidation (tags or observers)
4. Monitor cache hit rates
5. Profit (literally - lower hosting costs!)

In production systems I've architected, proper caching has been the difference between handling 100 requests/second and 1000 requests/second. Same hardware. Same code. Just smarter data management.

## The Cache Commandments 📜

✅ Cache data that's expensive to fetch
✅ Use tags for organized invalidation
✅ Clear cache on model changes
✅ Use Redis/Memcached in production
✅ Cache warmup after deployments

❌ Don't cache user-specific data globally
❌ Don't cache real-time critical data
❌ Don't forget to clear cache on deploy
❌ Don't use file/database drivers in prod
❌ Don't cache without a plan to invalidate

---

**Your database will thank you.** Your users will thank you. Your hosting bill will DEFINITELY thank you. 💰

**Questions about caching?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I've probably cached that answer already! 😄

**Want more performance tips?** Check out my [Laravel Performance Tips](https://kpanuragh.github.io/posts/laravel-performance-tips) post!

*Now go cache ALL the things!* 🚀💾
