---
title: "Laravel Telescope: Stop Guessing What's Happening in Your App 🔭"
date: "2026-02-26"
excerpt: "Flying blind in production? Laravel Telescope gives your app X-ray vision. Here's how I use it to catch bugs before my users even notice them."
tags: ["laravel", "php", "web-dev", "debugging"]
---

# Laravel Telescope: Stop Guessing What's Happening in Your App 🔭

You know that feeling when a bug hits production, users are screaming, and you're staring at raw log files wondering what on earth just happened? Yeah. Been there. Way too many times. 😅

Then I discovered Laravel Telescope. And my debugging life changed forever.

## What IS Telescope? 🤔

Think of Telescope as your app's personal black box recorder — like the ones in airplanes, but without the whole "we only find it after the crash" part.

It records **everything**: requests, queries, jobs, exceptions, cache hits, mail, notifications, gate checks, scheduled tasks. You name it, Telescope logs it.

And it ships with a gorgeous dashboard right inside your app. No extra SaaS. No monthly fee. Just install and understand your app.

## Installing Telescope Takes 60 Seconds ⚡

```bash
composer require laravel/telescope
php artisan telescope:install
php artisan migrate
```

Visit `/telescope`. Prepare to have your mind blown.

**Real Talk:** Only run Telescope in local and staging. You do NOT want to log every request in production — your database will stage a revolt.

```php
// AppServiceProvider.php
public function register(): void
{
    if ($this->app->environment('local', 'staging')) {
        $this->app->register(TelescopeServiceProvider::class);
    }
}
```

One guard clause. Now it only loads where you actually want it. 🎯

## The Watchers That Saved My Sanity 🧠

### 1. Requests Watcher — See Every HTTP Request

Every request that hits your app, with the full payload, headers, response body, and execution time. In production systems I've built at Cubet, we'd get bug reports like "checkout is slow sometimes." With Telescope on staging, I could reproduce the issue and immediately see the request taking 4 seconds — drilling in revealed 47 database queries firing because *someone* (definitely not me 👀) forgot to eager-load a relationship.

No guesswork. Just facts, timestamps, and accountability.

### 2. Queries Watcher — Catch Slow Queries Red-Handed 🔴

This is my favorite watcher. Telescope highlights slow queries in **angry red**. Like a disappointed parent, but more useful.

As a Technical Lead, I've learned that N+1 queries are the silent killers of Laravel apps. Telescope doesn't just tell you there's a problem — it shows you exactly which query ran, how many times it ran, and the exact line in your codebase where it originated.

**A pattern that saved us in a real project:** We had a product listing page that was mysteriously slow for certain categories. Without Telescope, we'd have been guessing for days. With it, I saw the query watcher screaming: *this query ran 312 times in a single request*. Fixed with one `with()` call. Users noticed immediately.

### 3. Exceptions Watcher — Full Stack Traces, Always 💥

Imagine having a very detail-oriented assistant who writes down every exception with the full stack trace, the request that caused it, the authenticated user, and the exact timestamp. That's the Exceptions watcher.

```
// Before Telescope:
// [2026-02-26 09:23:11] production.ERROR: Call to member function name()
// on null in app/Http/Controllers/OrderController.php:47

// With Telescope:
// Full stack trace ✅
// Request payload that triggered it ✅
// User ID + session data ✅
// Related DB queries ✅
```

**Real production story:** A payment webhook was occasionally failing silently — the job caught exceptions and just... discarded them. Nobody knew. Telescope caught every single failure with the exact webhook payload, HTTP method, and response code. We fixed a months-old bug in an afternoon.

### 4. Jobs Watcher — No More "Did the Queue Worker Run?" 🤷

Remember setting up queue workers and then just *hoping* they work? Those days are over.

Telescope shows every queued job with:
- When it was dispatched and when it actually ran
- How long it took to process
- Whether it succeeded, failed, or retried
- The payload it received

