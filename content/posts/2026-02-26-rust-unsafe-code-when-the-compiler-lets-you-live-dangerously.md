---
title: "Rust's `unsafe`: When the Borrow Checker Lets You Live Dangerously 🦀🚨"
date: "2026-02-26"
excerpt: "Coming from PHP where literally everything is 'unsafe' by default, Rust's explicit `unsafe` keyword felt bizarre. Turns out it's the most honest thing about the whole language."
tags: ["rust", "systems-programming", "performance", "memory-safety", "security"]
featured: true
---

# Rust's `unsafe`: When the Borrow Checker Lets You Live Dangerously 🦀🚨

**Hot take:** In PHP, there is no `unsafe` keyword. There's also no `safe` keyword. There's just... code. Vibes. Hope. A vague sense that `is_null()` will save you.

Everything in PHP is effectively `unsafe` by default. You call a function, pray the types are right, and find out at 2am whether you were correct.

Coming from 7 years of Laravel/Node.js, the first time I saw `unsafe` in a Rust tutorial, my reaction was: *"Wait — the language famous for memory safety has a way to turn it off? Isn't that the whole point?"*

Yes. And no. And it's actually brilliant.

## The Context That Makes `unsafe` Make Sense 🧠

Rust's borrow checker is phenomenal. It prevents dangling pointers, data races, use-after-free bugs, and a whole class of security vulnerabilities that C/C++ programmers have suffered through for decades.

But the borrow checker has a fundamental limitation: it can only verify what it can *reason about statically at compile time*.

Some things are genuinely correct but can't be proven to the compiler. Things like:

- Calling into a C library where Rust can't see the implementation
- Dereferencing a raw pointer you got from hardware registers
- Implementing a data structure where aliasing is controlled by your logic, not by Rust's ownership rules
- Writing the inner guts of `Vec<T>` itself — where someone has to manage raw memory

Rust's answer: **declare these regions explicitly, take responsibility, carry on.**

That's `unsafe`. It's not "I give up on safety." It's "I, the programmer, am personally vouching for this small region of code, because I understand why it's correct even though the compiler can't verify it."

From my security background, this clicked immediately. It's like a signed audit trail. The bug isn't hidden — it's marked.

## What `unsafe` Actually Unlocks 🔓

Regular Rust code can't do five things. `unsafe` unblocks them:

**1. Dereference a raw pointer**

```rust
let x = 42i32;
let ptr: *const i32 = &x;

unsafe {
    println!("{}", *ptr); // dereference
}
```

Raw pointers (`*const T`, `*mut T`) don't have Rust's ownership rules. They can be null, dangling, or aliased. You can create them anywhere — but dereferencing them requires `unsafe`.

**2. Call `unsafe` functions**

Some functions are marked `unsafe` because they have preconditions the compiler can't verify:

```rust
unsafe {
    some_c_function(); // from a C library via FFI
}
```

**3. Access or modify mutable statics**

Global mutable state is inherently a data race risk in concurrent programs. Reading or writing `static mut` variables requires `unsafe`:

```rust
static mut COUNTER: u32 = 0;

unsafe {
    COUNTER += 1; // you're responsible for synchronization
}
```

**4. Implement `unsafe` traits**

Some traits (like `Send` and `Sync`) are automatically implemented by Rust. If you implement them manually, you're asserting safety properties the compiler can't check.

**5. Access union fields**

Unions are like `struct` but all fields share memory (like in C). Reading a union field is `unsafe` because Rust can't know which variant is active.

## The Philosophy That Changed My Mind 💡

Here's what I love about this from a security perspective.

In C, every line is potentially unsafe. A buffer overflow can hide anywhere. A use-after-free can lurk in innocuous-looking code. You can audit for years and still miss things.

In safe Rust, you have a mathematical guarantee: **if it compiles, there are no memory safety bugs in the safe code.** Full stop.

In Rust with `unsafe`? You have a *searchable boundary*. Want to audit a Rust codebase for potential memory issues? Search for `unsafe {`. Every risky region is explicitly marked, documented (if the team is competent), and isolated.

```bash
grep -rn "unsafe" src/
```

That's your entire attack surface. In C, your attack surface is every single line.

Coming from a security background, this felt revelatory. Rust doesn't eliminate risk — no language can do that when you need raw hardware access. But it *isolates and labels* the risk. The `unsafe` blocks in a Rust codebase are like labeled biohazard containers. You know exactly where to look.

## My SDR Project and the Raw Pointer Moment 📡

For my RF/SDR hobby projects, I process I/Q samples from a software-defined radio in real time. The data arrives as raw bytes from a C library (`librtlsdr`), and I need to convert them to Rust types for processing.

The FFI call looks like this:

```rust
extern "C" {
    fn rtlsdr_read_sync(
        dev: *mut rtlsdr_dev,
        buf: *mut u8,
        len: i32,
        n_read: *mut i32,
    ) -> i32;
}
```

To call this, I need `unsafe`. There's no way around it — I'm calling into C code, passing raw pointers, and Rust can't verify the C library's behavior.

```rust
let mut buf = vec![0u8; 131072];
let mut n_read: i32 = 0;

let result = unsafe {
    rtlsdr_read_sync(dev, buf.as_mut_ptr(), buf.len() as i32, &mut n_read)
};
```

Is this unsafe? Technically yes — if `librtlsdr` misbehaves, all bets are off. But I know what the C library does. I've read the documentation. The unsafe block is small, isolated, and clearly justified.

