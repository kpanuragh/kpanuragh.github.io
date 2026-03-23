---
title: "Rust's `tracing` Crate: Stop Using println! in Production 🦀📋"
date: "2026-03-10"
excerpt: "Coming from 7 years of Laravel's Monolog and Node.js's Winston, I thought I knew logging. Then Rust's tracing crate showed me what structured, async-aware, zero-overhead observability actually looks like. Spoiler: println! is not a logging strategy!"
tags: ["\\\"rust\\\"", "\\\"systems-programming\\\"", "\\\"observability\\\"", "\\\"logging\\\"", "\\\"debugging\\\""]
featured: "true"
---

# Rust's `tracing` Crate: Stop Using println! in Production 🦀📋

**Confession:** When I first started writing Rust, my debugging strategy was `println!("HERE 1")`, `println!("HERE 2")`, `println!("got here: {:?}", value)`.

I called it "systematic logging." My colleagues called it "production archaeology." We were both right. 😅

Coming from 7 years of Laravel and Node.js, I'd used proper logging tools — Monolog, Winston, Pino. But somehow, in the excitement of learning Rust, I regressed to caveman debugging: me smash keyboard, me print things.

Then I discovered the `tracing` crate. And everything changed. 🔥

## The Problem With println! (And Even log!) 🚨

Before we dive into `tracing`, let's talk about why your current approach probably isn't good enough.

### The println! Problem

```rust
// Your production code, apparently
fn process_packet(data: &[u8]) -> Result<Signal, Error> {
    println!("processing packet...");
    println!("data length: {}", data.len());

    let signal = decode(data)?;
    println!("decoded: {:?}", signal);

    Ok(signal)
}
```

**Problems:**
- No timestamps (when did this happen?)
- No log levels (info? error? debug? who knows!)
- No structure (good luck parsing this with Elasticsearch)
- No async context (which request triggered this in a tokio server?)
- **Always prints** (enjoy your production log spam!)
- Performance overhead in the hot path

### The `log` Crate — Better, But...

The `log` crate is the old standard:

```rust
use log::{info, warn, error};

info!("processing packet, length={}", data.len());
warn!("signal strength low: {}", strength);
error!("decode failed: {}", err);
```

Better! But `log` was designed for synchronous, single-threaded code. In async Rust with Tokio handling thousands of concurrent connections? It loses all context. Which request caused that error? Which connection dropped? `log` shrugs. 🤷

**What excited me about `tracing`:** It was built from the ground up for async Rust. It knows about tasks, spans, and structured context. It's what logging should have been all along!

## Enter `tracing`: Observability Done Right ✨

The `tracing` crate introduces two key concepts: **spans** and **events**.

- **Events** = things that happened (like log messages)
- **Spans** = periods of time with context (like request handling)

Think of it this way: a span is like a named section of your code with a clock running. Events happen *inside* spans. When you're handling 1000 concurrent HTTP requests, each request gets its own span, and all events inside it carry that context automatically.

**In Cargo.toml:**
```toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

### Basic Usage That's Already Better Than println!

```rust
use tracing::{info, warn, error, debug, instrument};

fn process_packet(data: &[u8]) -> Result<Signal, Error> {
    info!(
        data_len = data.len(),
        "processing incoming packet"
    );

    let signal = decode(data).map_err(|e| {
        error!(error = %e, "packet decode failed");
        e
    })?;

    debug!(
        frequency = signal.frequency,
        amplitude = signal.amplitude,
        "decoded signal"
    );

    Ok(signal)
}
```

**What's different:**
- Structured key-value pairs (`data_len = data.len()`)
- Log levels built in (`info!`, `debug!`, `error!`)
- Machine-parseable output
- Zero overhead when the level is disabled

But that's just the beginning. 🚀

## The `#[instrument]` Macro: Automatic Spans 🎯

This is where `tracing` becomes genuinely magical. The `#[instrument]` attribute automatically creates a span around your function and records its arguments:

