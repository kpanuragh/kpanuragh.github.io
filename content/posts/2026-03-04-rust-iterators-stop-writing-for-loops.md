---
title: "Rust Iterators: I Stopped Writing For-Loops and Never Looked Back 🦀🔄"
date: "2026-03-04"
excerpt: "After 7 years of PHP foreach and JavaScript for...of, I discovered Rust's iterator system. Lazy evaluation, zero-cost abstractions, and pipelines that would make Laravel Collections jealous."
tags: ["\\\"rust\\\"", "\\\"systems-programming\\\"", "\\\"performance\\\"", "\\\"iterators\\\"", "\\\"functional-programming\\\""]
featured: "true"
---

# Rust Iterators: I Stopped Writing For-Loops and Never Looked Back 🦀🔄

**Hot take:** Every for-loop you've ever written was a cry for help. Your code was trying to tell you something, and that something was "please, just use an iterator."

I didn't believe this until Rust made it unavoidable.

Coming from 7 years of Laravel and Node.js, I was perfectly happy with foreach loops. They're readable. They're familiar. They're everywhere. And like most developers, I thought functional-style `map/filter/reduce` chains were just "fancy foreach loops that make senior devs feel smart."

Then I learned how Rust's iterators actually work under the hood. And I had a small crisis. A very productive crisis.

## The PHP Way: Doing Work You Didn't Ask For 😅

Let me show you a classic "get the first 3 even-squared numbers from a large list" operation. The Laravel/PHP way:

```php
// PHP: eager to please, even when you didn't ask
$numbers = range(1, 1_000_000); // Creates the entire array. All million of them. In memory. Right now.

$results = array_slice(
    array_filter(
        array_map(fn($n) => $n * $n, $numbers),  // Squares ALL million numbers
        fn($n) => $n % 2 === 0                     // Filters ALL million results
    ),
    0, 3  // Takes 3. You needed 3. You computed a million.
);
```

Your server just squared a million numbers to give you three. That's the computing equivalent of baking a thousand pizzas because someone ordered a slice.

Laravel Collections are nicer to write, but they're still *eager* by default — they process every item before moving to the next step.

Node.js is similarly enthusiastic about doing unnecessary work:

```javascript
// JavaScript: "I'll process all of these, just to be safe"
const results = numbers
  .map(n => n * n)      // All million squared
  .filter(n => n % 2 === 0) // All million filtered
  .slice(0, 3);          // Takes 3. Mission accomplished? No. Mission *over*accomplished.
```

## What Excited Me About Rust Iterators 🦀⚡

Here's the thing that broke my brain: Rust iterators are **lazy**. Nothing happens until you ask for it.

```rust
let results: Vec<i64> = (1..=1_000_000_i64)
    .map(|n| n * n)
    .filter(|n| n % 2 == 0)
    .take(3)
    .collect();
```

This looks almost identical to the JavaScript version. But it behaves completely differently. Rust computes exactly:
- The **first** number that survives `map` + `filter` + `take`
- Then the **second**
- Then the **third**
- Then it **stops**

No million-element array. No unnecessary squaring. The iterator pipeline is like a conveyor belt that only moves when something reaches the end — not a factory that processes everything first and then ships it.

That's what "lazy evaluation" means, and it's not just clever — it's *fast*.

## Zero-Cost: The Compiler's Superpower 🔥

Here's the part where Rust earns its reputation. In most languages, functional pipelines have overhead. There are function calls, closures wrapping closures, intermediate state being tracked.

Rust's compiler collapses the entire iterator chain into a single tight loop — often with zero overhead compared to writing the for-loop yourself. The `map`, `filter`, and `take` calls don't exist at runtime. The compiler inlines everything.

The marketing term for this is "zero-cost abstractions." The practical term is "you get to write clean code that runs like hand-optimized C."

I verified this myself for an RF/SDR project. I needed to process a stream of I/Q samples — raw radio data — and pull out every sample above a power threshold, square it (power calculation), and collect the first 512 for a processing window.

Iterator version vs manual for-loop: identical performance in release mode. The iterator version was about 40% less code and 100% more readable.

## For My RF/SDR Hobby Projects, This Changed Everything 📡

SDR (Software Defined Radio) generates *a lot* of data. A cheap RTL-SDR dongle spits out 2 million complex samples per second. Processing that in real time means you cannot afford to:
- Allocate intermediate buffers you don't need
- Process samples past the point where you have enough data
- Write nested loops that are hard to reason about

