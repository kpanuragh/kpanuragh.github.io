---
title: "Laravel Concurrency: Stop Running Slow Tasks One by One (It's 2026!) ⚡"
date: "2026-03-01"
excerpt: "Your Laravel app is running tasks sequentially like it's waiting in a McDonald's queue. Laravel 11's Concurrency facade lets you run them all at once. Here's how."
tags: ["laravel", "php", "web-dev", "performance", "concurrency"]
---

# Laravel Concurrency: Stop Running Slow Tasks One by One (It's 2026!) ⚡

Picture this: You need to call three third-party APIs for a single user request. Each one takes 300ms. So your user stares at a loading spinner for **900ms**. That's three eternities in web time.

Now what if all three ran *at the same time*? 300ms total. Done.

That's exactly what Laravel's `Concurrency` facade does — and I wish it had existed five years ago.

## The Problem That Made Me Pull My Hair Out 🤦

In production systems I've built, the worst offenders for slow response times weren't database queries. They were **sequential external API calls**.

Imagine a product page that needs:
1. Fetch product details from your inventory service (250ms)
2. Fetch pricing from a pricing engine (200ms)
3. Fetch shipping rates from a carrier API (350ms)

Running these sequentially? **800ms**. Your users hate you.

The old solutions? Spawn raw processes, abuse queues in weird ways, or write gnarly async code. Not fun.

Then Laravel 11.1 dropped the `Concurrency` facade and I nearly cried tears of joy.

## The Simple Magic ✨

```php
use Illuminate\Support\Facades\Concurrency;

[$product, $pricing, $shipping] = Concurrency::run([
    fn () => $this->inventoryService->getProduct($id),
    fn () => $this->pricingEngine->getPrice($id),
    fn () => $this->carrierApi->getShippingRates($id),
]);
```

That's it. Three tasks, running in parallel, results collected in order.

What used to be 800ms is now **~350ms** (the slowest task determines the total time). One line changed. Massive win.

## Real Talk: When I First Used This in Production 💬

A pattern that saved us in a real project: We had a dashboard endpoint that needed to aggregate data from four different services — user stats, order history, recent activity, and loyalty points. The whole thing was taking 1.2 seconds.

**Before (the sequential nightmare):**
```php
public function dashboard(User $user): array
{
    return [
        'stats'    => $this->userService->getStats($user),        // 300ms
        'orders'   => $this->orderService->getRecent($user),      // 400ms
        'activity' => $this->activityService->getLog($user),      // 250ms
        'loyalty'  => $this->loyaltyService->getPoints($user),    // 200ms
    ];
}
```
**Total: ~1,150ms.** The product team was not happy.

**After (the concurrent glow-up):**
```php
public function dashboard(User $user): array
{
    [$stats, $orders, $activity, $loyalty] = Concurrency::run([
        fn () => $this->userService->getStats($user),
        fn () => $this->orderService->getRecent($user),
        fn () => $this->activityService->getLog($user),
        fn () => $this->loyaltyService->getPoints($user),
    ]);

    return compact('stats', 'orders', 'activity', 'loyalty');
}
```
**Total: ~400ms.** The product team bought us pizza.

## How It Actually Works Under the Hood 🔧

Laravel's `Concurrency` facade uses PHP's `fork`-based process isolation by default (the `ProcessDriver`). Each closure runs in a separate child process, with results serialized back to the parent.

**No threads. No race conditions. No shared state disasters.**

Each task runs in complete isolation — they can't accidentally stomp on each other's data. As a Technical Lead, I've learned that "isolated by default" is exactly the safety guarantee you want.

> **Pro Tip:** You can switch drivers if needed:
> ```php
> Concurrency::driver('fiber')->run([...]); // PHP Fibers (same process)
> ```
> The fiber driver is faster for CPU-light tasks but doesn't give true parallelism on CPU-bound work. For external API calls? The process driver is your friend.

## The `defer()` Method: Fire and Forget 🔥

Sometimes you don't need the results right away. You just want to kick something off in the background:

```php
Concurrency::defer([
    fn () => $this->analyticsService->trackEvent($event),
    fn () => $this->auditLog->record($action),
]);

// Response is already sent to the user — these finish after
```

This is different from queues — you don't need a queue worker running. It's synchronous-ish but non-blocking from the user's perspective. Great for logging, analytics pings, and audit trails.

## When NOT to Use Concurrency ⚠️

As a Technical Lead, I've learned to know when *not* to use a shiny tool:

**Don't use it when tasks depend on each other:**
```php
// ❌ WRONG — task 2 needs task 1's result
[$a, $b] = Concurrency::run([
    fn () => $this->getUser($id),
    fn () => $this->getOrdersFor($a), // $a doesn't exist yet!
]);
```

**Don't use it for database-heavy tasks that share transactions** — each process gets its own DB connection.

**Don't overdo it** — spawning 50 concurrent processes on a box with 4 cores isn't a performance win, it's a performance prank.

> **Real Talk:** In production systems I've built on AWS Lambda, I cap concurrent tasks at 4-6. More than that and you're fighting the infrastructure instead of using it.

## Bonus: Combining with Caching 🎯

A pattern I love for data that changes infrequently:

```php
[$stats, $rankings] = Concurrency::run([
    fn () => Cache::remember("user:{$id}:stats", 300, fn() =>
        $this->heavyStatsQuery($id)
    ),
    fn () => Cache::remember("user:{$id}:rankings", 300, fn() =>
        $this->heavyRankingsQuery($id)
    ),
]);
```

Both cache checks and potential cache misses happen concurrently. On a cold cache? Still fast. On a warm cache? Blazing fast.

## The "Is This Better Than Queues?" Question 🤔

I get this a lot. Short answer: they solve different problems.

| | **Queues** | **Concurrency** |
|---|---|---|
| **Use when** | User doesn't need to wait for result | User needs result right now |
| **Speed** | Non-blocking for user, runs later | Parallel, user waits for all tasks |
| **Setup** | Queue worker required | Zero setup |
| **Best for** | Emails, reports, batch processing | API aggregation, dashboard data |

Both are in my production toolkit. They're teammates, not competitors.

## TL;DR ⚡

- **`Concurrency::run()`** — run tasks in parallel, collect all results
- **`Concurrency::defer()`** — kick tasks off without waiting for results
- Best for: multiple external API calls, independent data aggregation, dashboard endpoints
- Not for: tasks that depend on each other, or tasks that need to share database transactions
- Zero queue worker setup required — it just works

---

**The bottom line:** If you have an endpoint making multiple independent calls, you're leaving performance on the table by running them sequentially. `Concurrency::run()` is one of those features where you add three lines of code and your app gets 50-70% faster. That's a rare, beautiful thing.

As a Technical Lead, my job is partly to find those levers. This one's a big one.

---

**Got a use case I missed?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love talking about this stuff.

**Found this useful?** Star the blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and share it with the Laravel dev in your life who's still running things sequentially. 😄

*Now go make those API calls fly in parallel!* 🚀⚡
