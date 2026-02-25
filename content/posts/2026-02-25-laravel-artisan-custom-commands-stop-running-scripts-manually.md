---
title: "Laravel Artisan Custom Commands: Stop Running Scripts Manually Like It's 2005 🔧"
date: "2026-02-25"
excerpt: "You've been copy-pasting that database cleanup script into Tinker for months. It's time to stop living like this and write a proper Artisan command."
tags: ["laravel", "php", "web-dev", "artisan", "automation"]
---

# Laravel Artisan Custom Commands: Stop Running Scripts Manually Like It's 2005 🔧

You know that feeling when you SSH into production at 11pm, open Tinker, and start typing the same 40-line data cleanup script you've typed a dozen times before — hoping you don't accidentally fat-finger something and nuke the wrong table?

Yeah. I've been there. More than once. And it's entirely avoidable.

Custom Artisan commands exist precisely so you stop doing that. Let me show you how I've used them to go from "frantic SSH sessions" to "run one command and go back to sleep."

## What Even IS an Artisan Command? 🤔

You already use them every day: `php artisan migrate`, `php artisan queue:work`, `php artisan tinker`. These are just PHP classes with a `handle()` method. The cool part? You can write your own.

```bash
php artisan make:command CleanExpiredOrders
```

That single command creates `app/Console/Commands/CleanExpiredOrders.php` and you're 80% done.

## The Anatomy of a Command 🦴

Here's what a basic command looks like:

```php
class CleanExpiredOrders extends Command
{
    protected $signature = 'orders:clean-expired {--dry-run}';
    protected $description = 'Remove orders stuck in pending for over 24 hours';

    public function handle(): int
    {
        $orders = Order::where('status', 'pending')
            ->where('created_at', '<', now()->subDay())
            ->get();

        if ($this->option('dry-run')) {
            $this->info("Would delete {$orders->count()} orders. (dry run)");
            return Command::SUCCESS;
        }

        $orders->each->delete();
        $this->info("Deleted {$orders->count()} expired orders.");
        return Command::SUCCESS;
    }
}
```

That `--dry-run` flag? That single addition has saved me from countless "oops" moments in production.

**Real Talk:** Always build a dry-run mode into destructive commands. Your future 2am self will thank you.

## The `$signature` Is Where the Magic Lives ✨

The signature string is how Artisan knows what your command accepts. It's surprisingly expressive:

```php
// Required argument
'products:import {file}'

// Optional argument with default
'products:import {file=products.csv}'

// Required option (must pass a value)
'products:import {file} {--format=}'

// Boolean flag (present = true)
'products:import {file} {--dry-run}'

// Option with default value
'reports:generate {--period=weekly}'
```

In production systems I've built for e-commerce, I've used signatures like:

```php
protected $signature = 'inventory:sync
    {source : The source system (erp|warehouse)}
    {--limit=1000 : Max items to sync per run}
    {--dry-run : Preview changes without writing}
    {--force : Skip confirmation prompts}';
```

It self-documents. When someone runs `php artisan inventory:sync --help`, they get a proper usage guide. No more Confluence pages explaining what arguments some bash script takes.

## User Interaction: Make It Talk Back 🗣️

Commands aren't just fire-and-forget. Laravel gives you a nice set of output methods:

```php
// Different severity levels
$this->info('Starting sync...');
$this->comment('Processing batch 3 of 10...');
$this->warn('5 products had missing SKUs, skipping.');
$this->error('Connection to ERP timed out!');

// Ask for confirmation before something scary
if (!$this->confirm('This will update 5000 products. Continue?')) {
    return Command::SUCCESS;
}

// Progress bars for long operations
$bar = $this->output->createProgressBar($products->count());
$products->each(function ($product) use ($bar) {
    $this->syncProduct($product);
    $bar->advance();
});
$bar->finish();
```

As a Technical Lead, I've learned that a command with zero output is a maintenance nightmare. You ship it, it runs in a cron job, and six months later nobody knows if it's working or silently failing. Make your commands chatty.

