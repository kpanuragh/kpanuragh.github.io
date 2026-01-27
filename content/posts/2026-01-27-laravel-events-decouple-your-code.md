---
title: "Laravel Events: Stop Cramming Everything Into One Controller 🎯"
date: "2026-01-27"
excerpt: "Your controllers look like spaghetti? Events and Listeners will save your sanity and make your code so clean you'll cry tears of joy!"
tags: ["laravel", "php", "events", "web-dev"]
---

# Laravel Events: Stop Cramming Everything Into One Controller 🎯

You know that moment when a user registers and you need to: send a welcome email, notify admins, log to analytics, update CRM, create a Slack notification, give them welcome points, and probably solve world hunger too?

Your controller starts looking like this monster:

```php
public function register(Request $request)
{
    $user = User::create($request->validated());

    Mail::to($user)->send(new WelcomeEmail());
    Mail::to('admin@app.com')->send(new NewUserNotification());
    Analytics::track('user_registered', $user);
    Slack::send('New user: ' . $user->name);
    CRM::createContact($user);
    $user->givePoints(100);
    Cache::forget('user_stats');

    return response()->json(['message' => 'Welcome!']);
}
```

**Seven different responsibilities in ONE method!** If your controller needs therapy, it's time to learn about Events! 🎪

## What Are Events & Listeners? 🤔

Think of it like a party announcement system:

**Event:** "HEY EVERYONE, A USER JUST REGISTERED!" 📣

**Listeners:** Multiple party guests who hear the announcement and do their own thing:
- DJ starts the welcome music 🎵
- Bouncer logs it in the guest book 📖
- Chef prepares a welcome snack 🍪
- Photographer takes a photo 📸

Nobody has to tell each person what to do. They just LISTEN for the announcement and act independently!

**In Laravel terms:**
- **Event** = Something happened (UserRegistered)
- **Listeners** = Things that respond to it (SendWelcomeEmail, NotifyAdmin, UpdateAnalytics)

## The Problem with Fat Controllers 😱

**Before Events (the nightmare):**

```php
public function register(Request $request)
{
    $user = User::create($request->validated());

    // 50 lines of "stuff that needs to happen"
    Mail::to($user)->send(new WelcomeEmail());
    Mail::to('admin@app.com')->send(new NewUserAlert($user));
    Analytics::track('user_registered', $user->id);

    // Update external CRM
    $crm = new CRMClient(config('crm.api_key'));
    $crm->contacts->create([
        'email' => $user->email,
        'name' => $user->name
    ]);

    // Send Slack notification
    Http::post(config('slack.webhook'), [
        'text' => "New user: {$user->name}"
    ]);

    // Award welcome points
    $user->points()->create(['amount' => 100, 'reason' => 'Welcome bonus']);

    // Clear caches
    Cache::forget('total_users');
    Cache::forget('recent_signups');

    return response()->json(['message' => 'Welcome!']);
}
```

**Problems:**
- Controller knows too much 🧠💥
- Can't test parts independently 🧪
- Hard to add/remove features 🔧
- Slow (everything runs synchronously) 🐌
- One failure breaks everything 💀

## The Event Solution ✨

**After Events (the dream):**

```php
public function register(Request $request)
{
    $user = User::create($request->validated());

    // Fire the event
    event(new UserRegistered($user));

    return response()->json(['message' => 'Welcome!']);
}
```

**THREE LINES!** Now that's what I call clean code! 🧼

## Creating Your First Event 🎬

Laravel makes this stupidly easy:

```bash
php artisan make:event UserRegistered
```

This creates `app/Events/UserRegistered.php`:

```php
<?php

namespace App\Events;

use App\Models\User;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class UserRegistered
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public User $user
    ) {}
}
```

**That's it!** An event is just a data bag that holds information about what happened.

## Creating Listeners 👂

Now create listeners for all the things that should happen:

```bash
php artisan make:listener SendWelcomeEmail --event=UserRegistered
php artisan make:listener NotifyAdmin --event=UserRegistered
php artisan make:listener UpdateAnalytics --event=UserRegistered
php artisan make:listener CreateCRMContact --event=UserRegistered
```

Each listener gets a `handle()` method:

```php
<?php

namespace App\Listeners;

use App\Events\UserRegistered;
use App\Mail\WelcomeEmail;
use Illuminate\Support\Facades\Mail;

class SendWelcomeEmail
{
    public function handle(UserRegistered $event): void
    {
        Mail::to($event->user)->send(new WelcomeEmail());
    }
}
```

