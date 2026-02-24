---
title: "Rust's Compile Times: The Bill You Pay to Never Get Paged at 3am 🦀⏳"
date: "2026-02-24"
excerpt: "Coming from PHP where 'compilation' takes zero seconds and Node.js where there's no compilation at all, Rust's compile times feel like a tax. Turns out it's the best tax you'll ever pay."
tags: ["rust", "systems-programming", "performance", "developer-experience", "tooling"]
featured: true
---

# Rust's Compile Times: The Bill You Pay to Never Get Paged at 3am 🦀⏳

**Confession:** The first time I ran `cargo build` on a non-trivial Rust project, I walked away to make tea.

Came back. Still compiling.

Made a second cup. Sat down. Watched the cursor blink. Stared at the wall. Questioned my life choices. Eventually: `Compiling done.`

Coming from 7 years of PHP — where "compilation" is just `php artisan serve` and it's ready before I finish hitting Enter — this felt like I'd accidentally installed the Rust compiler on a potato.

Then I understood what was actually happening. And I never complained about compile times again. (I still complain about them. But now I do it with respect.)

## The PHP/Node.js Mental Model Problem 🧠

In PHP, there's no compilation. You hit save and the server runs your code. The "compilation" that Laravel does is just loading classes and caching some config. Instant.

In Node.js, TypeScript adds some compilation, but `tsc` is mostly syntax checking and type erasure. Webpack/Vite bundles things. Total? Maybe 5-10 seconds for a medium project.

In Rust? A moderately complex project can take 30 seconds to 3 minutes on a fresh build.

Why? Is Rust just... slow? Is the compiler written in assembly on a bad day?

No. It's doing an absolutely *obscene* amount of work on your behalf. Work that other languages push to runtime. Work that shows up at 2am as a production incident in PHP. Work that Rust decided to do upfront so you never have to deal with it later.

## What the Compiler Is Actually Doing 🔬

Here's the thing — when Rust compiles your code, it doesn't just parse syntax and check types. It does all of this:

**Borrow checking.** Every reference, every lifetime, every ownership transfer is verified to be correct. Zero dangling pointers. Zero use-after-free. Not "probably fine." Mathematically verified. This alone is doing work that C/C++ programmers spend careers debugging.

**Monomorphization.** When you write a generic function, Rust generates a *separate*, optimized version for every concrete type you use it with. `sort::<i32>()` and `sort::<f64>()` become different machine code, each optimal for that type. This is why Rust's generics have zero runtime cost — but it means more code to compile.

**LLVM optimization.** Rust hands your code to LLVM (the same optimizer behind Clang/C++) and says: "make this fast." LLVM does inlining, loop unrolling, dead code elimination, vectorization. A 30-line Rust function might become 500 lines of optimal machine code. This takes time. A lot of time.

In PHP, none of this happens. Opcache does some light optimization. That's why `php artisan serve` feels instant — and why PHP can't match Rust's runtime performance by 10-50x.

**Rust's compile time is long because it's doing your debugging for you.** Every minute the compiler takes is approximately a bug you won't have to trace in production.

## The 3am Math 🌙

I've been paged at 3am because of:
- A `null` reference in PHP that slipped past code review
- A race condition in Node.js that only happened under load
- An integer overflow that only triggered with certain user input
- A memory leak that didn't show up in staging because staging had less data

Every one of those incidents cost more than 3 minutes. Usually 2-3 hours of groggy debugging, rollbacks, apologetic Slack messages, and the next day writing a post-mortem.

Rust's compile times are a **prepaid bill**. You pay 3 minutes now. You don't pay 3am later.

The compiler refuses to compile code with null references. It refuses to compile code with data races. It refuses to compile code with use-after-free. It will not let you ship that category of bug. Not "you probably shouldn't" — it physically cannot compile it.

Coming from a background where `is_null()` checks and `try/catch` blocks are part of defensive coding — having a compiler that simply **won't let you write the bug** feels less like restriction and more like having a very strict but extremely competent code reviewer who never sleeps.

## Tricks That Actually Help ⚡

Not all hope is lost. There are real ways to make Rust's compile times bearable.

**`cargo check` instead of `cargo build`.** This is the one I use most. It does all the type checking and borrow checking but skips the LLVM codegen step. Catches 99% of your errors in roughly half the time:

```bash
cargo check  # fast: checks your code is correct
cargo build  # slow: actually compiles to a binary
```

I have `cargo check` running on every file save via `cargo watch`. I only run `cargo build` when I actually want to run the program.

**Incremental compilation.** Rust only recompiles what changed. This is on by default. Your first build is slow. Subsequent builds — if you changed one file — are usually a few seconds. The "slow compile" problem is mostly a first-build problem.

