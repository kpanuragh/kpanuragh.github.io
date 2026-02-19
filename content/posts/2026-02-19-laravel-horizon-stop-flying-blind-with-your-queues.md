---
title: "Laravel Horizon: Stop Flying Blind with Your Queues 🔭"
date: "2026-02-19"
excerpt: "Your queues are processing jobs in the dark and you have no idea if they're failing. Laravel Horizon is the control tower your background workers desperately need."
tags: ["laravel", "php", "web-dev", "queues", "monitoring"]
---

# Laravel Horizon: Stop Flying Blind with Your Queues 🔭

Picture this: it's Friday evening, you've deployed a shiny new feature that processes user uploads in the background. The boss is happy. You're happy. You grab a coffee and head home.

Monday morning: 2,000 failed jobs, 500 angry users, and a Slack channel on fire.

I've been there. Twice. Before Laravel Horizon saved my sanity.

## What Even Is Horizon? 🤔

You know how you can dispatch jobs to a queue and they run in the background? Great. But do you know *how many* are running? How long they're taking? Which ones failed and why? How many are backed up?

Without Horizon, the answer is a confident "...no."

Horizon is Laravel's official queue dashboard. It gives you real-time visibility into every single thing happening in your background workers — throughput, wait times, failed jobs, worker status, the works. It's like upgrading from flying by feel to having a full cockpit with instruments.

**Real Talk:** In production systems I've built at Cubet, the moment we added Horizon to a high-volume e-commerce platform, we discovered a job that was silently failing 30% of the time due to a timeout issue. Without Horizon's failed job UI, we'd never have caught it. The logs were getting buried.

## Getting Started in 5 Minutes ⚡

```bash
composer require laravel/horizon
php artisan horizon:install
php artisan migrate
```

That's it. Now visit `/horizon` in your browser and prepare to have your mind blown.

**Important:** Horizon only works with Redis queues. If you're still using the `database` driver for queues in production... we need to talk.

```php
// config/queue.php
'default' => env('QUEUE_CONNECTION', 'redis'),
```

## The Dashboard That Actually Makes Sense 📊

The Horizon dashboard shows you:

- **Throughput** — jobs processed per minute (is your system keeping up?)
- **Runtime** — how long jobs are actually taking (that 30-second job you thought was instant...)
- **Wait time** — how long jobs sit in the queue before processing starts
- **Failed jobs** — with full stack traces, not just "something went wrong"

As a Technical Lead, I've learned that the wait time metric alone has saved us from multiple incidents. When wait time spikes, your workers can't keep up — and you want to know that *before* your queue backlog hits 50,000 jobs.

## Configuring Your Workers Like a Pro 🎯

This is where most tutorials stop too early. Horizon isn't just a dashboard — it *manages your workers* too.

```php
// config/horizon.php
'environments' => [
    'production' => [
        'supervisor-1' => [
            'maxProcesses' => 10,
            'balanceMaxShift' => 1,
            'balanceCooldown' => 3,
        ],
    ],
    'local' => [
        'supervisor-1' => [
            'maxProcesses' => 3,
        ],
    ],
],
```

**The magic here:** `balance` (auto-balancing). Horizon watches your queue depths and automatically shifts workers to busier queues. You don't have to manually tune worker counts as traffic changes.

```php
// Before Horizon: static worker count, prayer required
// php artisan queue:work --queue=emails,notifications --tries=3

// After Horizon: workers scale themselves
// php artisan horizon
```

One command. Horizon handles the rest.

## Queue Priorities That Actually Work 🚦

A pattern that saved us in a real project: not all jobs are equal. Payment processing shouldn't wait behind bulk email sends.

```php
// config/horizon.php
'production' => [
    'supervisor-payments' => [
        'queue' => ['payments', 'critical'],
        'maxProcesses' => 5,
    ],
    'supervisor-bulk' => [
        'queue' => ['emails', 'notifications', 'reports'],
        'maxProcesses' => 3,
        'balance' => 'auto',
    ],
],
```

Dispatch jobs to the right queue:

```php
// Critical — goes to fast lane
ProcessPayment::dispatch($order)->onQueue('payments');

// Bulk — gets the regular lane
SendWeeklyNewsletter::dispatch()->onQueue('emails');
```

Your payment jobs no longer wait behind that CSV export someone triggered at 9am.