**Beautiful!** Each listener has ONE job. Single Responsibility Principle for the win! 🏆

## Registering Event Listeners 📋

In `app/Providers/EventServiceProvider.php`:

```php
protected $listen = [
    UserRegistered::class => [
        SendWelcomeEmail::class,
        NotifyAdmin::class,
        UpdateAnalytics::class,
        CreateCRMContact::class,
        AwardWelcomePoints::class,
    ],
];
```

**Pro tip:** Laravel can auto-discover listeners! Just follow the naming convention and you don't even need this! 🎉

## The Power Moves 💪

### 1. Queue Your Listeners (Make Them Fast!)

```php
class SendWelcomeEmail implements ShouldQueue
{
    use Queueable;

    public function handle(UserRegistered $event): void
    {
        Mail::to($event->user)->send(new WelcomeEmail());
    }
}
```

**That's it!** Add `implements ShouldQueue` and the listener runs in the background. Your response is instant! ⚡

### 2. Conditional Listeners

```php
class SendPremiumWelcome
{
    public function handle(UserRegistered $event): void
    {
        if ($event->user->isPremium()) {
            Mail::to($event->user)->send(new PremiumWelcomeEmail());
        }
    }
}
```

**Translation:** "Only run this if the user is premium!" Easy conditional logic! 🎛️

### 3. Stop Propagation

```php
class CheckUserIsBanned
{
    public function handle(UserRegistered $event): bool
    {
        if ($event->user->isBanned()) {
            // Stop other listeners from running!
            return false;
        }

        return true;
    }
}
```

**The power:** One listener can stop the chain! Like circuit breakers for events! 🚦

### 4. Event Subscribers (Multiple Events, One Class)

```php
class UserEventSubscriber
{
    public function handleUserRegistered(UserRegistered $event): void
    {
        // Handle registration
    }

    public function handleUserLoggedIn(UserLoggedIn $event): void
    {
        // Handle login
    }

    public function subscribe($events): void
    {
        $events->listen(
            UserRegistered::class,
            [UserEventSubscriber::class, 'handleUserRegistered']
        );

        $events->listen(
            UserLoggedIn::class,
            [UserEventSubscriber::class, 'handleUserLoggedIn']
        );
    }
}
```

**When to use:** When you have related events that share logic. Keep all user-related event handling in one place! 📦

## Real-World Example: E-commerce Order 🛒

**The event:**

```php
class OrderPlaced
{
    public function __construct(
        public Order $order,
        public User $customer
    ) {}
}
```

**The listeners:**

```php
// SendOrderConfirmation.php
class SendOrderConfirmation
{
    public function handle(OrderPlaced $event): void
    {
        Mail::to($event->customer)->send(
            new OrderConfirmationEmail($event->order)
        );
    }
}

// NotifyWarehouse.php
class NotifyWarehouse implements ShouldQueue
{
    public function handle(OrderPlaced $event): void
    {
        Http::post(config('warehouse.webhook'), [
            'order_id' => $event->order->id,
            'items' => $event->order->items->toArray()
        ]);
    }
}

// UpdateInventory.php
class UpdateInventory
{
    public function handle(OrderPlaced $event): void
    {
        foreach ($event->order->items as $item) {
            $item->product->decrement('stock', $item->quantity);
        }
    }
}

// CreateInvoice.php
class CreateInvoice implements ShouldQueue
{
    public function handle(OrderPlaced $event): void
    {
        $invoice = Invoice::generate($event->order);
        Storage::put("invoices/{$invoice->id}.pdf", $invoice->pdf());
    }
}

// AwardLoyaltyPoints.php
class AwardLoyaltyPoints
{
    public function handle(OrderPlaced $event): void
    {
        $points = floor($event->order->total * 0.1); // 10% back
        $event->customer->addPoints($points);
    }
}
```

**The controller:**

```php
public function store(Request $request)
{
    $order = Order::create($request->validated());

    event(new OrderPlaced($order, auth()->user()));

    return response()->json(['order' => $order]);
}
```

**CLEAN!** Five complex operations, one simple controller! 🎯

## Testing Made Easy 🧪

**Test that event is fired:**

