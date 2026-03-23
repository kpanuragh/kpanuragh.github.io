---
title: "Rust `impl Trait` vs `dyn Trait`: The Performance Decision You Make Without Knowing It 🦀⚡"
date: "2026-03-16"
excerpt: "In PHP and JavaScript, calling a method is just... calling a method. In Rust, there are two fundamentally different ways to do it — one is free at runtime, one costs a lookup. I didn't know I was choosing between them until I needed to care."
tags: ["\"rust\"", "\"systems-programming\"", "\"performance\"", "\"traits\"", "\"dispatch\""]
featured: "true"
---

# Rust `impl Trait` vs `dyn Trait`: The Performance Decision You Make Without Knowing It 🦀⚡

**Here's something nobody warned me about when I started learning Rust:** you can write what looks like almost identical code in two different ways, and one of them is faster than the other at a fundamental CPU level. Not "use Redis instead of MySQL" fast. Not "add an index" fast. At the level of how the CPU decides which function to call.

Coming from 7 years of Laravel and Node.js, I called methods without ever thinking about *how* the CPU figured out which code to run. You write `$user->notify()`, PHP figures it out, life continues. In Rust, the language hands you a choice. And once you understand why the choice exists, you can't unsee it.

## First: What Are We Even Talking About? 🤔

In Rust, traits are how you define shared behavior. A trait is like an interface — any type that implements it promises to have certain methods. Here's a simple one:

```rust
trait Demodulate {
    fn process(&self, sample: f32) -> f32;
}
```

Now, when you write a function that accepts "something that implements `Demodulate`," Rust gives you two syntaxes:

```rust
// Option A: impl Trait
fn run_decoder(demod: impl Demodulate) { ... }

// Option B: dyn Trait
fn run_decoder(demod: &dyn Demodulate) { ... }
```

These look nearly identical. They are not. One decides at compile time which code to run. The other decides at runtime. That difference is the entire story.

## Option A: `impl Trait` — The Compiler Does the Work 🏎️

When you write `impl Demodulate`, you're telling Rust: "I'll give you a concrete type at compile time, you figure out the rest."

The compiler looks at where you call `run_decoder`, sees what concrete type you're passing in, and generates a **separate copy of the function** specialized for that type. This is called **monomorphization** — a word that sounds terrifying but means "make one version per type."

```rust
struct FmDemodulator;
struct AmDemodulator;

impl Demodulate for FmDemodulator {
    fn process(&self, sample: f32) -> f32 { sample * 0.8 }
}

impl Demodulate for AmDemodulator {
    fn process(&self, sample: f32) -> f32 { sample.abs() }
}

fn run_decoder(demod: impl Demodulate, data: &[f32]) {
    for &s in data {
        let _ = demod.process(s);
    }
}

// These two calls generate TWO separate compiled functions:
run_decoder(FmDemodulator, &samples);
run_decoder(AmDemodulator, &samples);
```

The CPU never has to look up "which `process` function do I call?" It already knows. The function call is hardcoded into the binary. This is called **static dispatch** — and it's fast enough that the compiler can often inline the entire trait method call, eliminating the function call overhead entirely.

**Coming from PHP:** It's as if Laravel pre-compiled separate controller binaries for every possible injected service class combination. Ridiculous at web scale. Essential when you're crunching 2.4 million samples per second from an RTL-SDR dongle.

## Option B: `dyn Trait` — The Runtime Lookup 🔍

When you write `&dyn Demodulate`, you're telling Rust: "I don't know the concrete type at compile time. Figure it out at runtime."

Under the hood, Rust creates a **vtable** — a small lookup table that maps trait methods to function pointers for a specific type. When you call `demod.process()` through a `dyn Demodulate`, the CPU:

1. Loads the vtable pointer from the fat pointer
2. Looks up the `process` function address in the vtable
3. Jumps to that address

That lookup is called **dynamic dispatch**. It costs one extra memory dereference and kills the compiler's ability to inline the call. For a web API endpoint handling one request every few milliseconds, completely irrelevant. For a hot loop running millions of times per second on radio samples, it matters.

## When Does This Actually Matter? 📊

**For my RF/SDR hobby projects:** I'm writing a software FM radio decoder that processes 2.4 million IQ samples per second. The demodulation loop runs in a tight inner loop. Using `impl Trait` there means the compiler can see through the abstraction, understand exactly what operations happen, and optimize aggressively — including SIMD vectorization and inlining. Using `dyn Trait` puts a vtable lookup in the hot path and blocks those optimizations.

The difference on a tight loop: roughly 10-20% slower with dynamic dispatch, sometimes more if the compiler was going to inline the call. Not catastrophic, but real.

