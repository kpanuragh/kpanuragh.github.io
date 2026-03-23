---
title: "Rust + nom: Parsing Binary Packets Without Losing Your Mind 🦀📡"
date: "2026-03-03"
excerpt: "After 7 years of PHP's pack/unpack and Node.js Buffer hacks, I discovered Rust's nom crate. Parsing raw binary RF packets has never felt this safe — or this satisfying."
tags: ["\\\"rust\\\"", "\\\"systems-programming\\\"", "\\\"performance\\\"", "\\\"sdr\\\"", "\\\"parsing\\\""]
featured: "true"
---

# Rust + nom: Parsing Binary Packets Without Losing Your Mind 🦀📡

**A tale of two programmers:** One opens a hex dump of a radio packet and thinks "I'll just `unpack('C*', $data)`". The other opens the same hex dump and thinks "I need a proper parser combinator." Guess which one got the CVE report?

Spoiler: it was me. I was both programmers. At different points in my career.

Coming from 7 years of Laravel and Node.js, my mental model of "parsing data" was always about strings. JSON, XML, CSV — stuff with delimiters and human-readable structure. Binary protocols felt like dark magic reserved for C programmers with 30-inch monitors and 1990s email addresses.

Then I got into RF/SDR as a hobby, and suddenly I was staring at raw bytes from radio signals. AIS vessel tracking packets. APRS amateur radio frames. Weather station proprietary binary formats. None of them were JSON. None of them were forgiving. And PHP's `unpack()` was about to betray me in spectacular fashion.

Enter Rust's `nom` crate. My life has not been the same since.

## Why Binary Parsing Is a Security Nightmare in Every Other Language 😱

Let me paint you a picture. You've received 12 bytes from a radio signal. The protocol says bytes 4–7 are a 32-bit integer, big-endian. Easy, right?

Here's the PHP version:

```php
// PHP: trust me, bro
$data = receive_from_radio(); // 12 bytes... hopefully
$values = unpack('N', substr($data, 4, 4)); // What if $data is only 6 bytes?
$altitude = $values[1];                      // Undefined behavior? PHP: 🤷
```

If `$data` is shorter than expected, PHP just silently gives you garbage or `false`. No error. No exception. Just wrong data flowing through your system like everything is fine. My weather station decoder was reporting altitudes of 4,294,967,295 meters for three weeks before I noticed. That's 4.2 *billion* meters. The ISS would be jealous.

Node.js is slightly better but not immune:

```javascript
// Node.js: at least it throws sometimes?
const altitude = data.readUInt32BE(4); // Throws if buffer is too short...
                                        // but only at runtime, only when it happens
```

You get a runtime error, which is better than silent corruption. But you're still discovering this bug when it happens in production, not when you write the code.

## What Excited Me About nom 🦀⚡

Here's what blew my mind the first time I used `nom`: it's not just a parser. It's a **parser combinator library** — meaning you build complex parsers by combining tiny, composable pieces. And it's zero-copy, meaning it works directly on your byte slice without allocating new buffers for every step.

A simple binary parser in Rust with `nom`:

```rust
use nom::{number::complete::{be_u32, be_u16, u8}, bytes::complete::take, IResult};

#[derive(Debug)]
struct WeatherPacket {
    station_id: u8,
    sequence:   u16,
    altitude:   u32,
    payload:    Vec<u8>,
}

fn parse_weather_packet(input: &[u8]) -> IResult<&[u8], WeatherPacket> {
    let (input, station_id) = u8(input)?;
    let (input, sequence)   = be_u16(input)?;
    let (input, altitude)   = be_u32(input)?;
    let (input, payload)    = take(4usize)(input)?;
    Ok((input, WeatherPacket {
        station_id,
        sequence,
        altitude,
        payload: payload.to_vec(),
    }))
}
```

That's it. If the input is too short for any of those reads, `nom` returns an error — not a panic, not silent garbage, an actual `Err` you can handle. The parser literally **cannot** read past the end of your buffer because the type system and `nom`'s internals won't allow it.

