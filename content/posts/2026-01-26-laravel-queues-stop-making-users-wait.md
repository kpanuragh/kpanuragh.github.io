---
title: "Laravel Queues: Stop Making Your Users Wait Like It's the DMV 🚦"
date: "2026-01-26"
excerpt: "Your users are staring at loading spinners while you send emails? Let's fix that with Laravel queues - the secret weapon for background tasks!"
tags: ["laravel", "php", "web-dev", "queues", "performance"]
---

# Laravel Queues: Stop Making Your Users Wait Like It's the DMV 🚦

You know that feeling when you click "Sign Up" and the page just... hangs? Meanwhile, the server is busy sending a welcome email, resizing profile pictures, notifying admins, updating analytics, and probably making coffee too. ☕

Your users don't care about any of that. They just want to see "Success!" and move on with their lives!

Enter Laravel Queues - the art of saying "I'll handle that later" without being a jerk about it.

## What's a Queue Anyway? 🤔

Think of it like a restaurant kitchen:
- **Without queues:** The waiter takes your order, goes to the kitchen, cooks your food, brings it back. You wait 45 minutes. Everyone's angry.
- **With queues:** The waiter takes your order, gives it to the kitchen, serves the next customer. Kitchen cooks in the background. Everyone's happy!

In Laravel terms: stick slow tasks in a queue, return the response immediately, process tasks in the background. Magic! ✨

## The Classic Problem 😫

**Scenario:** User registers on your site

```php
public function register(Request $request)
{
    $user = User::create($request->validated());

    // Send welcome email (2 seconds)
    Mail::to($user)->send(new WelcomeEmail());

    // Notify admins (1 second)
    Mail::to('admin@app.com')->send(new NewUserNotification($user));

    // Generate PDF welcome guide (3 seconds)
    PDF::generate($user);

    // Update analytics (1 second)
    Analytics::track('user_registered', $user);

    return response()->json(['message' => 'Welcome!']);
    // User waited 7 SECONDS for this response! 😱
}
```

**User experience:** Click... wait... wait... wait... "Is this thing broken?"

## The Queue Solution 🎯

```php
public function register(Request $request)
{
    $user = User::create($request->validated());

    // Queue everything!
    SendWelcomeEmail::dispatch($user);
    NotifyAdmins::dispatch($user);
    GenerateWelcomeGuide::dispatch($user);
    TrackRegistration::dispatch($user);

    return response()->json(['message' => 'Welcome!']);
    // User waited like 200ms! 🚀
}
```

**User experience:** Click... "Welcome!" ... Done!

(Meanwhile, your queue worker is handling all that stuff in the background like a boss)

## Creating Your First Job 💼

Laravel makes this ridiculously easy:

```bash
php artisan make:job SendWelcomeEmail
```

This creates a file in `app/Jobs/SendWelcomeEmail.php`. Now fill it in:

```php
<?php

namespace App\Jobs;

use App\Mail\WelcomeEmail;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class SendWelcomeEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public User $user
    ) {}

    public function handle(): void
    {
        Mail::to($this->user)->send(new WelcomeEmail());
    }
}
```

**That's it!** Now just dispatch it:

```php
SendWelcomeEmail::dispatch($user);
```

## Queue Drivers: Pick Your Poison ☠️

Laravel supports multiple queue backends:

**Database** (Easiest to start with)
```bash
# .env
QUEUE_CONNECTION=database

# Create jobs table
php artisan queue:table
php artisan migrate
```

**Redis** (The popular kid)
```bash
# .env
QUEUE_CONNECTION=redis

# Install predis
composer require predis/predis
```

