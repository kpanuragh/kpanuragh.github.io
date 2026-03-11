---
title: "Laravel Pulse: Stop Finding Out About Outages on Twitter 🩺"
date: "2026-03-11"
excerpt: "Your app is probably dying right now and you have absolutely no idea. Laravel Pulse is the health dashboard you didn't know you desperately needed."
tags: ["laravel", "php", "web-dev", "monitoring", "devops"]
---

# Laravel Pulse: Stop Finding Out About Outages on Twitter 🩺

You know that sinking feeling when a user sends you a "hey is your site down?" DM... at 2am... and you have no dashboards, no alerts, and absolutely zero idea what's happening on your server?

Yeah. I've been there. Multiple times. Before Laravel Pulse entered my life.

## What Even Is Laravel Pulse? 🤔

Laravel Pulse is a **free, first-party real-time application monitoring dashboard** built right into the Laravel ecosystem. Think of it as a health monitor for your app — like having a doctor permanently watching your server's vitals instead of only calling 911 after the patient has already flatlined.

It shows you:
- Slow requests and slow jobs (the ones quietly murdering your UX)
- Queue performance and job failures
- Database query performance
- Cache hit/miss ratios
- Memory and CPU usage
- Who your heaviest users are (the ones hammering your API at 3am)

In production systems I've built at Cubet, we were flying completely blind for months. Custom cron jobs to ping endpoints. CloudWatch alarms set to thresholds that were basically "alert me when the building is already on fire." Pulse changed that completely.

## Setup in 60 Seconds 🚀

```bash
composer require laravel/pulse
php artisan vendor:publish --provider="Laravel\Pulse\PulseServiceProvider"
php artisan migrate
```

Add the dashboard route to your app:

```php
// routes/web.php
Route::get('/pulse', function () {
    return view('vendor.pulse.dashboard');
})->middleware(['auth']); // Don't forget auth!
```

That's genuinely it. Visit `/pulse` and you're staring at real data about your running application. No third-party SaaS, no credit card, no GDPR nightmares.

**Pro Tip:** Gate it properly so only admins can see it:

```php
// In a ServiceProvider or Pulse config
Pulse::authorize(function (Request $request) {
    return $request->user()?->isAdmin();
});
```

A pattern that saved us in a real project: we had a junior dev accidentally expose `/pulse` without auth during a deploy. Three users found it before we did. Gate. Your. Dashboards.

## The Real Talk: What Pulse Actually Saves You From 💬

### Slow Queries You Didn't Know Existed

Here's one that aged me five years. We had an e-commerce checkout flow that was *"fine"* in local dev. Tested on 50 products. Deployed to production with 50,000 products.

Pulse's slow query recorder showed us a query taking **4.2 seconds** on every checkout attempt. Without Pulse, we would have found out via 1-star reviews mentioning "checkout is broken."

Enable the slow query recorder in `config/pulse.php`:

```php
'recorders' => [
    \Laravel\Pulse\Recorders\SlowQueries::class => [
        'threshold' => 1000, // ms — flag anything over 1 second
    ],
],
```

### Queue Jobs Going Rogue 🏃

The worst production incident I've ever been part of involved a queue worker processing a "send newsletter" job — except the job kept throwing a silent exception and requeuing itself. For **6 hours**. We sent the same newsletter to 40,000 subscribers 847 times.

Pulse shows your failed jobs, queue sizes, and throughput at a glance. If your `emails` queue has 50,000 pending jobs at midnight when it should be empty... you know something's wrong before your users' inboxes do.

### Your Heaviest Users (The Ones Breaking Everything)

Pulse includes a "slow endpoints" and "usage" section that shows which users are hammering your API hardest. As a Technical Lead, I've learned this is almost always one of three culprits:

1. A mobile client with a bug that retries infinitely
2. A competitor scraping your public endpoints
3. An intern who wrote `while(true) { fetch('/api/data'); }`