```php
public function test_order_placed_event_fires()
{
    Event::fake([OrderPlaced::class]);

    $this->post('/orders', $orderData);

    Event::assertDispatched(OrderPlaced::class);
}
```

**Test listener in isolation:**

```php
public function test_welcome_email_is_sent()
{
    Mail::fake();

    $user = User::factory()->create();
    $listener = new SendWelcomeEmail();

    $listener->handle(new UserRegistered($user));

    Mail::assertSent(WelcomeEmail::class);
}
```

**The beauty:** Test each piece independently! No more testing 10 things at once! 🎊

## Bonus: Model Events (Built-in Magic) ✨

Laravel models fire events automatically!

```php
class User extends Model
{
    protected static function booted()
    {
        // Runs AFTER user is created
        static::created(function ($user) {
            event(new UserRegistered($user));
        });

        // Runs BEFORE user is deleted
        static::deleting(function ($user) {
            // Clean up related data
            $user->posts()->delete();
        });

        // Runs AFTER user is updated
        static::updated(function ($user) {
            if ($user->wasChanged('email')) {
                // Email changed! Send verification
            }
        });
    }
}
```

**Available model events:**
- `retrieved`, `creating`, `created`
- `updating`, `updated`
- `saving`, `saved`
- `deleting`, `deleted`
- `restoring`, `restored`

**Pro tip:** Use `creating` for defaults, `created` for notifications, `deleting` for cleanup!

## When to Use Events 🎨

**Use events when:**
- ✅ Multiple things need to happen after an action
- ✅ You want decoupled code
- ✅ Features might be added/removed later
- ✅ You need to notify external services
- ✅ Testing needs to be isolated

**Don't use events when:**
- ❌ Only ONE thing needs to happen
- ❌ The logic is critical to the operation (use synchronous code)
- ❌ You're making things complex for no reason

**Real talk:** Events are for "side effects," not core business logic. Creating an order? That's NOT an event. Sending confirmation email after order? THAT's an event! 📧

## Common Gotchas 🪤

**Gotcha #1: Event listeners not running**

Did you register them in `EventServiceProvider`?

```php
protected $listen = [
    MyEvent::class => [MyListener::class],
];
```

Or run: `php artisan event:cache` after changes!

**Gotcha #2: Queued listener not working**

Did you start your queue worker?

```bash
php artisan queue:work
```

**Gotcha #3: Circular events**

```php
// DON'T DO THIS:
UserCreated -> fires -> UpdateStats -> fires -> UserCreated -> 💀
```

Be careful not to create event loops! Your app will explode! 💥

## The Event Checklist ✅

Before you ship:

- [ ] Events named clearly (UserRegistered, OrderPlaced)
- [ ] Listeners registered in EventServiceProvider
- [ ] Slow listeners marked as `ShouldQueue`
- [ ] Tests for event dispatch and listener logic
- [ ] No circular event dependencies
- [ ] Queue worker running in production

## Real Talk 💬

**Q: "Should I use events for EVERYTHING?"**

A: No! Use them for side effects and cross-cutting concerns. Core business logic should be explicit in your code.

**Q: "Events vs Jobs - what's the difference?"**

A: Events = "Something happened, anyone who cares can respond." Jobs = "Do this specific task." Events broadcast, jobs execute!

**Q: "Are events slower?"**

A: Synchronous events? Barely! Queued listeners? Faster! They run in the background!

**Q: "Can I pass multiple parameters to an event?"**

A: Yes! Events are just classes. Put whatever you need in the constructor!

## The Bottom Line

Events are like having a town crier for your app:

1. **Something happens** (Event fires)
2. **Announce it** (event())
3. **Let interested parties respond** (Listeners)
4. **Keep your controllers clean** (Single responsibility!)

Stop writing controllers that do 47 things. Stop coupling every feature together. Fire events and let listeners handle their own business!

Think of it like ordering pizza: You don't tell the restaurant how to make the pizza, prep the ingredients, drive the car, and ring your doorbell. You just order (fire event) and they handle the rest (listeners)! 🍕

Your controllers will be clean, your code will be testable, and when someone asks you to add "just one more thing" after user registration, you'll just create another listener instead of crying into your coffee! ☕

---

**Want to discuss Laravel architecture patterns?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - Let's talk decoupled code!

**Found this helpful?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) for more Laravel magic!

*Now go decouple that spaghetti code!* 🍝➡️✨
