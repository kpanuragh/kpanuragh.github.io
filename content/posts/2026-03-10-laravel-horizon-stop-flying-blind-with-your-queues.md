---
title: "Laravel Horizon: Stop Flying Blind With Your Queues 🔭"
date: "2026-03-10"
excerpt: "Your queue workers are silently failing in production and you have NO idea. Laravel Horizon is the beautiful dashboard that gives you X-ray vision into your background jobs — and it takes 5 minutes to set up."
tags: ["laravel", "php", "web-dev", "queues", "redis"]
---

# Laravel Horizon: Stop Flying Blind With Your Queues 🔭

Picture this: it's 11 PM, your e-commerce site is processing Black Friday orders, and suddenly... order confirmation emails just stop arriving. Users are panicking. You SSH into the server, run `ps aux | grep artisan`, squint at the output like you're reading ancient Sanskrit, and have absolutely no idea what's happening.

I lived this nightmare. And then I discovered Laravel Horizon.

## The Problem: Queue Workers Are a Black Box 📦

You've set up Laravel queues. You're dispatching jobs. Everything *seems* fine. But do you know:

- How many jobs are waiting right now?
- Which jobs failed in the last hour?
- How fast your workers are processing?
- Which queue is backed up because someone dispatched 50,000 jobs by accident?

If your answer is "uh... no?" — congratulations, you're flying blind at 35,000 feet with no instruments. Not ideal!

**The old way of checking your queues:**
```bash
# Checking failed jobs like an archaeologist
php artisan queue:failed

# Watching workers with zero visibility
php artisan horizon
# ...and then staring at a blank terminal hoping for the best
```

Painful. Manual. Embarrassing in a post-mortem.

## Enter Laravel Horizon 🚀

Horizon is an official Laravel package that gives you a gorgeous, real-time dashboard for your Redis queues. Think of it as the mission control for your background jobs — except it doesn't cost billions of dollars.

**Installation is hilariously simple:**
```bash
composer require laravel/horizon
php artisan horizon:install
php artisan migrate
```

That's it. You now have a `/horizon` dashboard that shows you everything.

## What Horizon Actually Shows You ⚡

When I first opened the Horizon dashboard in production, I had a moment. In production systems I've built, we were processing 10,000+ jobs per hour and I was previously checking this with artisan commands like a caveman. Horizon showed me:

- **Throughput** — jobs processed per minute, in real-time
- **Runtime** — how long each job type actually takes (spoiler: that one job was taking 8 seconds, not the 200ms we assumed)
- **Failed jobs** — with full stack traces, right there in the browser
- **Queue depths** — see at a glance if `emails` is backed up but `notifications` is flying
- **Recent jobs** — searchable, filterable, beautiful

The first time I saw a queue backing up in real-time on the graph, I felt like a surgeon who finally got an X-ray machine.

## Pro Tip: Supervisor Configuration 🎯

Horizon doesn't just monitor — it manages your workers too. You define "supervisors" in `config/horizon.php`:

```php
'production' => [
    'supervisor-1' => [
        'maxProcesses' => 10,
        'balanceMaxShift' => 1,
        'balanceCooldown' => 3,
    ],
    'supervisor-2' => [
        'queue' => ['critical', 'default'],
        'balance' => 'auto',
        'maxProcesses' => 15,
    ],
],
```

**The `balance => 'auto'` part is chef's kiss.** Horizon auto-balances workers between queues based on load. On Black Friday, when your `orders` queue spikes, Horizon pulls workers from the quiet `newsletters` queue automatically. No manual intervention needed.

As a Technical Lead, I've learned that auto-balancing alone has saved us from more incidents than I care to admit.

## Real Talk: The Production Story 💬

At Cubet, we built a serverless e-commerce backend handling order processing, email notifications, inventory updates, and webhook dispatching — all through queues. Pre-Horizon, every incident started with someone saying "I think the queue is stuck?" and a 20-minute investigation.

Post-Horizon, our on-call flow became:

1. Open `/horizon` dashboard (30 seconds)
2. See exactly which queue is backed up and why (1 minute)
3. Fix it (depends on the bug, not on our investigation skills)

We went from "maybe something is wrong?" to "yes, exactly THIS job is failing, here's the stack trace, it's been failing for 3 minutes."

**A pattern that saved us in a real project:** We set up Horizon metrics to alert us when queue depth exceeded 500 jobs. Caught a runaway loop that was dispatching duplicate jobs — before any customer noticed.

## Securing Your Dashboard 🔐

Don't ship Horizon to production and forget to lock it down. The default gate only allows local access. Add proper authorization in `app/Providers/HorizonServiceProvider.php`:

```php
protected function gate(): void
{
    Gate::define('viewHorizon', function ($user) {
        return in_array($user->email, [
            'admin@yourcompany.com',
            'you@yourcompany.com',
        ]);
    });
}
```

Or better, use a role check. Nothing worse than exposing your job queue internals to the world. Security-conscious developers — and I count myself among them — don't leave dashboards unprotected.

## Bonus Tips 🎁

**Tag your jobs** for easier filtering in the dashboard:
```php
class ProcessOrder implements ShouldQueue
{
    public function tags(): array
    {
        return ['order:' . $this->order->id, 'user:' . $this->order->user_id];
    }
}
```

Now you can search Horizon for a specific order ID and see exactly what happened to it. Customers asking "where's my order?" become a 10-second lookup instead of a database spelunking expedition.

**Set job timeouts** — Horizon respects them and shows you timed-out jobs separately:
```php
public $timeout = 60; // Kill job if it takes longer than 60 seconds
public $tries = 3;    // Retry 3 times before giving up
```

**Use Horizon's metrics** in your status pages. We pipe queue throughput data into our internal health dashboard — if throughput drops to zero during business hours, something is very wrong.

## The TL;DR Checklist ✅

Before you call yourself a "queue person" in Laravel:

- [ ] Install Horizon (`composer require laravel/horizon`)
- [ ] Run it under Supervisor in production (not just `php artisan horizon` in a tmux)
- [ ] Configure multiple supervisors with auto-balancing
- [ ] Lock down the dashboard with proper authorization
- [ ] Tag your jobs for searchability
- [ ] Set up alerts on queue depth
- [ ] Actually check the dashboard during incidents (revolutionary, I know)

## The Bottom Line

Queues without Horizon are like driving at night without headlights. Sure, you *might* make it to your destination. But do you really want to find out what happens when you don't?

In 7 years of Laravel development, the single highest ROI thing I've added to any production system is Horizon. It takes 5 minutes to install, costs nothing, and has saved us from hours of incident investigation more times than I can count.

Your users don't know what a queue is. They just know their emails aren't arriving. Horizon helps you fix that before they notice.

---

**Hit a queue crisis at 2 AM?** I've been there. Drop me a message on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — misery loves company and I probably have a war story that'll make you feel better. 😄

**Want more Laravel deep-dives?** Star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) — new posts drop regularly!

*Now go add Horizon to your stack. Your future self at 2 AM will thank you.* 🌙