Pulse lets you see the `user_id` behind those spikes. Then you can have *a conversation*.

## What Pulse Is NOT 🚫

**Pulse is not Telescope.** This trips people up constantly.

- **Telescope** = detailed request inspector. Great for debugging individual requests in dev/staging. Like a magnifying glass — incredible detail, huge storage cost.
- **Pulse** = aggregate health metrics for production. Like a vital signs monitor — trends over time, lightweight, built to run forever in prod.

Run both, use each for what it's good at. In production, disable Telescope's watchers you don't need. Keep Pulse always on.

## Pro Tips From the Production Trenches 🎯

**Tip 1: Use a separate database for Pulse in high-traffic apps.**

Pulse writes a *lot* of data. In a system processing thousands of requests per minute, Pulse inserts were causing write contention on our main DB. The fix:

```php
// config/pulse.php
'storage' => [
    'driver' => 'database',
    'connection' => 'pulse', // separate DB connection
],
```

Add a `pulse` connection in `config/database.php` pointing to a cheap read/write DB or even SQLite if you're on a single server. Your main DB will thank you.

**Tip 2: Set proper sampling to control storage.**

```php
'recorders' => [
    \Laravel\Pulse\Recorders\Requests::class => [
        'sample_rate' => 0.25, // Only record 25% of requests
    ],
],
```

In a high-traffic e-commerce backend, recording every single request is overkill. 25% sampling still gives you accurate trend data without filling up your DB.

**Tip 3: Filter out health check noise.**

Load balancers pinging `/health` every 5 seconds will pollute your slow-request metrics. Filter them:

```php
'recorders' => [
    \Laravel\Pulse\Recorders\Requests::class => [
        'ignore' => [
            '#^/health$#',
            '#^/ping$#',
        ],
    ],
],
```

## The "Before Pulse / After Pulse" Reality Check 📊

**Before Pulse:**
- Outage discovered via Twitter DM
- 45 minutes of `tail -f storage/logs/laravel.log`
- "It seems fine now, not sure what happened"
- Users lose trust, you lose hair

**After Pulse:**
- Dashboard shows memory spike at 2:07am
- Slow query recorder shows one specific endpoint degrading
- Failed job count jumped from 0 to 847
- Root cause found in 3 minutes

As a Technical Lead, I've learned that the difference between a team that looks professional and a team that looks chaotic is almost entirely about observability. Pulse gives you observability for free, in an afternoon.

## Bonus: Pulse + Slack Alerts = Sleep at Night 😴

Pulse doesn't send alerts out of the box, but combine it with Laravel's scheduler and you've got something beautiful:

```php
// In your Console/Kernel.php or a scheduled command
Schedule::call(function () {
    $failedJobs = DB::table('pulse_values')
        ->where('type', 'failed_job')
        ->where('timestamp', '>', now()->subMinutes(5)->timestamp)
        ->count();

    if ($failedJobs > 10) {
        // Fire a Slack notification
        Notification::route('slack', config('services.slack.webhook'))
            ->notify(new ProductionAlertNotification($failedJobs));
    }
})->everyFiveMinutes();
```

This is the kind of thing that separates "we deploy and pray" from "we deploy with confidence."

## TL;DR 🎯

- **Install Pulse:** one composer command, done
- **Gate the dashboard** — seriously, auth protect it
- **Use a separate DB connection** in high-traffic production
- **Sample requests** instead of recording everything
- **Filter health check noise** from your metrics
- **Combine with scheduler alerts** for proactive monitoring

Laravel Pulse is one of those features where you install it and immediately think *"how was I shipping to production without this?"*

Your app has been whispering its problems to you this whole time. Pulse just finally gives it a voice.

---

**Running a production Laravel app?** I'd love to hear what monitoring setup you're using — hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp).

**Want more production Laravel tips?** The blog's on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) — star it if this saved you from a 2am outage! ⭐

*Now go install Pulse before your users find the bug first.* 🩺
