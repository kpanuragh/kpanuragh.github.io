---
title: "Laravel Telescope: Stop Debugging in the Dark 🔭"
date: "2026-03-16"
excerpt: "You're dd()-ing everywhere like it's 2012. Laravel Telescope gives you X-ray vision into every query, job, exception, and request — in real time."
tags: ["laravel", "php", "web-dev", "debugging", "devtools"]
---

# Laravel Telescope: Stop Debugging in the Dark 🔭

I once spent three hours hunting a bug by sprinkling `dd()` across my codebase like a panicked gardener. When I finally installed Laravel Telescope, I found the bug in *under four minutes*. I stared at my monitor. Then at my three wasted hours. Then at my monitor again.

Don't be past-me. Install Telescope.

## What Even Is Telescope? 🤔

Think of Telescope as your app's black box flight recorder — except you can actually read it *before* the crash. It's a first-party Laravel package that gives you a beautiful dashboard showing everything happening inside your application in real time:

- Every HTTP request (and its response)
- Every database query (including the slow ones you're pretending don't exist)
- Every queued job, scheduled task, and failed exception
- Every log entry, mail sent, notification dispatched, and cache hit/miss

It's like having your production logs, query analyzer, and email debugger all in one place — but actually usable.

## Installing It Takes 3 Minutes ⚡

```bash
composer require laravel/telescope --dev
php artisan telescope:install
php artisan migrate
```

Then hit `/telescope` in your browser. That's it. You're debugging like a grown-up now.

**Real talk:** Use `--dev` so Telescope doesn't ship to production. You don't want users poking around `/telescope` on a live server. I've seen it happen. It's not fun.

## The Features That'll Actually Save Your Life 💀

### 1. The Query Watcher — Expose Your N+1 Crimes 🕵️

This is the one that humbles you. Telescope shows every single SQL query fired during a request, including how long each one took.

Before Telescope, I *thought* our e-commerce product listing page was fine. After Telescope, I discovered it was firing **847 queries** per page load. Eight hundred and forty-seven. The product manager thought our servers were just "a bit slow." They were not just a bit slow.

In production systems I've built, the Query Watcher alone has paid for its installation a hundred times over. Slow query? Highlighted in red. N+1 problem? You'll see the same query repeating 100 times and feel immediate shame.

### 2. The Request Watcher — See What Your API Is Actually Doing 📡

Every inbound HTTP request gets logged with its headers, payload, session data, and response. As a Technical Lead, I've learned that what you *think* your frontend is sending and what it's *actually* sending are often two different things.

```
POST /api/orders
Payload: {"product_id": "abc", "quantity": "2"}
```

Wait — that `quantity` is a string, not an integer. That's why the validation was failing intermittently. Found in 30 seconds. Not 3 hours.

### 3. The Jobs Watcher — Queue Debugging Without `Log::info()` Spam 🔧

Queue jobs are notoriously hard to debug because they run in the background and die silently. Telescope shows you every job dispatched, every job processed, and every job that failed — with the full exception and stack trace.

A pattern that saved us in a real project: our order confirmation jobs were silently failing for customers with special characters in their names. We had no idea for two weeks. Telescope's Jobs Watcher showed us the `Mailer` was choking on encoding. Fixed same day.

### 4. The Exception Watcher — See Errors Before Users Report Them 🚨

This one catches exceptions your `try/catch` blocks suppress and errors that only happen under specific conditions. Every unhandled exception gets logged with full context: the request, the authenticated user, the stack trace.

As someone who's been on-call for production systems handling real traffic, I cannot overstate how valuable it is to see an exception that started spiking at 2:47 AM *before* your phone lights up with Slack messages at 6 AM.

## The Golden Rule: Don't Run Telescope in Production 🚫

Telescope stores a lot of data. Like, *a lot*. On a high-traffic system, it'll eat your storage and slow your database faster than you can say "why is our RDS instance at 100% CPU."

Keep Telescope for local and staging. For production observability, pair it with [Laravel Pulse](https://pulse.laravel.com) (which we covered earlier) or a proper APM like Datadog or New Relic.

If you absolutely must run Telescope in production, configure it to only track certain watchers:

```php
// config/telescope.php
'watchers' => [
    Watchers\ExceptionWatcher::class => true,
    Watchers\QueryWatcher::class => [
        'enabled' => true,
        'slow' => 500, // Only log queries over 500ms
    ],
    Watchers\RequestWatcher::class => false, // Too noisy in prod
],
```

## Pro Tips From 7+ Years of Using This 🎯

**Filter by tag.** Telescope auto-tags entries by user ID, model type, and queue name. When a customer reports a bug, filter by their user ID and see exactly what happened during their session. It's magical.

**Use the `slow` threshold.** Configure the Query Watcher to only flag queries slower than 100ms. Anything above that is a candidate for optimization. Everything below is noise.

**Check Telescope after every new feature.** Before you submit a PR, open Telescope and review the queries your feature generates. Catch N+1 problems before code review instead of in production. Your teammates will think you're a wizard.

**Prune regularly.** Run `php artisan telescope:prune` on a schedule or Telescope's database tables will become their own N+1 problem.

```php
// In App\Console\Kernel
$schedule->command('telescope:prune --hours=48')->daily();
```

## Real Talk 💬

**"I use Debugbar already, do I need Telescope?"**

Laravel Debugbar is great for per-request debugging inline in the browser. Telescope is better for background jobs, async processes, scheduled tasks, and anything that happens *outside* a browser request. Use both — they complement each other.

**"Can I use Telescope on a shared host?"**

Technically yes, practically maybe not. Telescope needs a database table and a background process for pruning. If your shared host lets you run Artisan commands, you're fine. If not, local development only.

**"My team doesn't want to install it."**

Sounds like a team that's never spent 3 hours hunting a bug that Telescope would have found in 4 minutes. I've been there. Show them the Query Watcher. That usually converts people immediately.

## The TL;DR 🏎️

Install Telescope. Use the Query Watcher to eliminate N+1 problems. Use the Jobs Watcher so your queues stop being a black box. Use the Request Watcher when your frontend team swears they're "definitely sending the right data." Prune regularly. Don't run it in production without limits.

Seven years of Laravel development, and Telescope is still the first thing I install on every new project. Right after I set up `.env`. Sometimes before I write a single line of business logic.

Your debugging workflow has been living in the dark ages. Time to turn on the lights.

---

**Found a query monster Telescope helped you slay?** I'd love to hear it — hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp).

**Want more Laravel deep-dives?** The [GitHub repo](https://github.com/kpanuragh/kpanuragh.github.io) has everything, and new posts drop regularly.

*Now go install Telescope before you `dd()` one more time.* 🔭
