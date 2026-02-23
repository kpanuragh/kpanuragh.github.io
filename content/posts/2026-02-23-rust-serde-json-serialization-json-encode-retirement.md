---
title: "Rust Serde: I Used json_encode() for 7 Years and Didn't Know What I Was Missing 🦀🔥"
date: "2026-02-23"
excerpt: "Coming from Laravel where json_encode() is a two-second thought, Serde felt like the first time someone actually took serialization seriously. Your data shape is enforced. Typos in field names don't silently corrupt your API. It's almost unfair."
tags: ["rust", "systems-programming", "performance", "serde", "serialization"]
featured: true
---

# Rust Serde: I Used json_encode() for 7 Years and Didn't Know What I Was Missing 🦀🔥

**Confession:** For 7 years, my mental model of JSON serialization was: take object, call `json_encode()`, ship it.

It worked. Mostly. Until it didn't — a `null` sneaking in where an integer should be, a camelCase field turning into snake_case because I forgot to add `->toArray()` in the transformer, an entire nested object vanishing because of a typo in the relationship name.

"PHP problems," I told myself. "Node.js will be better."

It was marginally better. `JSON.stringify()` is slightly more trustworthy than PHP, mostly because JavaScript doesn't have actual types to silently coerce anyway.

Then I found **Serde**. And I understood what I'd been coping with all along.

## What Is Serde? 🤔

Serde is Rust's serialization and deserialization framework. The name is literally **Ser**ialize + **De**serialize smooshed together, because Rust programmers are efficient even with naming.

But here's what makes it special: Serde knows the **exact shape of your data** at compile time. Not at runtime. Not when the request hits your API. At compile time — before your code even runs.

In practice, this means: if your struct has a field `frequency_mhz: f64`, Serde will serialize it as a float and deserialize it as a float. Not sometimes. Not usually. Always. And if the incoming JSON sends a string where you expected a float? **Compile error.** Or at minimum, a clear runtime error instead of a silent `null`.

Coming from Laravel where a missing `->withoutWrapping()` call once took me two hours to debug because the JSON structure changed silently — this felt like justice.

## The PHP/Laravel Way of "Serialization" 😬

Let's be honest about what JSON serialization looks like in Laravel:

```php
// The "it works, don't ask questions" approach
return response()->json($model); // hope your model is right

// The "I know what I'm doing" approach
return new UserResource($user); // explicit, but still no compile-time checks

// The "why is this null" approach — silent data loss
class UserResource extends JsonResource {
    public function toArray($request) {
        return [
            'id' => $this->id,
            'name' => $this->naem, // 🐛 typo. PHP says: null. No error.
            'email' => $this->email,
        ];
    }
}
```

That `naem` typo? PHP will happily return `"name": null` in your JSON response. No warning. No error. Your frontend dev files a bug three days later. You spend an hour in Postman before your eyes catch the typo.

I've done this. Multiple times. Over seven years.

## The Serde Way: Derive and Forget 🦀

Here's the equivalent in Rust:

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct User {
    id: u64,
    name: String,
    email: String,
    frequency_mhz: Option<f64>, // optional field, explicit
}
```

That `#[derive(Serialize, Deserialize)]` annotation — that's it. Serde now knows exactly how to turn your `User` into JSON and back.

```rust
use serde_json;

let user = User {
    id: 1,
    name: "Anuragh".to_string(),
    email: "me@example.com".to_string(),
    frequency_mhz: Some(433.92),
};

let json = serde_json::to_string(&user)?;
// {"id":1,"name":"Anuragh","email":"me@example.com","frequency_mhz":433.92}
```

No `json_encode()`. No `.toArray()`. No resource class to maintain. You define the struct once, add two words, and the serialization logic is automatically generated — **at compile time** — with zero runtime overhead.

And if I typo'd `naem` in the struct definition? The code wouldn't compile. Field `naem` doesn't exist. The compiler told me. Immediately. Before I wrote a single test.

## What Excited Me About This 🎉

What excited me about Serde wasn't just the safety. It was how *clever* the derive macros are.

You can control the output field names without renaming your struct fields:

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RadioSignal {
    signal_strength: f64,  // serializes as "signalStrength"
    center_frequency: f64, // serializes as "centerFrequency"
    sample_rate: u32,      // serializes as "sampleRate"
}
```

One annotation. Every field converts automatically. Coming from Laravel where you'd write a Resource class and manually camelCase every field name (or use a helper that sometimes worked and sometimes didn't) — this was a revelation.

You can skip fields during serialization:

```rust
#[derive(Serialize, Deserialize)]
struct User {
    id: u64,
    name: String,
    #[serde(skip_serializing)]
    password_hash: String, // never appears in JSON output
}
```

You can provide default values for missing fields during deserialization:

```rust
#[derive(Serialize, Deserialize)]
struct Config {
    host: String,
    #[serde(default = "default_port")]
    port: u16,
}