**Amazon SQS, Beanstalkd, etc.** (For when you're fancy)

**Real talk:** Start with database queues. They're simple and work great for most apps. Move to Redis when you're processing thousands of jobs per minute.

## Running the Queue Worker 🏃

Your jobs won't run themselves! You need a worker:

```bash
php artisan queue:work
```

**In production:** Use Supervisor to keep your worker running 24/7:

```ini
[program:laravel-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /path/to/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
numprocs=8
user=www-data
```

**Pro tip:** Run multiple workers for better throughput! (See `numprocs=8` above)

## The Power Features ⚡

### Delayed Jobs
```php
// Send reminder email in 1 hour
SendReminder::dispatch($user)->delay(now()->addHour());
```

### Job Chains (Do this, then that)
```php
Bus::chain([
    new ProcessVideo($video),
    new GenerateThumbnails($video),
    new NotifyUser($video),
])->dispatch();
```

### Job Batches (Track multiple jobs as one)
```php
Bus::batch([
    new ImportRow(1),
    new ImportRow(2),
    new ImportRow(3),
])->then(function (Batch $batch) {
    // All jobs completed!
})->dispatch();
```

### Retry Failed Jobs
```php
// In your job class
public $tries = 3;
public $backoff = [60, 120, 300]; // Wait 1min, 2min, 5min between retries

public function failed(Throwable $exception): void
{
    // Send alert, log it, cry a little
    Log::error('Job failed: ' . $exception->getMessage());
}
```

## What Should You Queue? 📋

**Queue these:**
- ✅ Sending emails
- ✅ Image/video processing
- ✅ PDF generation
- ✅ API calls to external services
- ✅ Data exports
- ✅ Notifications
- ✅ Database cleanup
- ✅ Anything taking > 1 second

**Don't queue these:**
- ❌ Things users need immediately (like fetching their profile data)
- ❌ Simple database queries
- ❌ Authentication checks
- ❌ Stuff that's already fast

## Common Gotchas 🪤

**Gotcha #1: Serialization Issues**
```php
// Bad: Passing closures
SomeJob::dispatch(function() { /* ... */ }); // Won't work!

// Good: Pass simple data
SomeJob::dispatch($userId); // Then fetch user in handle() method
```

**Gotcha #2: Jobs Not Running**
Did you forget to start the worker? 😅
```bash
php artisan queue:work
```

**Gotcha #3: Changes Not Reflecting**
Worker caches your code! Restart it after changes:
```bash
php artisan queue:restart
```

## Monitoring Your Queues 📊

**See failed jobs:**
```bash
php artisan queue:failed
```

**Retry all failed jobs:**
```bash
php artisan queue:retry all
```

**Clear failed jobs:**
```bash
php artisan queue:flush
```

**Pro move:** Use [Laravel Horizon](https://laravel.com/docs/horizon) (Redis only) for a beautiful dashboard to monitor your queues. It's like Laravel Telescope but for queues!

## Real Talk: The "Why Bother?" Question 💬

**You:** "My app is small. Do I really need queues?"

**Me:** If you're sending even ONE email after a user action, yes! That 2-second email send becomes 200ms with queues. Your users will notice.

**You:** "Isn't this overkill?"

**Me:** Setting up queues takes 5 minutes. Your users feeling like your app is "snappy" is priceless. Plus, it scales beautifully - what handles 10 emails today can handle 10,000 tomorrow.

**You:** "What if a job fails?"

**Me:** That's literally why Laravel has retry logic, failed job tables, and failure callbacks. It's more reliable than running everything synchronously!

## Quick Start Checklist ✅

Ready to queue all the things? Here's your path:

1. **Set up database queue:**
   ```bash
   php artisan queue:table
   php artisan migrate
   ```

2. **Update .env:**
   ```
   QUEUE_CONNECTION=database
   ```

3. **Create a job:**
   ```bash
   php artisan make:job YourJobName
   ```

4. **Dispatch it:**
   ```php
   YourJobName::dispatch($data);
   ```

5. **Start the worker:**
   ```bash
   php artisan queue:work
   ```

6. **Watch the magic happen!** ✨

## The Bottom Line

Queues are like having a personal assistant for your app:
- Users click, get instant feedback, move on
- Your app processes the heavy stuff in the background
- Nobody waits, everybody wins!

It's not "advanced Laravel" - it's "essential Laravel". If you're not using queues yet, you're making your users wait unnecessarily. And in 2026, nobody has patience for that!

Start queuing today. Your users (and your server) will thank you! 🙏

---

**Questions about queues?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - I've debugged more queue issues than I care to admit! 😂

**Want more Laravel magic?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) for more tips!

*Now go forth and queue all the things!* 🚀💨
