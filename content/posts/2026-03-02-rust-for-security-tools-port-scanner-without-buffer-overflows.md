---
title: "Rust for Security Tools: Building a Port Scanner That Won't Segfault 🦀🔍"
date: "2026-03-02"
excerpt: "Coming from 7 years of PHP and Node.js, I never thought I'd write a network security tool. Then Rust made it not just possible, but actually safe. Here's what happened when a web dev tried to build their own port scanner!"
tags: ["rust", "systems-programming", "security", "networking", "performance"]
featured: true
---

# Rust for Security Tools: Building a Port Scanner That Won't Segfault 🦀🔍

**True story:** I found a port scanner written in C on GitHub with 2,000 stars. I read the code for 10 minutes, found a buffer overflow on line 47, and gently closed my laptop. That was the day I decided to write my own in Rust.

Coming from 7 years of Laravel and Node.js, "security tool" always meant something you USED, not something you WROTE. Port scanners? That's C territory. Packet sniffers? C again. Raw sockets? Definitely not PHP!

But here's the thing — for my RF/SDR hobby projects, I needed to quickly scan networks to find which devices were broadcasting on certain ports. Python was too slow. C scared me. Then I remembered I'd been dabbling in Rust, and thought... why not?

Spoiler: it worked, it was fast, and nothing segfaulted. 🎉

## Why Web Devs Don't Build Security Tools (But Should) 🤔

In PHP-land, we think of security as "protecting" our apps. Rate limiting, JWT tokens, SQL injection prevention — all defense. We rarely think about the offensive side: scanning, probing, analyzing networks.

But security tools and web code have a LOT in common:
- Both make network connections
- Both parse responses
- Both need to handle timeouts and errors gracefully

The difference? Security tools need to do this **fast** and **at scale**. Scanning 65,535 ports on 256 hosts while managing thousands of concurrent connections? PHP will have a coffee break. Node.js will get there eventually. Rust? Rust was born for this.

## The PHP/Node.js Way vs The Rust Way 🔄

Here's a naive port check in PHP:

```php
// PHP: One port at a time. Pray for patience.
$socket = @fsockopen("192.168.1.1", 80, $errno, $errstr, 0.5);
if ($socket) {
    echo "Port 80 is open";
    fclose($socket);
}
// Want to check 1000 ports? Run this 1000 times. Good luck!
```

Now here's the Rust approach that actually scales:

```rust
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

async fn check_port(host: &str, port: u16) -> bool {
    let addr = format!("{}:{}", host, port);
    timeout(Duration::from_millis(500), TcpStream::connect(&addr))
        .await
        .is_ok_and(|r| r.is_ok())
}
```

That's it. One clean function. And with Tokio's async runtime, you can fire off **thousands of these concurrently** without spinning up threads. My laptop scanned a local /24 network in under 3 seconds. The PHP version? I stopped it at 8 minutes.

## What Excited Me About Rust for Security Tools ⚡

When I started writing network tools, I immediately saw why C and C++ dominate this space — and why they're also DANGEROUS.

In C, you're one `strcpy()` away from a buffer overflow. In C++, one dangling pointer from undefined behavior. Famous security tools like nmap, Wireshark, and tcpdump have CVE histories longer than my arm.

**Rust changes this completely.** The borrow checker that used to drive me crazy? In security tool land, it's a SUPERPOWER:

```rust
// Rust won't let you do this:
let buffer = vec![0u8; 64];
let offset: usize = user_supplied_input; // Could be anything!
let value = buffer[offset]; // 💥 INDEX OUT OF BOUNDS - Rust panics safely
                             // In C, this is a buffer overread vulnerability
```

No buffer overflows. No use-after-free. No dangling pointers. The compiler catches entire *classes* of security vulnerabilities **before you even run the program**.

For my SDR projects, I found myself parsing binary protocols from radio signals — exactly the kind of code that kills C programs. In Rust, I sleep soundly.

## Building Something Real: A Minimal Port Scanner 🛠️