Rust's iterator model is perfect for this. A signal processing pipeline becomes a chain of `.map()`, `.filter()`, `.flat_map()`, and `.take()` calls. Each stage is composable, testable, and has no overhead.

```rust
// Real-time I/Q sample processing — no intermediate allocations
let power_readings: Vec<f32> = iq_samples
    .iter()
    .map(|(i, q)| i * i + q * q)   // Power = I² + Q²
    .filter(|&power| power > threshold)
    .take(512)
    .collect();
```

Before Rust, my Python equivalent was allocating NumPy arrays at each step. Not terrible, but you feel the GC pressure at high sample rates. This Rust version processes the samples with one pass through memory, one allocation for the final result.

## The Iterator Adapters Worth Knowing 🧰

Rust's standard library ships with iterator adapters that cover most of what you'd want. Coming from PHP, these felt familiar but more powerful:

- `.map()` — transform each element (like `array_map`, but lazy)
- `.filter()` — keep matching elements (like `array_filter`, but lazy)
- `.flat_map()` — transform-then-flatten (Laravel's `flatMap`, but lazy)
- `.zip()` — combine two iterators element-by-element (no equivalent in PHP without a library)
- `.enumerate()` — adds index to each element (like `array_keys` + value together)
- `.chain()` — concatenate two iterators without allocating a new collection
- `.take_while()` — keep elements until condition fails (extremely useful for streaming data)
- `.fold()` — reduce to a single value (like `array_reduce`, but the naming makes sense)

The `zip` one genuinely shocked me. In PHP, pairing two arrays by position requires some gymnastics. In Rust it's just `.zip()` and done, with no allocations.

## Creating Your Own Iterators 🏗️

Here's where it gets properly nerdy. The `Iterator` trait in Rust only requires you to implement one method: `next()`. Everything else — `map`, `filter`, `take`, all of it — is provided for free through the trait.

```rust
struct Counter {
    count: u32,
    max: u32,
}

impl Iterator for Counter {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        if self.count < self.max {
            self.count += 1;
            Some(self.count)
        } else {
            None
        }
    }
}

// Now this Counter gets ALL the iterator adapters for free:
let sum: u32 = Counter { count: 0, max: 5 }
    .filter(|n| n % 2 == 0)
    .map(|n| n * n)
    .sum();
```

One method. You implement `next()`. The entire iterator ecosystem becomes available. This is traits composing beautifully, and it's why Rust's standard library feels so consistent — everything that's an `Iterator` works with everything designed for `Iterator`.

## The Mental Shift That Actually Matters 🧠

Coming from 7 years of imperative web development, the hardest part wasn't the syntax. It was letting go of "loop over the collection, accumulate into a variable, return the result."

Rust pushes you toward "describe the transformation, let the compiler figure out the execution." This feels abstract at first. Then it clicks, and you realize your old nested loops were actually harder to reason about, not easier.

When I read a Rust iterator chain, I read it like a sentence: "Take these samples, compute their power, keep only the strong ones, give me the first 512." The code matches the thought. No loop variable. No bounds check. No off-by-one anxiety at 2am.

## TL;DR 🎯

- **PHP and JS pipelines** are typically *eager* — they process everything before moving to the next step
- **Rust iterators are lazy** — they only compute what you actually consume
- **Zero-cost abstractions** mean the iterator chain compiles to the same assembly as a hand-written loop
- **One trait, one method** (`next()`) gives you the entire iterator adapter ecosystem for free
- **For RF/SDR and streaming data**, lazy iterators mean no unnecessary allocations and single-pass processing

Coming from Laravel Collections — which are lovely, honestly — Rust's iterators feel like Collections grew up, joined a compiler team, and came back speaking fluent assembly. The expressiveness is the same. The performance ceiling is completely different.

Now if you'll excuse me, I have 2 million I/Q samples per second to process and exactly zero excuses to write a for-loop. `cargo run`. 🦀📡

---

**Exploring Rust iterators or SDR signal processing?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to compare iterator adapter horror stories.

**Hobby projects:** [GitHub](https://github.com/kpanuragh) — where the web dev stuff lives alongside increasingly exotic RF code.

*Now go `.map()` something that would have been three nested loops yesterday!* 🦀🔄✨
