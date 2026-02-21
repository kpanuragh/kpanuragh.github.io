---
title: "Rust Axum: I Built a REST API Without Losing My Mind (Much) 🦀🌐"
date: "2026-02-21"
excerpt: "Coming from 7 years of Laravel where `Route::get()` is two words and a prayer, I discovered Axum — Rust's web framework that's shockingly familiar and absolutely terrifyingly fast."
tags: ["rust", "systems-programming", "performance", "axum", "web-development"]
featured: true
---

# Rust Axum: I Built a REST API Without Losing My Mind (Much) 🦀🌐

**Confession:** I thought building a web API in Rust would feel like performing surgery with oven mitts.

I was wrong. Mostly. The compiler still yells at you. But in a *loving* way.

Coming from 7 years of Laravel and Node.js, I've been spoiled. Laravel gives you routing, validation, authentication, a majestic ORM, artisan commands, and free therapy in the form of readable error messages. Node.js gives you `npm install express` and you're somehow shipping code 10 minutes later.

So when I decided to build a lightweight HTTP API for my RF/SDR hobby project — I needed something to expose decoded radio signals over a REST endpoint — I went looking for the Rust equivalent of Express. I found **Axum**. And it was... actually kind of great?

## What Even Is Axum? 🤔

Axum is a web framework built by the Tokio team (the same people behind Rust's async runtime you might have met if you've been following this series). It's opinionated about a few things and completely hands-off about others.

If Express.js and Laravel had a systems-programming baby with a PhD in type safety, you'd get Axum.

It's fast — like, embarrassingly fast. We're talking benchmarks where it handles **hundreds of thousands of requests per second** on a single machine. Your Laravel app running on a shared DigitalOcean droplet is giving Axum the side-eye right now.

## Setting Up: Cargo Is Still My Hero 📦

```toml
# Cargo.toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

That's it. No `composer.json` with 40 nested dependencies. No `package.json` with 800MB of `node_modules`. Just four lines and `cargo build` does the rest.

**Coming from PHP:** yes, Cargo actually resolves and locks dependencies correctly on the first try. I know. I was suspicious too.

## Your First Route: Shockingly Familiar 🛣️

```rust
use axum::{routing::get, Router};

async fn hello() -> &'static str {
    "Hello from Rust! 🦀"
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(hello));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();
}
```

Compare that to Laravel:

```php
Route::get('/', fn() => 'Hello from PHP! 🐘');
```

Okay, Laravel is more concise. But notice what's happening in Rust: it's not magic. You can see the TCP listener. You can see the async runtime. Everything is explicit. Coming from a background where Laravel hides a lot behind facades and service containers, I actually found this refreshing — even if my fingers were typing more.

## JSON Responses: Serde Is Your Best Friend 🔄

The real test of any web framework is JSON in, JSON out. Here's where Axum shines:

```rust
use axum::{routing::get, Json, Router};
use serde::Serialize;

#[derive(Serialize)]
struct Signal {
    frequency: f64,
    strength: f32,
    decoded: String,
}

async fn get_signal() -> Json<Signal> {
    Json(Signal {
        frequency: 433.92,
        strength: -65.4,
        decoded: "Garage door opener detected 🚪".to_string(),
    })
}
```

The `#[derive(Serialize)]` macro tells Rust how to convert your struct to JSON automatically. No `json_encode()`. No `res.json()`. Just annotate your struct and return it. The type system guarantees your response is always valid JSON — the compiler won't let you return something that can't be serialized.

**What excited me about this:** in Laravel, I can accidentally return non-serializable objects in API Resources and only find out in production. In Axum? That's a compile error. Your CI pipeline catches it, not your users.

## Route Parameters: Extractors Are Elegant 🎯

This is where Axum gets clever. Instead of passing a `Request` object everywhere (hello, Express), Axum uses **extractors** — typed function parameters that the framework fills in automatically.

```rust
use axum::{extract::Path, routing::get, Json, Router};

async fn get_station(Path(station_id): Path<u32>) -> Json<serde_json::Value> {
    // station_id is already a u32 — no parsing, no "did they send a string?" panic
    Json(serde_json::json!({
        "station": station_id,
        "status": "monitoring"
    }))
}

let app = Router::new()
    .route("/stations/:id", get(get_station));
```

Coming from Laravel's route model binding, this felt familiar. The framework handles the parsing. But unlike Laravel, if someone sends `GET /stations/abc`, Rust rejects it at the type level — the handler never even runs. `u32` doesn't accept "abc". No custom validation rule needed. The type IS the validation.

