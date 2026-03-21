---
title: "Rust Serde: JSON Serialization So Fast Your PHP Will File a Complaint 🦀📦"
date: "2026-03-21"
excerpt: "Coming from 7 years of Laravel APIs, I assumed JSON serialization was a solved, boring problem. Then I found Serde — Rust's serialization framework that validates your JSON structure at compile time, runs at zero runtime overhead, and makes json_encode() look like a horse and buggy."
tags: ["rust", "systems-programming", "performance", "json", "web-development"]
featured: true
---

# Rust Serde: JSON Serialization So Fast Your PHP Will File a Complaint 🦀📦

I've been building JSON APIs for 7 years.

`json_encode($data)`. Done. Ship it. Works. Never thought twice.

Then I started learning Rust and discovered **Serde** — Rust's serialization framework. And I sat there for a full minute just reading the docs, feeling that specific kind of awe usually reserved for seeing a magic trick explained.

It validates your JSON structure. At compile time. Before your code runs. Before it ever touches a request.

Let me explain why that broke my brain.

## What json_encode() Is Actually Doing 😬

In PHP (and I say this with love, I still write Laravel daily):

```php
$user = [
    'id' => $user->id,
    'name' => $user->name,
    'email' => $user->email,
];
return response()->json($user);
```

This works great until:
- You typo a field name and return `"nmae"` to production for three weeks
- `$user->created_at` is a Carbon object and suddenly you have a mysterious serialization error at 2am
- You add a field to your model and forget to update 6 response transformers

PHP can't catch any of this until **runtime** — meaning until a real user hits a real endpoint and your logs start filling up.

Coming from 7 years of this, I had accepted it as the cost of doing business.

Serde has different ideas.

## Enter Serde: Your JSON Reviewed Before It Ships 🔍

Serde is a Rust crate (package) for **ser**ializing and **de**serializing data. You annotate your structs with `#[derive(Serialize, Deserialize)]` and Serde generates all the conversion code at compile time.

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct User {
    id: u32,
    name: String,
    email: String,
}
```

That's it. Now `User` can serialize to JSON and deserialize from JSON. And if you try to deserialize JSON that's missing `email`? Compile error. Or more accurately: a **runtime error with a clear message** — but more importantly, if you typo the field name in your struct, that's a compile error. The *shape* of your data is locked in.

Compare that to PHP where your JSON structure is an array you build by hand, checked by no one.

## What Excited Me: Zero-Cost Serialization ⚡

Here's the part that genuinely delighted me. Serde's code generation happens at **compile time** via Rust's macro system. The `#[derive(Serialize)]` macro doesn't add a runtime reflection layer — it generates the exact, optimized serialization code for your specific struct.

What this means: Serde JSON serialization is roughly **2–3x faster than Python's json module** and significantly faster than Node.js `JSON.stringify()` for equivalent payloads. PHP's `json_encode()` doesn't even want to be in this race.

For my RF/SDR hobby projects, I needed to serialize thousands of decoded radio packets per second to JSON for logging. In Python, that was a bottleneck. In Rust with Serde, it just... doesn't register as a cost. The benchmark noise is louder than the serialization time.

## The Features That Make API Devs Weep With Joy 😭

**Rename fields:**
```rust
#[derive(Serialize)]
struct User {
    #[serde(rename = "userId")]
    id: u32,      // serializes as "userId" in JSON
    full_name: String,  // serializes as "full_name"
}
```

In Laravel you'd override `toArray()` or use API Resources. Here it's one annotation.

**Skip null fields:**
```rust
#[derive(Serialize)]
struct Response {
    id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,  // omitted from JSON when None
}
```

No more `array_filter()` to strip nulls before `json_encode()`.

**Default values on deserialization:**
```rust
#[derive(Deserialize)]
struct Config {
    host: String,
    #[serde(default = "default_port")]
    port: u16,
}

fn default_port() -> u16 { 8080 }
```

Missing `port` in the incoming JSON? Serde fills it in with `8080` automatically. Try doing that cleanly in PHP without a dedicated DTO library.

## Deserializing Untrusted Input: The Security Angle 🔒

What excited me as a security enthusiast: Serde forces you to be explicit about what fields you accept.

In PHP, if you do `$data = json_decode($request->getBody(), true)` — you get whatever the user sent. All of it. Fields you didn't expect, fields you don't want. You have to manually whitelist or you've essentially done the work for a mass assignment attack.

With Serde, your struct IS your whitelist:

```rust
#[derive(Deserialize)]
struct CreateUserRequest {
    name: String,
    email: String,
    // That's it. "is_admin: true" in the payload? Silently ignored.
}
```

Unknown fields are ignored by default. You can even set `#[serde(deny_unknown_fields)]` to explicitly reject payloads with unexpected keys. The type system is doing your input validation for you.

Coming from years of writing `$request->only(['name', 'email'])` as a defensive habit in Laravel, having the language enforce this by default felt like getting a security feature for free.

## The Web Framework Integration 🌐

If you're building a Rust web API (with Axum or Actix-web), Serde is the backbone:

```rust
// Axum handler — JSON body automatically deserialized by Serde
async fn create_user(
    Json(payload): Json<CreateUserRequest>,
) -> Json<User> {
    let user = User { id: 1, name: payload.name, email: payload.email };
    Json(user) // automatically serialized by Serde
}
```

If the incoming JSON doesn't match `CreateUserRequest`? Axum returns a 422 before your handler even runs. No validation boilerplate. The struct definition IS the validation.

This is the moment when 7 years of writing Laravel Form Requests flashed before my eyes.

## The Learning Curve (Honest Take) 📚

Serde isn't hard, but it has some gotchas:

**Enums need attention.** Serializing Rust enums to JSON has multiple representation options (`internally tagged`, `externally tagged`, `untagged`). You'll need to pick one and understand it. Laravel devs: think of it like choosing between different `$casts` behaviors.

**Nested types need all layers derived.** If `User` contains an `Address` struct, `Address` also needs `#[derive(Serialize)]`. The compiler will tell you exactly which one is missing, at least.

**serde_json for dynamic JSON.** Sometimes you genuinely don't know the structure upfront (webhooks, external APIs). Serde has `serde_json::Value` for dynamic JSON — it's like PHP's `json_decode($x, true)`. Useful escape hatch.

## TL;DR: Why Serde Changes How You Think About JSON 🏁

After 7 years of building JSON APIs in PHP and Node.js, Serde was the first time I thought: *what if the JSON structure was verified before runtime?*

The key wins:
1. **Compile-time structure validation** — typos and missing fields caught before deployment
2. **Zero runtime overhead** — all serialization code generated at compile time
3. **Security by default** — unknown fields ignored, strict deserialization
4. **Expressive annotations** — rename, skip, default values without custom transformers
5. **Framework integration** — Axum/Actix use Serde so your struct IS your API contract

Is it more work upfront than `json_encode()`? Yes. Rust always asks you to be more explicit.

Is it worth it? Every time I get a compile error instead of a 3am production incident, yes. Absolutely yes.

`json_encode()` is still my friend in Laravel. But I'll never unsee what Serde showed me about what JSON handling could look like. 🦀

---

**Exploring Rust from a web dev background?** Let's compare notes on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — there are more of us making this journey than you'd think.

**See Serde in action in my SDR projects:** [GitHub](https://github.com/kpanuragh) — radio packet structs deriving `Serialize` for structured logging.

*Type your JSON. Let the compiler review it. Ship with confidence.* 🦀📦✨
