---
title: "Rust Generics: Stop Writing the Same Function Five Times 🦀"
date: "2026-02-27"
excerpt: "Coming from PHP where 'generic' just means 'accepts everything and hopes for the best at runtime', Rust generics feel like someone finally made types work *for* you instead of against you."
tags: ["rust", "systems-programming", "performance", "generics", "type-system"]
featured: true
---

# Rust Generics: Stop Writing the Same Function Five Times 🦀

**Hot take:** In PHP, every function is already "generic." It'll accept an int, a string, an array, a null, a bool, whatever you throw at it. At runtime. When it's too late to do anything about it.

Coming from 7 years of Laravel/Node.js, my mental model of "code that works with multiple types" was: either write it separately for each type, or throw `any` at it and cry later. PHP has type hints now, which is great! But real generics? Not quite.

Then I met Rust generics. And I understood why the Rust compiler is so smug about performance.

## The Problem Generics Solve 🎯

Imagine you want a function that returns the larger of two values. In PHP, you'd write something like this:

```php
function max_int(int $a, int $b): int {
    return $a > $b ? $a : $b;
}

function max_float(float $a, float $b): float {
    return $a > $b ? $a : $b;
}

// same thing for strings... same thing for your custom types...
```

Three functions. Same logic. Different types. This is what every developer from a dynamically-typed background does — copy-paste with type annotations and hope nobody notices.

In Rust, you write it once:

```rust
fn largest<T: PartialOrd>(a: T, b: T) -> T {
    if a > b { a } else { b }
}
```

One function. Works for `i32`, `f64`, `String`, or any type that supports comparison. The `<T: PartialOrd>` part says: "T can be any type, as long as it knows how to compare itself."

## What That `<T>` Thing Actually Means 🧠

The `<T>` syntax declares a **type parameter** — a placeholder that gets filled in at compile time.

```rust
fn largest<T: PartialOrd>(a: T, b: T) -> T {
//         ^^             ^     ^       ^
//         declare T      use T  use T  return T
```

The `T: PartialOrd` part is a **trait bound** — it says T must implement the `PartialOrd` trait (i.e., support `>`, `<`, comparisons). Without that bound, Rust would refuse to compile because it can't guarantee every possible T supports comparison.

That's the thing that blew my mind coming from PHP: Rust rejects code that *might* fail, at compile time, for any possible type. Not "this particular type failed at runtime." Not "we found the problem in production at 2am." The compiler says: "I cannot prove this is correct for all T. Rejected."

Coming from PHP where `$a > $b` on two arrays produces... something... this was a revelation.

## The Secret: Monomorphization ⚡

Here's the trick that makes Rust generics essentially free at runtime.

When you write `largest(5i32, 3i32)` and `largest(3.14f64, 2.71f64)` in your code, Rust doesn't generate one generic function and figure it out at runtime (like Java does with type erasure). Instead, the compiler **generates two separate, specialized functions**:

```rust
// What the compiler actually generates behind the scenes:
fn largest_for_i32(a: i32, b: i32) -> i32 { ... }
fn largest_for_f64(a: f64, b: f64) -> f64 { ... }
```

This is called **monomorphization**. You write generic code once, the compiler stamps out specific versions for each type you actually use.

The result: the generic function runs at exactly the same speed as if you'd hand-written the type-specific version. No boxing. No virtual dispatch. No runtime type checking. No overhead whatsoever.

In Java, generics involve type erasure and boxing primitives into heap-allocated objects. In Python, it's duck typing with a hope and a prayer. In Rust, generics compile away to zero-cost specialized code.

This is what "zero-cost abstractions" actually means in practice.

## Generics in Structs — Not Just Functions 📦

You can make your data types generic too. Here's a `Pair<T>` that holds any two values of the same type:

```rust
struct Pair<T> {
    first: T,
    second: T,
}

impl<T: std::fmt::Display + PartialOrd> Pair<T> {
    fn display_larger(&self) {
        if self.first > self.second {
            println!("Largest: {}", self.first);
        } else {
            println!("Largest: {}", self.second);
        }
    }
}
```

Compare this to PHP:

```php
class Pair {
    public function __construct(
        public mixed $first,   // "generic" PHP-style 😅
        public mixed $second,
    ) {}

    // Runtime crash if $first doesn't support comparison?
    // Find out at production time!
}
```

PHP's `mixed` is the runtime version of generics. Rust's `<T>` is the compile-time version. One crashes at 2am. The other won't compile if you use it wrong.

