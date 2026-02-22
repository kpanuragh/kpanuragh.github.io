---
title: "Rust Rayon: I Added `.par_iter()` and Accidentally Used All 4 CPU Cores 🦀⚡"
date: "2026-02-22"
excerpt: "Coming from a world where PHP runs on one core and Node.js pretends it doesn't need the others, Rayon is the kind of magic that makes you feel like you've been leaving money on the table for 7 years."
tags: ["rust", "systems-programming", "performance", "rayon", "parallelism"]
featured: true
---

# Rust Rayon: I Added `.par_iter()` and Accidentally Used All 4 CPU Cores 🦀⚡

**Confession:** I once thought "multi-core performance" was something only game engine developers and NASA needed to care about.

I was building web APIs. They wait for databases. The CPU is mostly asleep. Who needs multiple cores?

Then I started processing RTL-SDR radio samples in Rust — thousands of I/Q data points per second, running FFT transforms, correlating signal patterns across frequencies. Suddenly my Raspberry Pi's four cores looked less like a luxury and more like four employees where three of them were just standing around watching the first one do all the work.

Enter **Rayon**. And my CPU utilization graph became a beautiful wall of 100%.

## What Even Is Rayon? 🤔

Rayon is a Rust library for **data parallelism** — splitting your data across CPU cores and processing it in parallel, automatically.

It's different from the other concurrency tools you might have seen in Rust:

- **Tokio** = async I/O concurrency (waiting for network/disk without blocking)
- **Channels** = communication between threads (passing messages)
- **Rayon** = CPU-bound data parallelism (crunching numbers on all your cores)

If you're coming from a web background, think of it this way: Tokio is for waiting efficiently. Rayon is for **working harder**.

The killer feature? You switch from `.iter()` to `.par_iter()` and Rayon figures out the rest. One word. No threads. No mutexes. No deadlocks. Just... faster.

## The PHP/Node.js Mental Model Problem 🧠

Coming from 7 years of Laravel and Node.js, my mental model of CPU usage was basically:

```
Task 1 → runs → finishes → Task 2 → runs → finishes
```

