---
title: "Rust Cargo Features: The Feature Flags That Actually Delete Code 🦀🎛️"
date: "2026-03-19"
excerpt: "In Laravel I toggled features with .env files at runtime. In Rust, you toggle features at compile time — and the disabled code literally doesn't exist in your binary. Coming from web dev, this broke my brain in the best possible way."
tags: ["rust", "systems-programming", "performance", "cargo", "optimization"]
featured: true
---

# Rust Cargo Features: The Feature Flags That Actually Delete Code 🦀🎛️

**Story time:** I once spent an afternoon debugging why a Laravel app was slow in production. Turned out a feature flag was set to `true` in `.env`, which loaded an entire service provider, which booted a whole subsystem — one nobody had used in six months. The code was right there, running, consuming memory, slowing things down, completely ignored.

In Rust, that can't happen. When a feature is disabled, the code is *gone*. Not "skipped at runtime." Gone. Not compiled. Doesn't exist in the binary. The CPU has never heard of it.

Coming from 7 years of Laravel and Node.js, Cargo features genuinely changed how I think about feature flags. Let me explain why.

## The Problem: Binaries That Carry Luggage 🧳

In PHP/Node.js land, your app ships with everything. You `composer install` or `npm install` and every dependency lands in your vendor folder, loaded (or lazily loaded) at runtime. Want to ship a "lite" version without the PDF generator? Good luck — it's sitting right there in `vendor/`.

In Rust, dependencies are compiled into your binary. If you link a crate, it's in the binary forever, adding to compile time, binary size, and attack surface. Unless you use features to make it optional.

For my RF/SDR hobby projects, this matters: I want a command-line decoder binary with zero HTTP overhead. But I also want an optional web dashboard for visualization. In PHP I'd have loaded the HTTP stack regardless. In Rust, the HTTP server literally doesn't exist unless I opt in.

## What Are Cargo Features? 🤔

Features are named flags you define in `Cargo.toml` that control which code gets compiled. Here's a minimal example:

```toml
[package]
name = "my-sdr-decoder"
version = "0.1.0"

[features]
default = []
web-dashboard = ["dep:axum", "dep:tokio"]
tui = ["dep:ratatui"]

[dependencies]
axum = { version = "0.7", optional = true }
tokio = { version = "1", optional = true, features = ["full"] }
ratatui = { version = "0.26", optional = true }
```

Notice `optional = true` on the dependencies. That means axum, tokio, and ratatui are not compiled unless someone explicitly enables the feature that requires them.

Build without the dashboard: `cargo build` — no HTTP server, no tokio runtime, nothing.

Build with the dashboard: `cargo build --features web-dashboard` — now axum and tokio are compiled in.

**The binary without `web-dashboard` is genuinely smaller and faster to compile.** The code is absent. Not disabled. Absent.

## The `#[cfg(feature = "...")]` Gate 🚪

In your Rust code, you gate feature-specific code with `cfg` attributes:

```rust
#[cfg(feature = "web-dashboard")]
mod dashboard {
    use axum::{Router, routing::get};

    pub async fn start_server() {
        let app = Router::new().route("/status", get(|| async { "decoder running" }));
        axum::serve(tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap(), app)
            .await
            .unwrap();
    }
}

fn main() {
    let decoder = Decoder::new();

    #[cfg(feature = "web-dashboard")]
    tokio::spawn(dashboard::start_server());

    decoder.run(); // always present
}
```

When `web-dashboard` is disabled, the compiler sees `#[cfg(feature = "web-dashboard")]` and treats that entire block as if it doesn't exist. It doesn't even parse it for errors. **No runtime check. No if-statement. The instruction pointer can never reach code that isn't there.**

**Coming from PHP:** This is nothing like `if (config('features.dashboard'))`. That's a runtime check — the code still loads, the condition still evaluates, and you can still accidentally call it. Rust features are enforced by the compiler before the program ever runs.

## Features Compose: The Dependency Chain 🔗

Features can enable other features. This is where it gets elegant:

```toml
[features]
default = []
web-dashboard = ["dep:axum", "dep:tokio", "logging"]
logging = ["dep:tracing", "dep:tracing-subscriber"]
tui = ["dep:ratatui", "logging"]
```

Enable `web-dashboard` and you automatically get `logging` too. Enable `tui` and you also get `logging`. The dependency graph is explicit, in your `Cargo.toml`, checked at compile time.

