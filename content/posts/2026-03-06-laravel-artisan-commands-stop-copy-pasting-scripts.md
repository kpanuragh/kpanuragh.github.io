---
title: "Laravel Artisan Commands: Stop Copy-Pasting Scripts Like a Caveman 🦴"
date: "2026-03-06"
excerpt: "You're manually running PHP scripts from a sticky note? Bro. Laravel has a whole CLI framework built in. Let's fix that."
tags: ["\"laravel\"", "\"php\"", "\"web-dev\"", "\"artisan\"", "\"automation\""]
---

# Laravel Artisan Commands: Stop Copy-Pasting Scripts Like a Caveman 🦴

Picture this: It's 2 AM. Black Friday traffic is spiking. Your boss is pinging you. And you're SSH'd into the server, copy-pasting a PHP script from a Notion doc to manually clear expired promotions.

Been there. Done that. Never again.

After 7+ years building Laravel systems — including a serverless e-commerce backend that had to handle thousands of flash sale orders — I learned the hard way: **custom Artisan commands are one of the most underused superpowers in Laravel**. They turn your "oh god, someone run that script" moments into clean, repeatable, schedulable, loggable commands.

Let's talk about it. 🚀

## What Even Is an Artisan Command? 🤔

You already know `php artisan migrate`, `php artisan cache:clear`, `php artisan queue:work`. Those are built-in Artisan commands. But you can build your own.

```bash
php artisan make:command ExpireFlashSales
```

That one line creates a fully structured command class in `app/Console/Commands/`. You fill it in. You run it. You sleep at night.

## Your First Real Command ⚡

Here's the anatomy of a custom command — nothing scary:

```php
class ExpireFlashSales extends Command
{
    protected $signature = 'sales:expire {--dry-run : Preview without making changes}';
    protected $description = 'Expire flash sales that have passed their end time';

    public function handle(): int
    {
        $sales = FlashSale::where('ends_at', '<', now())
                          ->where('status', 'active')
                          ->get();

        if ($this->option('dry-run')) {
            $this->info("Would expire {$sales->count()} sales (dry run)");
            return Command::SUCCESS;
        }

        $sales->each->update(['status' => 'expired']);
        $this->info("✅ Expired {$sales->count()} flash sales");

        return Command::SUCCESS;
    }
}
```

**What's happening here:**
- `$signature` defines the command name and options
- `{--dry-run}` is a flag you can pass (`--dry-run`)
- `handle()` is where your logic lives
- Return `Command::SUCCESS` or `Command::FAILURE` (not 0 or 1 like it's 1999)

## The `$signature` Is Where The Magic Happens 🎯

This is the part most tutorials rush past. The signature DSL is genuinely clever:

```php
// Required argument
protected $signature = 'report:generate {type}';
// php artisan report:generate monthly

// Optional argument with default
protected $signature = 'report:generate {type=monthly}';

// Optional flag
protected $signature = 'orders:sync {--force}';
// php artisan orders:sync --force

// Option with a value
protected $signature = 'orders:sync {--from=}';
// php artisan orders:sync --from=2026-01-01

// Multiple values
protected $signature = 'notify:users {emails*}';
// php artisan notify:users alice@example.com bob@example.com
```

In production systems I've built, we have commands with 3-4 options each. The `--dry-run` flag is one I put in *everything* now. Run it in staging, verify the output, then run it for real. No more "oops, I just deleted all orders" moments.

## Real Talk: Commands That Saved Us 💬

As a Technical Lead, I've learned that the best commands are the ones born from incidents.

**The situation:** Our e-commerce platform had a batch job to reconcile payment statuses with the payment gateway. It was a PHP file someone ran manually. It had no logging. It had no error handling. It ran in someone's local terminal.

**The fix:** We built a proper Artisan command.

```php
public function handle(PaymentGateway $gateway): int
{
    $pending = Order::where('payment_status', 'pending')
                    ->where('created_at', '<', now()->subHours(1))
                    ->get();

    $this->withProgressBar($pending, function (Order $order) use ($gateway) {
        try {
            $status = $gateway->checkStatus($order->payment_reference);
            $order->update(['payment_status' => $status]);
        } catch (GatewayException $e) {
            Log::error('Payment reconciliation failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }
    });

    $this->newLine();
    $this->info('Payment reconciliation complete.');

    return Command::SUCCESS;
}
```

`withProgressBar()` — because watching a progress bar beat staring at a blank terminal is a productivity unlock.

## Pro Tip: Use The Output Methods 🎨

Laravel gives you a whole palette of output methods. Use them:

```php
$this->info('This is green');       // success / info
$this->warn('This is yellow');      // warning
$this->error('This is red');        // something went wrong
$this->line('Plain text');          // neutral
$this->comment('// like a comment'); // grey-ish

// Tables for structured data
$this->table(
    ['Order ID', 'Status', 'Amount'],
    Order::latest()->take(5)->get(['id', 'status', 'total'])->toArray()
);

// Ask for confirmation before doing something destructive
if (!$this->confirm('This will delete 500 records. Continue?')) {
    $this->warn('Aborted.');
    return Command::SUCCESS;
}
```

A pattern that saved us in a real project: always add a `confirm()` prompt to any command that deletes or modifies data in bulk. Your 3 AM self will thank you.

## Schedule It and Never Think About It Again ⏰

Once your command is built, throw it in the scheduler. No more cron tabs with cryptic syntax:

```php
// routes/console.php (Laravel 11+)
Schedule::command('sales:expire')->everyFifteenMinutes();
Schedule::command('payments:reconcile')->hourly()->withoutOverlapping();
Schedule::command('report:generate monthly')->monthlyOn(1, '08:00');
```

`withoutOverlapping()` is a gem — if the command is still running from the last cycle, don't start another one. Absolutely essential for anything touching payments or inventory.

## Bonus Tips 🎯

**Inject dependencies like a pro.** The `handle()` method supports dependency injection straight from the service container:

```php
public function handle(OrderRepository $orders, Mailer $mailer): int
```

**Chain commands with `callSilently()`:**
```php
public function handle(): int
{
    $this->callSilently('cache:clear');
    // ... rest of your logic
}
```

**Test your commands** — yes, they're testable:
```php
$this->artisan('sales:expire', ['--dry-run' => true])
     ->expectsOutput('Would expire 3 sales (dry run)')
     ->assertSuccessful();
```

## The TL;DR 🏁

| Before | After |
|--------|-------|
| "Can someone run that script?" | `php artisan payments:reconcile` |
| PHP files on a sticky note | Versioned, tested, documented command |
| Cron tabs nobody understands | `Schedule::command()->hourly()` |
| Zero feedback while running | Progress bars, color output, tables |
| Hope and prayers | `--dry-run` flag + `confirm()` prompts |

Custom Artisan commands aren't just about convenience. They're about turning tribal knowledge ("oh just run that script") into reliable, repeatable infrastructure that any developer on your team can use safely.

I used to have a folder called `scripts/` full of PHP files with names like `fix_orders_v3_final_FINAL.php`. We don't talk about that folder anymore.

---

**Got a command you're particularly proud of?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I genuinely love hearing about creative Artisan command use cases.

**Want more Laravel deep-dives?** The repo is on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io). Star it if this was useful!

*Now go automate something. Your 3 AM self is counting on you.* 🌙