PHP processes one request at a time per worker. Node.js does one thing at a time on the event loop (even if it's fast). Neither actually uses multiple cores for a single computation.

The Laravel way to process a list of 10,000 items:

```php
// PHP - one item at a time, one core, all day long
$results = collect($signals)
    ->map(fn($signal) => decode($signal))
    ->filter(fn($decoded) => $decoded->strength > -80)
    ->values();
```

This is fine. It works. But if `decode()` is CPU-intensive, you're using approximately 25% of a quad-core machine. The other 75% is making coffee.

## Rayon: Your Cores Finally Clock In ⚡

Here's the same thing in Rust with Rayon:

```rust
use rayon::prelude::*;

let results: Vec<DecodedSignal> = signals
    .par_iter()          // 👈 this one word
    .map(|signal| decode(signal))
    .filter(|decoded| decoded.strength > -80.0)
    .collect();
```

That's it. Rayon automatically splits `signals` across your available CPU cores, runs `decode()` in parallel on all of them, and collects the results back in order.

**What excited me about this:** I changed exactly one word in my code — `iter()` to `par_iter()` — and my signal processing pipeline went from using one core at 100% to using all four cores at ~95% each. The throughput didn't double. It **quadrupled**.

## How Does It Know What to Do? 🔮

Rayon uses a technique called **work-stealing**. It creates a thread pool (sized to your CPU core count by default) and splits work into small chunks. When a thread finishes its chunk early, it "steals" work from threads that are still busy.

You don't configure this. You don't tune it (usually). You just use `.par_iter()` and Rayon handles the rest.

Compare that to the alternative in many languages — manually spinning up threads, dividing work, synchronizing results, handling panics in worker threads. In PHP, this means `pcntl_fork()` which sounds like a cooking utensil and behaves like one. In Node.js, it means `worker_threads` and a lot of `postMessage()` ceremony.

Rayon is the version of parallelism where you don't have to think about parallelism.

## The Gotcha: Not Everything Parallelizes Well ⚠️

This is where Rust's type system earns its keep. Rayon won't let you do things that are inherently sequential or unsafe to parallelize.

```rust
// This WON'T compile — mutating shared state is a data race
let mut count = 0;
signals.par_iter().for_each(|s| {
    count += 1; // ❌ can't mutate from multiple threads
});

// This WILL compile — no shared mutable state
let count = signals.par_iter().filter(|s| s.valid).count(); // ✅
```

The borrow checker catches data races **at compile time**. You physically cannot write a Rayon program that has a race condition. If it compiles, the parallel version is correct.

Coming from PHP, where threading was "don't do it" and Node.js where it was "use workers and pray," this felt like cheating.

## The SDR Use Case That Made It Click 📡

For my RF/SDR hobby project, I'm processing IQ samples from an RTL-SDR dongle — hundreds of thousands of complex numbers per second. I need to run a Fast Fourier Transform (FFT) on overlapping windows of data to detect signal peaks across frequencies.

Before Rayon, I was doing this sequentially:

```rust
let spectra: Vec<Spectrum> = windows
    .iter()
    .map(|window| compute_fft(window))
    .collect();
```

My Pi 4's single core was at 100% and I was dropping samples. Not ideal when you're trying to catch a 433 MHz temperature sensor that broadcasts for 8 milliseconds every 60 seconds.

After Rayon:

```rust
let spectra: Vec<Spectrum> = windows
    .par_iter()
    .map(|window| compute_fft(window))
    .collect();
```

All four cores lit up. Sample processing time dropped by 3.5x. I stopped dropping packets. The temperature sensor in my shed — the one that had been "unreliable" — turned out to have been perfectly reliable all along. I was just too slow to catch it.

My hardware hadn't changed. My algorithm hadn't changed. One word changed.

## Parallel Sort, Filter, Reduce — All the Hits 🎵

Rayon doesn't stop at `map` and `filter`. The whole iterator API works:

```rust
use rayon::prelude::*;

// Parallel sort (Rust's standard sort is sequential)
let mut frequencies = vec![915.0, 433.92, 868.0, 2400.0, 169.0];
frequencies.par_sort_by(|a, b| a.partial_cmp(b).unwrap());

// Parallel sum/reduce
let total_power: f64 = signal_strengths.par_iter().sum();

// Parallel find (stops as soon as any thread finds a match)
let strong_signal = signals
    .par_iter()
    .find_any(|s| s.strength > -50.0);
```

The `find_any` is particularly interesting. In a sequential search through a million signals, you might scan 800,000 before finding the one you want. In parallel with four cores, you're doing four searches simultaneously — the first thread to find a match wins, and all other threads stop. No wasted work, no sequential penalty.

## Is It Always Faster? The Honest Answer 🤷

No. Parallelism has overhead. Rayon needs to split work, schedule threads, and merge results. For small datasets or operations that are faster than that overhead, sequential iteration wins.

The rough rule: if your operation on each item takes more than a few microseconds, Rayon will win. If it's nanosecond-level work on a small slice, stick with `.iter()`.

For signal processing, machine learning preprocessing, image manipulation, cryptographic operations, large sorting tasks — yes, Rayon wins. For iterating over 50 items to build a JSON response — stick with regular iterators.

**For my RF work?** Every FFT window took ~15 microseconds. Rayon's overhead is about 1 microsecond. Easy win.

## What About Node.js Worker Threads? 🤔

Node.js got `worker_threads` in v10. They work. But the ergonomics are... different:

```javascript
// Node.js: explicit threads, postMessage ceremony, error handling per thread
const { Worker, isMainThread, parentPort } = require('worker_threads');
if (isMainThread) {
    const worker = new Worker(__filename);
    worker.postMessage(signals);
    worker.on('message', result => { /* handle */ });
    worker.on('error', err => { /* handle */ });
} else {
    parentPort.on('message', signals => {
        const results = signals.map(decode); // still sequential inside
        parentPort.postMessage(results);
    });
}
```

You're still doing the work inside the worker sequentially. To parallelize *within* the worker you'd need to split manually. And data passed via `postMessage` gets serialized (structured clone), which costs time.

Rayon shares data between threads with zero-copy. The type system guarantees it's safe. The API is one word. I'm not trying to dunk on Node.js — it's my daily driver for seven years — but the ergonomics aren't in the same universe.

## TL;DR: When To Reach For Rayon 📋

1. **You have CPU-bound work** (not I/O-bound) — signal processing, cryptography, data transformation, image/audio processing.
2. **You have enough data** — at least hundreds of items where each item takes some real processing time.
3. **The work is independent** — each item doesn't need the result of a previous item.
4. **You're already using iterators** — just change `.iter()` to `.par_iter()`. Done.

Coming from 7 years of Laravel and Node.js, Rayon was the first thing in Rust that made me feel genuinely powerful rather than just *safe*. The borrow checker makes your code correct. Rayon makes it fast. Together they're the reason "fearless concurrency" is actually Rust's tagline and not just marketing.

My Raspberry Pi went from struggling with real-time signal processing to handling it effortlessly. The hardware was always capable. I was just the bottleneck — one sequential developer in a world of parallel possibilities.

`.par_iter()`. One word. That's it. 🦀⚡

---

**Processing RF signals in Rust?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I've got opinions on FFT window sizes and zero strong opinions about which core should do which chunk.

**Curious about the full SDR pipeline?** Check out my [GitHub](https://github.com/kpanuragh) for hobby projects decoding radio signals one parallel iterator at a time.

*Sequential is safe. Parallel is fast. Rayon is both.* 🦀⚡
