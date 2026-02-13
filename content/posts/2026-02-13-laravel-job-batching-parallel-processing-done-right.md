---
title: "Laravel Job Batching: Stop Waiting for 1000 Tasks to Finish One by One 🚀⚡"
date: "2026-02-13"
excerpt: "Need to process 10,000 images? Send 5,000 emails? Track it all with progress bars and handle failures like a boss!"
tags: ["laravel", "php", "queues", "performance"]
---

# Laravel Job Batching: Stop Waiting for 1000 Tasks to Finish One by One 🚀⚡

You know that moment when your boss says "We need to send welcome emails to all 50,000 users" and you feel your soul leave your body? Yeah, I've been there. Then I discovered Laravel's job batching, and suddenly I became the hero who could track progress, handle failures, and still go home on time!

Let me show you how to process thousands of tasks in parallel without losing your sanity (or your job).

## The Problem: Sequential Hell 😫

Picture this: You need to generate PDF invoices for 1,000 orders. Your first attempt looks like this:

```php
// Controller - The "I'll just loop it" approach
foreach ($orders as $order) {
    GenerateInvoicePDF::dispatch($order);
}

// Now what? Are they done? Did any fail? Who knows! 🤷‍♂️
```

**The nightmare:**
- No progress tracking (boss: "How long till it's done?" You: "¯\\_(ツ)_/¯")
- No failure handling (1 job fails, you find out next week)
- Can't run code when all jobs finish
- No way to cancel if something goes wrong

In production systems I've built at Cubet, this "fire and forget" approach caused us real pain. Orders got stuck, invoices went missing, and debugging was like finding a needle in a haystack made of needles.

## Enter Job Batching: The Grown-Up Way 🎯

Laravel's job batching lets you:
- Dispatch thousands of jobs as a **single batch**
- Track completion percentage in real-time
- Run code when all jobs finish (or fail)
- Handle failures gracefully
- Cancel the whole batch if needed

**Real-world example I built:** Bulk image processing for a photo-sharing app. Users could upload 500 images, we'd resize, optimize, and generate thumbnails - all tracked with a progress bar! 📊

## Let's Build Something Real: Bulk User Import 📥

Imagine importing 10,000 users from a CSV. Each user needs validation, avatar generation, and a welcome email.

### Step 1: Create the Database Migration

```php
php artisan queue:batches-table
php artisan migrate
```

This adds the `job_batches` table. Think of it as the mission control for your batch operations! 🎮

### Step 2: Create the Job

```php
php artisan make:job ProcessUserImport
```

```php
use Illuminate\Bus\Batchable;

class ProcessUserImport implements ShouldQueue
{
    use Batchable; // The secret sauce! 🌟

    public function __construct(
        public array $userData
    ) {}

    public function handle()
    {
        // Check if batch was cancelled
        if ($this->batch()->cancelled()) {
            return; // Bail out gracefully
        }

        // Do the actual work
        $user = User::create($this->userData);

        // Generate avatar
        GenerateAvatar::dispatch($user);

        // Send welcome email
        Mail::to($user)->send(new WelcomeEmail($user));
    }
}
```

**Pro tip:** The `Batchable` trait gives you access to `$this->batch()` - your window into the batch's status!

### Step 3: Dispatch the Batch 🚀

Here's where the magic happens:

```php
use Illuminate\Support\Facades\Bus;

public function importUsers(Request $request)
{
    $users = $this->parseCSV($request->file('csv')); // 10,000 users

    $batch = Bus::batch([
        collect($users)->map(function ($userData) {
            return new ProcessUserImport($userData);
        })
    ])->then(function (Batch $batch) {
        // 🎉 Success! All jobs completed
        Log::info("Imported {$batch->totalJobs} users successfully!");

        // Send notification to admin
        $admin = User::find(1);
        $admin->notify(new ImportCompleted($batch->totalJobs));

    })->catch(function (Batch $batch, Throwable $e) {
        // 😱 First failure detected
        Log::error("Batch failed: {$e->getMessage()}");

    })->finally(function (Batch $batch) {
        // 🏁 Always runs, success or failure
        Log::info("Batch finished. Total: {$batch->totalJobs}, Failed: {$batch->failedJobs}");

    })->name('User Import - ' . now()->format('Y-m-d'))
      ->onQueue('imports')
      ->allowFailures() // Don't stop batch if one job fails
      ->dispatch();

    return response()->json([
        'batch_id' => $batch->id,
        'message' => 'Import started! Check progress at /batch/' . $batch->id
    ]);
}
```