Here's a trimmed version of what I actually run for my home lab:

```rust
use futures::stream::{self, StreamExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

#[tokio::main]
async fn main() {
    let target = "192.168.1.1";
    let ports: Vec<u16> = (1..=1024).collect();

    let results = stream::iter(ports)
        .map(|port| async move {
            let open = check_port(target, port).await;
            (port, open)
        })
        .buffer_unordered(500) // 500 concurrent checks!
        .filter(|(_, open)| futures::future::ready(*open))
        .collect::<Vec<_>>()
        .await;

    for (port, _) in results {
        println!("Port {} is OPEN", port);
    }
}
```

`buffer_unordered(500)` — that single line runs 500 port checks simultaneously, managing the concurrency automatically. No thread pools. No callback hell. No "I hope Node.js doesn't run out of file descriptors." Just Rust doing what Rust does best.

## The Security Angle That Keeps Me Up at Night (In a Good Way) 😅

Here's something I didn't expect: building security tools in Rust taught me *more* about security than 7 years of writing defensive web code.

When you write a port scanner, you think about:
- What happens when the target host doesn't respond?
- What if it resets the connection immediately?
- What if there's a firewall doing something weird?

In PHP, "weird input" means validating form fields. In security tools, "weird input" means the network itself is adversarial. Rust's type system forces you to handle every failure mode:

```rust
// Rust makes you acknowledge every possible outcome:
match TcpStream::connect(&addr).await {
    Ok(_) => println!("Open"),
    Err(e) if e.kind() == ErrorKind::ConnectionRefused => println!("Closed"),
    Err(e) if e.kind() == ErrorKind::TimedOut => println!("Filtered"),
    Err(e) => println!("Unknown: {}", e),
}
// Can't ignore errors. Can't crash on unexpected states. Love it.
```

In my Laravel days, I'd happily `.unwrap()` (or PHP-equivalent — just not check the return value) and move on. Rust says: "Hey, what happens when this goes wrong?" And in security tools, something ALWAYS goes wrong.

## Performance That Slaps 🚀

For my RF/SDR hobby, I decode packets from radio signals in real time. Missing a packet means missing data. Latency matters.

My Rust scanner scanning 1-1024 ports on a local host:
- **Rust (tokio, 500 concurrent):** ~0.8 seconds
- **Python (asyncio):** ~4.2 seconds
- **Node.js (net module):** ~3.1 seconds
- **PHP (synchronous):** I aged visibly waiting

For local network scanning, this gap is fine. For scanning production infrastructure during incident response at 2 AM? Those seconds matter.

## The Learning Curve Is Worth It 📈

I won't lie — my first Rust network program had 12 compiler errors. The borrow checker had opinions about my async closures. Tokio's docs are dense.

But here's what changed my mind: every single compiler error was a **real bug** I would have shipped in PHP without noticing. Use after free? Caught. Race condition? Caught. Unhandled error? Caught. The compiler is a free code review from a senior developer who never sleeps.

For security tools specifically, this matters more than anywhere else. A vulnerability in a security tool is deeply ironic.

## TL;DR 🎯

- **Web devs CAN write security tools** — the skills transfer more than you think
- **Rust makes it safe** — the entire category of memory bugs that plague C tools doesn't exist in Rust
- **Tokio makes it fast** — thousands of concurrent connections without breaking a sweat
- **The compiler is your security auditor** — it catches bugs that would be CVEs in C
- **For RF/SDR + security work**, Rust is genuinely the right tool for the job

Coming from 7 years of PHP, I thought systems programming was "not for me." Turns out, it just needed a language that treats memory safety as a feature, not a constraint.

Now if you'll excuse me, I have packets to scan and signals to decode. 📡🦀

---

**Got a security tool idea?** Let's talk on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love swapping notes with other security-curious devs!

**See my Rust experiments:** [GitHub](https://github.com/kpanuragh) — fair warning, some of it is still fighting the borrow checker!

*Now go `cargo run` something that would have segfaulted in C!* 🦀🔍✨
