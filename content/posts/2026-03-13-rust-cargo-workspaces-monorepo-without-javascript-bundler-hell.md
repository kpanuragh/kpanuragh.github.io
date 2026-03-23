---
title: "Rust Cargo Workspaces: Monorepo Without the JavaScript Bundler Hell 🦀📦"
date: "2026-03-13"
excerpt: "I've spent years configuring Turborepo, Nx, and Lerna just to share one utility function between two Node.js packages. Then I tried Rust's cargo workspaces. It just... worked. No config files. No plugins. No three-hour debugging session. Let me show you why."
tags: ["\"rust\"", "\"systems-programming\"", "\"performance\"", "\"cargo\"", "\"monorepo\""]
featured: "true"
---

# Rust Cargo Workspaces: Monorepo Without the JavaScript Bundler Hell 🦀📦

I want to tell you about the thing that genuinely broke my brain — in a good way.

Coming from 7 years of Laravel/Node.js, I've been through every monorepo tool the JavaScript ecosystem has thrown at us. Lerna. Yarn Workspaces. Nx. Turborepo. pnpm workspaces. Each one promises to be the last one you'll ever need to configure. Each one lies.

I once spent an entire afternoon getting two Node.js packages to share a single TypeScript utility function. By the end of it I had three config files, a custom `tsconfig.json` with path aliases, a build step that ran before the build step, and a deep sense that I had taken a wrong turn somewhere in my career.

Then I tried **Rust cargo workspaces**. It took me about four minutes to set up. I'm not exaggerating. 🦀

## What Even Is a Workspace? 🤔

In Rust, a project is called a **crate**. When you have multiple related crates — say, a library, a CLI tool that uses that library, and a server that also uses that library — you could keep them as totally separate projects. But that means duplicating dependencies, managing separate `Cargo.lock` files, and constantly bumping versions whenever your shared library changes.

A workspace is just a way to tell Cargo: "hey, all these crates belong together." One `Cargo.lock` file. Shared dependency versions. Build them all with one command.

It's the monorepo dream, except nobody had to write a blog post called "How We Scaled Our Turborepo Configuration to 47 Packages."

## The Setup That Doesn't Make You Want to Quit 🛠️

Here's a real workspace structure — the kind I use for my SDR/RF hobby projects where I have a shared signal processing library, a CLI tool to capture signals, and a web API to visualize them:

```
my-sdr-project/
├── Cargo.toml          ← the workspace root
├── Cargo.lock          ← ONE lock file for everything
├── signal-lib/         ← shared library crate
│   ├── Cargo.toml
│   └── src/lib.rs
├── capture-cli/        ← CLI tool
│   ├── Cargo.toml
│   └── src/main.rs
└── viz-api/            ← web API
    ├── Cargo.toml
    └── src/main.rs
```

The workspace root `Cargo.toml` looks like this:

```toml
[workspace]
members = [
    "signal-lib",
    "capture-cli",
    "viz-api",
]
resolver = "2"
```

That's it. That's the entire workspace config. No plugins. No scripts. No separate tool to install. Just four lines of TOML. 🎉

## Sharing Code Between Crates 📡

Now comes the part that would require three config files in JavaScript land. In `capture-cli/Cargo.toml`, to use the shared library:

```toml
[dependencies]
signal-lib = { path = "../signal-lib" }
```

One line. Cargo knows it's a local path. It handles the build order automatically — `signal-lib` gets compiled first, then `capture-cli`. No build scripts. No `tsc --watch` in another terminal. No circular dependency warnings that send you to Stack Overflow.

And in `capture-cli/src/main.rs`:

```rust
use signal_lib::decode_fm;

fn main() {
    let signal = decode_fm(my_raw_iq_data);
    println!("Decoded: {:?}", signal);
}
```

Just works. The compiler figures out the dependency graph. You can focus on the actual problem instead of the tooling. 🧘

## The Dependency Sharing Magic ⚡

Here's where Rust workspaces become genuinely impressive. When multiple crates in your workspace depend on the same external package — say, `serde` for JSON serialization — Cargo uses **one shared version** across the whole workspace.

In JavaScript monorepo land, this is a solved problem, but one that required `peerDependencies`, hoisting configs, and occasionally yelling at your `node_modules` folder. In Cargo, it just happens. Every crate in the workspace shares the same `Cargo.lock`. If `signal-lib` and `viz-api` both use `serde`, they get the same compiled version. No duplication. No conflicts. No mysterious "two copies of lodash" situation.