In Laravel, this kind of dependency would be implicit — enabling a feature silently depends on a service provider that must be registered, which depends on config being set, which someone forgot to document three years ago. Good luck debugging that.

## Real Talk: When Do Features Actually Help? 🎯

**For my SDR projects:** I have a decoder binary that can optionally spin up a web dashboard or a terminal UI. The core signal processing crate has zero HTTP, zero rendering dependencies. This makes the core library extremely portable — it compiles to ARM for my Raspberry Pi without dragging in a whole web framework.

**For library authors:** If you're writing a Rust library, features let users pay only for what they use. `serde` support optional? Put it behind a `serde` feature. JSON support? `json` feature. The user's binary doesn't carry your optional integrations unless they opt in.

**For application developers:** `default` features ship to most users. Power users enable extras with `--features`. You can even disable defaults: `cargo build --no-default-features --features minimal` for embedded targets where every kilobyte counts.

## The `default` Feature: What Ships Without Asking 📦

Whatever you list in `default` is enabled automatically:

```toml
[features]
default = ["logging"]
logging = ["dep:tracing"]
web-dashboard = ["dep:axum"]
```

Now everyone gets `logging` unless they explicitly opt out with `--no-default-features`. This is how most Rust crates ship sensible defaults while still letting you strip them for constrained environments.

**What excited me about this:** I can ship a crate where 99% of users get full features with zero configuration, but an embedded developer can strip it down to bare metal with `--no-default-features`. One codebase, multiple deployment targets, no runtime conditionals, no separate forks.

## The Security Angle 🔒

From my security hobbyist perspective: features reduce attack surface. Every dependency you link is code that could have vulnerabilities, supply chain issues, or just unexpected behaviour. With Cargo features, you can audit exactly which code lands in your binary. `cargo tree --features web-dashboard` shows the full dependency tree with that feature enabled. `cargo tree` without it shows the slimmer picture.

In PHP, `composer.lock` shows everything that's installed — you don't get a "what's actually loaded in this request path" view. In Rust, the compiler gives you a precise accounting of what exists in your binary. Security-conscious deployments can ship the minimal feature set and know exactly what attack surface they've accepted.

## A Quick Mental Model 🧠

Here's how I explain Cargo features to other web developers:

| Web Dev Concept | Cargo Features Equivalent |
|---|---|
| `.env` `FEATURE_X=true` | `--features feature-x` at build time |
| `if (config('x'))` in code | `#[cfg(feature = "x")]` — compile-time only |
| Optional npm package | `optional = true` dependency |
| Default enabled feature | Listed in `[features] default = [...]` |

The critical difference: in web dev, disabled features are still loaded, just not executed. In Rust, disabled features don't exist.

## The Gotcha: Testing All Feature Combinations 🧪

One real-world friction: if you have features, you need to test with them enabled and disabled. `cargo test` only tests with default features. You need `cargo test --features web-dashboard` and `cargo test --no-default-features` too. CI configuration gets more involved.

There's a crate called `cargo-hack` that runs commands across all feature combinations. For libraries with many features, this becomes essential. It's the trade-off: more compile-time power means more compile-time responsibility.

## The Bottom Line 🏁

Cargo features rewired how I think about optional functionality. After years of runtime feature flags that "disable" code that's still loaded and sitting in memory, the idea that disabled code literally doesn't compile felt almost too good to be true.

For my RF/SDR projects, it means I can build a portable signal-processing core, and compose it into different tools — CLI decoder, web dashboard, TUI visualizer — without any of them paying the cost of the others' dependencies.

For web developers dipping into Rust: this is one of those moments where the language hands you a capability that simply doesn't exist in interpreted runtimes. Not "we do it differently" different. Fundamentally different. The compiler is your feature flag system. And it never forgets to check.

Start with `default = []` (no defaults), add features for optional integrations, and run `cargo build --no-default-features` to see just how small your binary can get. The number will surprise you. 🦀🎛️

---

**Exploring Cargo features?** `cargo tree --features your-feature` shows the full dependency graph for a given feature set. Very useful for auditing what you're actually shipping.

**Building SDR tools or embedded Rust?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk about trimming binaries and keeping signal processing lean.

**Check out my projects:** [GitHub](https://github.com/kpanuragh) — including the RTL-SDR decoder where features keep the core library genuinely portable.

*Build only what you need. Ship only what you built.* 🦀⚡
