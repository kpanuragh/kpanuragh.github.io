---
title: "Laravel Pennant: Ship Features Without the 3am Panic Attack 🚩"
date: "2026-02-24"
excerpt: "Stop deploying and praying. Feature flags let you ship code without turning it on — and Laravel Pennant makes it embarrassingly easy."
tags: ["laravel", "php", "web-dev", "feature-flags"]
---

# Laravel Pennant: Ship Features Without the 3am Panic Attack 🚩

If you've ever deployed a new feature and immediately opened your phone to check Slack while pretending to eat dinner — this post is for you.

We've all been there. Feature goes live, everything looks fine in staging, then production decides to have a meltdown at 6pm on a Friday. You frantically roll back, debug for two hours, and swear you'll "be more careful next time."

Feature flags fix this. And Laravel Pennant makes feature flags so simple it feels like cheating.

## What Even IS a Feature Flag? 🤔

A feature flag is basically a light switch for your code. Instead of deploying a feature and turning it on for everyone immediately, you deploy the code in "off" mode and flip it on when you're ready — or for specific users first.

**Without feature flags:**
```
Deploy → Pray → Panic → Rollback → Cry
```

**With feature flags:**
```
Deploy → Enable for 5% of users → Monitor → Enable for everyone → Victory lap
```

As a Technical Lead, I've learned that the most dangerous moment in software isn't writing the code — it's the second you deploy it. Feature flags are the airbag you didn't know you needed.

## Installing Pennant (It Takes 30 Seconds) ⚡

```bash
composer require laravel/pennant
php artisan vendor:publish --provider="Laravel\Pennant\PennantServiceProvider"
php artisan migrate
```

That's it. You're done. No SDK account, no third-party service, no "enterprise pricing" page that makes you cry.

## Defining Your First Feature 🎯

In `AppServiceProvider` (or a dedicated `FeaturesServiceProvider` if you're fancy):

```php
use Laravel\Pennant\Feature;

Feature::define('new-checkout-flow', function (User $user) {
    return $user->isInBeta();
});
```

Then in your code:

```php
if (Feature::active('new-checkout-flow')) {
    return $this->newCheckout($cart);
}

return $this->oldCheckout($cart);
```

And in Blade:

```blade
@feature('new-checkout-flow')
    <x-new-checkout />
@else
    <x-old-checkout />
@endfeature
```

Clean. Readable. No third-party dependency anxiety.

## Real Talk: The Story That Made Me Love This 💬

In production systems I've built for e-commerce clients, we had a complete checkout redesign. The old way? Deploy everything at once, hold your breath, watch error rates like a hawk at 2am.

With Pennant, we rolled it out like this:

1. **Week 1:** Internal team only (5 accounts)
2. **Week 2:** Beta users (2,000 accounts)
3. **Week 3:** New registrations only
4. **Week 4:** Everyone

We caught a bug with a specific payment gateway that only appeared when the cart had more than 15 items. In a full rollout, that would've affected thousands of transactions. With feature flags, it affected exactly 4 beta users who were very understanding about it.

One feature flag saved us from what would've been an absolute disaster.

## Gradual Rollouts with Percentage-Based Activation 📊

```php
Feature::define('new-dashboard', function (User $user) {
    // Roll out to 10% of users
    return Feature::lottery(10);
});
```

Or be more surgical:

```php
Feature::define('new-dashboard', function (User $user) {
    // Paid users first, then everyone else gets 10%
    if ($user->isPaid()) {
        return true;
    }

    return Feature::lottery(10);
});
```

**Pro Tip:** Pennant caches the result per user so you won't flip someone between the old and new UI every page load. User gets assigned a flag value once, it sticks. Nobody ends up in UI purgatory.

## The Kill Switch Pattern 🔪

This is the pattern that saved us in a real project. We had a third-party inventory sync running in real-time. When their API started returning garbage, I wanted to disable the feature without deploying.

```php
Feature::define('live-inventory-sync', fn () =>
    config('features.live_inventory_sync', false)
);
```

Flip the env variable, run `php artisan config:cache`, done. No deploy. No rollback. No ceremony. Feature is off in 10 seconds.

## Pennant in Feature Testing 🧪

This is where Pennant really shines. Testing feature-flagged code is a nightmare with most systems. With Pennant:

```php
it('shows new checkout flow to beta users', function () {
    Feature::activate('new-checkout-flow');

    $response = $this->actingAs($betaUser)->get('/checkout');

    $response->assertViewIs('checkout.new');
});

it('shows old checkout to regular users', function () {
    Feature::deactivate('new-checkout-flow');

    $response = $this->actingAs($regularUser)->get('/checkout');

    $response->assertViewIs('checkout.old');
});
```

`Feature::activate()` and `Feature::deactivate()` work perfectly in test environments. No mocking, no config overrides, no prayer required.

## Checking Multiple Features at Once 🔍

```php
// Check if any of these features are active
if (Feature::someAreActive(['new-ui', 'experimental-api', 'dark-mode'])) {
    // At least one is on
}

// Check if ALL are active
if (Feature::allAreActive(['new-ui', 'dark-mode'])) {
    // Both are on
}
```

## Purging Old Flags 🧹

Feature flags have a lifecycle. Once a rollout is complete and the old code is deleted, delete the flag too. Orphaned flags are technical debt wearing a trenchcoat.

```bash
# Remove flags that no longer exist in your codebase
php artisan pennant:purge new-checkout-flow
```

As a Technical Lead, I've seen codebases with 50+ dead feature flags. Nobody knows which ones are safe to remove. Nobody touches them. They accumulate like stickers on a laptop. Don't let that happen to you.

## Bonus Tips 🎁

**Store activation in the database, not just memory.** Pennant does this by default with the `database` driver — flags survive deployments and restarts.

**Use descriptive flag names.** `new-ui` is bad. `checkout-v2-redesign-q1-2026` is better. When you're staring at the database six months later, you'll thank yourself.

**Add flags to your deployment checklist.** Every sprint: what flags are shipping? What flags are ready to be cleaned up?

**Don't abuse flags for configuration.** Feature flags are for code paths, not settings. If you're using them to store `tax_rate`, you've gone too far.

## TL;DR 🚀

Laravel Pennant gives you production-grade feature flags with zero third-party dependencies:

- **Gradual rollouts** — 5% → 25% → 100% without cold sweats
- **User targeting** — beta users, paid plans, internal team
- **Kill switches** — disable a feature without deploying
- **Clean testing** — `Feature::activate()` in tests, no mocks needed
- **Database-backed** — flags persist across deployments

The feature flag pattern is one of those "I can't believe I shipped without this" tools. Once you start using them, deploying without them feels like driving without a seatbelt.

Your users will never know the difference. Your on-call rotation will absolutely notice.

---

**Got questions or battle stories about feature flags?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love hearing how teams solve deployment anxiety.

**More Laravel deep dives?** Check out the [blog archive](/) and star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io)!

*Now go ship that feature. Safely.* 🚩
