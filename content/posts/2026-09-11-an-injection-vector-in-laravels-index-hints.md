---
title: "An injection vector in Laravel's index hints"
date: "2026-09-11"
excerpt: "forceIndex() and inRandomOrder() passed their arguments straight into compiled SQL. The patch shipped in v12.48.0 — but Laravel didn't issue a CVE, and they had a reasonable argument for that."
tags: ["security", "laravel", "sql-injection"]
---

I spent part of last month going through Laravel's query builder looking for places where a string ends up inside compiled SQL without being checked first. I found one: `forceIndex()` and `inRandomOrder()` took their argument and wrote it into the query, unvalidated, in the MySQL, SQLite, and SQL Server grammars. I reported it through Laravel's security process, wrote the patch, and it shipped in **v12.48.0**, commit [`1dcf0b38`](https://github.com/laravel/framework/commit/1dcf0b38).

Laravel did not issue a CVE for this. I think that was the right call, and I want to explain why, because the interesting part of this story isn't the bug — it's the disagreement about whose problem it was.

## What the methods did

`forceIndex($index)` exists so you can tell MySQL which index to use for a query, instead of letting the optimizer guess:

```php
User::query()->forceIndex('users_email_index')->where('active', true)->get();
```

Under the hood, the grammar classes took that string and dropped it straight into the compiled SQL as `use index (users_email_index)`. There was no escaping, no quoting, no check that it looked like an identifier. Whatever you passed became part of the query, verbatim.

`inRandomOrder($seed)` had the same shape. It's meant for things like `ORDER BY RAND(seed)` in MySQL, and the seed value went into the compiled `ORDER BY` clause the same way — pasted in, not bound as a parameter.

This touched three grammar classes: `MySqlGrammar.php`, `SQLiteGrammar.php`, and `SqlServerGrammar.php`. Each one builds its dialect's SQL syntax for these clauses, and each one had the same gap.

## Why that's reachable

Index hints and sort parameters are things people take from user input. A common pattern:

```php
$index = $request->query('index');
Product::query()->forceIndex($index)->get();
```

Or a "randomize results" toggle that passes a seed from the request into `inRandomOrder()`. Neither of these looks unusual. Query builders exist so you don't have to write raw SQL by hand, and `forceIndex()` reads like any other builder method — you'd reasonably assume it's as safe as `where()`.

It isn't, because unlike `where()`, this value can't be bound as a parameter. `use index (?)` isn't valid SQL — the index name has to be inlined into the query text. That's exactly the situation where you need to validate the input yourself, and the framework wasn't doing it for you.

## The patch

The fix is a single allow-list check, added to each grammar before the value is interpolated:

```php
if (! preg_match('/^[a-zA-Z0-9_$]+$/', $index)) {
    throw new InvalidArgumentException("Invalid index name.");
}
```

I picked an allow-list over escaping on purpose. Escaping makes sense when the value is data — a string that needs to survive being embedded in SQL syntax while still meaning what it meant. An index identifier isn't data in that sense. It's a name, and MySQL, SQLite, and SQL Server all agree on what a valid identifier of this kind can contain: letters, digits, underscores, and `$`. There's no legitimate index name that this regex rejects. So instead of trying to neutralize dangerous characters, the guard just refuses to compile anything that couldn't be a real index name in the first place. Nothing gets escaped because nothing dangerous should ever reach that line.

## The disagreement

Here's the part that matters more than the bug itself: Laravel's position was that this is the developer's responsibility, not the framework's, and the docs never said otherwise. `forceIndex()` and `inRandomOrder()` were never documented as sanitizing their arguments. That's the same contract `DB::raw()` has always had — you're writing something closer to raw SQL, and the framework trusts you to know that.

I think that's a fair reading of how these methods were documented. It's easy to expect a query builder method to behave like a query builder method, but Laravel never promised that these two would. If you hand `$request->query('index')` straight to `forceIndex()`, that's the same category of mistake as interpolating request data into `DB::raw()` — a documented footgun, not a broken promise.

So no CVE. The advisory stayed a draft. I don't think that's Laravel dodging responsibility — I think it's an accurate description of what the contract for these methods actually was.

## Why it still shipped

Given all that, why fix it at all?

Because a documented contract and a cheap guard aren't in tension. Laravel can maintain that validating this input is the caller's job, and still decide that a query builder should refuse to compile a string that can never be a valid index name. That's defence in depth: the framework isn't taking on a new promise about sanitizing arbitrary SQL, it's just refusing to hand a clearly-invalid identifier through to the database driver. The cost is one `preg_match` per call. There's no meaningful downside to rejecting `"1; DROP TABLE users"` as an index name, whether or not the caller was "supposed to" validate it first.

That's the shape of the fix that landed: not a reversal of the framework's position, just one more layer that happens to close off this specific mistake for free.

## What to check in your own code

If you use Laravel, it's worth a quick grep regardless of what version you're on, since the pattern that caused this — request data reaching a place where it gets inlined into SQL — shows up in more than just these two methods:

```bash
grep -rn "forceIndex(" app/
grep -rn "->from(" app/          # dynamic table names
grep -rn "orderByRaw(" app/       # raw fragments built from input
```

For each hit, trace the argument back. If it can originate from `$request`, a route parameter, or anything else outside your own code, either validate it against an allow-list before it's used, or make sure it's a fixed value chosen by your code and not by the caller. Update to v12.48.0 or later either way — the guard doesn't cost you anything, and there's no reason to rely on discipline alone when the framework will now do the check for you.
