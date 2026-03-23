---
title: "Laravel Cashier: Stop Building Your Own Billing System (Seriously, Stop) 💳"
date: "2026-03-14"
excerpt: "Every e-commerce project I've touched had a custom Stripe integration that was held together by duct tape and prayers. Then I discovered Laravel Cashier and my weekends came back."
tags: ["\\\"laravel\\\"", "\\\"php\\\"", "\\\"web-dev\\\"", "\\\"stripe\\\"", "\\\"e-commerce\\\""]
---

# Laravel Cashier: Stop Building Your Own Billing System (Seriously, Stop) 💳

Every e-commerce project I've touched had a custom Stripe integration that was held together by duct tape and prayers. Then I discovered Laravel Cashier and my weekends came back.

I'm not even exaggerating. At Cubet Techno Labs, I once inherited a "homegrown billing module" that was 1,800 lines of raw Stripe API calls, webhook handlers written in 2018, and a `handlePayment()` function that had 47 early returns. It was the developer equivalent of a Jackson Pollock painting — chaotic, expensive, and nobody understood what they were looking at.

Then we migrated to **Laravel Cashier**. The billing code went from 1,800 lines to around 200. My colleague cried actual tears of joy. I'm not making that up.

## What Is Laravel Cashier? 🤔

Cashier is Laravel's official package for Stripe billing. It handles:

- Subscriptions (create, update, cancel, resume)
- One-time charges
- Invoices and billing history
- Trial periods
- Payment method management
- Webhook handling (the part that always breaks)

Think of it as a translator between your Laravel app and Stripe's API. Instead of speaking raw Stripe, you speak fluent Eloquent.

## The Before/After That'll Make You Cringe 😬

**Before Cashier (classic chaos):**
```php
// "Simple" subscription creation from a real project I inherited
$customer = \Stripe\Customer::create(['email' => $user->email]);
$user->update(['stripe_id' => $customer->id]);

$paymentMethod = \Stripe\PaymentMethod::retrieve($request->payment_method);
$paymentMethod->attach(['customer' => $customer->id]);

\Stripe\Customer::update($customer->id, [
    'invoice_settings' => ['default_payment_method' => $paymentMethod->id],
]);

$subscription = \Stripe\Subscription::create([
    'customer' => $customer->id,
    'items' => [['price' => 'price_abc123']],
    'trial_period_days' => 14,
]);
// ... 40 more lines of error handling ...
```

**After Cashier (actual elegance):**
```php
$user->newSubscription('default', 'price_abc123')
     ->trialDays(14)
     ->create($request->payment_method);
```

One line. **One line.** I nearly cried myself.

## Setting It Up ⚡

```bash
composer require laravel/cashier
php artisan vendor:publish --tag="cashier-migrations"
php artisan migrate
```

Add the `Billable` trait to your User model:

```php
use Laravel\Cashier\Billable;

class User extends Authenticatable
{
    use Billable;
}
```

Set your Stripe keys in `.env`:

```bash
STRIPE_KEY=pk_test_...
STRIPE_SECRET=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Done. You're now 80% of the way to a production billing system.

## The Patterns That Saved Us in Production 🎯

### 1. Subscription Checks That Don't Require a PhD

In production systems I've built for e-commerce clients, feature gating by subscription tier was a nightmare before Cashier.

**Before:**
```php
// Don't even ask where this came from
if ($user->subscription_status === 'active'
    && $user->subscription_plan !== 'cancelled'
    && Carbon::parse($user->subscription_ends_at)->isFuture()) {
```

**After:**
```php
if ($user->subscribed('default')) {
    // user has an active subscription
}

if ($user->subscribedToPrice('price_premium')) {
    // user is on the premium plan
}
```

Cashier knows about trials, grace periods, and cancellations. You don't have to.

### 2. Webhooks Without Losing Your Mind

This is the part that breaks every custom implementation. Stripe fires events (payment succeeded, subscription cancelled, invoice failed) and you need to handle them reliably.

Cashier handles the boilerplate. You just listen to the events that matter:

```php
// In App\Providers\EventServiceProvider
protected $listen = [
    'Laravel\Cashier\Events\WebhookReceived' => [
        App\Listeners\HandleStripeWebhook::class,
    ],
];
```

Or extend the built-in webhook controller for specific events:

```php
class WebhookController extends CashierController
{
    public function handleInvoicePaymentFailed($payload)
    {
        $user = User::where('stripe_id', $payload['data']['object']['customer'])->first();
        // Send dunning email, suspend account, cry softly
    }
}
```

No raw JSON parsing. No "did Stripe actually send this?" signature verification code scattered across 3 files. Cashier handles the signature verification automatically.

### 3. One-Time Charges for Ad-Hoc Purchases

Not everything is a subscription. Sometimes users just buy a thing.

```php
// Charge $29.99 for a one-time report export
$user->charge(2999, $paymentMethodId, [
    'description' => 'Premium Report Export',
]);
```

In a real project at Cubet, we used this for marketplace sellers paying to feature their listings. Before Cashier, this was 30 lines. Now it's one.

### 4. Free Trials Done Right

```php
$user->newSubscription('default', 'price_pro')
     ->trialDays(14)
     ->create($paymentMethodId);

// Later, check trial status
if ($user->onTrial('default')) {
    $daysLeft = $user->trial_ends_at->diffInDays(now());
    // Show "X days left in your trial" banner
}
```

Cashier tracks trial periods in your database. When the trial ends, Stripe automatically charges the card. If the card fails, Cashier fires a webhook. The whole lifecycle is handled.

## Pro Tip: The Invoice Portal 🧾

This one blew my mind when I first used it. Your users want to download invoices. Building an invoice page is boring.

```php
// Generate a link to Stripe's hosted billing portal
return $user->redirectToBillingPortal(route('dashboard'));
```

That's it. Stripe shows a fully branded portal where users can:
- Download all their invoices
- Update their payment method
- Cancel or change their subscription

All without you writing a single line of frontend code. As a Technical Lead, I've learned that every page you don't have to build is a page that can't have bugs.

## Real Talk: When Cashier Isn't Enough 💬

Cashier is phenomenal, but it has limits:

**It's Stripe-only.** If your client wants PayPal, Razorpay, or Mollie, you'll need separate packages (`laravel/cashier-paddle` for Paddle, or roll your own for others). In international e-commerce projects, this comes up more than you'd expect.

**Complex marketplace splits are rough.** Stripe Connect (for platforms that split payments between sellers) has limited Cashier support. We had to write custom integration code on top for a marketplace project. It wasn't fun.

**Metered billing takes some setup.** Usage-based pricing is supported but requires more configuration. Not a dealbreaker, just expect to read the docs carefully.

## Bonus Tips 🎁

**Generate a payment intent for frontend:**
```php
$intent = $user->createSetupIntent();
// Pass $intent->client_secret to Stripe.js
```

**Check if a subscription is cancelled but still in grace period:**
```php
if ($user->subscription('default')->onGracePeriod()) {
    // User cancelled but access continues until period ends
}
```

**Swap plans without losing billing cycle:**
```php
$user->subscription('default')->swap('price_enterprise');
```

**Give a user a free coupon:**
```php
$user->newSubscription('default', 'price_pro')
     ->withCoupon('WELCOME50')
     ->create($paymentMethodId);
```

## TL;DR 🎯

- **Laravel Cashier** handles Stripe subscriptions, one-time charges, webhooks, invoices, and trials with minimal code
- The `Billable` trait on your User model unlocks a fluent API that replaces hundreds of lines of raw Stripe calls
- Webhook handling with Stripe signature verification is built-in — no more homebrew security nightmares
- The billing portal redirect is the greatest lazy developer feature ever created
- Limitation: Stripe-only, complex marketplace billing requires custom work

A pattern that saved us in a real project: always use Cashier's built-in webhook controller as a base. Extending it is safer than building from scratch, and you get Stripe signature verification for free.

Your future self (and your on-call rotation) will thank you for not rolling your own billing system.

---

**Got billing war stories?** Share them on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've definitely made every mistake possible so we can commiserate.

**More Laravel deep dives?** Check the [blog](https://kpanuragh.github.io) or star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io).

*Now go bill your users correctly. They deserve it.* 💳✨
