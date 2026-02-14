---
title: "Laravel Soft Deletes: Delete Without Actually Deleting 🗑️"
date: "2026-02-14"
excerpt: "Why permanently delete data when you can just... pretend? Learn how Laravel's soft deletes saved my butt (and can save yours too)."
tags: ["laravel", "php", "eloquent", "database"]
---

# Laravel Soft Deletes: Delete Without Actually Deleting 🗑️

Ever deleted a user account only to hear "Wait, I didn't mean to delete that!" five minutes later? Yeah, me too. And that's how I learned about soft deletes the hard way.

## The "Oh Crap" Moment That Changed Everything 😱

Picture this: It's 2 PM on a Friday. A client calls. "We need to restore that customer account we deleted last week. They're our biggest client."

Me: "Sure, let me just... oh."

The database: *cricket sounds*

That data was GONE. Like, permanently gone. No backup recent enough. No audit trail. Just gone.

After spending 3 hours manually reconstructing data from scattered logs and old exports, I made a promise: Never. Again.

## What Even Are Soft Deletes? 🤔

Soft deletes are Laravel's way of saying "Let's not actually delete this, let's just hide it."

Instead of running `DELETE FROM users WHERE id = 5`, Laravel just adds a timestamp to a `deleted_at` column. The row stays in your database, but Laravel pretends it's not there.

It's like closing your eyes and saying "I can't see you, so you don't exist!" Except it actually works.

## The 30-Second Setup ⚡

**Step 1:** Add the trait to your model

```php
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Model
{
    use SoftDeletes;
}
```

**Step 2:** Add the column in your migration

```php
Schema::table('users', function (Blueprint $table) {
    $table->softDeletes(); // Adds deleted_at column
});
```

That's it. Seriously. Laravel handles everything else.

## How It Actually Works 🔧

When you "delete" a model:

```php
$user = User::find(5);
$user->delete();
```

Laravel doesn't delete the row. It does this:

```sql
UPDATE users SET deleted_at = '2026-02-14 15:30:00' WHERE id = 5
```

Now when you query users:

```php
User::all(); // Doesn't include soft-deleted users
User::find(5); // Returns null (user is "deleted")
```

Laravel automatically adds `WHERE deleted_at IS NULL` to every query. Magic! ✨

## The Real-World Scenarios Where This Saves Your Butt 🦸

### 1. The Accidental Delete

As a Technical Lead, I've seen this happen way too many times. Someone clicks the wrong button, and boom—critical data is gone.

With soft deletes:

```php
// Whoops, deleted the wrong user
$user->delete();

// No problem, restore it!
$user->restore();
```

In production systems I've built, we've restored "deleted" records hundreds of times. It's a lifesaver.

### 2. The Audit Trail

Ever need to know WHO deleted WHAT and WHEN? With soft deletes, you keep everything:

```php
// Get all deleted users with deletion info
$deletedUsers = User::onlyTrashed()
    ->where('deleted_at', '>=', now()->subDays(30))
    ->get();

foreach ($deletedUsers as $user) {
    echo "Deleted: {$user->name} at {$user->deleted_at}";
}
```

This saved us during a security audit. We could prove exactly what happened and when.

### 3. The Cascade Nightmare

Imagine a user who has:
- 500 orders
- 200 comments
- 50 reviews

If you hard-delete that user, what happens? Foreign key constraints go berserk. Cascade deletes wipe out tons of data.

With soft deletes? Everything just gets a timestamp. Nothing actually breaks. You can restore it all if needed.

## Pro Tips From the Trenches 💡

### Tip 1: Querying Deleted Records

```php
// Only deleted records
User::onlyTrashed()->get();

// Include deleted records
User::withTrashed()->get();

// Check if a model is soft deleted
if ($user->trashed()) {
    echo "This user is deleted!";
}
```

### Tip 2: Force Deleting When You Mean It

Sometimes you DO want to permanently delete:

```php
// Soft delete (recoverable)
$user->delete();

// Force delete (gone forever)
$user->forceDelete();
```