**Real Talk:** See that `allowFailures()` chain? In a real project, 1 invalid email shouldn't stop 9,999 valid users from being imported. That method saved my butt more times than I can count!

## Tracking Progress: The Boss Loves This 📈

Want a real-time progress bar? Easy!

```php
// In your controller
public function batchStatus($batchId)
{
    $batch = Bus::findBatch($batchId);

    if (!$batch) {
        return response()->json(['error' => 'Batch not found'], 404);
    }

    return response()->json([
        'total' => $batch->totalJobs,
        'pending' => $batch->pendingJobs,
        'processed' => $batch->processedJobs(),
        'failed' => $batch->failedJobs,
        'progress' => $batch->progress(), // Percentage! 0-100
        'finished' => $batch->finished(),
        'cancelled' => $batch->cancelled(),
    ]);
}
```

**Frontend (simple polling):**
```javascript
// Poll every 2 seconds
setInterval(async () => {
    const response = await fetch(`/batch/${batchId}/status`);
    const data = await response.json();

    document.querySelector('.progress-bar').style.width = data.progress + '%';
    document.querySelector('.status').textContent =
        `${data.processed} / ${data.total} completed`;

    if (data.finished) {
        clearInterval(this); // Stop polling
        alert('Import complete! 🎉');
    }
}, 2000);
```

**A pattern that saved us in a real project:** We showed users a progress bar during bulk operations. Support tickets dropped 60% because users could SEE it was working! 📉

## Handling Failures Like a Pro 🛡️

What if 50 out of 10,000 jobs fail? You don't want to lose that data!

```php
$batch = Bus::batch([
    // ... your jobs
])->catch(function (Batch $batch, Throwable $e) {
    // Get failed job IDs
    $failedJobIds = $batch->failedJobIds;

    // Store them for retry
    FailedImport::create([
        'batch_id' => $batch->id,
        'failed_jobs' => $failedJobIds,
        'error' => $e->getMessage(),
    ]);

    // Notify admin
    Log::error("Batch {$batch->id} had failures", [
        'failed_count' => count($failedJobIds),
        'error' => $e->getMessage(),
    ]);
})->dispatch();
```

**Retry failed jobs later:**
```php
public function retryFailed($batchId)
{
    $batch = Bus::findBatch($batchId);
    $failedImport = FailedImport::where('batch_id', $batchId)->first();

    // Get the original data for failed jobs
    $failedUsers = $this->getFailedUserData($failedImport->failed_jobs);

    // Create a new batch with only failed items
    Bus::batch(
        collect($failedUsers)->map(fn($user) => new ProcessUserImport($user))
    )->name("Retry Import - $batchId")
      ->dispatch();
}
```

## Cancelling a Batch: The Emergency Stop 🚨

Sometimes you need to pull the plug:

```php
public function cancelBatch($batchId)
{
    $batch = Bus::findBatch($batchId);

    if ($batch && !$batch->finished()) {
        $batch->cancel();

        return response()->json([
            'message' => 'Batch cancelled. Running jobs will complete, but no new jobs will start.'
        ]);
    }
}
```

**Important:** Jobs already running will finish. `cancel()` just prevents *new* jobs from starting. Check `$this->batch()->cancelled()` in your job's handle method to bail out early!

## Real-World Use Cases I've Built 🏗️

### 1. Bulk Email Campaigns
```php
Bus::batch(
    $subscribers->map(fn($sub) => new SendCampaignEmail($sub, $campaign))
)->then(function (Batch $batch) {
    // Update campaign stats
    Campaign::find($campaignId)->update([
        'sent_count' => $batch->totalJobs,
        'sent_at' => now(),
    ]);
})->dispatch();
```