If a job fails, you get the full exception. If it's mysteriously slow, the nested queries watcher tells you exactly why. It's like having a security camera pointed at your queue workers.

## The Killer Feature: Telescope Tags 🏷️

You can tag your Telescope entries to filter by user, tenant, order ID — anything:

```php
Telescope::tag(function (IncomingEntry $entry) {
    if (auth()->check()) {
        return ['user:' . auth()->id()];
    }
    return [];
});
```

Now when a specific customer reports "my order keeps failing," you filter Telescope by their user ID and see **exactly** what they experienced. Their requests, their queries, their exceptions. All in order.

As a Technical Lead, I've learned that "it only happens for user X" bugs are the most demoralizing. Telescope tags turn them from nightmares into 5-minute fixes.

## Pro Tip: The Mail Watcher 💌

This one is underrated. Every email your app sends shows up in Telescope — with a full rendered preview. No more "did the welcome email actually go out?" or "does the password reset look right on mobile?"

During development, I disable actual email sending and let Telescope intercept everything:

```env
MAIL_MAILER=log
```

Every "sent" email shows up beautifully in the dashboard. QA your email templates without spamming real addresses. Your team will thank you.

## Real Talk: Production Use 💬

**Should you run Telescope in production?**

Short answer: carefully.

Telescope writes a LOT to your database. On a high-traffic app it can balloon quickly. If you need it in production, do two things:

**1. Restrict access hard:**
```php
// TelescopeServiceProvider.php
protected function gate(): void
{
    Gate::define('viewTelescope', function ($user) {
        return in_array($user->email, [
            'you@company.com',
            'lead@company.com',
        ]);
    });
}
```

**2. Prune old data aggressively:**
```php
// In your App\Console\Kernel or scheduler
$schedule->command('telescope:prune --hours=24')->daily();
```

Keep 24 hours. That's usually enough to debug yesterday's incident without filling your database.

## Bonus: The Dump Watcher (The `var_dump` Killer) 🎯

You know how developers scatter `dd()` and `dump()` everywhere while debugging? Telescope captures those too — without polluting your API responses.

```php
dump('checking user permissions', $user->roles);
// Shows up in Telescope dashboard ✅
// Your JSON response is clean ✅
// Your colleagues don't see your debug mess ✅
```

I use this constantly when debugging complex Eloquent scopes or authorization logic. It's `dump()` but civilized.

## The Full Watcher Lineup 📋

| Watcher     | What it catches                              |
|-------------|----------------------------------------------|
| Requests    | Every HTTP request + response                |
| Queries     | All DB queries, slow queries highlighted     |
| Exceptions  | Full stack traces, always                    |
| Jobs        | Queue job lifecycle: dispatched → ran → result |
| Logs        | All `Log::info/warning/error` calls          |
| Cache       | Hits, misses, forgotten/written keys         |
| Mail        | Every email sent (with rendered preview!)    |
| Notifications | SMS, push, database — everything          |
| Gates       | Every `can()` / `authorize()` check         |
| Schedules   | Every scheduled task run + output            |
| Dump        | All `dump()` calls without breaking responses |

## The Real Lesson Here 🎓

Here's what 7+ years of Laravel taught me: the difference between a junior dev and a senior dev isn't that seniors write perfect code. It's that seniors *understand what their code is actually doing*.

Telescope bridges that gap. It makes your app transparent. You stop guessing and start knowing.

If you're still debugging with `dd()` and `tail -f storage/logs/laravel.log`, you're leaving a superpower on the table.

Install Telescope today. Your future self at 2 AM debugging a production incident will thank you.

---

**Got a Telescope tip or debugging horror story?** Share it with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got a collection.

**Found this useful?** Star the [GitHub repo](https://github.com/kpanuragh/kpanuragh.github.io) and share it with whoever is still using `var_dump` in 2026.

*Now go install Telescope and finally find out what your app's been hiding from you.* 🔭
