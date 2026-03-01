---
title: "Rust for Signal Processing: When My RTL-SDR Started Dropping Samples and I Ran Out of Excuses 📡🦀"
date: "2026-03-01"
excerpt: "I've been decoding radio signals as a hobby for years. PHP wasn't going to cut it. Node.js tried its best. Then I rewrote the hot path in Rust and suddenly my dongle wasn't dropping 40% of its samples anymore. Funny how that works."
tags: ["rust", "systems-programming", "performance", "signal-processing", "sdr"]
featured: true
---

# Rust for Signal Processing: When My RTL-SDR Started Dropping Samples and I Ran Out of Excuses 📡🦀

**Hot take:** Your $25 RTL-SDR dongle is streaming 2 million samples per second directly into your laptop's USB port. Your laptop is handling all of it. Whether your *software* is handling all of it is a different question entirely.

Coming from 7 years of Laravel/Node.js, I'd built my RF hobby tooling the way I built everything else — a Node.js script, some async callbacks, maybe a Redis queue for the expensive bits. It worked fine. Mostly. As long as I didn't actually look at the dropped sample counter.

Then I rewrote the hot path in Rust. The dropped sample counter went from 40% to essentially 0. I am a changed person.

## The Problem With 2 Million Samples Per Second 📊

Your RTL-SDR dongle doesn't care whether your garbage collector is running. It doesn't care that Node.js decided this was a good moment to pause and reclaim memory. It streams I/Q samples — pairs of numbers representing a radio signal's real and imaginary components — at a rate your CPU has to match *or drop data*.

This is the part where web programming instincts actively hurt you.

In Laravel or Node.js, you don't think about:
- How long garbage collection pauses your code
- Whether memory allocation happens inside your hot loop
- The overhead of calling a function through a virtual dispatch table

In real-time signal processing, these are literally the difference between "receiving a packet" and "corrupting a packet." A 1ms GC pause at 2 MSPS means 2,000 samples vanished into the void.

## What Real-Time DSP Actually Needs 🔬

Before we get to Rust, let me explain what a basic I/Q processing pipeline looks like:

1. **Read raw bytes** from the USB device (8-bit unsigned integers)
2. **Convert to float** — subtract 127.5, divide by 128 to get [-1.0, 1.0]
3. **Apply a filter** — typically a low-pass FIR filter to cut out-of-band noise
4. **Demodulate** — extract the actual signal (FM, AM, BPSK, whatever)
5. **Decode** — turn the signal into meaningful data

Steps 2–4 happen *for every single sample*. At 2 MSPS, that's 2 million iterations per second, inside a tight loop, with zero budget for unexpected pauses.

## The Node.js Version (This Is Fine 🔥)

Here's roughly what my original Node.js pipeline looked like in the conversion step:

```javascript
// Runs on every chunk of 512 samples
function convertToComplex(buffer) {
  const result = [];
  for (let i = 0; i < buffer.length; i += 2) {
    result.push({
      re: (buffer[i] - 127.5) / 128.0,
      im: (buffer[i + 1] - 127.5) / 128.0,
    });
  }
  return result;
}
```

Looks innocent, right? That `result.push({ re, im })` is allocating a new JavaScript object *for every sample pair*. At 2 MSPS, you're allocating 1 million objects per second. The GC is not thrilled. The GC is having a bad time. The GC is pausing your processing loop at the worst moments.

I added a `--max-old-space-size=4096` flag and told myself it was fine.

Reader, it was not fine.

## The Rust Version ⚡

Here's the equivalent in Rust:

```rust
#[derive(Clone, Copy)]
struct Complex {
    re: f32,
    im: f32,
}

fn convert_to_complex(raw: &[u8], output: &mut Vec<Complex>) {
    output.clear();
    for chunk in raw.chunks_exact(2) {
        output.push(Complex {
            re: (chunk[0] as f32 - 127.5) / 128.0,
            im: (chunk[1] as f32 - 127.5) / 128.0,
        });
    }
}
```

Two things are different:
1. `output` is a pre-allocated `Vec` passed in by the caller — **no allocation inside the loop**
2. `#[derive(Clone, Copy)]` means `Complex` is copied by value, not heap-allocated — **no GC objects, ever**

The Rust version allocates nothing during processing. The `Vec` is allocated once, up front, and reused for every chunk. The garbage collector doesn't exist. There is nothing to pause.

## The FIR Filter: Where Rust Really Shines 🔥

A low-pass FIR filter is the workhorse of DSP — it's a weighted sum over the last N samples. The naive version in any language is a nested loop over N coefficients per sample.