### 2. Report Generation
```php
// Generate 12 monthly reports in parallel
Bus::batch(
    collect(range(1, 12))->map(fn($month) => new GenerateMonthlyReport($month, $year))
)->then(function (Batch $batch) {
    // Combine into annual report
    CombineAnnualReport::dispatch($year);
})->dispatch();
```

### 3. Database Migration
```php
// Migrate 1M records in chunks
Bus::batch(
    OldUser::chunk(1000)->map(fn($chunk) => new MigrateUserChunk($chunk))
)->allowFailures()
  ->then(function (Batch $batch) {
      Log::info("Migrated {$batch->totalJobs} chunks");
  })->dispatch();
```

## Bonus: Adding Jobs to a Running Batch 🎪

Yes, you can add jobs mid-flight!

```php
$batch = Bus::findBatch($batchId);

if ($batch && !$batch->finished()) {
    $batch->add([
        new ProcessUserImport($newUserData1),
        new ProcessUserImport($newUserData2),
    ]);
}
```

**Why this is cool:** In a photo processing app, users could upload more images while the first batch was still running. We just added them to the existing batch - progress bar updated automatically! 🎨

## Common Gotchas I've Hit 🐛

### 1. Serialization Issues
```php
// ❌ DON'T pass Eloquent models directly
new ProcessUserImport($user); // Will serialize the ENTIRE model

// ✅ DO pass only what you need
new ProcessUserImport($user->id); // Just the ID, load in handle()
```

### 2. Timeout on Large Batches
```php
// Set a longer timeout for batch creation
set_time_limit(300); // 5 minutes

Bus::batch([
    // 10,000 jobs...
])->dispatch();
```

### 3. Memory Leaks
```php
// ❌ Creating 10,000 job instances at once
Bus::batch(
    User::all()->map(fn($u) => new ProcessUser($u)) // Loads all users into memory!
)->dispatch();

// ✅ Use lazy collections
Bus::batch(
    User::cursor()->map(fn($u) => new ProcessUser($u->id))
)->dispatch();
```

## The Monitoring Setup: Laravel Horizon 📡

As a Technical Lead, I always add Horizon for queue monitoring:

```bash
composer require laravel/horizon
php artisan horizon:install
php artisan horizon
```

Visit `/horizon` and you get:
- Real-time job throughput
- Failed job inspection
- **Batch progress monitoring** 🎯
- Retry failed jobs with one click

**Pro tip:** In production, I set up Slack notifications when batches fail. No more "oops, that import failed 3 days ago" moments!

## Quick Reference Card 🎴

```php
// Basic batch
Bus::batch([...])->dispatch();

// With callbacks
Bus::batch([...])
    ->then(fn($b) => /* success */)
    ->catch(fn($b, $e) => /* failure */)
    ->finally(fn($b) => /* always */)
    ->dispatch();

// Options
->name('Batch Name')           // Give it a name
->onQueue('heavy-processing')  // Specific queue
->allowFailures()              // Don't stop on failures
->allowFailures(10)            // Allow up to 10 failures

// Check status
$batch = Bus::findBatch($id);
$batch->progress();            // 0-100
$batch->finished();            // true/false
$batch->cancel();              // Stop it
$batch->add([...]);            // Add more jobs
```

## The Bottom Line 🎯

Job batching turns "I hope this finishes eventually" into "I know exactly what's happening":

- ✅ Track progress in real-time
- ✅ Handle failures gracefully
- ✅ Run cleanup when done
- ✅ Scale to millions of jobs
- ✅ Sleep peacefully at night

In serverless e-commerce backends I've built, job batching handled everything from order processing to inventory updates. The alternative? A mess of database flags, cron jobs, and crossed fingers.

Stop treating background jobs like black holes. Batch them, track them, own them!

---

**Questions about job batching?** I've probably debugged it already! Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) 😄

**Want more Laravel performance tips?** Check out my posts on [queues](https://kpanuragh.github.io), [caching](https://kpanuragh.github.io), and [N+1 queries](https://kpanuragh.github.io)!

*Now go batch those jobs like a boss!* 🚀✨
