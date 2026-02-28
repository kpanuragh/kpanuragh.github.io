---
title: "Rust Interior Mutability: Sneaking Past the Borrow Checker (Legally) 🦀"
date: "2026-02-28"
excerpt: "Coming from PHP where you can mutate literally anything from anywhere at any time with zero consequences — until production — Rust's ownership rules feel like a padlock. Interior mutability is the key. The *legal* key."
tags: ["rust", "systems-programming", "performance", "interior-mutability", "concurrency"]
featured: true
---

# Rust Interior Mutability: Sneaking Past the Borrow Checker (Legally) 🦀

**Hot take:** In PHP, mutation is a personality trait. You mutate things in functions, in closures, in callbacks, in static methods, in `$GLOBALS`, in session data — everywhere, all the time, with reckless abandon. The program has no idea what's happening. Neither do you. Everything is fine.

Coming from 7 years of Laravel/Node.js, Rust's ownership rules felt like moving from a shared kitchen (PHP) to a clean room where only one person can touch the equipment at a time. Infuriating. Correct. But infuriating.

Then I hit a real wall: what do you do when the borrow checker's rules are technically correct, but you *genuinely need* shared mutation?

Meet interior mutability — the feature Rust gives you when ownership is too strict for the problem at hand.

## The Problem: Ownership Meets Reality 🧱

Here's the situation the borrow checker can't handle on its own:

```rust
struct Config {
    debug: bool,
    request_count: u32,
}

fn log_request(config: &Config) {
    config.request_count += 1; // ERROR: cannot assign to `config.request_count`
                               // because `config` is a `&` reference (immutable)
}
```

You have an immutable reference (because you only need to *read* the config), but you also want to *write* to one field inside it. The borrow checker says no. Shared reference = no mutation. Period.

Coming from PHP where `$config->requestCount++` in a function called with any reference is totally fine... this is jarring.

But Rust has a solution. Several, actually. And they all fall under the umbrella of **interior mutability**.

## What Interior Mutability Actually Is 🔑

Interior mutability is a design pattern (and a set of standard library types) that lets you mutate data through an *immutable reference* — safely, with the rules enforced at a different point.

Instead of the compiler enforcing borrow rules at compile time, these types move the checking to **runtime**, or use clever type tricks to guarantee safety **without any checking overhead**.

There are three main players:

1. **`Cell<T>`** — for `Copy` types. Zero overhead. No runtime checks. Single-threaded.
2. **`RefCell<T>`** — for any type. Runtime borrow checking. Single-threaded.
3. **`Mutex<T>` / `RwLock<T>`** — for multi-threaded mutation. The heavy-duty tools.

Let's meet them one by one.

## `Cell<T>`: The Zero-Cost Option ⚡

`Cell<T>` works with types that implement `Copy` (integers, booleans, floats — simple values). It lets you get and set the value through an immutable reference, with zero runtime overhead.

```rust
use std::cell::Cell;

struct Config {
    debug: bool,
    request_count: Cell<u32>, // wrapped in Cell!
}

fn log_request(config: &Config) {
    let count = config.request_count.get();
    config.request_count.set(count + 1); // mutation through & reference!
}
```

That `Cell<u32>` wrapper is the magic. `get()` copies the value out. `set()` replaces it. No mutable reference required. No runtime checks. No overhead.

The trade-off: you can't get a direct reference *inside* a `Cell` — you can only copy values in and out. For simple counters, flags, or small `Copy` values, it's perfect.

For my RF/SDR projects, I use this for sample counters and diagnostic flags — things I want to update inside a processing callback without needing a `&mut` reference to the whole pipeline state.

## `RefCell<T>`: The Flexible Option 🔄

`RefCell<T>` is for when you need mutation of types that *don't* implement `Copy` — Strings, Vecs, custom structs. It enforces Rust's borrow rules at **runtime** instead of compile time.

```rust
use std::cell::RefCell;

struct RequestLog {
    entries: RefCell<Vec<String>>,
}

impl RequestLog {
    fn add(&self, entry: String) {
        self.entries.borrow_mut().push(entry); // runtime borrow check
    }

    fn count(&self) -> usize {
        self.entries.borrow().len()            // runtime borrow check
    }
}
```

`borrow()` gives you an immutable reference to the inner `Vec`. `borrow_mut()` gives a mutable one. At runtime, `RefCell` tracks how many borrows are active. If you try to call `borrow_mut()` while a `borrow()` is still alive — **panic**. The same rules as the borrow checker, just checked when the code actually runs.

Coming from PHP: this is basically how PHP works except PHP doesn't panic — it just lets you have 47 things mutating the same array at once and then produces incorrect results quietly at 3am.

The trade-off: if you violate the rules, you get a runtime panic instead of a compile error. So `RefCell` moves the safety guarantee from "the compiler says so" to "you need to test this path." It's still safe (no undefined behavior), but the failure mode is different.

## When to Use Each One 🗺️

Here's the mental model I use, coming from a web background:

**`Cell<T>`** → Like a PHP property that's a simple int or bool. Just get and set it. Super fast.

**`RefCell<T>`** → Like a PHP property holding an array or object. You can read or write it, but not both at the same time. The runtime enforces this.

**`Mutex<T>`** → Like a database lock. Multiple threads (workers) can exist, but only one can write at a time, and they wait for each other.

```rust
use std::sync::{Arc, Mutex};

// Shared state across multiple threads
let counter = Arc::new(Mutex::new(0u32));

let counter_clone = Arc::clone(&counter);
std::thread::spawn(move || {
    let mut val = counter_clone.lock().unwrap();
    *val += 1;
});
```

`Arc<Mutex<T>>` is the combo you'll see constantly in multi-threaded Rust. `Arc` handles shared ownership across threads. `Mutex` handles safe mutation. Together, they're the Rust equivalent of a database transaction — only one writer at a time, everyone waits in line.

## The SDR Project Moment That Made This Click 📡

For my RF/SDR hobby project, I decode I/Q samples from an RTL-SDR dongle in real time. I have a processing pipeline with multiple stages — each stage reads from the previous one.

I needed a stats tracker that every stage could update without requiring `&mut` access to the whole pipeline:

```rust
use std::cell::Cell;

struct PipelineStats {
    samples_processed: Cell<u64>,
    drops: Cell<u32>,
    peak_amplitude: Cell<f32>,
}

impl PipelineStats {
    fn record_samples(&self, n: u64) {
        self.samples_processed.set(self.samples_processed.get() + n);
    }

    fn record_drop(&self) {
        self.drops.set(self.drops.get() + 1);
    }
}
```

Each stage holds a `&PipelineStats` reference (immutable). But they can all update counters through `Cell`. No locking (single-threaded pipeline), no `&mut`, no reshuffling of the whole ownership graph.

This is the kind of thing that in PHP you'd solve with a static property on a class. In Rust, `Cell` is the *correct*, zero-cost equivalent — with the bonus that the compiler still catches anything you try to do that's genuinely unsafe.

## The "Why Doesn't Rust Just Allow This Always?" Question 🤔

Great question. The answer is: thread safety.

If Rust allowed mutation through `&` references without any machinery, you could take one of those references, send it to another thread, and have two threads mutating the same data at once — a data race, and a security/correctness bug.

`Cell<T>` and `RefCell<T>` are both **not `Sync`** — the Rust type system literally won't let you send them to another thread. Problem solved at compile time, not at "I hope my tests covered this" time.

When you actually need shared mutation across threads, you graduate to `Mutex<T>` (or `RwLock<T>` if reads vastly outnumber writes), wrapped in `Arc` for shared ownership. The Rust type system enforces the upgrade — you can't use a `RefCell` across threads even if you wanted to. The compiler just says no.

## The PHP Brain Rewire 🧠

Coming from PHP, my instinct was: "why is mutation such a big deal? I just want to change a variable."

After 7 years of Laravel, I've seen enough concurrency bugs, race conditions, and "this object was modified by something I didn't expect" bugs to appreciate what Rust is doing here.

PHP's approach: mutation is free. Race conditions and shared-state bugs are your problem.

Rust's approach: mutation is a contract. Every mutation is visible, controlled, and type-checked. Interior mutability types are how Rust says "I understand you need to mutate this — here's the safe way to do it."

The irony? Rust's "safe" interior mutation is still safer than PHP's completely unrestricted mutation. There's no undefined behavior. There's no silent corruption. At worst, you get a clear panic with a useful message.

## TL;DR: The Honest Summary 📋

1. **Interior mutability = mutation through `&` references**, enforced safely by the type system
2. **`Cell<T>`** — zero cost, `Copy` types only, single-threaded. Perfect for counters and flags
3. **`RefCell<T>`** — any type, runtime borrow checking, single-threaded. Use when you need Vec/String mutation through shared references
4. **`Mutex<T>` / `Arc<Mutex<T>>`** — multi-threaded safe mutation. The locks you actually need
5. **`Cell`/`RefCell` are not `Sync`** — the compiler prevents you from sending them to other threads. Safety enforced at compile time
6. **The PHP comparison**: PHP mutation is free-for-all with invisible consequences. Rust mutation is explicit, controlled, and auditable
7. **Use interior mutability sparingly** — it's a tool for specific patterns, not a way to "defeat" the borrow checker

Coming from 7 years of PHP where every variable is a potential time bomb waiting to be mutated by something three layers up the call stack — having a type system that makes mutation *visible and controlled* is genuinely refreshing.

The borrow checker isn't your enemy. Interior mutability is the proof: Rust doesn't want to prevent you from mutating things. It just wants you to do it *honestly*. 🦀

---

**Fighting the borrow checker on a Rust side project?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've spent enough time arguing with the compiler to have opinions.

**Curious how `Cell` works in a real SDR pipeline?** My [GitHub](https://github.com/kpanuragh) has the project — search for `Cell<` and see interior mutability in the wild.

*Mutation: just be honest about it.* 🦀