## Shared State: No More Global Facades 🏗️

This was the biggest mental shift for me. Laravel has its service container. Node.js has module-level globals. Axum makes you be explicit about shared state — which sounds annoying until you realize it means no mysterious "why is this singleton behaving weirdly in tests" bugs.

```rust
use axum::{extract::State, routing::get, Router};
use std::sync::Arc;

// Your shared "application state"
struct AppState {
    active_frequencies: Vec<f64>,
    api_key: String,
}

async fn list_frequencies(State(state): State<Arc<AppState>>) -> String {
    format!("Monitoring {} frequencies", state.active_frequencies.len())
}

let state = Arc::new(AppState {
    active_frequencies: vec![433.92, 868.0, 915.0],
    api_key: "secret".to_string(),
});

let app = Router::new()
    .route("/frequencies", get(list_frequencies))
    .with_state(state);
```

`Arc` is Rust's reference-counted pointer for sharing data across threads. You pass state in once, and every handler that needs it just declares it in its parameters. Thread-safe by default. No `Singleton::getInstance()` prayer required.

## The Performance Number That Made Me Choke On My Coffee ☕

I built a tiny signal-reporting API. Same logic, two implementations:

- **Laravel (PHP 8.3, FPM):** ~800 requests/second on my dev machine
- **Axum (Rust):** ~120,000 requests/second on the same machine

That's not a benchmark artifact. That's the difference between "interpreted language with a request lifecycle" and "compiled binary that talks directly to your OS's networking stack."

For my SDR project — where I want to push decoded packet data to a dashboard in near-real-time — Axum means I can serve hundreds of concurrent WebSocket connections on a Raspberry Pi without breaking a sweat. The Pi that previously struggled to run PHP-FPM.

## What's Still Harder Than Laravel 😤

Look, I'm not going to pretend Axum replaces Laravel for building a full web app. Some things are still genuinely painful:

- **No built-in ORM.** You need `sqlx` or `diesel`. Both are excellent. Neither is Eloquent.
- **No authentication scaffolding.** Building JWT middleware from scratch taught me more about security than anything else, but it's not a 30-second job.
- **Error messages are improving but still dense.** When the compiler rejects your handler signature, the error can span 40 lines. You learn to love it, eventually.

**But here's the thing:** for APIs where performance matters — real-time data, high-concurrency endpoints, edge deployments — Axum makes the hard parts worth it. The compile-time guarantees mean my signal processing API has been running for weeks without a single panic or null pointer crash.

## The RF/SDR Use Case That Sold Me 📡

My actual use case: I have a Raspberry Pi 4 running an RTL-SDR dongle, monitoring ISM-band wireless sensors around my house. I needed an API to expose the decoded data to a dashboard.

In Laravel, I'd need PHP-FPM, a queue worker for real-time processing, Redis for buffering, and probably a WebSocket server like Pusher or Soketi. That's four processes, two paid services, and a deployment that makes me nervous.

In Axum with Tokio channels (from the previous post in this series!), it's **one binary**. The SDR reader, the decoder, the HTTP server — one compiled program. No services to manage. No memory leaks in the PHP process that require weekly restarts. No npm audit warnings.

It fits on a Pi. It's fast enough to not miss a packet. It crashes approximately never.

That's the promise of systems programming that web development has been quietly whispering about for years.

## TL;DR: Should You Try Axum? 📋

1. **If you're building a performance-critical API** — yes, absolutely, start here.
2. **If you need rapid prototyping and an ORM** — stick with Laravel or Express for now, revisit Axum when you need speed.
3. **Extractors are the killer feature** — typed parameters that eliminate an entire class of runtime bugs.
4. **Explicit state is annoying until it saves you** — no mysterious global state bugs in production.
5. **The learning curve is real but finite** — after a week, the patterns click and you stop fighting the compiler.

Coming from 7 years of Laravel, I thought Rust web development would feel alien. Axum is the framework that proved me wrong. The patterns — routing, handlers, middleware, state — are recognizable. What's different is the layer of compile-time guarantees underneath them.

And for a hobby project where I'm decoding radio signals on a Raspberry Pi at 2am, those guarantees matter more than "fast to write." I want it to be fast to **run**. 🦀📡

---

**Building REST APIs in Rust?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm probably comparing Axum route handler signatures to Laravel middleware chains and finding them weirdly similar.

**Curious about the SDR-to-API pipeline?** Check out my [GitHub](https://github.com/kpanuragh) for hobby projects where Axum serves real decoded radio packets.

*Your types are your validation. Your compiler is your test suite.* 🦀🌐