fn default_port() -> u16 { 8080 }
```

All of this happens at compile time, through code generation. No reflection. No runtime overhead. No hidden surprises.

## The RF/SDR Project That Made It Click 📡

For my RTL-SDR signal monitoring project, I'm capturing 433 MHz sensor transmissions — temperature/humidity sensors, door contacts, weather stations. I want to decode them and log to a file and push to a small HTTP API.

In Python (my previous approach), this looked something like:

```python
# Python: works, but every field is a prayer
import json

signal = {
    "timestamp": time.time(),
    "frequency": 433.92,
    "sensor_id": sensor_id,  # might be None if parsing failed
    "temperature": temp,     # might be a string if I forgot to cast
    "humidity": humidity,
}
json.dumps(signal)  # fingers crossed
```

Any field could be any type. `temperature` could be a string from one code path and a float from another. The JSON would be happily malformed and I'd only find out when my dashboard showed "NaN°C."

In Rust with Serde:

```rust
#[derive(Serialize, Deserialize)]
struct SensorReading {
    timestamp: f64,
    frequency_mhz: f64,
    sensor_id: String,
    temperature_c: f64,
    humidity_pct: Option<u8>, // some sensors don't have humidity
}
```

If `temperature_c` gets a string somehow, it doesn't compile. The `Option<u8>` on humidity means the type system documents and enforces that humidity might not be present. The JSON output is always exactly this shape. Always.

My dashboard stopped showing "NaN°C" the day I rewrote this in Rust. Coincidence? No. Compiler.

## Deserializing Untrusted Data 🔐

For my security-focused projects, Serde's strict deserialization is even more valuable.

When you accept JSON from an external API or user input in PHP:

```php
$data = json_decode($request->getContent(), true);
$userId = $data['user_id']; // could be anything: string, array, injected code
```

You'd better sanitize everything manually. The data is a `mixed` type. Anything goes.

In Rust:

```rust
#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

let request: LoginRequest = serde_json::from_str(json_body)?;
// If json_body has "username": 123, this returns an error
// If json_body has extra fields, they're silently ignored by default
// If username is missing, it errors immediately
```

The deserialization *is* the validation. You don't need a separate validation layer for type safety — the type system provides it for free. Extra fields are ignored. Missing required fields error out. Type mismatches error out. All before your business logic runs.

Coming from 7 years of writing Laravel `$request->validate(['user_id' => 'required|integer'])` separately from the deserialization — having these two steps unified in the type definition felt almost too convenient.

## Format Flexibility Without Code Changes 🔄

Here's something that blew my mind: Serde is format-agnostic.

The same `#[derive(Serialize, Deserialize)]` that works with JSON also works with:

- **TOML** (for config files) via `toml` crate
- **MessagePack** (binary, fast) via `rmp-serde`
- **CSV** via `csv` crate
- **YAML** via `serde_yaml`
- **Bincode** (binary, even faster) for internal storage

Your struct definition doesn't change. You just swap the serializer. For my SDR project, I log readings as JSON for debugging and Bincode for the high-frequency storage buffer. Same struct. Different format. Zero code duplication.

In PHP, "support multiple formats" means writing a separate transformer for each one. In Rust, it means swapping one function call.

## The Performance Angle ⚡

Because Serde works at compile time via derive macros, there's no runtime reflection, no type introspection, no inspecting field names as strings. The serialization code is generated once and then it's just... code. Regular, optimized code.

`serde_json` is consistently one of the fastest JSON parsers in any language. Not because of tricks, but because the compiler knows exactly what shape the data is and generates optimal code for exactly that shape.

For my SDR pipeline processing thousands of sensor readings per minute, this matters. JSON serialization is never a bottleneck. It's just free.

## TL;DR: Why You Should Care About Serde 📋

1. **Type-safe serialization** — your JSON shape is enforced by the compiler, not by tests you might forget to write.
2. **Zero boilerplate** — two words (`Serialize, Deserialize`) and you're done.
3. **Zero runtime overhead** — code is generated at compile time, not via reflection.
4. **Format-agnostic** — same struct works with JSON, TOML, binary formats, CSV.
5. **Strict deserialization** — incoming JSON is validated to your type automatically.

Coming from 7 years of `json_encode()`, Laravel API Resources, and JavaScript `JSON.stringify()`, Serde felt like the first time someone designed serialization for developers who wanted to be correct, not just fast.

I'm not writing `UserResource.php` anymore. I'm not manually specifying every field. I'm not hand-writing camelCase conversions. I'm not wondering if that `null` came from a typo or a failed database lookup.

I wrote the struct. I added `#[derive(Serialize, Deserialize)]`. The rest is the compiler's problem.

And the compiler is **very good** at its problem. 🦀🔥

---

**Curious about Serde's internals?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I have strong opinions on derive macros and weak opinions on camelCase vs snake_case (though Serde handles both).

**Want to see Serde in action for RF signal logging?** My [GitHub](https://github.com/kpanuragh) has the SDR project where every sensor reading is a typed struct that serde_json can't get wrong.

*json_encode() never knew what it was competing with.* 🦀