You can also define workspace-level dependency versions so you don't repeat yourself:

```toml
# Root Cargo.toml
[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
```

Then in each member crate, you just inherit:

```toml
# capture-cli/Cargo.toml
[dependencies]
serde.workspace = true
tokio.workspace = true
```

Change the version in one place, all crates update. The PHP developer in me is thinking "this is what Composer does but without the drama." 🐘

## Building, Testing, and Running Everything 🚀

From the workspace root, a single command builds every crate:

```bash
cargo build --workspace
```

A single command runs every test across every crate:

```bash
cargo test --workspace
```

Want to run just one specific crate?

```bash
cargo run -p capture-cli
```

Coming from the JavaScript world where "run all tests" might mean a Makefile that calls `cd` into each directory, or a monorepo tool that needs a cache layer to not take 10 minutes — this feels almost offensive in its simplicity.

## What Excited Me About This (The Real Talk) 🔥

For my RF/SDR hobby projects, I needed a clean way to share signal processing code between:

1. A **library** for IQ sample processing and FM demodulation
2. A **CLI** for capturing and decoding live signals from an RTL-SDR dongle
3. An **API server** for streaming decoded data to a web dashboard

In Node.js, I'd been dealing with shared TypeScript config, path aliasing, `tsc -p tsconfig.build.json` vs `tsc -p tsconfig.json`, and the occasional fun afternoon where one package's type definitions didn't match the other's because we'd bumped a version in only one place.

In Rust, the workspace handles all of that. I added my new crate to the `members` array, pointed its `Cargo.toml` at the shared lib, and the compiler took care of the rest. My SDR decoder talks to my web server through the same Rust types. No JSON schema drift. No "wait, the API crate is on `signal-lib` v0.3.1 but capture-cli is on v0.3.0" conversations with myself at midnight.

The compiler just... keeps everything honest. 🦀

## The Security Angle: One Lock File to Rule Them All 🔒

Coming from a security perspective, one thing that genuinely worries me about large JavaScript monorepos is supply chain security. When each package has its own `package-lock.json`, you can end up with the same package at five different versions across your repo — and auditing for vulnerabilities requires checking all of them.

A Rust workspace has **one `Cargo.lock`**. One file. One place to look. One `cargo audit` run to check every single dependency used by every crate in your project. This is a meaningful security improvement, not just a convenience feature.

`cargo audit` against a workspace gives you a complete picture instantly. No extra tooling. No `npm audit --workspaces` with its various quirks. Just `cargo audit` and you're done.

## The Comparison That Breaks Laravel Dev Brains 🐘 vs 🦀

If you're coming from Laravel, think of it this way: a Cargo workspace is like having multiple Laravel packages in one repository, except Composer automatically resolves their shared dependencies, you can test all packages with a single PHPUnit command, and nobody wrote a Medium article about "How We Migrated from Lerna to Our Custom Workspace Solution at Scale."

The Rust ecosystem's secret is that Cargo was designed to handle this from day one. It's not a third-party tool bolted on. It's not a convention that grew organically. It's just... how Rust does multi-crate projects. And it's delightful.

## TL;DR 🏁

If you're building anything non-trivial in Rust — a CLI plus a library, a server plus shared types, an SDR pipeline with multiple consumers — cargo workspaces are your answer.

- **One `Cargo.toml` at the root** with a `[workspace]` section and a list of member crates
- **One `Cargo.lock`** shared across everything — no version drift, clean security audits
- **Shared dependencies** declared once at the workspace level, inherited by each crate
- **Build/test everything** from the root with `cargo build --workspace` and `cargo test --workspace`
- **Zero extra tooling** — this is built into Cargo, which is built into Rust

I've spent more combined hours on JavaScript monorepo tooling than I care to admit. Cargo workspaces took four minutes. That time difference is not small. That time difference is *my weekend*.

Coming from 7 years of Laravel and Node.js, I expected to spend a day fighting Rust's workspace setup. Instead I spent that day writing actual signal processing code. That's the right way for it to go. 📡

---

**Running a Cargo workspace for your own projects?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to talk about project structure and workspace setups.

**SDR or multi-crate Rust projects?** Check out [GitHub](https://github.com/kpanuragh) — I share my RF hobby project structures there.

*Now go delete your `turbo.json`. You don't need it anymore. 🦀📦✨*
