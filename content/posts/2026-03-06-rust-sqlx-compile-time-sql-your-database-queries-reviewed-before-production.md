---
title: "Rust SQLx: Your Database Queries Get a Code Review From the Compiler 🦀🗄️"
date: "2026-03-06"
excerpt: "Coming from Laravel's Eloquent where your SQL errors hide until a user hits that route at 3am, discovering that Rust's SQLx can verify your SQL queries at compile time felt like being handed a superpower I didn't know I needed."
tags: ["\\\"rust\\\"", "\\\"systems-programming\\\"", "\\\"sqlx\\\"", "\\\"databases\\\"", "\\\"performance\\\""]
featured: "true"
---

# Rust SQLx: Your Database Queries Get a Code Review From the Compiler 🦀🗄️

**Honest confession:** I have shipped at least three typos in raw SQL queries to production in my career. One was `SELCET`. Yes, really.

Coming from 7 years of Laravel and Node.js, my relationship with databases was always "write the query, push it, find out if it works when someone clicks a button." Eloquent's ORM protects you from a lot of this, but the moment you reach for a raw query or a complex join, you're flying blind until runtime.

Then I found SQLx in the Rust ecosystem. And I nearly dropped my coffee.

## The Laravel/Node.js Reality: Trust Your Own Typing 😅

Here's the loop every web developer knows:

```php
// Laravel raw query - looks fine, right?
$results = DB::select('SELECT user_id, emial, created_at FROM users WHERE active = ?', [1]);
//                              ^^^^^ you won't see this until production
```

Or in Node.js:

```javascript
const rows = await db.query(
  'SELECT id, usernme, role FROM users WHERE tenant_id = $1',
  [tenantId]
  //       ^^^^^^ typo discovered at 2am on a Saturday
);
```

The ORM abstracts the SQL away, which is mostly great — until you need to write something the ORM can't express. At that point you're hand-crafting strings, and the compiler has absolutely nothing useful to say about them. It's just a string. It could say `"banana"` and the compiler would shrug.

Your test suite *might* catch it. Your QA *might* catch it. Production definitely catches it, usually during a demo.

## What Excited Me About SQLx 🦀

SQLx is a Rust database crate with an absolutely wild feature: **it can verify your SQL queries against your actual database schema at compile time.**

Not through an ORM. Not through a query builder. Through your actual SQL strings.

```rust
// This won't compile if 'emial' isn't a real column in 'users'
let users = sqlx::query!(
    "SELECT id, email, created_at FROM users WHERE active = $1",
    true
)
.fetch_all(&pool)
.await?;
```

If you typo `email` as `emial`, `cargo build` fails. Not at runtime. Not in production. At **build time**, before a single byte hits the network.

The first time this caught a column name I'd misremembered, I sat back from my keyboard and stared at the ceiling for about thirty seconds.

## How It Actually Works (The Clever Bit) 🔥

SQLx uses Rust's procedural macro system to do something genuinely impressive. When you call `sqlx::query!()`, it:

1. Connects to your database during compilation (via a `DATABASE_URL` env var)
2. Sends your query to the database as a `PREPARE` statement
3. Gets back the column types and parameter types
4. Generates Rust types that match exactly

```rust
let row = sqlx::query!(
    "SELECT id, username, role FROM users WHERE id = $1",
    user_id
)
.fetch_one(&pool)
.await?;

// row.id is already typed as i32 (or whatever your schema says)
// row.username is String
// row.role is whatever type you mapped
// All verified against your ACTUAL database. At compile time.
println!("Got user: {}", row.username);
```

No guessing what columns come back. No `row["column_name"]` that might panic at runtime. The compiler knows the shape of your result because it asked your database.

This is not magic. This is Rust macros being genuinely powerful.

## For My SDR Projects: Logging Signal Data to SQLite 📡

For my RF/SDR hobby projects, I log interesting signal detections to a local SQLite database — timestamps, frequencies, signal strength, modulation type. I started with Python and a raw `sqlite3` module, which meant a runtime crash every time I got a column name wrong in my logging code.

Switching to Rust with SQLx meant my signal logger won't even compile if my SQL doesn't match my schema:

```rust
sqlx::query!(
    "INSERT INTO detections (frequency_hz, signal_strength_db, modulation, captured_at)
     VALUES ($1, $2, $3, $4)",
    detection.frequency,
    detection.strength,
    detection.modulation,
    detection.timestamp
)
.execute(&pool)
.await?;
```