A pattern that saved us in a real project: Keep soft deletes for 90 days, then permanently delete with a scheduled job:

```php
// In App\Console\Kernel.php
protected function schedule(Schedule $schedule)
{
    $schedule->call(function () {
        User::onlyTrashed()
            ->where('deleted_at', '<', now()->subDays(90))
            ->forceDelete();
    })->daily();
}
```

### Tip 3: Relationships and Soft Deletes

Here's a gotcha that bit me: When you soft delete a parent, what about the children?

```php
class User extends Model
{
    use SoftDeletes;

    public function posts()
    {
        return $this->hasMany(Post::class);
    }
}

$user->delete(); // User is soft-deleted
$user->posts; // Still returns posts!
```

If you want posts to "disappear" too, make Post use SoftDeletes and add a `deleted` event:

```php
class User extends Model
{
    use SoftDeletes;

    protected static function boot()
    {
        parent::boot();

        static::deleted(function ($user) {
            $user->posts()->delete(); // Soft delete all posts
        });

        static::restored(function ($user) {
            $user->posts()->restore(); // Restore all posts
        });
    }
}
```

### Tip 4: The Unique Index Problem

Watch out for this one! If you have a unique constraint on email:

```php
// User deletes account (soft delete)
$user->delete();

// They try to re-register with same email
User::create(['email' => 'john@example.com']); // ERROR! Email already exists
```

The solution? Make your unique index ignore soft-deleted records:

```php
Schema::table('users', function (Blueprint $table) {
    $table->unique(['email', 'deleted_at']);
});
```

Or use a partial index in PostgreSQL:

```sql
CREATE UNIQUE INDEX users_email_unique
ON users (email)
WHERE deleted_at IS NULL;
```

## When NOT to Use Soft Deletes 🚫

Real talk: Don't use soft deletes everywhere. Here's when to skip them:

**1. High-volume tables:** Logs, analytics events, temporary data—just delete them. Your database will thank you.

**2. Sensitive data:** GDPR/CCPA requires you to ACTUALLY delete personal data when requested. Soft deletes don't cut it.

**3. Large tables:** Soft deletes mean your table keeps growing. If you have millions of records, performance suffers.

In production systems I've built, we use soft deletes for:
- User accounts ✅
- Orders and transactions ✅
- Content (posts, articles) ✅

We DON'T use them for:
- Session data ❌
- Cache entries ❌
- Analytics events ❌

## The Bottom Line 🎯

Soft deletes are like an "undo" button for your database. They cost you almost nothing but can save you hours (or days) of pain.

Set them up on models where:
1. Users might delete things accidentally
2. You need an audit trail
3. Data recovery is important
4. You have complex relationships

Don't use them on:
1. High-volume tables
2. Temporary data
3. When legal requirements demand real deletion

## Real Talk: The Performance Question 💬

"Won't soft deletes slow down my queries?"

Slightly. Every query adds `WHERE deleted_at IS NULL`. But you know what's slower? Explaining to your boss why you can't recover that deleted data.

Add an index if you're worried:

```php
Schema::table('users', function (Blueprint $table) {
    $table->index('deleted_at');
});
```

In my experience, the performance hit is negligible compared to the peace of mind.

## Quick Reference Card 📝

```php
// Soft delete
$user->delete();

// Restore
$user->restore();

// Check if deleted
$user->trashed(); // true/false

// Include deleted
User::withTrashed()->get();

// Only deleted
User::onlyTrashed()->get();

// Force delete (permanent)
$user->forceDelete();

// Restore by ID
User::withTrashed()->find(5)->restore();
```

---

**Learned this the hard way?** Share your deleted-data horror stories on [LinkedIn](https://www.linkedin.com/in/anuraghkp). Misery loves company! 😄

**Want more Laravel wisdom?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io)—it's like soft deletes, but for stars (okay, that analogy fell apart).

*Now go forth and delete things without fear!* 🗑️✨