Everything *after* that — the signal processing, the demodulation, the output — is fully safe Rust. The `unsafe` is exactly the size it needs to be and nothing more.

## The Rules of Responsible `unsafe` ⚙️

The Rust community has converged on good practices:

**Keep unsafe blocks tiny.** An `unsafe` block should be as small as possible — just the single operation that requires it. Don't put 50 lines of code in `unsafe` when only one line needs it.

**Document *why* it's safe.** Write a comment explaining the invariants that make this correct:

```rust
// SAFETY: `ptr` is guaranteed non-null because we just called
// rtlsdr_open() and checked its return value. The buffer `buf`
// outlives this call because it's allocated in the same scope.
let result = unsafe { rtlsdr_read_sync(dev, buf.as_mut_ptr(), ...) };
```

The `// SAFETY:` comment convention is idiomatic Rust. If you're using `unsafe` without a `SAFETY:` comment, you're doing it wrong.

**Wrap unsafe in safe abstractions.** The goal is to write `unsafe` once, wrap it in a safe API, and let the rest of the codebase be fully safe:

```rust
// Only this function touches unsafe. Every caller uses the safe wrapper.
pub fn read_samples(dev: &mut Device, buf: &mut [u8]) -> Result<usize, Error> {
    let mut n_read: i32 = 0;
    // SAFETY: `buf` is valid for at least `buf.len()` bytes...
    let result = unsafe { rtlsdr_read_sync(dev.ptr, buf.as_mut_ptr(), ...) };
    // ...handle result, return safely
}
```

The standard library does this constantly. `Vec<T>` internally uses `unsafe` for raw memory management, but every public method on `Vec` is safe. You've been using `unsafe` Rust code your entire Rust career — you just didn't see it because it was wrapped in safe abstractions.

## The PHP Comparison That Breaks My Brain 🤯

In PHP:

```php
$data = json_decode($input); // might be null
$value = $data->field;       // might crash if null
```

This is perfectly valid PHP. The runtime will crash (or return `null` silently, which is arguably worse). There's no marking, no warning, no `unsafe` block. The danger is invisible.

In Rust, even the "unsafe" code is safer than normal PHP:
- The unsafe region is explicitly marked
- The scope of the risk is known
- The compiler catches every other issue outside that block
- The `SAFETY:` comment documents why it's correct

I used to write PHP where *every line* could crash from unexpected null. Now I write Rust where I have one `unsafe` block per external library call, documented, tested, and isolated.

The irony is that my Rust code with `unsafe` blocks is dramatically safer than my PHP code without them.

## When Should You Actually Use `unsafe`? 🤔

In most application-level Rust code: almost never.

The common cases:
- **FFI** — calling C libraries (like I do with `librtlsdr`). No choice.
- **Embedded** — reading/writing hardware registers directly. No choice.
- **Performance-critical hot paths** — very rarely, and only after profiling proves it's needed.
- **Implementing data structures** — `Vec`, `HashMap`, etc. Their internals use `unsafe`. You almost certainly won't write new ones.

If you're building a web API with Axum, writing a CLI tool with Clap, or processing files — you may never write a single `unsafe` block. The standard library and popular crates have already done that work for you.

The existence of `unsafe` isn't an invitation to use it everywhere. It's an escape hatch for when you genuinely need low-level control.

## The Mental Shift That Matters 🧠

Coming from PHP and Node.js, I thought "unsafe" was a red flag — a sign that something was wrong. A last resort. An admission of failure.

In Rust, `unsafe` is something different: it's an honest acknowledgment of where the contract between programmer and compiler changes. Outside `unsafe`, the compiler is responsible for correctness. Inside `unsafe`, you are.

That contract is clearly written. It's searchable. It's auditable.

Every large Rust codebase has some `unsafe`. The Rust standard library itself is full of it. The question isn't whether `unsafe` exists — it's whether the unsafe regions are small, justified, documented, and wrapped in safe abstractions.

After 7 years of PHP where the entire codebase was implicit `unsafe`, the idea of explicit, minimal, documented `unsafe` feels less like danger and more like engineering.

## TL;DR: The Honest Summary 📋

1. **`unsafe` isn't the opposite of Rust's safety** — it's a tool for the cases where safety can't be proven statically
2. **It unlocks five specific things**: raw pointer dereference, unsafe function calls, mutable statics, unsafe trait impls, union field access
3. **From a security perspective, it's brilliant**: every dangerous region is explicitly labeled and searchable
4. **Keep unsafe blocks tiny** and document them with `// SAFETY:` comments
5. **Wrap unsafe in safe abstractions** — write `unsafe` once, expose a safe API
6. **In app-level Rust, you'll rarely write it** — library authors handle the hard parts
7. **It's more honest than PHP** — which is all "unsafe" with no labels at all

Coming from a world where PHP crashes happen silently and Node.js memory leaks hide for weeks — having a language that forces you to be *explicit* about the dangerous bits is a feature, not a limitation.

The `unsafe` keyword is Rust saying: "I trust you with this, but I'm going to make sure you meant it." 🦀🚨

---

**Wrestling with FFI in your Rust project?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — my RTL-SDR Rust wrapper has more `unsafe` blocks than I'm proud of and I'm happy to compare notes.

**Want to see the actual SDR code?** My [GitHub](https://github.com/kpanuragh) has the project — search for `unsafe` in the source, read the `SAFETY:` comments, and judge me accordingly.

*Explicit danger beats invisible danger every single time.* 🦀🚨