## My RF/SDR Use Case: Generic Signal Buffers 📡

For my RF/SDR hobby projects, I work with signal samples that come in different formats: `i16` (16-bit integers from the hardware), `f32` (floats for processing), or `Complex<f32>` (complex numbers for I/Q data).

A generic buffer type saves me from writing three separate implementations:

```rust
struct SampleBuffer<T> {
    data: Vec<T>,
    sample_rate: u32,
}

impl<T: Copy> SampleBuffer<T> {
    fn new(sample_rate: u32) -> Self {
        SampleBuffer { data: Vec::new(), sample_rate }
    }

    fn push(&mut self, sample: T) {
        self.data.push(sample);
    }

    fn len(&self) -> usize {
        self.data.len()
    }
}
```

`SampleBuffer<i16>`, `SampleBuffer<f32>`, `SampleBuffer<Complex<f32>>` — all work. One implementation. Zero runtime overhead. If I accidentally put a `String` in a buffer that expects `Complex<f32>`, that's a compile error, not a runtime surprise at 2.4 million samples per second.

## The `where` Clause: When Bounds Get Complicated 📝

When trait bounds get verbose, Rust gives you the `where` clause as a cleaner alternative:

```rust
// This is getting hard to read:
fn process<T: Copy + PartialOrd + std::fmt::Display>(value: T) -> T { ... }

// This is the same thing, just easier on the eyes:
fn process<T>(value: T) -> T
where
    T: Copy + PartialOrd + std::fmt::Display,
{ ... }
```

Both compile to identical code. The `where` clause is pure ergonomics — pick whichever you find more readable.

This is also why Rust code can look intimidating at first. There's a lot of type information in the function signature. But every piece of that syntax is *telling you something real* about what the code guarantees. It's not noise — it's a contract written in code.

## The Trade-Off: Longer Compile Times ⏱️

Here's the honest downside to monomorphization.

Generics are free at *runtime*. But at *compile time*, the compiler has to generate and optimize a separate version for each type you actually use. More generics = more work for the compiler.

This is one reason Rust compile times can be... memorable. The same mechanism that gives you zero-cost runtime abstractions is also what makes you stare at a progress bar wondering if the compiler has started a side project.

Is it worth it? For code that runs millions of times in a tight loop — like processing 2.4 million RF samples per second — absolutely. For a web API handling 50 requests per second, the performance difference is invisible, but the type safety is still real and valuable.

## When to Use Generics (and When Not To) 🤔

**Use generics when:**
- You're writing utility functions or data structures that genuinely work with multiple types
- You want compile-time type safety with no runtime overhead
- You keep copy-pasting the same function with different type annotations

**Don't use generics when:**
- One concrete type is all you need — don't over-engineer it
- You want runtime polymorphism (use `dyn Trait` instead — that's a different post)
- The trait bounds get so complex that reading the code requires a PhD

The Rust ecosystem's most-used crates (`Vec`, `HashMap`, `Option`, `Result`) are all generic. You've been using monomorphized Rust code since your first `let mut v: Vec<i32> = Vec::new()`. You just didn't have to write the generic machinery yourself.

## TL;DR: The Honest Summary 📋

1. **Rust generics let you write one function that works for many types** — without runtime overhead
2. **The `<T: SomeTrait>` syntax** declares a type parameter with constraints — wrong usage is rejected at compile time
3. **Monomorphization** means the compiler stamps out specialized code for each type you use — zero runtime cost
4. **Compared to PHP's `mixed`**: PHP accepts everything at runtime and crashes later. Rust rejects wrong types at compile time.
5. **You can make structs generic too** — hugely useful for reusable data structures
6. **The trade-off is compile time** — the compiler does more work up front so you don't pay at runtime
7. **For hot paths** (signal processing, tight loops, high-throughput parsing), zero-cost generics genuinely matter

Coming from 7 years of PHP where "generic" meant "accept `mixed` and debug at 2am" — having the compiler verify my code for every possible type combination, before a single byte runs, is one of those things that makes you understand why systems programmers keep evangelizing Rust.

The performance is free. The correctness is guaranteed. The compiler errors are... educational. 🦀

---

**Building generic data structures for DSP or signal processing?** I'd love to compare type signatures — hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp).

**Curious what `SampleBuffer<Complex<f32>>` looks like in real SDR code?** My [GitHub](https://github.com/kpanuragh) has the project — there's more type algebra in there than I originally planned.

*Generics: all the flexibility of dynamic typing, none of the 2am debugging.* 🦀
