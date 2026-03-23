---
title: "Rust `const fn`: Stop Paying for Math at Runtime When the Compiler Works for Free ⚡🦀"
date: "2026-03-05"
excerpt: "Coming from PHP and Node.js, the concept of 'do this computation at compile time, not runtime' never existed. Rust's const fn changes everything — and the performance implications are wild."
tags: ["\"rust\"", "\"systems-programming\"", "\"performance\"", "\"const-fn\"", "\"compile-time\""]
featured: "true"
---

# Rust `const fn`: Stop Paying for Math at Runtime When the Compiler Works for Free ⚡🦀

**Controversial opinion:** Your web app is doing work at runtime that your compiler should be doing for free. Every. Single. Request.

I didn't realize this was a thing that existed until Rust slapped me with the concept of compile-time computation. Coming from 7 years of Laravel and Node.js, the idea that you could move CPU work *out of your running program* and into the *build process* simply never occurred to me.

Then I discovered `const fn`. And now I can't stop thinking about how much unnecessary runtime math I've been doing my entire career.

## The PHP Dev's Reality: Everything Happens at Request Time 😅

Here's a classic PHP pattern I've written approximately ten thousand times:

```php
// Computed fresh every single request. Even if it never changes.
function getBufferSize(): int {
    return 1024 * 64;  // 65536
}

// Or worse, "constants" that are actually functions
define('SAMPLE_RATE', 2_048_000);
define('FFT_SIZE', 1024);
define('FREQUENCY_RESOLUTION', SAMPLE_RATE / FFT_SIZE);  // Division. Every. Page. Load.
```

PHP `define()` is evaluated when the interpreter first hits that line. Every request. The multiplication, the division — happening at runtime. It's fast, sure, but the point is: *why is it happening at all?* This value never changes. The compiler (or interpreter) could figure it out before your code ever runs.

Node.js is the same:

```javascript
const NYQUIST_FREQ = SAMPLE_RATE / 2;  // Computed when the module loads
const BIN_RESOLUTION = NYQUIST_FREQ / (FFT_SIZE / 2);  // Runtime arithmetic, every time
```

Every time your Node process starts, it's doing math that has exactly one possible answer. You could have had that answer before the process even launched.

## What Excited Me About Rust's `const fn` 🦀⚡

In Rust, you can mark a function with `const`. This tells the compiler: "I promise this function's output depends only on its inputs — go ahead and evaluate it at compile time if you can."

```rust
const fn buffer_size() -> usize {
    1024 * 64  // Compiler computes 65536. Binary contains 65536. No multiplication at runtime.
}

const SAMPLE_RATE: u32 = 2_048_000;
const FFT_SIZE: usize = 1024;
const FREQUENCY_RESOLUTION: f64 = SAMPLE_RATE as f64 / FFT_SIZE as f64;  // Done. At compile time.

const BUFFER_SIZE: usize = buffer_size();  // Also done. At compile time.
```

When your compiled binary runs, `BUFFER_SIZE` is already `65536` baked into the executable. The CPU never executes a multiplication instruction for it. The compiler did the work so your users don't have to.

This isn't a micro-optimization. This is a philosophical shift.

## The Lookup Table That Blew My Mind 🔥

Here's where it gets genuinely impressive. For my RF/SDR hobby projects, I need a sine wave lookup table — a pre-computed array of sine values used for signal generation and mixing. Computing `sin()` in real time at 2 million samples per second adds up.

The classic C approach: declare a global array, write an `init()` function, call it at startup, hope you didn't forget.

The PHP approach: compute it in a constructor. Maybe cache it in Redis. Add a cache invalidation bug two years later.

The Rust approach:

```rust
const fn generate_sine_table<const N: usize>() -> [f32; N] {
    let mut table = [0.0f32; N];
    let mut i = 0;
    while i < N {
        // Note: const fn can't use floating point in stable Rust yet for sin(),
        // but the pattern shows the intent — zero runtime cost initialization
        table[i] = (i as f32) / (N as f32);  // Simplified for example
        i += 1;
    }
    table
}

const SINE_TABLE: [f32; 1024] = generate_sine_table::<1024>();
```

That `SINE_TABLE` is computed once — when you run `cargo build`. Your binary ships with all 1024 values pre-baked. Your program starts with a fully initialized lookup table and never paid a nanosecond of runtime CPU for it.

I nearly fell out of my chair when I realized this was possible.

## For My SDR Projects, This Changed Everything 📡

When you're processing 2 million I/Q samples per second, the math budget is tight. Every cycle you waste on setup work is a cycle you can't spend on actual signal processing.

