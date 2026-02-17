---
title: "Laravel Pipelines: Stop Writing Spaghetti Code in Your Controllers 🍝"
date: "2026-02-17"
excerpt: "Your controller has 200 lines of sequential 'do this, then do that' logic? Laravel Pipelines will save your soul (and your code review)."
tags: ["laravel", "php", "web-dev", "design-patterns"]
---

# Laravel Pipelines: Stop Writing Spaghetti Code in Your Controllers 🍝

Your checkout controller has 15 sequential steps and is longer than a CVS receipt. I've been there. In fact, I *built* that controller — and then I had to maintain it.

Let me show you the feature Laravel ships with that most developers completely ignore: **Pipelines**.

## What Even Is a Pipeline? 🤔

Think of it like an airport security line. Your passenger (the data) goes through a series of checkpoints. Each checkpoint does one thing, hands the passenger to the next checkpoint, and doesn't care about anything else.

That's a pipeline. Simple. Beautiful. Clean.

In Laravel, it looks like this:

```php
$result = app(Pipeline::class)
    ->send($order)
    ->through([
        ValidateInventory::class,
        ApplyDiscounts::class,
        CalculateTax::class,
        ChargePayment::class,
        SendConfirmationEmail::class,
    ])
    ->thenReturn();
```

Five steps. Zero spaghetti. Your controller stays readable.

## The Problem It Solves 😭

In production systems I've built at Cubet, we had an e-commerce checkout flow. Here's what the controller looked like *before* pipelines:

```php
// The Controller of Doom™
public function checkout(Request $request)
{
    // Step 1: validate inventory
    foreach ($cart->items as $item) {
        if ($item->product->stock < $item->quantity) {
            return response()->json(['error' => 'Out of stock'], 422);
        }
    }

    // Step 2: apply discounts (50 lines of coupon logic)
    // Step 3: calculate tax (varies by country, don't ask)
    // Step 4: charge payment (Stripe, PayPal, maybe both)
    // Step 5: update inventory
    // Step 6: send email
    // Step 7: notify warehouse
    // Step 8: log everything

    // 200 lines later...
    return response()->json(['success' => true]);
}
```

This controller was a crime scene. Adding a new step meant scrolling through 200 lines and praying you didn't break the existing ones.

## How Pipelines Save Your Sanity ⚡

Each step becomes its own class with one job:

```php
class ValidateInventory
{
    public function handle(Order $order, Closure $next)
    {
        foreach ($order->items as $item) {
            if ($item->product->stock < $item->quantity) {
                throw new InsufficientStockException($item->product);
            }
        }

        return $next($order);
    }
}
```

The magic is `$next($order)` — it passes the order to the next pipe in the chain. If you don't call `$next`, the pipeline stops right there.

Your controller goes from 200 lines to this:

```php
public function checkout(CheckoutRequest $request)
{
    $order = Order::create($request->validated());

    $processedOrder = app(Pipeline::class)
        ->send($order)
        ->through([
            ValidateInventory::class,
            ApplyDiscounts::class,
            CalculateTax::class,
            ChargePayment::class,
            UpdateInventory::class,
            SendConfirmationEmail::class,
            NotifyWarehouse::class,
        ])
        ->thenReturn();

    return OrderResource::make($processedOrder);
}
```

That's it. That's the whole controller. A junior dev can read this and immediately understand the flow.

## Real Talk: The Thing That Saved Us in Production 🎯

A pattern that saved us in a real project: pipelines are **testable in isolation**.

Before pipelines, testing the checkout flow meant mocking 8 different things in one test. It was a nightmare.

After pipelines:

```php
// Test JUST the tax calculation, nothing else
public function test_tax_is_calculated_correctly_for_kerala()
{
    $order = Order::factory()->make(['state' => 'KL']);

    $result = app(Pipeline::class)
        ->send($order)
        ->through([CalculateTax::class])
        ->thenReturn();

    $this->assertEquals(0.18, $result->tax_rate);
}
```

One pipe. One test. One thing to fix when it breaks.

As a Technical Lead, I've learned that code you can't test is code you can't trust in production.

## Pro Tip: Conditional Pipes 🧩

You can dynamically add or remove pipes based on conditions. This is incredibly useful:

```php
$pipes = [
    ValidateInventory::class,
    ApplyDiscounts::class,
    CalculateTax::class,
];

// Only charge if it's not a free order
if ($order->total > 0) {
    $pipes[] = ChargePayment::class;
}

// Only notify warehouse for physical products
if ($order->hasPhysicalItems()) {
    $pipes[] = NotifyWarehouse::class;
}

$result = app(Pipeline::class)
    ->send($order)
    ->through($pipes)
    ->thenReturn();
```

Dynamic pipelines based on runtime conditions. Try doing *that* cleanly with 200 lines of `if/else`.

## Error Handling Done Right 🛡️

Here's the part most tutorials skip. When a pipe throws an exception, the pipeline stops and the exception bubbles up normally. You handle it in one place:

```php
try {
    $processedOrder = app(Pipeline::class)
        ->send($order)
        ->through([
            ValidateInventory::class,
            ChargePayment::class,
        ])
        ->thenReturn();
} catch (InsufficientStockException $e) {
    return response()->json(['error' => 'Item out of stock: ' . $e->product->name], 422);
} catch (PaymentFailedException $e) {
    return response()->json(['error' => 'Payment failed, try again'], 402);
}
```

Each exception is specific and meaningful. No more `// something went wrong` catch-all disasters.

## Where Else to Use Pipelines 🚀

Once you see the pattern, you'll see it everywhere:

- **User registration flow**: validate → create account → send verification → create trial subscription → log signup
- **Image upload processing**: validate → resize → compress → watermark → store → generate CDN URL
- **API request handling**: authenticate → rate limit → sanitize → transform → respond
- **Report generation**: gather data → filter → aggregate → format → cache → deliver

In production systems I've built, pipelines have replaced some of the gnarliest conditional logic I've ever seen. The serverless e-commerce backends we deployed at Cubet use pipelines extensively — especially useful when the "pipeline" maps cleanly to Lambda Step Functions in AWS.

## Bonus Tips 🎯

**Tip 1:** Name your pipe classes like verbs — `ValidateInventory`, `ApplyDiscounts`, `NotifyWarehouse`. If you can't name it as a verb, the class is doing too much.

**Tip 2:** Laravel's HTTP middleware IS a pipeline. Every `$request` through your middleware stack is `app(Pipeline::class)->send($request)->through($middleware)`. You've been using pipelines all along without knowing it!

**Tip 3:** Use `->then(fn($order) => ...)` instead of `->thenReturn()` if you need to transform the final result after all pipes run.

**Tip 4:** Keep each pipe under 30 lines. If a pipe is getting long, it's doing too much. Split it.

## The Bottom Line

Pipelines won't win you a GitHub star or a conference talk. But they'll make the developer who reads your code six months from now (probably you) actually understand what's happening.

That developer will not curse your name. And in software, that's the highest praise there is.

**Before:** 200-line controller, zero testability, one change breaks everything.

**After:** 10-line controller, isolated pipe classes, tests that actually mean something.

---

**Want to see more patterns like this?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I share stuff I've learned the hard way so you don't have to.

**Star the blog repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io)** if this saved your controller from becoming a spaghetti monster.

*Now go refactor that controller. You know the one.* 🍝→✨
