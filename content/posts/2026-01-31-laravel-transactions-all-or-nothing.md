---
title: "Laravel Transactions: All or Nothing (No Half-Baked Data) 🛡️"
date: "2026-01-31"
excerpt: "Your database is a hot mess because you're not using transactions. Let's fix that before your users notice!"
tags: ["laravel", "php", "database", "web-dev"]
---

# Laravel Transactions: All or Nothing (No Half-Baked Data) 🛡️

Ever had a user's payment go through but their order didn't save? Or created an account but forgot to send the welcome email record? Yeah, that's what happens when you don't use database transactions!

Let's talk about how to keep your database consistent without losing your mind (or your data).

## What Even Is a Transaction? 🤔

Think of a transaction like an Amazon order:
- Either ALL items ship, or NONE do
- No "oops, we shipped half your order and lost the rest" situations

Database transactions work the same way. Either ALL your database operations succeed, or NONE of them happen. It's the "ctrl+z" for your database!

## The Problem: Half-Baked Data 🍞

**The scary scenario:**

```php
// User signs up for premium
$user = User::create([
    'name' => 'John',
    'email' => 'john@example.com',
]);

// This succeeds ✅

$user->subscription()->create([
    'plan' => 'premium',
    'expires_at' => now()->addYear(),
]);

// This FAILS! 💥 Database connection dies

// Result: User exists but no subscription
// User gets premium features for free? Your boss is NOT happy! 😱
```

**The consequences:**
- User created but subscription missing
- Money charged but order not recorded
- Inventory reduced but sale not logged
- Your database is now inconsistent
- Your weekend plans are now "fix production" 😭

## The Solution: DB::transaction() 🎯

Laravel makes transactions stupid simple:

```php
use Illuminate\Support\Facades\DB;

DB::transaction(function () {
    $user = User::create([
        'name' => 'John',
        'email' => 'john@example.com',
    ]);

    $user->subscription()->create([
        'plan' => 'premium',
        'expires_at' => now()->addYear(),
    ]);

    PaymentLog::create([
        'user_id' => $user->id,
        'amount' => 99.99,
    ]);
});

// If ANYTHING fails, EVERYTHING rolls back!
// All or nothing, baby! 🚀
```

**What happens:**
1. Laravel says "START TRANSACTION" to the database
2. All your operations run
3. If everything succeeds → "COMMIT" (save it all!)
4. If anything fails → "ROLLBACK" (nuke it all!)

It's like having an undo button that triggers automatically! ✨

## Real-World Example: Transferring Money 💰

**The classic bank transfer:**

```php
public function transferMoney($fromUserId, $toUserId, $amount)
{
    DB::transaction(function () use ($fromUserId, $toUserId, $amount) {
        $fromUser = User::lockForUpdate()->find($fromUserId);
        $toUser = User::lockForUpdate()->find($toUserId);

        if ($fromUser->balance < $amount) {
            throw new InsufficientFundsException();
        }

        // Deduct from sender
        $fromUser->decrement('balance', $amount);

        // Add to receiver
        $toUser->increment('balance', $amount);

        // Log the transaction
        Transfer::create([
            'from_user_id' => $fromUserId,
            'to_user_id' => $toUserId,
            'amount' => $amount,
        ]);
    });
}
```

**The magic:**
- Either money leaves AND arrives, or nothing happens
- No "money disappeared into the void" situations
- `lockForUpdate()` prevents race conditions (bonus points!)
- Your accountant can sleep at night 😴

## Manual Control: When You Need the Wheel 🎮

Sometimes you need more control:

```php
DB::beginTransaction();

try {
    $order = Order::create($orderData);
    $order->items()->createMany($items);
    $this->chargePayment($order);

    DB::commit(); // All good! Save it!

} catch (\Exception $e) {
    DB::rollBack(); // Something broke! Undo everything!

    // Handle the error
    Log::error('Order failed: ' . $e->getMessage());
    throw $e;
}
```

**When to use manual transactions:**
- You need custom error handling
- Complex logic with multiple decision points
- You want to log before rolling back
- You're feeling fancy 💅

## Common Gotchas (Learn From My Pain) 🚨

### 1. Nested Transactions Are Tricky

