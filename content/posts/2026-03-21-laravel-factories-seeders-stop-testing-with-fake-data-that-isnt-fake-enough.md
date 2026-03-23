---
title: "Laravel Factories & Seeders: Your Test Data Is Lying to You 🏭"
date: "2026-03-21"
excerpt: "If your test database has 3 users named 'Test User', one product called 'Product 1', and no edge cases — congratulations, you're writing tests for a world that doesn't exist."
tags: ["\\\"laravel\\\"", "\\\"php\\\"", "\\\"testing\\\"", "\\\"web-dev\\\""]
---

# Laravel Factories & Seeders: Your Test Data Is Lying to You 🏭

If your test database has 3 users named "Test User", one product called "Product 1", and no edge cases — congratulations, you're writing tests for a world that doesn't exist.

I learned this the hard way. We launched an e-commerce feature at Cubet that worked perfectly in staging. Real users hit it and immediately found a bug because one of them had an apostrophe in their name (O'Brien). Our test data had zero apostrophes. Our test suite was green. Our Slack was not. 🔥

Let's fix this properly.

## The Problem With Lazy Test Data 😴

This is what most devs write:

```php
// The "I'll fix it later" seeder
User::create(['name' => 'Test User', 'email' => 'test@test.com']);
User::create(['name' => 'Test User 2', 'email' => 'test2@test.com']);
```

This tests precisely nothing real. Real users have long names, unicode characters, weird email providers, and they definitely have "O'" in their surnames.

**Real Talk:** If your test data looks nothing like production data, your tests are theatre. They feel good but they're not catching real bugs.

## Laravel Factories: The Right Way 🎯

Laravel factories use Faker to generate realistic data automatically. Here's what a proper factory looks like:

```php
// database/factories/UserFactory.php
class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->phoneNumber(),
            'country' => fake()->countryCode(),
            'email_verified_at' => now(),
            'password' => bcrypt('password'),
        ];
    }

    // States make factories incredibly powerful
    public function unverified(): static
    {
        return $this->state(['email_verified_at' => null]);
    }

    public function admin(): static
    {
        return $this->state(['role' => 'admin']);
    }

    public function suspended(): static
    {
        return $this->state(['suspended_at' => now()]);
    }
}
```

Now your tests can do this:

```php
// Create 50 realistic users with one line
User::factory()->count(50)->create();

// Create an unverified admin (good for edge case testing)
User::factory()->unverified()->admin()->create();

// Create a suspended user for testing access restrictions
User::factory()->suspended()->create();
```

In production systems I've built, this pattern has caught bugs that "happy path" tests missed every single time.

## Factory Relationships: Where It Gets Fun 🔗

For our e-commerce backend, orders belong to users, items belong to orders, and addresses belong to users. Here's how we handled it:

```php
class OrderFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(), // Creates a user automatically!
            'status' => fake()->randomElement(['pending', 'processing', 'shipped', 'delivered', 'cancelled']),
            'total' => fake()->randomFloat(2, 10, 5000),
            'notes' => fake()->optional()->sentence(), // Randomly null or filled
        ];
    }
}
```

The `User::factory()` call inside the definition is magic. Laravel will automatically create a related user when you create an order. No manual setup needed.

```php
// This creates a user AND an order in one line
$order = Order::factory()->create();

// Or if you want to control the user
$order = Order::factory()->for($existingUser)->create();

// Create 10 orders with 3 items each
Order::factory()
    ->count(10)
    ->has(OrderItem::factory()->count(3), 'items')
    ->create();
```

## Pro Tip: The `recycle()` Method 🔄

Here's something that saved us in a real project. When you create 100 orders for a realistic database, you don't want 100 different users — that's not realistic. You want a smaller pool of users placing multiple orders.

```php
$users = User::factory()->count(20)->create();

Order::factory()
    ->count(100)
    ->recycle($users) // Reuses existing users randomly
    ->create();
```

One method call. Now your test DB looks like a real app where some users are power buyers and others placed one order two years ago.

## Seeders: Orchestrating the Whole Thing 🌱

Factories are the building blocks. Seeders are the conductor.

```php
// database/seeders/DatabaseSeeder.php
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Create admin users first
        User::factory()->admin()->count(3)->create();

        // Create regular users
        $users = User::factory()->count(50)->create();

        // Create products
        $products = Product::factory()->count(200)->create();

        // Generate realistic order history
        Order::factory()
            ->count(500)
            ->recycle($users)
            ->has(
                OrderItem::factory()
                    ->count(fake()->numberBetween(1, 5))
                    ->recycle($products),
                'items'
            )
            ->create();

        $this->command->info('✅ Database seeded with realistic e-commerce data');
    }
}
```

Run with:

```bash
php artisan migrate:fresh --seed
```

One command and you have a realistic database with 50 users, 200 products, 500 orders, and up to 2,500 order items. Takes about 3 seconds.

## Real Talk: The Edge Cases That Will Bite You 💬

As a Technical Lead, I've learned that the bugs your test data doesn't cover will find their way to production with surgical precision. These are the states I now *always* test:

**For users:** unverified accounts, suspended accounts, accounts with no orders, accounts with 100+ orders, names with apostrophes and hyphens

**For orders:** zero-item orders (edge case — can happen with race conditions), cancelled orders mid-fulfillment, orders with free items (price = 0.00), orders in every status

**For products:** out-of-stock items, items with no images, items with names exceeding 255 chars (you'd be surprised)

Add factory states for all of these. Future you will send current you a thank-you card.

## Bonus: Fake Data That's Actually Realistic 🎁

Faker has providers for almost everything. Don't settle for generic data:

```php
// For an e-commerce app, this is way more realistic
'product_name' => fake()->randomElement([
    fake()->colorName() . ' ' . fake()->word(),
    fake()->company() . ' ' . fake()->word(),
]),
'price' => fake()->randomElement([9.99, 19.99, 29.99, 49.99, 99.99]),
'sku' => strtoupper(fake()->bothify('??-####-??')),
'weight_kg' => fake()->randomFloat(2, 0.1, 25.0),
```

And for locale-specific testing, Faker supports it:

```php
fake('en_IN')->phoneNumber() // Indian phone numbers
fake('de_DE')->name()        // German names
```

We used this extensively when building multi-region features. Catching "this breaks for German addresses" in staging beats finding it after launch.

## TL;DR ✅

- **Factories** generate realistic model data using Faker — use states for edge cases
- **`recycle()`** reuses existing models for realistic relationships
- **`has()` and `for()`** build proper relational data with zero boilerplate
- **Seeders** orchestrate factories into complete, believable datasets
- Your test data should be *embarrassingly realistic* — if it looks too clean, it's lying to you

Stop testing with `test@test.com` and "Product 1". Your bugs are hiding in the data you're too polite to generate.

---

**Burned by bad test data before?** Hit me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I have war stories. 😄

**More Laravel deep dives?** Star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) — new posts drop regularly!

*Now go seed that database like it owes you money.* 🌱💨