**For most Laravel/Node.js web work:** You'll use `dyn Trait` when you need a collection of different types or when you need to store trait objects in a `Vec`. The "runtime lookup" overhead is measured in nanoseconds. Your database query takes 5 milliseconds. Don't stress.

## The Concrete Use Cases 🎯

**Use `impl Trait` when:**
- You know the type at compile time
- The function is called in a tight loop
- You want the compiler to optimize aggressively
- You're writing generic utility functions

```rust
// Perfect for impl Trait — concrete type known, compiler optimizes
fn process_stream(filter: impl Filter, data: &[f32]) -> Vec<f32> {
    data.iter().map(|&s| filter.apply(s)).collect()
}
```

**Use `dyn Trait` when:**
- You need a collection of different types
- The type is determined at runtime (user config, plugins)
- You're storing trait objects in a struct
- Binary size matters more than runtime speed

```rust
// Perfect for dyn Trait — different demodulators, runtime choice
struct RadioDecoder {
    demod: Box<dyn Demodulate>,  // Could be FM, AM, or anything else
}

impl RadioDecoder {
    fn new(mode: &str) -> Self {
        let demod: Box<dyn Demodulate> = match mode {
            "fm" => Box::new(FmDemodulator),
            "am" => Box::new(AmDemodulator),
            _ => panic!("Unknown mode"),
        };
        RadioDecoder { demod }
    }
}
```

Here, `dyn Trait` is the *right* choice. You genuinely don't know which demodulator you'll use until the user picks a mode. The vtable lookup is the correct mechanism for this job.

## The PHP/JS Mental Model Translation 🧠

In PHP, *every* method call through an interface is dynamic dispatch. Always. PHP's engine looks up the method at runtime every time. You never think about it because you can't change it.

In JavaScript, the V8 engine is smart — it uses "hidden classes" and inline caching to make repeated method calls on the same object shape nearly as fast as static dispatch. It's doing heroic work behind the scenes to approximate what Rust's `impl Trait` gives you explicitly.

**What excited me about Rust's approach:** You write in the language what you actually mean. If you know the type at compile time, you say so with `impl Trait` and get the performance that implies. If you need runtime flexibility, you say so with `dyn Trait` and get exactly that. No hidden overhead, no runtime magic, no guessing what the JIT is doing.

The explicit choice felt overwhelming at first. After a few months, it felt like finally having the right vocabulary. You were always making this choice in other languages — you just couldn't express it.

## One Gotcha: Binary Size 📦

Monomorphization (the `impl Trait` magic) has a cost: **code bloat**. Every concrete type you pass to a generic function generates a separate copy of that function in the binary. For a function used with 50 different types, you get 50 compiled versions.

For my SDR decoder binary that runs on a Raspberry Pi 4, this matters. I have some utility functions that I switched to `dyn Trait` specifically to reduce binary size, even though the performance is slightly worse. The pi doesn't have infinite flash storage, and the performance difference in those non-hot paths is immeasurable.

This is the kind of tradeoff that Rust makes you think about explicitly. Some days that's maddening. Most days it feels like respect — the language trusts you to make informed decisions.

## The Summary 🏁

`impl Trait` and `dyn Trait` aren't interchangeable styles — they're two different mechanisms with different tradeoffs:

| | `impl Trait` | `dyn Trait` |
|---|---|---|
| Dispatch | Static (compile time) | Dynamic (runtime vtable) |
| Speed | Faster, inlineable | Slightly slower |
| Binary size | Larger (one copy per type) | Smaller (one copy) |
| Flexibility | Type fixed at compile time | Any type at runtime |
| Use for | Hot loops, known types | Collections, plugins, config-driven code |

Coming from web development, you'll reach for `dyn Trait` instinctively because it's the mental model you're used to. That's fine — it works and it's often the right call. But when you're in a hot loop crunching numbers, switch to `impl Trait`, measure the difference, and enjoy the tiny smugness of knowing exactly what your CPU is doing.

After 7 years of writing code without thinking about vtables, I now find myself thinking "static or dynamic dispatch?" in the shower. Rust does this to you. It's not a bug.

---

**Exploring Rust performance?** The [Rust Performance Book](https://nnethercote.github.io/perf-book/) has a great section on trait object overhead. Worth a read before you start micro-optimizing.

**Doing RF/SDR or signal processing in Rust?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk shop about keeping decoders fast.

**Check out my projects:** [GitHub](https://github.com/kpanuragh) — including experiments where swapping `dyn` for `impl` actually showed up in benchmarks.

*Know your dispatch. Your CPU does.* 🦀⚡