**`cargo build --release` is even slower, and that's fine.** Debug builds are faster but unoptimized. Release builds turn on all the LLVM optimization passes. Only do release builds when you're actually releasing. During development, debug builds are fast enough.

**The linker is often the bottleneck.** On Linux, switching to `mold` (a fast parallel linker) can cut link times by 50-80%:

```toml
# .cargo/config.toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

One config file change. No code changes. Noticeably faster.

**`sccache` for shared caching.** If you're on a team or CI pipeline, `sccache` caches compiled artifacts in S3 or a shared cache. Your CI pipeline stops recompiling dependencies from scratch on every run.

## The RF/SDR Angle That Surprised Me 📡

For my RF hobby project targeting a Raspberry Pi 4, I cross-compile from my laptop — compile on the fast x86 machine, deploy the binary to the Pi.

The first time I set this up, I was nervous the compile time would be brutal. Cross-compilation plus LLVM plus a Pi target — surely this would be slow.

It was exactly as slow as native compilation. Which is to say: slow on first build, fast on incremental builds. And once I switched to `mold` as the linker? The incremental builds on my laptop are 3-4 seconds.

Here's the thing — the Pi would take *much* longer to compile the same code natively. By doing the heavy lifting on my laptop and just deploying a binary, I'm actually saving time. The compile time that felt like a penalty is, in the cross-compilation world, a feature: the powerful machine does the work, the embedded device just runs the result.

My 433 MHz sensor decoder — previously a Python script that was slow enough to miss signals — is now a Rust binary that the Pi runs with ~3% CPU usage. The compile time to get there was maybe 90 seconds total across all my iterations. My Python script had no compile time and cost me a Pi CPU core and a lot of missed readings.

## Comparing Ecosystems Honestly 🔍

| Language | Compile Time | Runtime Bugs Caught | 3am Risk |
|---|---|---|---|
| PHP | ~0s | Almost none | High |
| Node.js/TS | 5-10s | Some types | Medium |
| Go | 2-15s | Some | Low-Medium |
| Rust | 30s-3min | Almost all | Very Low |

Go is often cited as the middle ground — fast compilation, good safety. And that's fair. But Go's safety is runtime-enforced (goroutine races are caught by the race detector, not the compiler). Rust's safety is compile-time-enforced — no race detector needed because races can't compile.

Neither is universally better. Go compiles faster. Rust is safer. For web APIs, Go is probably fine. For signal processing code on embedded hardware where I can't just SSH in and restart the process — Rust's guarantee is worth the compile time.

## The Emotional Arc of Learning Rust 😅

I went through distinct phases:

**Week 1:** "Why does this take so long? PHP doesn't do this."

**Week 2:** "Oh, it's catching things I didn't know were wrong. Okay, fine."

**Month 1:** "My Rust programs don't crash. They don't have weird null bugs. They don't leak memory. This is why it compiles slowly."

**Month 3:** "I kind of trust the compiler now. If it compiles, it probably works."

**Now:** Compiling. Making tea. Returning to working code.

The compile time anxiety doesn't go away, but your relationship with it changes. You stop fighting the compiler and start working with it. The red squiggles in your IDE become guidance, not obstacles.

`cargo check` running on save means you know about problems immediately. You fix them before they compound. By the time you do `cargo build`, the code is mostly right. The "slow" build rarely surprises you.

## TL;DR: The Honest Summary 📋

1. **Yes, Rust compiles slowly** compared to PHP and Node.js. First builds can take minutes.
2. **Incremental builds are fast** — usually a few seconds after the first build.
3. **The compiler is earning that time** — monomorphization, borrow checking, LLVM optimization. It's doing more than any other language's compiler.
4. **`cargo check` is your friend** — fast type checking without full compilation.
5. **The slow compile trades against 3am pages** — you pay at compile time, not production time.
6. **Tools help** — `cargo watch`, `mold`, `sccache`, and splitting large crates reduce pain significantly.

Coming from 7 years of PHP and Node.js, I expected zero compile times and accepted runtime surprises as part of the job. Rust asked me to flip that trade. Pay upfront. Trust the compiler. Ship confidence instead of fingers crossed.

A 90-second compile time for a binary that runs flawlessly on a Raspberry Pi for weeks without crashing, leaking, or misbehaving?

That's not a tax. That's a deal. 🦀⏳

---

**Strong opinions on linker choice?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I have a spreadsheet of compile times across different setups and I'm not sorry about it.

**Watch the build happen in real time?** My [GitHub](https://github.com/kpanuragh) has the SDR project — fair warning, the CI logs show every second of the compile time and I'm proud of it.

*The compiler takes 3 minutes so your users never see a crash.* 🦀⏳