```rust
fn apply_fir(samples: &[Complex], taps: &[f32], output: &mut Vec<Complex>) {
    output.clear();
    let n = taps.len();
    for i in n..samples.len() {
        let mut acc = Complex { re: 0.0, im: 0.0 };
        for (j, &tap) in taps.iter().enumerate() {
            acc.re += samples[i - j].re * tap;
            acc.im += samples[i - j].im * tap;
        }
        output.push(acc);
    }
}
```

No allocation. No GC. The compiler sees this tight inner loop, notices the `f32` multiplications, and with optimizations enabled (`--release`), it auto-vectorizes: it uses SIMD instructions to process multiple multiplications in parallel using your CPU's vector unit.

You didn't ask for SIMD. You didn't write SIMD intrinsics. The Rust compiler looked at your code and decided to make it faster for free.

This is what "zero-cost abstractions" means in practice. The high-level code you write compiles to the same thing an expert would hand-write in assembly. The gap between "readable Rust" and "maximum performance Rust" is much smaller than people expect.

## My Actual SDR Project 📡

For my RTL-SDR setup, I process ACARS messages — those text messages airlines send between aircraft and ground stations. The pipeline runs at 2.4 MSPS, applies a FIR filter, runs FM demodulation, and then bit-slices the baseband signal.

Before Rust: ~40% sample drop rate under load. The decoder would occasionally produce garbled messages or miss packets entirely.

After rewriting the conversion and filter stages in Rust: essentially 0% drops. The decoder catches almost everything. I can now run multiple decoders simultaneously (ACARS + ADS-B) on the same machine without either falling behind.

The Node.js parts of the stack — HTTP API, database writes, WebSocket broadcasting — are still Node.js. I didn't rewrite everything. I rewrote *the part where performance actually matters*, and left the rest alone.

This is the lesson: Rust doesn't have to be all-or-nothing. Use it where you need it.

## Why This Matters Beyond Hobbyist Radio 🌍

Real-time signal processing isn't just an RF nerd problem. The same constraints apply to:

- **Audio processing** — plugins, DAWs, effects chains running at 44.1 kHz with 5ms latency budgets
- **Video encoding** — every frame needs to be processed before the next one arrives
- **Financial tick data** — microsecond timestamps, no dropped events
- **IoT sensor streams** — continuous high-frequency data from sensors

Anywhere data arrives faster than you can pause and think, the same principles apply: no allocation in the hot path, no GC pauses, predictable timing.

Coming from web development, I'd always thought of performance as "make the database queries faster" or "add a cache layer." Real-time processing introduced me to a different category of performance problem — one where Rust is one of the very few languages that can actually solve it.

## The Learning Curve Is Real, But So Is the Payoff 🏔️

The Rust DSP code I showed above is simpler than it looks. Once you understand ownership (no GC = explicit memory management, but Rust automates the hard parts), the actual signal processing code is almost identical to what you'd write in Python or JavaScript — just without the runtime surprises.

The `Vec` pre-allocation pattern felt weird at first coming from PHP where arrays just grow however they want. Now it feels obvious. Of course I don't want to allocate inside the loop. Why was I ever doing that?

The compiler is also an excellent teacher. When I accidentally tried to share the output buffer across multiple threads, the Rust compiler told me exactly why that was wrong and what to use instead (`Arc<Mutex<Vec<Complex>>>`). No runtime crash, no race condition I'd discover six hours later — just a clear compile error pointing at the problem.

## TL;DR: Should Web Developers Care About Rust DSP? 📋

1. **Real-time signal processing** (SDR, audio, video) has hard constraints that GC languages can't reliably meet
2. **The hot path is small** — you don't need to rewrite everything in Rust, just the 20% that matters
3. **Rust allocates nothing you don't ask for** — no GC pauses, no surprise allocations in your tight loop
4. **The Rust compiler auto-vectorizes** — write readable code, get SIMD performance for free
5. **Rust plays well with others** — calling Rust from Node.js (via Neon or FFI) is very doable
6. **The concepts transfer** — understanding where allocation happens makes you a better programmer in every language

Coming from 7 years of Laravel/Node.js, the biggest shift wasn't learning Rust syntax — it was learning to think about *when* and *where* code runs and what resources it uses. Rust forces you to think about this. The RTL-SDR dropping 40% of its samples was just the motivation I needed to finally make that shift.

My dongle is happy now. So am I. 🦀📡

---

**Building something with RTL-SDR or want to talk RF/Rust?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check my [GitHub](https://github.com/kpanuragh) for the actual SDR project code.

**Next time you see a commercial aircraft overhead:** it's broadcasting ACARS messages in plain text. Your $25 dongle and some Rust can read all of them. Just saying.

*Performance isn't premature optimization when the data is already arriving.* 🦀