```rust
use tracing::instrument;

#[instrument]
async fn handle_request(user_id: u64, endpoint: &str) -> Result<Response, Error> {
    // Everything in here automatically has context:
    // - function name (handle_request)
    // - user_id
    // - endpoint

    info!("handling request");  // Automatically gets span context!

    let data = fetch_from_db(user_id).await?;

    info!(rows = data.len(), "fetched data");

    Ok(build_response(data))
}
```

**Without `tracing`:**
```
[INFO] handling request
[INFO] fetched data: 42 rows
[ERROR] something went wrong
```
*Which request? Which user? Which endpoint? A mystery!* 🔍

**With `tracing`:**
```
[INFO] handle_request{user_id=1337 endpoint="/api/signals"}: handling request
[INFO] handle_request{user_id=1337 endpoint="/api/signals"}: fetched data rows=42
[ERROR] handle_request{user_id=1337 endpoint="/api/signals"}: something went wrong
```

Now you know EXACTLY which request, user, and endpoint caused the error. Across thousands of concurrent async requests. **Automatically.** 🤯

**Coming from Laravel:** Remember how you'd add `Log::withContext(['user_id' => $userId])` everywhere and it still got lost across middleware? `tracing` does this at the language level, not the application level.

## For My RF/SDR Projects: Context Across Signal Pipelines 📡

This is where `tracing` genuinely changed my workflow. For my SDR signal processing, I have pipelines:

```
IQ samples → demodulate → decode → parse packet → classify
```

With `println!`, when something went wrong mid-pipeline, I had no idea at which stage or with which sample batch. With `tracing`:

```rust
#[instrument(skip(samples), fields(sample_count = samples.len()))]
fn process_iq_batch(samples: &[Complex<f32>], center_freq: u64) -> Vec<Packet> {
    debug!("starting IQ processing");

    let demod = demodulate(samples);
    debug!(demod_len = demod.len(), "demodulation complete");

    let decoded: Vec<Packet> = demod
        .chunks(FRAME_SIZE)
        .filter_map(|frame| {
            decode_frame(frame).map_err(|e| {
                warn!(error = %e, "frame decode failed, skipping");
            }).ok()
        })
        .collect();

    info!(
        packets = decoded.len(),
        center_freq = center_freq,
        "batch complete"
    );

    decoded
}
```

Now when a packet fails to decode, I see exactly which batch (by sample count and center frequency), at which stage, with what error. My SDR debugging time dropped dramatically. 📉

## Subscribers: Where Your Logs Actually Go 🔌

`tracing` is cleverly split: the crate itself just generates events. **Subscribers** decide what to do with them. This separation means you can swap output formats without changing your code.

### Pretty Console Output (Development)

```rust
fn main() {
    tracing_subscriber::fmt()
        .pretty()
        .with_env_filter("my_app=debug,warn")
        .init();

    // Now all your tracing calls go to pretty console output
}
```

Output:
```
  2026-03-10T12:34:56Z  INFO my_app::server: server started addr=0.0.0.0:8080
  2026-03-10T12:34:57Z  INFO my_app::handler handle_request{user_id=42}: handling request
  2026-03-10T12:34:57Z DEBUG my_app::db: query executed rows=5 duration=2ms
```

### JSON Output (Production / Log Aggregators)

```rust
fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(EnvFilter::from_default_env())
        .init();
}
```

Output (Elasticsearch/Datadog ready!):
```json
{"timestamp":"2026-03-10T12:34:56Z","level":"INFO","message":"handling request","user_id":42,"endpoint":"/api/signals","span":"handle_request"}
```

**Coming from Node.js:** This is exactly what Pino gives you — structured JSON logging. But built into the language ecosystem, with async context propagation that Pino can't match!

### Environment-Based Filtering

```bash
# Only show errors in production
RUST_LOG=error cargo run --release

# Debug your specific module, warn everything else
RUST_LOG=my_app::signal_processor=debug,warn cargo run

# See everything (brace yourself)
RUST_LOG=trace cargo run
```

