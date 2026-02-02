---
title: "Laravel Observers: The Silent Watchers 👀"
date: "2026-02-02"
excerpt: "Stop cluttering your controllers! Let Laravel Observers watch your models and handle side effects like a ninja. Clean code incoming!"
tags: ["laravel", "php", "web-dev", "eloquent"]
---

# Laravel Observers: The Silent Watchers 👀

Ever felt like your Laravel controllers are doing too much? You're creating a user, sending a welcome email, creating a profile, logging the action, notifying admins, making coffee... okay maybe not the last one, but you get the point!

Let me tell you about Observers - Laravel's way of saying "I got this" while keeping your code clean.

## What the Heck Is an Observer? 🤔

Think of Observers as security cameras for your Eloquent models. They watch everything happening to your models and react automatically. Created a user? Observer knows. Updated a post? Observer's watching. Deleted something? Observer caught that too!

In production systems I've built at Cubet Techno Labs, Observers saved us from controller bloat and made our e-commerce backends way more maintainable.

## The Problem: Controllers on Steroids 💪❌

Here's what I see all the time (and what I used to do):

```php
public function store(Request $request)
{
    // Create user
    $user = User::create($request->validated());

    // Create profile
    Profile::create(['user_id' => $user->id]);

    // Send welcome email
    Mail::to($user)->send(new WelcomeEmail($user));

    // Log the registration
    Log::info('New user registered', ['user_id' => $user->id]);

    // Notify admins
    Notification::send($admins, new NewUserNotification($user));

    // Generate API token
    $user->createToken('default');

    return response()->json($user, 201);
}
```

This works, but YIKES! Your controller knows way too much. It's like hiring someone to make pizza who also has to grow the tomatoes, milk the cow for cheese, and deliver the pizza. Not scalable! 🍕

## The Solution: Let Observers Watch 🔍

Create an observer:

```bash
php artisan make:observer UserObserver --model=User
```

Now move all that logic where it belongs:

```php
class UserObserver
{
    public function created(User $user)
    {
        // Auto-create profile
        $user->profile()->create([
            'bio' => 'New user - bio coming soon!',
        ]);

        // Send welcome email
        Mail::to($user)->queue(new WelcomeEmail($user));

        // Generate default API token
        $user->createToken('default');

        Log::info('New user registered', ['user_id' => $user->id]);
    }

    public function updated(User $user)
    {
        // Track what changed
        if ($user->isDirty('email')) {
            Mail::to($user)->send(new EmailChangedNotification());
        }
    }

    public function deleting(User $user)
    {
        // Clean up before deletion (note: deleting, not deleted!)
        $user->posts()->delete();
        $user->comments()->delete();
        $user->sessions()->delete();
    }
}
```

Register it in `AppServiceProvider`:

```php
use App\Models\User;
use App\Observers\UserObserver;

public function boot()
{
    User::observe(UserObserver::class);
}
```

Now your controller is CLEAN:

```php
public function store(Request $request)
{
    $user = User::create($request->validated());

    return response()->json($user, 201);
}
```

Beautiful! One line! The Observer handles everything else automatically. 🎯

## Real Talk: When I Actually Use Observers 💼

As a Technical Lead, I've learned that Observers shine in these scenarios:

**1. Model-Specific Side Effects**
When something ALWAYS needs to happen with a model, regardless of where it's created/updated. User always needs a profile? Observer it!

**2. Automatic Cleanup**
Deleting a user should delete their data. Don't trust developers to remember - let the Observer handle it.

**3. Audit Trails**
In a production e-commerce system I architected, we used Observers to track every price change, every inventory update. Gold for debugging customer complaints!

**4. Computed Fields**
Need to auto-generate slugs? Calculate totals? Hash passwords (actually use a mutator for this, but you get the idea)?

## Pro Tips From the Trenches 🎖️

### Tip 1: Know Your Events

Observer methods you can use:
- `creating` / `created` - Before/after insert
- `updating` / `updated` - Before/after update
- `saving` / `saved` - Before/after create OR update
- `deleting` / `deleted` - Before/after delete
- `retrieved` - When model is fetched (use sparingly!)
- `restoring` / `restored` - When soft-deleted model is restored

**The "ing" vs "ed" trick:**
- Use `creating/updating/deleting` when you need to CHANGE the model before it's saved
- Use `created/updated/deleted` for side effects AFTER it's saved

### Tip 2: Don't Go Observer Crazy 🤪