The `?` propagates errors upward. You're left with clean, sequential parsing logic that reads almost like a spec document.

## For My RF/SDR Hobby Projects, I Needed This Yesterday 📡

Here's my actual use case. I was decoding AIS (Automatic Identification System) packets — the protocol ships use to broadcast their position. The binary format is a 168-bit payload encoded in a 6-bit ASCII representation, packed into NMEA sentences.

Before `nom`, my Node.js decoder was a mess of bit-shifting, manual bounds checks, and at least two off-by-one bugs I discovered only when a vessel appeared to be sailing through downtown Mumbai at 847 knots.

With `nom`, I built the parser layer by layer:
- First: a parser for the 6-bit ASCII encoding
- Then: a parser for the bit fields within the decoded payload
- Then: a parser for the vessel class-specific fields

Each layer is tested independently. Each layer is composable. And the entire thing runs at speeds where I can decode packets in real time from my RTL-SDR dongle without dropping a frame.

## The Part That Would Have Saved Me Hours 🔥

The real party trick: `nom` parsers compose like LEGO. You need to parse a packet that starts with a 2-byte magic number, then has a length field, then has exactly that many bytes of payload?

```rust
use nom::{bytes::complete::{tag, take}, number::complete::be_u16, IResult};

fn parse_framed_packet(input: &[u8]) -> IResult<&[u8], &[u8]> {
    let (input, _)      = tag(&[0xAA, 0xBB])(input)?; // Magic header check
    let (input, length) = be_u16(input)?;              // Read payload length
    let (input, data)   = take(length as usize)(input)?; // Read exactly that many bytes
    Ok((input, data))
}
```

The `tag` parser verifies your magic bytes are there — and fails cleanly if they're not. Then you read the length field, and `take` reads *exactly* that many bytes. If the packet is malformed and claims to be 1000 bytes when only 50 remain? `nom` returns `Incomplete`, not a buffer overread.

Compare this to the C alternative where a malformed `length` field could send your `memcpy` reading into memory it has no business touching. That's how security tools become security vulnerabilities.

## Coming from Laravel, This Mental Shift Was Real 🧠

In Laravel, I was used to high-level abstractions. `json_decode()`. Eloquent models. Request validation. Someone else had already solved parsing for me.

With binary protocols and `nom`, *I'm* the person solving parsing. And honestly? It's more fun than I expected.

The key mindset shift: in web development, bad input means a 400 error and move on. In binary protocol parsing, bad input means corrupted state, security vulnerabilities, or my weather station confidently reporting that it's snowing on the sun.

Rust's type system forces me to think about every byte. And `nom` makes that thinking organized and testable instead of a maze of if-statements and manual offset arithmetic.

## TL;DR 🎯

- **PHP's `unpack()` and Node.js `Buffer`** will silently give you garbage on malformed binary input
- **nom** is a zero-copy parser combinator library that makes binary parsing composable and safe
- **If input is too short**, `nom` returns `Incomplete` — not a buffer overread, not silence
- **Parsers compose** — build complex formats from small, testable pieces
- **For RF/SDR work**, this is the difference between a decoder that works and one that reports your weather station as a fighter jet

Coming from 7 years of PHP and Node.js, I assumed binary parsing was C territory — dangerous, tedious, and full of landmines. Rust with `nom` proved me completely wrong. It's still tedious (protocols are tedious), but it's *safe* tedious, and there's a huge difference.

Now if you'll excuse me, I have a vessel database to update. Apparently one ship has been at 0°N, 0°E doing 999 knots, which means my old parser is still lurking somewhere. Time to `cargo run`. 🦀📡

---

**Experimenting with `nom` or SDR decoding?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm always happy to compare parser combinator war stories!

**See my hobby projects:** [GitHub](https://github.com/kpanuragh) — the RF stuff lives alongside the web stuff, just with more hex dumps.

*Now go `cargo add nom` and parse something that would have segfaulted in C!* 🦀📡✨