If I rename a column in my schema and forget to update this query, the build fails immediately. The compiler is running a diff between my code and my database on every `cargo build`.

Coming from Python where I'd discover this bug after missing a meteor scatter event I was trying to log, this felt like having a spell-checker for my database interactions.

## The Query Macro vs. The query_as Macro 🧠

There are two main flavours you'll use:

**`query!()`** — returns anonymous structs with your column names as fields. Great for quick queries.

**`query_as!()`** — maps results directly into your own structs. This is the one you'll use most in real code:

```rust
#[derive(sqlx::FromRow)]
struct User {
    id: i32,
    email: String,
    is_active: bool,
}

let users: Vec<User> = sqlx::query_as!(
    User,
    "SELECT id, email, is_active FROM users WHERE role = $1",
    "admin"
)
.fetch_all(&pool)
.await?;
```

If `User` has a field that doesn't match a column in your query, or your query returns a column your struct doesn't have — compile error. Your struct and your SQL have to agree, and the compiler enforces this every time you build.

This is the Eloquent model concept, except Eloquent checks at runtime and SQLx checks when you `cargo build`.

## The Offline Mode (For When You Don't Have a Database Handy) 🛠️

"But wait," I hear you saying. "My build server doesn't have a database connection."

Fair. SQLx has you covered with `cargo sqlx prepare`. You run this locally while you do have a database, and it generates a `.sqlx/` directory of cached query metadata. Commit that to your repo. Your CI pipeline uses the cached metadata to verify queries without needing a live database.

```bash
cargo sqlx prepare  # Run locally, commits to git
# CI uses the cached metadata — no database required
```

Your CI still gets the type-checking benefits without needing a live Postgres instance. Coming from PHP where CI just runs `phpunit` and hopes the database connection is configured right, this felt refreshingly deliberate.

## The Performance Bit (Because This Is Rust) ⚡

SQLx isn't just a safety tool — it's also genuinely fast. It's an async-first library built on top of `tokio` (or `async-std`), with zero runtime query building overhead because the query is just a string. No ORM query builder generating SQL at request time, no reflection magic, no hydration layer.

Your query goes directly to the database driver. The compile-time verification happens at build time. At runtime, SQLx is essentially just sending bytes and receiving bytes with very little in between.

For a Laravel developer used to Eloquent's N+1 query problems showing up in Debugbar, seeing SQLx's performance numbers is one of those "oh, this is what fast actually looks like" moments.

## What I Miss (Let's Be Honest) 😅

SQLx is not Eloquent. There's no `User::with('posts')->where('active', true)->get()`. You write SQL. Actual SQL. If you've been hiding from SQL behind an ORM for years, this is a reckoning.

I've also had to learn what `RETURNING` does in PostgreSQL because SQLx queries don't automatically give you the inserted row — you have to ask for it explicitly. Which is more correct, but requires knowing SQL beyond `SELECT * FROM`.

The learning curve is real. But after 7 years of occasionally being surprised by what Eloquent generates under the hood, writing explicit SQL that I know compiles correctly feels like a fair trade.

## TL;DR 🎯

- **SQLx verifies your SQL queries at compile time** — typos, wrong column names, and type mismatches become build errors, not runtime surprises
- **It uses your actual database schema** — connects during compilation (or uses cached metadata for CI)
- **Results are fully typed** — no more `row["column"]` dictionary lookups that might panic at runtime
- **`query_as!()` maps directly to your structs** — and the compiler ensures they match your query
- **It's async-first and fast** — no ORM overhead, just SQL to database driver with minimal ceremony
- **`cargo sqlx prepare`** for offline builds — commit the metadata, CI gets the benefits without a live DB

After 7 years of shipping SQL typos to production and finding them via runtime exceptions, having the compiler catch them at build time feels almost unfair to my future self who would have spent 20 minutes debugging a `SELCET` at 2am.

The bar was on the floor, and Rust just raised it to the ceiling. 🦀⚡

---

**Building something with SQLx or curious about type-safe database access?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to compare notes on how different the database experience feels coming from the ORM world.

**Hobby and Rust projects:** [GitHub](https://github.com/kpanuragh) — where web dev experience meets increasingly compile-time-paranoid database code.

*Now go run `cargo sqlx prepare` and enjoy the feeling of your SQL being validated before it meets a single real user.* 🗄️🦀✨
