---
title: "Laravel Octane: I Made My App 10x Faster Without Touching a Single Feature 🚀"
date: "2026-02-27"
excerpt: "PHP dies after every request. What if it didn't? Laravel Octane keeps your app alive and screaming fast. Here's what happened when I turned it on in production."
tags: ["laravel", "php", "performance", "web-dev", "octane"]
---

# Laravel Octane: I Made My App 10x Faster Without Touching a Single Feature 🚀

Picture this: PHP boots your entire Laravel application, handles one request, and then dramatically dies. Every. Single. Time.

It's like hiring a chef who sets up the entire kitchen, cooks one plate of food, and then burns the building down. Next request? Build another kitchen. Cook one more plate. Burn it down again.

This is how PHP has worked forever. And we just... accepted it.

Then Laravel Octane came along and said: *what if the chef just stayed?*

## What Is Laravel Octane? ⚡

Octane is Laravel's high-octane application server (yes, the name is intentional) that keeps your app **permanently booted in memory**.

No cold starts. No re-bootstrapping the service container. No re-reading config files. No reloading service providers. Your app wakes up once and stays awake, handling thousands of requests from that single warm state.

The difference in production is... not subtle.

**Before Octane (standard PHP-FPM):**
- Boot Laravel (~40-80ms)
- Handle request (~20ms)
- Die
- Boot Laravel again (~40-80ms)
- Handle request (~20ms)
- Die again

**After Octane:**
- Boot Laravel once (~80ms)
- Handle request (~5ms)
- Handle request (~5ms)
- Handle request (~5ms)
- *Still going...*

That bootstrap overhead? Gone. Forever.

## FrankenPHP vs Swoole vs RoadRunner 🤔

Octane supports three server backends. In production systems I've built, here's the honest breakdown:

**FrankenPHP** (my current recommendation): Built on top of Caddy server. Written in Go + PHP. Dead simple to set up — it's a single binary. HTTPS out of the box. Works beautifully with Docker. If you're starting fresh, use this.

**Swoole**: The OG option. Coroutine-based, incredibly powerful, but requires a PHP extension. More complex to configure, but extremely battle-tested.

**RoadRunner**: Go-based process manager. More config-heavy but gives you fine-grained control.

As a Technical Lead, I default to **FrankenPHP** in new projects. Fewer moving parts. Less to configure. Less to break at 3 AM.

## Installing Octane Takes 3 Commands 🛠️

```bash
composer require laravel/octane
php artisan octane:install
php artisan octane:start
```

Visit `http://localhost:8000`. Marvel at your app responding in single-digit milliseconds.

That's genuinely it. For local development, you're done. For production, you'll containerize it (more on that below).

## The Performance Numbers Are Not Reasonable 📊

A pattern that saved us in a real project: we had an e-commerce API endpoint that aggregated product data from multiple Eloquent queries. Under standard PHP-FPM it averaged **210ms** per request. High traffic would push it to **400ms+** and we'd start seeing timeouts.

After switching to Octane with FrankenPHP, the same endpoint: **22ms**. No code changes. No query optimization. No caching tricks. Just Octane keeping the app warm.

The math is straightforward: if Laravel's bootstrap takes 80ms and your actual logic takes 20ms, you're spending **80% of your response time just starting up**. Octane eliminates that 80%.

## The Catch: Shared State Will Destroy You 💥

Here's where Octane gets spicy. Since your app *stays alive* between requests, any state you accidentally leave behind will bleed into the next request. This is the thing that bites everyone.

**The classic trap — static properties:**

```php
// BAD: This bleeds between requests 💀
class CartService
{
    private static ?User $currentUser = null;

    public function setUser(User $user): void
    {
        self::$currentUser = $user; // Still set for the next request!
    }
}
```

```php
// GOOD: Fresh state every time ✅
class CartService
{
    private ?User $currentUser = null;

    // Instance state, not static — Octane re-resolves per request
}
```

**The singleton gotcha:**

If you register a singleton in your service container that holds request-specific data, it'll hold onto it forever. The solution is to reset it in the `octane:start` event, or better — just don't put request-specific data in singletons.