## Failed Jobs: Your New Best Friend 💀

Stop dreading failed jobs. Horizon makes them *actionable*.

Every failed job gets stored with:
- The exact exception and stack trace
- The full job payload (what data it had)
- Which queue and connection it was on
- How many times it retried

From the dashboard you can retry individual failed jobs or bulk-retry them all. In my experience, most production "incidents" with queues are just transient failures — rate limits, network blips, a third-party API that hiccuped. Horizon's retry UI turns a 2-hour debugging session into a 30-second fix.

```php
// Your jobs should always define this
public $tries = 3;
public $backoff = [1, 5, 10]; // seconds between retries
public $timeout = 60; // kill it if it runs too long
```

**Pro Tip:** Set `$timeout` on every single job. A stuck job without a timeout will block a worker forever. I found this out the hard way when a job hit an infinite loop and took down 4 of our 5 workers.

## Securing the Dashboard 🔒

By default, Horizon is only accessible in `local` environment. For production, you need to define who can access it.

```php
// app/Providers/HorizonServiceProvider.php
protected function gate(): void
{
    Gate::define('viewHorizon', function (User $user) {
        return in_array($user->email, [
            'you@yourcompany.com',
            'devops@yourcompany.com',
        ]);
    });
}
```

Don't skip this. An exposed Horizon dashboard leaks your job payloads, which may contain sensitive data. Security-conscious developer rule #1: don't expose admin tools to the world.

## Running Horizon in Production 🚀

Horizon needs to stay running. Use a process supervisor:

```ini
; /etc/supervisor/conf.d/laravel-horizon.conf
[program:laravel-horizon]
process_name=%(program_name)s
command=php /var/www/html/artisan horizon
autostart=true
autorestart=true
user=www-data
redirect_stderr=true
stdout_logfile=/var/log/horizon.log
stopwaitsecs=3600
```

The `stopwaitsecs=3600` is important — it gives Horizon time to finish processing current jobs before shutting down. Without it, you'll get half-processed jobs on every deploy.

After deploying new code, restart Horizon gracefully:

```bash
php artisan horizon:terminate
# Supervisor auto-restarts it with your new code
```

## The Metrics That Matter 📈

Horizon tracks metrics per queue and per job class. Set up snapshots to keep history:

```php
// routes/console.php (or Kernel.php)
Schedule::command('horizon:snapshot')->everyFiveMinutes();
```

Now you can see trends over time. That job that used to take 200ms and now takes 2 seconds? Horizon will show you exactly when the regression happened.

**Pro Tip:** Set up Horizon alerts for long wait times. We use a simple health check endpoint:

```php
Route::get('/health/horizon', function () {
    $status = Artisan::call('horizon:status');
    return response()->json([
        'status' => $status === 0 ? 'running' : 'stopped'
    ]);
});
```

Ping this from your monitoring tool. If Horizon goes down, you'll know in seconds, not hours.

## Bonus Tips 🎁

**Tag your jobs for filtering:**
```php
public function tags(): array
{
    return ['order:' . $this->order->id, 'user:' . $this->order->user_id];
}
```
Now you can search Horizon for all jobs related to a specific order or user. Invaluable for debugging production issues.

**Pause specific queues without stopping everything:**
```bash
php artisan horizon:pause-supervisor supervisor-bulk
# Bulk jobs pause, payments keep processing
php artisan horizon:continue-supervisor supervisor-bulk
```

This is a lifesaver during maintenance windows.

## TL;DR 🎯

- Horizon = Redis queue monitoring + worker management in one package
- Install it, point it at Redis, visit `/horizon`
- Use supervisor configs to separate critical vs bulk work
- Set `$timeout` and `$tries` on every job (non-negotiable)
- Lock down the dashboard with the Gate
- Run `horizon:snapshot` every 5 minutes for historical metrics
- Deploy with `horizon:terminate` for zero job loss

Your queues are doing real work in the background. They deserve better than flying blind.

---

**Further reading:**
- [Laravel Horizon Docs](https://laravel.com/docs/horizon) — the official docs are genuinely good
- [Laravel Queues Deep Dive](/posts/2026-01-26-laravel-queues-stop-making-users-wait) — if you're new to queues, start here first

Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) if your Horizon dashboard is showing something scary — I've probably seen it before. 😅
