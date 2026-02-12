---
title: "Laravel Model Casts: Making Data Types Not Suck 🎯"
date: "2026-02-12"
excerpt: "Stop manually converting JSON strings and dates! Laravel's model casts handle data transformation automatically. Let me show you the magic I wish I knew 5 years ago."
tags: ["laravel", "php", "eloquent", "web-dev"]
---

# Laravel Model Casts: Making Data Types Not Suck 🎯

Picture this: You pull a model from the database, and instead of getting `"true"` as a string, you get an actual boolean. Instead of `"2026-02-12"` as text, you get a Carbon instance ready to format. Instead of a JSON blob, you get a real PHP array.

**That's the magic of model casts.** And I'm kicking myself for not using them properly in my first 2 years of Laravel development! 🤦

## What Are Model Casts? 🤔

Model casts automatically transform attribute values when you read or write them from the database. Think of them as invisible data translators sitting between your database and your code.

**Without casts:**
```php
$user->preferences; // "{"theme":"dark","notifications":true}"
// Gross! Now I need json_decode() everywhere
```

**With casts:**
```php
$user->preferences; // ['theme' => 'dark', 'notifications' => true]
// Beautiful! Just use it like a normal array!
```

In production systems I've built, casts have eliminated SO much repetitive code. Let me show you the power moves.

## 1. The Basics: Built-in Cast Types 🎁

Laravel gives you these casts for free:

```php
class User extends Model
{
    protected $casts = [
        'email_verified_at' => 'datetime',
        'is_admin' => 'boolean',
        'login_count' => 'integer',
        'balance' => 'decimal:2',
        'preferences' => 'array',
        'metadata' => 'object',
        'tags' => 'collection',
    ];
}
```

**Now watch the magic:**

```php
// Database has: is_admin = 1 (integer)
$user->is_admin; // true (boolean)

// Database has: preferences = '{"theme":"dark"}'
$user->preferences['theme']; // 'dark' - no json_decode needed!

// Database has: email_verified_at = '2026-02-12 10:30:00'
$user->email_verified_at->diffForHumans(); // '2 hours ago'
```

**As a Technical Lead, I've learned:** This one feature has prevented countless bugs from type juggling issues!

## 2. JSON Casts: The Game Changer 🎮

Here's a pattern that saved us in a real e-commerce project:

**Before casts (the painful way):**
```php
// Storing product options
$product->options = json_encode([
    'sizes' => ['S', 'M', 'L'],
    'colors' => ['red', 'blue'],
]);
$product->save();

// Reading them (pain!)
$options = json_decode($product->options, true);
$sizes = $options['sizes'] ?? [];
```

**After casts (the smart way):**
```php
class Product extends Model
{
    protected $casts = [
        'options' => 'array',
    ];
}

// Storing - Laravel handles JSON encoding
$product->options = [
    'sizes' => ['S', 'M', 'L'],
    'colors' => ['red', 'blue'],
];
$product->save();

// Reading - Already an array!
$sizes = $product->options['sizes'];
```

**Pro Tip:** Use `'collection'` instead of `'array'` if you want Laravel Collection methods:

```php
protected $casts = [
    'tags' => 'collection',
];

// Now you can do this:
$product->tags->map(fn($tag) => strtoupper($tag));
$product->tags->filter(fn($tag) => strlen($tag) > 3);
```

## 3. DateTime Casts: Time Travel Made Easy ⏰

In production systems I've built, working with dates is a constant headache. Casts fix it!

```php
class Post extends Model
{
    protected $casts = [
        'published_at' => 'datetime',
        'scheduled_for' => 'datetime:Y-m-d H:i',
    ];
}
```

**Now you get Carbon instances automatically:**

```php
// Database has: '2026-02-12 10:30:00'
$post->published_at->format('F j, Y'); // 'February 12, 2026'
$post->published_at->addDays(7);
$post->published_at->isPast(); // true/false

// Compare dates easily
if ($post->scheduled_for->isFuture()) {
    // Publish later
}
```

**Real Talk:** Before I learned this, I had `Carbon::parse()` scattered EVERYWHERE in my code. Such a waste!

## 4. Encrypted Casts: Secret Sauce 🔐

Need to store sensitive data? Laravel's got you covered:

```php
class User extends Model
{
    protected $casts = [
        'social_security' => 'encrypted',
        'bank_details' => 'encrypted:array',
    ];
}
```

**The magic:**
- **Writing:** Automatically encrypts before saving
- **Reading:** Automatically decrypts when accessing
- **Security:** Uses your `APP_KEY` for encryption

```php
// You write this
$user->social_security = '123-45-6789';
$user->save();

// Database stores encrypted gibberish
// But when you read it:
$user->social_security; // '123-45-6789' - decrypted!
```

A pattern that saved us in a real project: **Never store payment info without encryption casts!**

## 5. Custom Casts: Build Your Own Magic ✨

This is where it gets FUN! Let's build a custom cast for storing money values:

```bash
php artisan make:cast MoneyCast
```

```php
class MoneyCast implements CastsAttributes
{
    public function get($model, $key, $value, $attributes)
    {
        // Convert cents to dollars with formatting
        return number_format($value / 100, 2);
    }

    public function set($model, $key, $value, $attributes)
    {
        // Convert dollars to cents for storage
        return (int) ($value * 100);
    }
}
```

**Use it:**

```php
class Order extends Model
{
    protected $casts = [
        'total' => MoneyCast::class,
    ];
}

// Write in dollars
$order->total = 99.99;
$order->save(); // Stores 9999 (cents) in DB

// Read as formatted dollars
$order->total; // "99.99"
```