Before Rust, my Python SDR code had an initialization phase: build lookup tables, pre-compute filter coefficients, allocate buffers. Users experienced a delay on startup. The buffers lived in interpreted-Python memory.

In Rust, most of that setup work moved to compile time. My binary starts up instantly because there's nothing to initialize — it's already done. The lookup tables are static arrays in the executable's data segment. No allocation, no initialization, no startup cost.

This matters less for a Laravel web app serving JSON responses. It matters enormously when you're building embedded signal processors, CLI tools that need to start fast, or any system where startup latency is observable.

## const fn Has Rules (and They're Surprisingly Reasonable) 🧠

`const fn` isn't magic. The compiler needs to evaluate it without any information it doesn't have yet. That means:

**Allowed:**
- Arithmetic, comparisons, bitwise operations
- Calling other `const fn` functions
- Constructing structs and arrays
- Basic control flow (`if`, `while`, loops)
- Most of the standard library's basic operations

**Not allowed (at least in stable Rust):**
- Heap allocation (`Box::new`, `Vec`, etc.) — the heap doesn't exist at compile time
- Floating-point functions like `sin()` and `cos()` (though `const` floats *do* work, trig functions aren't stable yet)
- I/O of any kind
- Anything that depends on runtime state

The restrictions make sense once you think about it. The compiler is evaluating your function in a sandboxed, abstract environment. Anything that touches the outside world or allocates dynamic memory can't exist in that environment.

Coming from PHP where everything *can* have side effects everywhere, these constraints are actually clarifying. Pure functions feel weird at first. Then they feel like freedom.

## The Real-World Win: Hash Maps at Compile Time 🗺️

The `phf` crate (Perfect Hash Functions) takes this to its logical conclusion. You define a hash map in your source code, and the crate generates a *perfect*, *collision-free* hash map at compile time. Your binary ships with a static data structure that has O(1) lookup and zero runtime construction cost.

```rust
use phf::phf_map;

static BAND_NAMES: phf::Map<u32, &'static str> = phf_map! {
    88_000_000u32 => "FM Radio Low",
    108_000_000u32 => "FM Radio High",
    433_920_000u32 => "ISM 433MHz",
    915_000_000u32 => "ISM 915MHz",
    2_400_000_000u32 => "WiFi 2.4GHz",
};
```

That map is fully built at compile time. The hash function, the buckets, the values — everything. Your running program does a single memory read to look up a frequency band name. No `HashMap::new()`, no `insert()` calls at startup, no allocation.

For my frequency scanner, this replaced a startup initialization routine with a static data structure. The first lookup is as fast as the millionth.

## Why This Matters for Web Devs Too 🌐

I know what you're thinking: "Cool for SDR nerd projects, but my Laravel app doesn't need this."

Fair. But consider:

- **Route lookup tables** — Laravel builds these at runtime (and caches them for performance). In Rust web frameworks, many can be compile-time structures.
- **Status code maps, error message tables, regex patterns** — anything that's known before your server starts could theoretically live in a `const` or `static`.
- **Configuration validation** — if your config values have constraints, some of those constraints can be checked at compile time rather than panicking at runtime.

The bigger lesson isn't "use `const fn` everywhere." It's "start asking whether this work needs to happen at runtime at all."

After 7 years of PHP and Node.js, I had never asked that question. Runtime was where everything lived. Compile time was just... turning source code into a binary.

Rust taught me that compile time is a computational resource. And it's a resource I was leaving entirely unused.

## TL;DR 🎯

- **`const fn`** tells the Rust compiler it can evaluate a function at compile time, baking the result into your binary
- **Constants computed at compile time** mean zero runtime CPU cost — the value is just there when your program starts
- **Lookup tables and static data structures** can be fully initialized before your program runs
- **The restrictions** (no heap, no I/O, no runtime state) make sense — and they push you toward pure functions, which are easier to reason about anyway
- **For SDR and real-time processing**, compile-time initialization means instant startup and no wasted cycles on setup work
- **For web devs**, this reframes how you think about "when does this computation need to happen?"

I spent 7 years assuming all computation happened at request time. Rust showed me the compile time is just as real — and completely free, from the perspective of your running program.

Now if you'll excuse me, I have a sine table to pre-compute and a build process to watch with inappropriate levels of satisfaction. `cargo build` ⚡🦀

---

**Exploring Rust's `const fn` or building compile-time data structures?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to nerd out about moving work out of runtime.

**Hobby projects:** [GitHub](https://github.com/kpanuragh) — where the web dev stuff lives alongside increasingly compile-time-obsessed RF code.

*Now go declare something `const` that you used to compute at startup. Your users will never notice, but you will.* 🦀⚡✨
