---
title: "Laravel Scout: Stop Querying Your Database Like It's Google 🔍"
date: "2026-02-28"
excerpt: "Your LIKE '%search%' query is not a search engine. Your users know it. Your database is crying. Let Laravel Scout fix this embarrassment."
tags: ["laravel", "php", "web-dev", "search", "performance"]
---

# Laravel Scout: Stop Querying Your Database Like It's Google 🔍

Picture this: a user types "blue running shoes" into your e-commerce search bar. Your database goes into full panic mode, scanning every row, doing a `WHERE name LIKE '%blue running shoes%'` query, finding exactly zero results because the product is called "Azure Athletic Footwear."

The user thinks your store is broken. They leave. You lose the sale. And somewhere, a MySQL table weeps.

I've been there. We've all been there.

## The `LIKE` Query Hall of Shame 😬

Before I learned better, here's what search looked like in the systems I inherited:

```php
// 😱 The "search engine" that definitely isn't one
$products = Product::where('name', 'LIKE', '%' . $query . '%')
    ->orWhere('description', 'LIKE', '%' . $query . '%')
    ->get();
```

This is bad for so many reasons. No relevance ranking. Full table scan on every search. "Shoe" doesn't match "Shoes." "Nike" doesn't match products where Nike is in the brand field. And performance? Don't even look at your slow query log.

At Cubet, when we were building an e-commerce platform for a client that had 50,000+ SKUs, this approach died a horrible death the first week in staging. The search query was taking 8 seconds. For search. The one thing that needs to be instant.

That's when I fell in love with Laravel Scout. ❤️

## What Is Laravel Scout? 🤔

Scout is Laravel's official package for adding full-text search to your Eloquent models. It syncs your data to a dedicated search engine — Algolia, Meilisearch, Typesense, or even a database driver for small projects.

The magic: your users get typo tolerance, relevance ranking, and instant results. Your MySQL instance stops plotting revenge against you.

## Setup Is Embarrassingly Simple ⚡

```bash
composer require laravel/scout
php artisan vendor:publish --provider="Laravel\Scout\ScoutServiceProvider"
```

Then pick your driver. For self-hosted projects, I love **Meilisearch** — it's open source, blazing fast, and runs great on a cheap VPS or Docker container.

```bash
composer require meilisearch/meilisearch-php http-interop/http-factory-guzzle
```

In your `.env`:

```bash
SCOUT_DRIVER=meilisearch
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_KEY=your-master-key
```

## Making Your Model Searchable 🎯

Add the `Searchable` trait to your model. That's it. No, really.

```php
use Laravel\Scout\Searchable;

class Product extends Model
{
    use Searchable;

    // Customize what gets indexed
    public function toSearchableArray(): array
    {
        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'description' => $this->description,
            'brand'       => $this->brand->name,
            'category'    => $this->category->name,
            'tags'        => $this->tags->pluck('name')->implode(' '),
        ];
    }
}
```

**Pro Tip:** That `toSearchableArray()` method is gold. In production systems I've built, we include the brand name, category, and tags directly in the searchable document. So searching "Nike running" finds products even if "Nike" lives in a separate `brands` table. No joins during search!

Now index your existing data:

```bash
php artisan scout:import "App\Models\Product"
```

## Searching Is Now One Line 🚀

```php
// Before: 8-second table scan
$results = Product::where('name', 'LIKE', '%' . $query . '%')->get();

// After: sub-100ms full-text search with relevance ranking
$results = Product::search($query)->get();
```

User types "bule runnnig shoe" (yes, with typos)? Meilisearch still finds "Blue Running Shoes" because it has typo tolerance built in. Your database-based LIKE query would return nothing and the user would question your entire existence as a developer.

## Filtering + Searching: The Power Combo 💥

Here's where it gets really good. Combine search with filters:

```php
$results = Product::search($query)
    ->where('category_id', $categoryId)
    ->where('in_stock', true)
    ->orderBy('price', 'asc')
    ->paginate(20);
```

**A pattern that saved us in a real project:** We had a marketplace with products from multiple sellers. Users needed to search within a specific seller's catalog. With Scout, filtering by `seller_id` inside the search call was trivial. Try building that efficiently with raw SQL and LIKE queries — I dare you.

## Keeping Your Index in Sync 🔄

Scout automatically syncs your index when you create, update, or delete records (if you're using Eloquent). Zero extra code.

But for bulk operations, be smart about it:

```php
// Temporarily disable syncing during large imports
Product::withoutSyncingToSearch(function () {
    // Import 50,000 products here
    // Index them all at once after
});

// Then import in one shot
Product::makeAllSearchable();
```

In production, I always have queue workers handling index syncing so it never blocks the main request:

```php
// config/scout.php
'queue' => [
    'connection' => 'redis',
    'queue' => 'scout',
],
```

## Real Talk: Choosing Your Search Driver 🧠

| Driver | Best For | Cost |
|--------|----------|------|
| **Meilisearch** | Self-hosted, open source, side projects to medium scale | Free (self-host) |
| **Typesense** | Similar to Meilisearch, also open source | Free (self-host) |
| **Algolia** | Managed, scales to millions of records, enterprise | Paid (generous free tier) |
| **Database** | Tiny apps, prototypes, "I'll fix it later" | Free (your sanity) |

As a Technical Lead, I've learned the hard way: start with Meilisearch in Docker for staging and production if you control the infrastructure. Use Algolia if you want zero ops overhead and have budget. Never use the database driver in production if you care about your users' time.

## Bonus Tips 🎁

**Soft-deleted models?** Scout handles it:

```php
use Laravel\Scout\Searchable;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use Searchable, SoftDeletes;
    // Soft deleted records are automatically excluded from search 🙌
}
```

**Search only specific columns? Use `searchableAs()` to control index name:**

```php
public function searchableAs(): string
{
    return 'products_index';
}
```

**Pause indexing during tests:**

```php
// In your test or TestCase setUp
Scout::fake();
// Now your tests don't hit the real search engine
```

## The Before/After That Converted Me 📊

On the e-commerce project at Cubet:

- **Before Scout:** Search queries averaging 6-8 seconds. Users gave up. Bounce rate on search: 73%.
- **After Scout + Meilisearch:** Search averaging 45ms. Typo tolerance actually working. Bounce rate dropped to 31%.

That's not a refactor. That's a business transformation.

## TL;DR ✅

Stop embarrassing yourself with `LIKE '%search%'` queries. Laravel Scout gives you:

- **Full-text search** with relevance ranking (not just substring matching)
- **Typo tolerance** (because users can't type)
- **Filtering + search** in one clean API
- **Automatic index syncing** when records change
- **One line to search:** `Product::search($query)->get()`

Setup takes 20 minutes. The performance improvement lasts forever.

Your users will think you hired a search team. Your database will finally stop generating passive-aggressive slow query logs.

---

**Building something with Laravel Scout?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'd love to hear what search engine you picked and why.

**Want more Laravel deep-dives?** Star the repo on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) and stay tuned. There's always another performance catastrophe to prevent. 🚀
