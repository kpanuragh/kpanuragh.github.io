---
title: "Rust Strings: When 'Hello World' Made Me Question My Entire Career 🦀🔤"
date: "2026-03-17"
excerpt: "I've been writing PHP and JavaScript for 7 years. Strings were never a problem. Then I tried to write 'Hello, World!' in Rust and suddenly there were TWO string types, neither of them was what I expected, and the compiler was yelling at me. Welcome to Rust strings."
tags: ["\"rust\"", "\"systems-programming\"", "\"performance\"", "\"beginners\"", "\"memory\""]
featured: "true"
---

# Rust Strings: When "Hello World" Made Me Question My Entire Career 🦀🔤

The year was my first week with Rust.

I thought: "I'll start with something easy. I'll print some text. I've done this a thousand times."

Then I typed `"hello"` and tried to pass it to a function. And the Rust compiler looked me dead in the eyes and said: *"Expected `String`, found `&str`."*

I stared at the screen. It's a string. It's literally a string. What do you mean it's not the right string?

**Turns out, Rust has two string types.** And understanding them is one of the most important things you'll do in Rust — and also one of the funniest explanations you'll hear when it finally clicks.

## PHP and JavaScript Lied to You (Kindly) 😅

Coming from 7 years of Laravel and Node.js, I never thought about strings deeply. In PHP:

```php
$name = "Anuragh";
$greeting = "Hello, " . $name;
```

One string type. Done. PHP figures out memory, copies, references — all behind the scenes. You just concatenate and move on.

JavaScript is the same. Python is the same. They all abstract away the question of **where** the string data lives in memory and **who owns it**.

Rust doesn't abstract that away. Rust makes you decide. And honestly? Once I understood why, I couldn't unsee it.

## The Two String Types, Explained Like I'm Five 🧒

**`String`** — a string you OWN. It lives on the heap. You can modify it, grow it, shrink it, and when it goes out of scope, it gets freed automatically. It's like owning a house: you can renovate it, you pay for it, and when you're done, it gets demolished.

**`&str`** — a string SLICE. It's a reference to string data that already exists somewhere else. You can read it but you don't own it. It's like renting a room: you can look at the walls, but you're not knocking them down.

String literals in your code — like `"hello"` — are `&str`. They're baked directly into your compiled binary and live forever. You can't modify them. You're just borrowing a view into text that's been there since compile time.

```rust
let owned: String = String::from("I own this");
let borrowed: &str = "I'm just visiting";

// Both look like strings. Neither is wrong. Context decides which you need.
```

**What excited me about this:** For my RF/SDR hobby projects, signal labels and protocol names are hardcoded constants. They never change. Using `&str` for those means Rust puts them in the binary itself — zero heap allocation, zero runtime cost. For web dev code processing API strings that DO change, I use `String`. The language makes you be precise, and being precise makes your code faster.

## The Confusion That Got Me (And Gets Everyone) 🤦

Here was my first Rust function attempt:

```rust
fn greet(name: String) {
    println!("Hello, {}!", name);
}

fn main() {
    greet("Anuragh"); // 💥 ERROR: expected String, found &str
}
```

The fix? Either change the function signature to accept `&str`:

```rust
fn greet(name: &str) {
    println!("Hello, {}!", name);
}

fn main() {
    greet("Anuragh"); // ✅ works!
    greet(&my_string);  // ✅ also works! &String coerces to &str
}
```

**The rule of thumb:** If your function only needs to READ a string, take `&str`. It works with both string literals AND owned `String`s (Rust automatically coerces `&String` to `&str`). Only take a `String` if you need to own it or modify it.

This single rule eliminates 80% of string-related compiler errors for beginners.

## Growing Strings: The `format!` Macro is Your Friend 🔨

In PHP: `$result = "Hello, " . $name . "!";`

In Rust, building strings from parts:

```rust
let name = "Anuragh";
let lang = "Rust";

// Option 1: format! (most readable, allocates a new String)
let greeting = format!("Hello, {}! You're writing {}.", name, lang);

// Option 2: push_str on a mutable String
let mut msg = String::from("Hello, ");
msg.push_str(name);
msg.push('!'); // push a single char with push()
```

`format!` is the go-to for anything that isn't performance-critical. It's exactly like PHP's `sprintf` or JavaScript's template literals — just using `{}` as the placeholder.

## For My SDR Projects: Why This Actually Matters ⚡

When I'm processing hundreds of radio packets per second, string allocation matters. Each `String::new()` is a heap allocation. Each `format!` call allocates.

For protocol names that don't change — `"AX.25"`, `"APRS"`, `"POCSAG"` — I use `&str` constants:

```rust
const PROTOCOL: &str = "APRS";
const VERSION: &str = "2.0";
```

These live in the binary. Zero allocations. Zero runtime cost.

For packet payloads that need to be assembled dynamically from decoded bytes? `String`. You're building it from scratch, you need to own it, you pass it around.

The type system forces this distinction, which means the compiler is essentially doing your performance profiling for you before you even run the code.

## The `to_string()` Escape Hatch 🚪

When you need to convert a `&str` into an owned `String` quickly:

```rust
let borrowed: &str = "hello";
let owned: String = borrowed.to_string();
// or equivalently:
let owned: String = String::from(borrowed);
```

This allocates. It's the "I need to own this" operation. Use it when you need to store a string somewhere that outlives its original source, or when a function demands an owned `String`.

Coming from JavaScript, think of it like: `const owned = [...borrowed]` — you're making a copy you control.

## The Mental Model That Made It Click 🧠

Here's the analogy that finally made it stick for me:

- **`String`** = a `Vec<u8>` with a UTF-8 guarantee. It's a growable buffer on the heap.
- **`&str`** = a pointer + length pointing INTO some string data somewhere (binary, another String, whatever). It's a view, not a container.

PHP strings are always `String` under the hood. They copy-on-write and you never think about it. Rust makes you explicit because **allocation is never free** — and in systems programming, you need to know when you're paying that cost.

## TL;DR: The Rules That Will Save You 🏁

1. **String literals** like `"hello"` are `&str` — they live in your binary
2. **`String`** is heap-allocated, owned, growable — use when you need to own or modify it
3. **Function signatures:** default to `&str` for read-only string params; it accepts both
4. **`format!`** builds owned `String`s from parts — your template literal equivalent
5. **`to_string()` / `String::from()`** converts `&str` → `String` (costs a heap allocation)

After 7 years of never thinking about strings, Rust made me think hard about them for about two days. Then it became second nature. Now I look at PHP code and quietly wonder how much invisible string copying is happening.

The answer, by the way, is "a lot." PHP's generous. Rust is honest. 🦀

---

**Hit the same string confusion?** I'd love to commiserate on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — the "expected String, found &str" club has many members.

**More Rust explorations from a web dev perspective:** [GitHub](https://github.com/kpanuragh) — signal processing code full of carefully-chosen `String`s and `&str`s.

*Now go forth and type your strings correctly. The compiler is watching.* 🦀🔤✨
