---
title: "Rust Closures: When JavaScript's `() => {}` Grew Up and Got a PhD 🦀🔒"
date: "2026-02-18"
excerpt: "Coming from 7 years of JavaScript callbacks and PHP anonymous functions, I thought I knew closures. Then Rust handed me Fn, FnMut, and FnOnce and my brain quietly rebooted. Here's the closure guide I wish I had."
tags: ["rust", "systems-programming", "performance", "closures", "functional-programming"]
featured: true
---

# Rust Closures: When JavaScript's `() => {}` Grew Up and Got a PhD 🦀🔒

**Hot take:** JavaScript closures are like a lab puppy. Friendly, forgiving, gets into everything, and occasionally eats something it shouldn't. Rust closures are like a trained K9 unit. Extremely capable, follows rules to the letter, and will absolutely refuse to do something dangerous — even if you really want it to.

Coming from 7 years of Laravel and Node.js, closures were my bread and butter. Arrow functions, anonymous functions, callbacks — I used them everywhere without thinking twice. Then I picked up Rust and discovered that closures have *opinions*. Strong ones. About memory. About ownership. About what you're allowed to do with a function you captured a variable in.

And honestly? After the initial frustration wore off, I fell in love. 😍

## The Basics: Syntax That Won't Kill You 🎯

Good news: Rust closure syntax isn't that alien.

```js
// JavaScript
const double = (x) => x * 2;
const add = (a, b) => a + b;
```

```rust
// Rust — spot the difference
let double = |x| x * 2;
let add = |a, b| a + b;
```

Pipes instead of parentheses. That's... basically it for simple cases. The Rust compiler infers types so you don't even need annotations most of the time.

```rust
// With explicit types (when the compiler needs help)
let double = |x: i32| -> i32 { x * 2 };
```

**Coming from PHP:** It's like PHP's `fn($x) => $x * 2` — same idea, cleaner syntax.

So far so good. Now here's where Rust diverges from everything you know. 🧠

## The Plot Twist: There Are THREE Kinds of Closures 😱

In JavaScript, a closure is just... a closure. It captures whatever it wants, whenever it wants. In Rust, *how* a closure captures its environment determines what you can do with it.

Meet the trio:

```
Fn      — reads captured variables (borrowing)
FnMut   — modifies captured variables (mutable borrowing)
FnOnce  — consumes captured variables (takes ownership)
```

This is where PHP/JS developers have a mini existential crisis. Including me. Let me show you why this matters.

## `Fn`: The Read-Only Closure 📖

```rust
let greeting = String::from("Hello");

// This closure only READS greeting — it's Fn
let say_hi = |name: &str| println!("{}, {}!", greeting, name);

say_hi("Alice");  // Works!
say_hi("Bob");    // Works! Can call it multiple times
say_hi("Carol");  // Still works!

println!("{}", greeting);  // greeting is STILL VALID!
```

`Fn` closures borrow immutably. They can be called as many times as you want. The captured variable stays alive and accessible outside the closure too.

**Laravel equivalent:** A closure passed to `array_map` that just reads data — no state changes.

## `FnMut`: The Closure That Counts 📊

```rust
let mut count = 0;

let mut increment = || {
    count += 1;  // MODIFIES count — this is FnMut
    count
};

println!("{}", increment());  // 1
println!("{}", increment());  // 2
println!("{}", increment());  // 3
```

`FnMut` mutably borrows captured variables. You CAN call it multiple times, but you can't have the variable AND call the closure simultaneously.

**For my RF/SDR projects:** I use `FnMut` closures to accumulate signal samples as they stream in. The closure maintains state (a running buffer) between calls. Perfect.

```rust
// Real-world-ish: accumulating signal readings
let mut buffer: Vec<f32> = Vec::new();
let threshold = 0.5;

let mut process_sample = |sample: f32| {
    buffer.push(sample);  // mutates buffer — FnMut!
    buffer.len() > 100    // return true when buffer is full
};

// Call it as samples arrive
while let Some(sample) = radio_source.next_sample() {
    if process_sample(sample) {
        flush_buffer(&mut buffer);
    }
}
```

## `FnOnce`: The Closure That Dies for Its Values ☠️

This is the one that broke my brain for a week.

```rust
let name = String::from("Alice");

// This closure MOVES name into itself — it's FnOnce
let greet_once = move || {
    println!("Hello, {}!", name);
    drop(name);  // name is consumed inside the closure
};

greet_once();  // Works!
// greet_once();  // ERROR! Can't call it again — name is gone!
```

`FnOnce` means the closure can only be called **once** because it *consumes* something it captured. After the call, the closure is done. Dead. Finished.

**The `move` keyword:** This forces the closure to take *ownership* of captured variables, rather than borrowing them. Why would you want that?

```rust
// Without move — this breaks!
fn make_greeter() -> impl Fn() {
    let message = String::from("Hello from Rust!");
    // ERROR: `message` doesn't live long enough!
    || println!("{}", message)
}

// With move — this works!
fn make_greeter() -> impl Fn() {
    let message = String::from("Hello from Rust!");
    // message is MOVED into the closure — lives as long as the closure
    move || println!("{}", message)
}
```

**Coming from JavaScript:** This is like explicitly binding variables to a closure scope. In JS, closures implicitly capture references and the GC keeps everything alive. In Rust, with no GC, you have to say *exactly* who owns what.