**In production systems I've built,** this pattern prevents floating-point errors when handling money!

## 6. Enum Casts: Type-Safe Status Values 🎯

PHP 8.1+ enums with Laravel casts = chef's kiss! 👨‍🍳

```php
enum OrderStatus: string
{
    case PENDING = 'pending';
    case PROCESSING = 'processing';
    case SHIPPED = 'shipped';
    case DELIVERED = 'delivered';

    public function label(): string
    {
        return match($this) {
            self::PENDING => 'Waiting to ship',
            self::PROCESSING => 'Being prepared',
            self::SHIPPED => 'On the way',
            self::DELIVERED => 'Arrived!',
        };
    }
}

class Order extends Model
{
    protected $casts = [
        'status' => OrderStatus::class,
    ];
}
```

**Now check this out:**

```php
// Database stores: 'pending'
// But you get:
$order->status; // OrderStatus::PENDING (enum instance!)

// Type-safe comparisons
if ($order->status === OrderStatus::SHIPPED) {
    // Send tracking email
}

// Methods from your enum
$order->status->label(); // 'Waiting to ship'
```

**As a Technical Lead, I've learned:** This eliminates typo bugs like `'shpped'` vs `'shipped'`!

## 7. Value Objects: Next-Level Casts 🚀

Want to cast to custom classes? Hell yes!

```php
class Address
{
    public function __construct(
        public string $street,
        public string $city,
        public string $zip,
    ) {}

    public function formatted(): string
    {
        return "{$this->street}, {$this->city} {$this->zip}";
    }
}

class AddressCast implements CastsAttributes
{
    public function get($model, $key, $value, $attributes)
    {
        $data = json_decode($value, true);

        return new Address(
            $data['street'],
            $data['city'],
            $data['zip']
        );
    }

    public function set($model, $key, $value, $attributes)
    {
        return json_encode([
            'street' => $value->street,
            'city' => $value->city,
            'zip' => $value->zip,
        ]);
    }
}
```

**Use it like a boss:**

```php
class User extends Model
{
    protected $casts = [
        'address' => AddressCast::class,
    ];
}

// Write as object
$user->address = new Address('123 Main St', 'Portland', '97201');

// Read as object
$user->address->formatted(); // '123 Main St, Portland 97201'
$user->address->city; // 'Portland'
```

## 8. The Gotchas (Learn From My Mistakes!) ⚠️

**1. Null Values:**
```php
// This can crash if the field is null
protected $casts = [
    'settings' => 'array',
];

// Better: Handle nulls in accessors
public function getSettingsAttribute($value)
{
    return json_decode($value, true) ?? [];
}
```

**2. Mass Assignment:**
```php
// Casts work with mass assignment
$user = User::create([
    'is_admin' => 'yes', // String!
]);

// Laravel casts it to boolean automatically
$user->is_admin; // false (because 'yes' !== '1')

// Be explicit:
'is_admin' => true, // Much better!
```

**3. Performance:**
```php
// Don't do this on large collections
$users = User::all(); // 10,000 users
$users->each(fn($u) => $u->preferences); // Decodes JSON 10,000 times!

// Better: Only select what you need
$users = User::select('id', 'name')->get();
```

## Bonus Tips: Pro Moves 💪

**1. Cast Parameters:**
```php
protected $casts = [
    'balance' => 'decimal:2',  // 2 decimal places
    'published_at' => 'datetime:Y-m-d', // Custom format
];
```

**2. Conditional Casts:**
```php
public function getCastsAttribute()
{
    $casts = [
        'created_at' => 'datetime',
    ];

    if ($this->type === 'premium') {
        $casts['features'] = 'collection';
    }

    return $casts;
}
```

**3. AsArrayObject:**
```php
protected $casts = [
    'options' => AsArrayObject::class,
];

// Now you can do:
$product->options->sizes = ['S', 'M', 'L'];
$product->save(); // Automatically saves!
```

## The Cast Types Cheat Sheet 📝

| Cast Type | Use Case | Example |
|-----------|----------|---------|
| `integer` | Numeric IDs, counts | `'views' => 'integer'` |
| `boolean` | True/false flags | `'is_active' => 'boolean'` |
| `array` | JSON arrays | `'tags' => 'array'` |
| `collection` | JSON with Collection methods | `'items' => 'collection'` |
| `datetime` | Timestamps | `'published_at' => 'datetime'` |
| `decimal:2` | Money, percentages | `'price' => 'decimal:2'` |
| `encrypted` | Sensitive data | `'ssn' => 'encrypted'` |
| Custom class | Complex types | `'status' => OrderStatus::class` |

## TL;DR - Just Use Casts! ✅

Model casts are like having a personal assistant that translates data for you:

1. **Stop manual conversion** - No more `json_decode()` everywhere
2. **Type safety** - Get actual booleans, not strings
3. **Carbon magic** - Automatic date handling
4. **Encryption** - Secure sensitive data automatically
5. **Custom types** - Build your own transformations
6. **Cleaner code** - Less repetition, more clarity

In production systems I've built, casts have eliminated hundreds of lines of repetitive transformation code. They're not optional - they're essential!

**Real Talk:** If you're still doing `json_decode($model->field, true)` in your code, you're working too hard. Let Laravel do the boring stuff! 🎯

---

**Questions about model casts?** Let's chat on [LinkedIn](https://www.linkedin.com/in/anuraghkp)!

**Want more Laravel tips?** Star this blog on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and watch for updates!

*Now go refactor those models!* ✨