A pattern that saved us in a real project: If the logic is needed in EVERY context, use an Observer. If it's only needed in specific scenarios, use Events instead.

**Example:**
- User always needs a profile → Observer ✅
- User might get a welcome email depending on signup source → Event 🎯

### Tip 3: Observers Can Access Dirty Data

This is POWERFUL:

```php
public function updated(User $user)
{
    // Check what changed
    if ($user->isDirty('email')) {
        // Email changed!
    }

    // Get old value
    $oldEmail = $user->getOriginal('email');
    $newEmail = $user->email;

    // Get all changes
    $changes = $user->getDirty();
}
```

In production systems I've built, this saved us countless hours debugging "what changed?" issues.

### Tip 4: Observers Fire on Mass Operations (Usually)

Here's a gotcha:

```php
// This DOES fire observers (one by one)
User::where('active', false)->get()->each->delete();

// This does NOT fire observers (direct SQL)
User::where('active', false)->delete();
```

Choose wisely based on your needs! Mass deletes are faster but skip Observers.

## Real-World Example: E-commerce Order Observer 🛒

Here's something similar to what I built in a serverless e-commerce backend:

```php
class OrderObserver
{
    public function creating(Order $order)
    {
        // Auto-generate order number before saving
        $order->order_number = 'ORD-' . strtoupper(Str::random(10));

        // Set initial status
        $order->status = 'pending';
    }

    public function created(Order $order)
    {
        // Queue inventory reservation
        ReserveInventory::dispatch($order);

        // Send confirmation email
        Mail::to($order->customer)->queue(new OrderConfirmation($order));

        // Notify warehouse
        event(new NewOrderPlaced($order));
    }

    public function updating(Order $order)
    {
        // Track status changes
        if ($order->isDirty('status')) {
            $order->status_changed_at = now();
            $order->status_changed_by = auth()->id();
        }
    }

    public function updated(Order $order)
    {
        // Status changed? Take action!
        if ($order->wasChanged('status')) {
            match($order->status) {
                'paid' => event(new OrderPaid($order)),
                'shipped' => Mail::to($order->customer)
                    ->queue(new OrderShipped($order)),
                'delivered' => AskForReview::dispatch($order)
                    ->delay(now()->addDays(3)),
                default => null,
            };
        }
    }
}
```

This Observer handles ALL order lifecycle management. Controllers stay thin, business logic stays organized. Chef's kiss! 👨‍🍳💋

## Common Mistakes (That I've Made) 🙈

**Mistake 1: Heavy Operations in Observers**
Don't run slow stuff directly in Observers - queue it!

```php
// Bad: Blocks the request
public function created(User $user)
{
    $this->someSlowApiCall($user);
}

// Good: Queued for background processing
public function created(User $user)
{
    ProcessNewUser::dispatch($user);
}
```

**Mistake 2: Infinite Loops**
```php
public function updated(User $user)
{
    // DON'T DO THIS! Infinite loop!
    $user->update(['last_modified' => now()]);
}
```

Use `updateQuietly()` or check `isDirty()` to avoid loops:

```php
public function updated(User $user)
{
    if (!$user->isDirty('last_modified')) {
        $user->updateQuietly(['last_modified' => now()]);
    }
}
```

**Mistake 3: Testing Nightmares**
Remember to account for Observers in tests! Sometimes you want them, sometimes you don't:

```php
// Disable observers for a test
User::withoutEvents(function () {
    User::factory()->count(100)->create();
});
```

## The Bottom Line 📊

Observers are like having a responsible roommate who automatically does the dishes, takes out the trash, and pays the bills on time. You barely notice them, but life is so much better with them!

**Use Observers when:**
- Something ALWAYS happens with a model
- You want to keep controllers thin
- You need automatic cleanup
- You're tracking changes for audit trails

**Skip Observers when:**
- Logic is context-specific (use Events)
- You need external input (use explicit methods)
- It's a one-off operation (just do it inline)

## Quick Setup Checklist ✅

1. Create Observer: `php artisan make:observer XObserver --model=X`
2. Add logic to appropriate methods (`created`, `updated`, etc.)
3. Register in `AppServiceProvider`: `X::observe(XObserver::class);`
4. Test it! (Don't forget this one! 😅)
5. Queue heavy operations - don't block requests!

---

**Questions about Observers?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). As a Technical Lead who's built production systems handling real traffic, I've probably debugged the same Observer issues you're facing! 😄

**Want more Laravel magic?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) - more clean code patterns coming soon!

*Now go make your controllers skinny and your Observers mighty!* 💪✨