## A Pattern That Saved Us in a Real Project 💡

At one point, we had a serverless e-commerce backend where Lambda functions were doing all the heavy lifting. But some batch jobs — bulk price updates, inventory reconciliation, loyalty point recalculations — didn't fit the Lambda execution model cleanly.

The solution: Artisan commands running on ECS Fargate, triggered by CloudWatch Events.

The key pattern we used was **chunked processing with progress tracking:**

```php
public function handle(): int
{
    $total = Product::where('needs_price_update', true)->count();
    $this->info("Processing {$total} products...");

    Product::where('needs_price_update', true)
        ->chunkById(500, function ($products) {
            $products->each(function ($product) {
                // expensive price recalculation
                $product->recalculatePrice();
            });
        });

    $this->info('Done!');
    return Command::SUCCESS;
}
```

`chunkById()` instead of `chunk()` is critical here — it avoids cursor drift when you're modifying records while iterating. Ask me how I found that bug. (It was not fun.)

## Pro Tip: Return Codes Matter 🚦

This is the one thing most tutorials skip. Artisan commands return exit codes, and those codes matter for CI/CD pipelines, cron monitoring, and deployment scripts:

```php
return Command::SUCCESS;   // 0 - everything's fine
return Command::FAILURE;   // 1 - something went wrong
return Command::INVALID;   // 2 - bad input/arguments
```

If your command returns `Command::FAILURE` and your cron monitoring tool is watching exit codes, you'll get an alert. If you always return `Command::SUCCESS` regardless of what happened... you're flying blind.

```php
try {
    $this->runSync();
    $this->info('Sync completed successfully.');
    return Command::SUCCESS;
} catch (SyncException $e) {
    $this->error("Sync failed: {$e->getMessage()}");
    return Command::FAILURE;
}
```

## Scheduling Your Commands 📅

Once you have a command, putting it on a schedule is one line in `routes/console.php` (Laravel 11+):

```php
Schedule::command('orders:clean-expired')->daily()->at('02:00');
Schedule::command('reports:generate --period=daily')->dailyAt('06:00');
Schedule::command('inventory:sync warehouse --limit=5000')->everyThirtyMinutes();
```

No more editing crontabs. No more `* * * * * php /var/www/artisan...` mysteries in some server you forgot about. All your scheduled work is in version control, reviewable, and testable.

## Bonus Tips Section 🎯

**Test your commands!** Laravel makes it embarrassingly easy:

```php
it('deletes expired orders', function () {
    Order::factory()->count(5)->create([
        'status' => 'pending',
        'created_at' => now()->subDays(2),
    ]);

    $this->artisan('orders:clean-expired')
        ->assertExitCode(0);

    expect(Order::count())->toBe(0);
});
```

**Use `$this->call()` to chain commands:**

```php
public function handle(): int
{
    $this->call('cache:clear');
    $this->call('config:cache');
    $this->call('route:cache');
    $this->info('All caches refreshed!');
    return Command::SUCCESS;
}
```

**Inject dependencies via the constructor** — the service container works normally in commands:

```php
public function __construct(
    private readonly InventoryService $inventory,
    private readonly SlackNotifier $slack,
) {
    parent::__construct();
}
```

## The TL;DR 🏁

Stop running ad-hoc scripts in Tinker. Stop SSHing into production. Stop maintaining a `scripts/` folder of raw PHP files that only you know about.

Write Artisan commands. Your team will be able to run them. They'll be testable. They'll be schedulable. They'll return proper exit codes. They'll have dry-run modes so nobody panic-deletes the wrong thing.

Your 2am self — the one who gets paged because the order cleanup job broke — deserves better tools.

---

**Got a gnarly Artisan command you've built?** Share it on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I genuinely love seeing what people automate.

**More Laravel deep dives?** Check out the blog archive and star the [GitHub repo](https://github.com/kpanuragh/kpanuragh.github.io) to stay updated!

*Now go automate something. You've been putting it off long enough.* ⚡