This is annoying at first. Then it's enlightening. Then it's one of your favorite Rust features. 🙃

## The Hierarchy (Yes, There's a Hierarchy) 🏛️

Here's the bit that ties it together:

```
FnOnce ← FnMut ← Fn
```

Every `Fn` is also `FnMut` (reading is a subset of mutating, in terms of what you're allowed to do). Every `FnMut` is also `FnOnce` (you can always call something once if you can call it many times).

So if a function asks for a `FnOnce`, you can pass it a regular `Fn`. But not vice versa.

```rust
// This function accepts ANY callable that takes no args
fn run_twice<F: Fn()>(f: F) {
    f();
    f();
}

// This accepts any callable, but can only call it ONCE
fn run_once<F: FnOnce()>(f: F) {
    f();
    // f();  // Compile error — might not be callable again!
}
```

**Why does this matter for you?** When you're writing higher-order functions or passing closures to async tasks (hello, Tokio!), knowing which trait to use saves you from compiler screaming matches.

## Closures in Iterators: Where It All Clicks 🔗

Remember Rust iterators from last week? Closures are what make them actually usable:

```rust
let signal_data: Vec<f32> = get_samples();

// All of these take closures!
let strong: Vec<f32> = signal_data.iter()
    .copied()
    .filter(|&s| s.abs() > 0.5)     // Fn closure (reads s)
    .map(|s| s * gain_factor)        // Fn closure (reads s and gain_factor)
    .collect();
```

The `filter` and `map` closures here are `Fn` — they just read their inputs and the captured `gain_factor`. The iterator can call them as many times as needed.

```rust
// What about accumulating state in an iterator?
let mut running_total = 0.0f32;

let cumulative: Vec<f32> = signal_data.iter()
    .map(|&s| {
        running_total += s;  // mutates captured variable!
        running_total        // FnMut closure
    })
    .collect();
```

The borrow checker keeps this honest. Try to alias `running_total` outside this `.map()` while it's running? Nope. No data races. No undefined behavior. The compiler just refuses.

**For my SDR hobby:** This pattern — accumulating signal power over time while iterating through samples — used to require careful mutex locking in my Node.js code. In Rust, the closure rules handle it at compile time. Zero runtime cost, zero data races. 📡

## The Move Closure + Threads Pattern 🧵

The moment Rust closures become *obviously necessary* is when you spawn threads:

```rust
use std::thread;

let device_id = String::from("RTL-SDR-001");
let frequency = 98_500_000u32;  // 98.5 MHz

// Closures MUST own their data when sent to threads
let handle = thread::spawn(move || {
    // device_id and frequency are MOVED here
    // No shared memory, no data races
    println!("Tuning {} to {} Hz", device_id, frequency);
    // ... scan for signals ...
});

handle.join().unwrap();

// device_id and frequency are GONE from this scope
// That's the whole point! The thread owns them now.
```

**Coming from Node.js:** Worker threads in JS share memory through `SharedArrayBuffer`, which is powerful but terrifying. Rust's approach is different: the thread OWNS its data. No sharing by default. If you want to share, you use explicit synchronization primitives — and the borrow checker enforces it.

What excited me about this: for my RF projects that spawn threads to scan multiple frequencies simultaneously, Rust's ownership model *prevents* the race conditions that bit me in my Python/Node.js implementations. The compiler is my thread-safety auditor. 🔍

## The Comparison That Made Me Laugh 😂

```php
// PHP: Closures implicitly inherit nothing
$multiplier = 3;
$triple = fn($x) => $x * $multiplier;  // Works! PHP captures by value

// PHP: use keyword for explicit capture
$triple = function($x) use ($multiplier) { return $x * $multiplier; };
```

```rust
// Rust: Captures are automatic, but the compiler tracks ownership
let multiplier = 3;
let triple = |x| x * multiplier;  // Borrows multiplier — fine!
```

Actually, for simple cases, Rust is *cleaner* than PHP's `use ($var)` syntax. PHP made you be explicit about what you capture. Rust figures it out and then tells you if you're doing something dangerous.

The PHP closure just copies the value and calls it a day — no GC, no ownership, just a copy. Simple! Rust has to track whether that copy is safe, whether the original is still valid, whether you're trying to use it from multiple threads...

**PHP wins on simplicity. Rust wins on safety.** For hobby SDR code running on a single machine, PHP's approach is fine. For systems code that might run on embedded hardware with 64KB of RAM? Rust's strictness is a gift. 🎁

## TL;DR: The Three-Line Cheat Sheet 📋

```
Fn      → reads captured vars    → callable ∞ times → safe to share
FnMut   → modifies captured vars → callable ∞ times → one caller at a time
FnOnce  → owns captured vars     → callable ONCE     → transfers ownership
```

When the compiler yells at you:
- "cannot move out of captured variable" → you need `FnOnce` or `move`
- "cannot borrow as mutable" → you need `FnMut`
- "closure may outlive the current function" → you need `move`

Start with `move ||` when in doubt. It's the safest default for someone coming from garbage-collected languages, and you can loosen it once you understand what's happening. 🦀

---

**Wrestling with Rust closures or just escaped from 7 years of PHP callbacks like me?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've made every one of these mistakes so you don't have to!

**Want to see closures doing actual radio signal processing?** Check out my [GitHub](https://github.com/kpanuragh) for SDR projects where `FnMut` closures process real-time signal data.

*Now go close over some variables. Responsibly.* 🦀🔒