**Real Talk:** Before turning on Octane, I run through every service provider and every `singleton()` binding and ask: "Does this hold any user or request-specific state?" If yes, it gets refactored. This process usually takes an afternoon and finds 2-3 subtle bugs you didn't know you had.

## Octane in Docker (The Production Setup) 🐳

The cleanest way to ship Octane to production:

```dockerfile
FROM dunglas/frankenphp

COPY . /app
WORKDIR /app

RUN composer install --no-dev --optimize-autoloader
RUN php artisan config:cache && \
    php artisan route:cache && \
    php artisan view:cache

CMD ["php", "artisan", "octane:frankenphp", "--workers=4", "--max-requests=500"]
```

The `--max-requests=500` flag is important: after 500 requests, the worker gracefully restarts. This prevents any slow memory leaks from building up over time. It's a safety net, not a crutch.

As a Technical Lead, I've learned that the `--workers` count should match your CPU cores. Don't over-provision. More workers than cores = context switching = slower, not faster.

## Pro Tip: Concurrency Without Extra Infrastructure 🎯

Octane unlocks something truly interesting: concurrent HTTP requests from within your application.

```php
use Laravel\Octane\Facades\Octane;

[$users, $products, $orders] = Octane::concurrently([
    fn () => User::count(),
    fn () => Product::where('active', true)->count(),
    fn () => Order::whereDate('created_at', today())->count(),
]);
```

Three database queries. Running in parallel. Without Redis, without queues, without any additional infrastructure. Just Octane and a few closures.

In a dashboard endpoint that previously fired these sequentially (3 × 40ms = 120ms), this pattern brought it to ~45ms. The queries ran simultaneously.

## Monitoring Octane in Production 🔭

Octane ships with a status command:

```bash
php artisan octane:status
```

But what I actually watch in production are two things:

**Memory per worker**: Each worker should stay relatively flat over time. If memory grows steadily, you have a leak somewhere. Octane's `--max-requests` acts as a pressure valve, but you want to find the root cause.

**Worker restart frequency**: If workers are restarting constantly due to exceptions, something is wrong. Connect this to your error tracking (Sentry, Flare, whatever you use) and alert on it.

## Real Talk: Should You Use Octane? 💬

**Yes, absolutely if:**
- You have a high-traffic API (even moderate traffic sees real gains)
- Your team is comfortable with the stateless discipline it requires
- You're already using Docker in production
- You want the best performance per dollar on your infrastructure

**Pump the brakes if:**
- Your codebase uses lots of global state or static properties everywhere
- You're on shared hosting (Octane needs process control)
- Your team isn't ready to enforce stateless patterns in code reviews

In production systems I've built for e-commerce clients at Cubet, Octane went from "interesting experiment" to "standard architecture" over two years. The performance gains justify the discipline it requires.

## The Checklist Before You Flip the Switch ✅

Before enabling Octane in production:

- [ ] Audit all `static` properties — any that hold request data must go
- [ ] Check every `singleton()` in service providers for state leakage
- [ ] Ensure sessions use Redis or database (not file driver — files work, but ensure no cross-request contamination)
- [ ] Test with concurrent requests to surface any race conditions
- [ ] Set `--max-requests` as a safety valve against memory leaks
- [ ] Set worker count = CPU cores (don't over-provision)
- [ ] Wire up error tracking to alert on worker crashes

## The Bottom Line 🎯

Laravel Octane is the closest thing to free performance in the PHP world. You install a package, change how your app starts, and watch response times drop off a cliff.

The framework bootstrap overhead that PHP developers have tolerated for decades? Octane makes it a one-time cost.

If you're running Laravel in production and haven't tried Octane yet, this weekend is a good time to start. Spin it up locally, run your test suite, and check for state leaks. The migration is usually smoother than you expect.

Your load balancer will notice. Your users will notice. Your AWS bill will definitely notice.

---

**Running Octane in production?** Tell me about your setup on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm always curious about real-world configurations.

**Found this useful?** Star the [GitHub repo](https://github.com/kpanuragh/kpanuragh.github.io) and share it with whoever's still not impressed by PHP performance.

*Now go turn that bootstrap into a one-time cost. Your requests are waiting.* ⚡
