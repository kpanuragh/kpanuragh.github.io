---
title: "Laravel Pipelines: Stop Writing Nested If-Else Hell 🚀"
date: "2026-03-09"
excerpt: "There's a Pipeline class hiding in Laravel that'll make your messy, nested business logic look like clean, elegant art. Let me show you what I should have learned in year one."
tags: ["\"laravel\"", "\"php\"", "\"web-dev\"", "\"clean-code\"", "\"patterns\""]
---

# Laravel Pipelines: Stop Writing Nested If-Else Hell 🚀

I want you to imagine something horrifying.

It's 2019. I'm a bright-eyed Laravel developer at Cubet Techno Labs. I've been handed a ticket: "Process a new order — validate stock, apply discounts, calculate tax, send confirmation email."

Here's what I wrote:

```php
// My past self. I'm so sorry.
if ($order->isValid()) {
    if ($stock->hasEnough($order)) {
        $order = $discountService->apply($order);
        if ($order->amount > 0) {
            $order->tax = $taxService->calculate($order);
            $order->save();
            Mail::to($user)->send(new OrderConfirmation($order));
        }
    }
}
```

Nested. Brittle. Untestable. A monument to chaos.

Five months later, nobody — including me — could understand what this code was doing without a flashlight and a map.

Then I discovered `Pipeline`. And I want to give past-me a hug.

## What Is a Laravel Pipeline? 🤔

Think of it like an assembly line at a factory.

A product (your data) enters at one end. It passes through a series of workstations (your handlers). Each station does one job. The finished product comes out the other end.

Laravel has had this built in since forever, and almost nobody talks about it.

```php
use Illuminate\Pipeline\Pipeline;

$order = app(Pipeline::class)
    ->send($order)
    ->through([
        ValidateStock::class,
        ApplyDiscounts::class,
        CalculateTax::class,
        SendConfirmation::class,
    ])
    ->thenReturn();
```

That's it. That's the whole thing. Clean. Linear. You can read it like a sentence.

## A Real Project Example 💡

In production systems I've built at Cubet, we handled e-commerce checkout flows with 8–10 processing steps. Coupons, loyalty points, GST calculation, inventory locks, payment gateway routing — the works.

Before pipelines, this lived in a `CheckoutController` that had grown to 300+ lines. Every new business rule meant digging through layers of `if-else` to find the right spot. New devs took 30 minutes just to understand the flow.

After pipelines, each stage became its own class:

```php
// Each pipe is a single-responsibility class
class ApplyDiscounts
{
    public function handle(Order $order, Closure $next)
    {
        if ($order->coupon) {
            $order->discount = $this->calculateDiscount($order);
        }

        return $next($order); // Pass to the next pipe
    }
}
```

**The magic:** each handler only knows about its own job. It calls `$next($order)` to pass work down the line. Want to skip a step? Remove it from the array. Want to add a new step? Add a new class. Zero surgery on existing code.

## Before vs After 🔥

**Before — the nested nightmare:**
```php
// Good luck figuring out what happens when coupon is null AND tax_exempt is true
public function checkout(Request $request)
{
    $order = Order::create($request->all());
    if ($order->items->isNotEmpty()) {
        if ($request->coupon) {
            $order->discount = $this->applyCoupon($request->coupon, $order);
        }
        if (!$user->isTaxExempt()) {
            $order->tax = $this->calculateTax($order);
        }
        $order->total = $order->subtotal - $order->discount + $order->tax;
        $order->save();
        // 50 more lines...
    }
}
```

**After — the pipeline way:**
```php
public function checkout(Request $request)
{
    $order = app(Pipeline::class)
        ->send(Order::create($request->all()))
        ->through([
            ValidateOrderItems::class,
            ApplyCouponDiscount::class,
            CalculateTax::class,
            ComputeOrderTotal::class,
            SaveOrder::class,
        ])
        ->thenReturn();

    return new OrderResource($order);
}
```

Reading the second version, even a non-developer could understand the flow. That's the goal.

## Real Talk 💬

**"But what if a step fails? How do I bail out?"**

Great question. Throw an exception inside any pipe — the pipeline stops immediately and Laravel handles it like any other exception. Pair it with a try/catch and you have full control.

```php
class ValidateStock
{
    public function handle(Order $order, Closure $next)
    {
        if (!$this->stock->hasEnough($order)) {
            throw new InsufficientStockException('Not enough stock for this order.');
        }

        return $next($order);
    }
}
```

**"Can I use this outside of HTTP requests?"**

Absolutely. As a Technical Lead, I've learned that pipelines are great for CLI commands, queue jobs, and background processes too. Anywhere you have a sequence of transformations on an object, Pipeline fits like a glove.

## Pro Tip: The `thenReturn()` vs `then()` difference ⚡

```php
// thenReturn() — just returns the final result
$result = app(Pipeline::class)
    ->send($data)
    ->through([StepOne::class, StepTwo::class])
    ->thenReturn();

// then() — you define what to do with the final result
$result = app(Pipeline::class)
    ->send($data)
    ->through([StepOne::class, StepTwo::class])
    ->then(fn ($processedData) => response()->json($processedData));
```

Use `thenReturn()` when the pipeline itself produces your result. Use `then()` when you need to do something specific with the output at the end.

## A Pattern That Saved Us in a Real Project 🎯

We had a webhook processor that received events from multiple payment gateways. Each gateway had slightly different payload formats, different validation rules, and different enrichment steps.

Before: one giant switch statement with nested if-else inside each case. When Stripe changed their payload format, fixing it meant not breaking Razorpay's handler. Terrifying.

After: a pipeline per gateway type, all stored in a config array. Adding a new gateway meant adding a new folder with handlers — zero touch to existing code.

```php
// config/payment_pipelines.php
return [
    'stripe'  => [StripeValidate::class, StripeEnrich::class, StripeRecord::class],
    'razorpay' => [RazorpayValidate::class, RazorpayEnrich::class, RazorpayRecord::class],
];

// In the webhook controller
$pipes = config("payment_pipelines.{$gateway}");
app(Pipeline::class)->send($payload)->through($pipes)->thenReturn();
```

Open/Closed Principle, baby. Open for extension, closed for modification.

## Bonus Tips 🎁

**Test each pipe independently** — because each handler is its own class, you can unit test them in isolation. No need to mock the entire checkout flow just to test the tax calculation.

```php
it('calculates GST correctly', function () {
    $order = Order::factory()->make(['subtotal' => 1000, 'state' => 'KA']);
    $pipe = new CalculateTax();
    $result = $pipe->handle($order, fn ($o) => $o);
    expect($result->tax)->toBe(180.0);
});
```

**Log between pipes** — add a `LogPipelineStep` handler between critical steps during debugging. Remove it when you're done. No permanent log noise.

**Reuse pipes across pipelines** — `ValidateStock` works for both checkout AND cart updates. Write once, use everywhere.

## The Bottom Line

`Pipeline` is one of those Laravel features that makes you wonder why you were writing procedural spaghetti for years.

It forces single responsibility. It makes sequences explicit. It makes testing a joy. It makes onboarding new devs significantly less painful. And it's been sitting there in your `vendor` folder this whole time, waiting patiently to be used.

A pattern that saved us in a real project — and will probably save yours too.

---

**Found this useful?** Let's connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I post real lessons from production Laravel systems.

**More Laravel deep-dives?** Star the blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and keep building cool stuff.

*Now go refactor that checkout controller. You know the one.* 🏗️✨