No code changes needed. Just an environment variable. Just like Laravel's `LOG_LEVEL`. ✅

## Performance: Zero Cost When Disabled ⚡

Here's the killer feature that makes `tracing` systems-programming worthy.

```rust
debug!(
    frequency = signal.frequency,
    snr = signal.snr,
    "signal quality check"
);
```

When `debug` level is disabled, this entire statement compiles to **nothing**. Not "checks a flag and skips." Literally zero assembly instructions. The compiler eliminates it entirely.

**For my SDR signal processing**, where I'm processing millions of IQ samples per second, this matters enormously. I can litter my signal processing code with detailed debug instrumentation. In release mode with `RUST_LOG=info`, those debug calls simply don't exist at runtime.

**Compare with PHP:**
```php
// Monolog always evaluates arguments, even if log level is disabled!
Log::debug('signal quality: ' . json_encode($signal));
// json_encode() runs even when debug logging is off! 😬
```

Rust's `tracing`: the argument expressions aren't even evaluated if the level is disabled. That's what "zero cost" means.

## Spans: Making Async Code Debuggable 🔄

The real superpower is how spans work across async `.await` points:

```rust
#[instrument]
async fn fetch_signal_data(station_id: u32) -> Result<SignalData, Error> {
    info!("fetching signal data");

    // Even though this suspends and other tasks run,
    // when we resume, the span context is still here!
    let raw = http_client.get(station_endpoint(station_id)).await?;

    info!(bytes = raw.len(), "received raw data");

    let parsed = parse_signal_data(&raw)?;

    Ok(parsed)
}
```

When a thousand instances of this function run concurrently, each `.await` suspension and resumption correctly restores the span context. No mixing up which station's data is which. The async runtime handles this automatically.

**This is why `log` isn't enough for async Rust.** `log` has no concept of async tasks or span context. `tracing` was designed for exactly this world.

## Real-World Setup: What I Actually Use 🛠️

```toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
```

```rust
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn init_logging() {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().json())
        .init();
}

fn main() {
    init_logging();

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        "application started"
    );

    // your app
}
```

Clean, production-ready, JSON structured, env-configurable. Done. ✅

## The Debugging Mindset Shift 🧠

Coming from Laravel/Node.js web backgrounds, we think of logging as "print interesting things to a file." `tracing` shifts the mental model to "annotate your code with observable context."

The difference:
- **Old:** add log lines when something goes wrong
- **New:** annotate your functions with `#[instrument]` always, and the context appears automatically

It's the difference between writing `console.log()` in every function vs having OpenTelemetry traces for free.

**What excited me most:** The same `tracing` instrumentation works for both debugging locally AND production observability (Jaeger, Honeycomb, Datadog). You write it once, pipe it different places depending on environment.

## TL;DR: Why `tracing` Is a Big Deal 🏁

After 7 years of Laravel (Monolog) and Node.js (Winston/Pino), `tracing` is the first logging solution I've used that was designed for how modern async, concurrent applications actually work.

**The key wins:**
- `#[instrument]` gives you automatic spans with zero boilerplate
- Async context propagates correctly across `.await` — log knows which request triggered what
- Zero-cost when disabled — no runtime overhead in release builds
- Structured key-value pairs — Elasticsearch/Datadog ready from day one
- One crate, swap subscribers — same code, different outputs per environment

**My advice:** Add `tracing` from day one. Slap `#[instrument]` on any function you might ever want to debug. The cost is zero in production. The benefit when something breaks at 2am is immeasurable.

And yes, you can still use `println!` for your scripts and toy projects. I won't judge.

(I'll just know. 👀)

---

**Ready to ditch `println!` for good?** Check out the [tracing docs](https://docs.rs/tracing) — the examples are excellent.

**Building something observable?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk Rust observability and SDR debugging!

**See `tracing` in my RF projects:** [GitHub](https://github.com/kpanuragh) — real-world structured logging in signal processing code!

*Now go `#[instrument]` your functions and stop flying blind!* 🦀📋✨