```php
DB::transaction(function () {
    // Outer transaction

    DB::transaction(function () {
        // Inner transaction... or is it? 🤔
    });
});
```

**Real talk:** By default, Laravel doesn't support true nested transactions. It just ignores the inner ones! Use `savepoints` if you really need nesting.

### 2. Queued Jobs Run AFTER Commit

```php
DB::transaction(function () {
    $user = User::create($data);

    // This job might run BEFORE the transaction commits!
    ProcessUser::dispatch($user);
});
```

**The fix:** Use `afterCommit()`:

```php
ProcessUser::dispatch($user)->afterCommit();
```

### 3. Don't Catch ALL Exceptions

```php
// 🚫 BAD: This breaks transactions!
DB::transaction(function () {
    try {
        // stuff that might fail
    } catch (\Exception $e) {
        // Swallowing exceptions = transaction won't rollback!
    }
});
```

**Better:**

```php
DB::transaction(function () {
    // Let exceptions bubble up!
    // Laravel will auto-rollback on exceptions
    $order = Order::create($data);
});
```

## When to Use Transactions ✅

**Always use them when:**
- Creating related records (user + profile + settings)
- Money is involved (duh! 💸)
- Updating inventory/stock levels
- Multi-step operations that must all succeed
- You'd be upset if only half completed

**You probably don't need them for:**
- Single INSERT/UPDATE operations
- Read-only queries
- Logging (logs should survive even if operations fail)
- Non-critical operations

## Pro Tips 💡

### 1. Keep Transactions Short

```php
// 🚫 BAD: Long transaction locks tables
DB::transaction(function () {
    $user = User::create($data);
    sleep(10); // Sending email or something slow
    $user->update($moreData);
});

// ✅ GOOD: Only transact what needs it
$user = User::create($data);
$this->sendEmail($user); // Outside transaction
DB::transaction(function () use ($user, $moreData) {
    $user->update($moreData);
});
```

### 2. Use Eloquent Events Wisely

```php
// Model events fire INSIDE the transaction
class User extends Model
{
    protected static function booted()
    {
        static::created(function ($user) {
            // This runs inside the transaction
            // If this fails, user creation rolls back!
        });
    }
}
```

### 3. Test Your Rollbacks!

```php
// In your tests
public function test_transaction_rolls_back_on_failure()
{
    $this->expectException(SomeException::class);

    $initialCount = User::count();

    try {
        DB::transaction(function () {
            User::create(['name' => 'Test']);
            throw new SomeException();
        });
    } catch (SomeException $e) {
        // Exception caught
    }

    $this->assertEquals($initialCount, User::count());
    // User wasn't created! 🎉
}
```

## The Quick Reference 📋

```php
// Simple auto-rollback
DB::transaction(function () {
    // Do database stuff
});

// Manual control
DB::beginTransaction();
try {
    // Do stuff
    DB::commit();
} catch (\Exception $e) {
    DB::rollBack();
    throw $e;
}

// With retry on deadlock
DB::transaction(function () {
    // Do stuff
}, 5); // Retry up to 5 times

// Lock rows to prevent race conditions
User::lockForUpdate()->find($id);
```

## Real Talk 💬

**Q: "Do transactions slow down my app?"**

A: A tiny bit, but inconsistent data is WAY worse! The overhead is minimal compared to the safety you get.

**Q: "Can I use transactions with MongoDB?"**

A: MongoDB 4.0+ supports multi-document transactions, but Laravel's transaction helpers are designed for SQL databases. Check the MongoDB Laravel docs!

**Q: "What if my transaction times out?"**

A: Keep transactions short! If you're hitting timeouts, you're probably doing too much inside the transaction. Move non-critical stuff outside.

## The Bottom Line

Database transactions are like seatbelts:
- They feel unnecessary... until you need them
- They prevent disasters
- They're easy to use
- Not using them is just asking for trouble

Your data deserves better than "oops, something broke halfway through!"

Wrap your critical operations in `DB::transaction()` and sleep better at night knowing your database stays consistent! 🌙

---

**Questions? War stories?** Share them on [LinkedIn](https://www.linkedin.com/in/anuraghkp). I've definitely caused database inconsistencies before I learned this! 😅

**Want more Laravel deep-dives?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and keep learning!

*Now go wrap those critical operations in transactions!* 🛡️💪
