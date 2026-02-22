---
title: "AIS: I'm Now Tracking Ships Like a Real-Life Maritime Traffic Controller 🚢📡"
date: "2026-02-22"
excerpt: "I pointed my RTL-SDR at 162MHz and suddenly became aware of every cargo ship, tanker, ferry, and tugboat within 50 miles. Their names. Their destinations. Their speeds. Their cargo types. Broadcasting in plain air for anyone to receive. I've been living near the sea my whole life and had no idea this was happening."
tags: ["rf", "sdr", "wireless", "hobby", "maritime", "ais"]
featured: true
---

# AIS: I'm Now Tracking Ships Like a Real-Life Maritime Traffic Controller 🚢📡

**Real talk:** I was showing my ADS-B plane tracker to a friend who lives near the coast. He watched planes zip across the map, impressed. Then he pointed at the harbor and said "Can you do that for ships?"

I said "No, that's different. Ships don't broadcast like planes."

Reader, I was wrong.

One week later: I had a live map of every vessel in the harbor, the strait, and 50 miles offshore. Cargo ships. Tankers. Ferries. Fishing boats. Tugboats. ALL of them constantly broadcasting their GPS position, heading, speed, destination, and — hilariously — their cargo type. In plain radio waves. For free. To anyone with the right gear.

**My reaction to being so wrong:** "Well, at least I learned something awesome." 🤷

Welcome to AIS — the maritime equivalent of ADS-B that most SDR hobbyists haven't discovered yet. Let's fix that!

## What Even IS AIS? 🤔

**AIS = Automatic Identification System**

**Translation:** A maritime radio standard that requires ships to constantly broadcast "HEY! I'M HERE! Here's everything about me!"

Think of it like ADS-B for aircraft, but for boats — except:
- **ADS-B:** 1090 MHz, digital, aircraft only
- **AIS:** 161.975 MHz and 162.025 MHz, VHF, every vessel over 300 gross tons (plus most smaller commercial vessels)

What's in each AIS broadcast?

```
MMSI:       123456789     (vessel's unique ID — like a tail number for ships)
Name:       EVER GIVEN    (yes, THAT Ever Given)
Type:       Cargo vessel
Destination: ROTTERDAM
ETA:        2026-02-25 14:00 UTC
Speed:      14.2 knots
Heading:    273°
Position:   51.9° N, 4.1° E
Length:     400m
Width:      59m
Draft:      14.5m         (depth underwater — critical for shallow water!)
```

**What fascinated me as a developer:** AIS has multiple message types — position reports, voyage data, base station messages, binary data, even safety-related text messages. It's a real protocol with structure. And I'm receiving it with a USB dongle while drinking coffee. 📡

## How I Fell Into This Rabbit Hole 🐰

### The Accidental Discovery

**Me:** *Watching my ADS-B plane map at night, bored because air traffic dies down*

**Me:** *Wonders if the harbor 40km away is doing anything interesting*

**Google:** "SDR maritime tracking"

**Google, one result later:** "AIS reception with RTL-SDR"

**Me:** "Wait, this is a thing? Ships broadcast on VHF? At 162MHz?"

```
Tuned to: 162.025 MHz
Bandwidth: 200 kHz (watching both AIS channels)
Wait time: About 8 seconds
First signal: A cargo ship named "NORDIC HAWK"
              heading to Hamburg at 11.3 knots
My face: 🤯
```

The whole setup took 20 minutes. The results were immediate. I live 40km from the coast and was receiving ships I couldn't see, in water I couldn't even visit without a 45-minute drive.

This is the part of SDR that never gets old — pointing software at a frequency and suddenly the invisible becomes visible.

### The "Oh No, This Is Going to Consume My Life" Moment

An hour into my first AIS session, a container ship appeared on my map labeled:

```
Name:   MSC GÜLSÜN
Type:   Container ship
Length: 400m (!!!)
ETA:    SINGAPORE
```

A 400-meter container ship. One of the largest ships on Earth. I was tracking it on my laptop. With a $20 USB dongle. From my apartment.

I stayed up until 2am watching ships.

## How AIS Actually Works 🔧

### The Technical Bits (Without the Pain)

AIS uses **TDMA (Time Division Multiple Access)** — ships take turns broadcasting in pre-assigned time slots so they don't all talk at once. Think of it like orderly queue management for radio, except the ships are very large and mostly don't crash into each other.

**Two VHF channels:**
```
AIS Channel 87B: 161.975 MHz (primary)
AIS Channel 88B: 162.025 MHz (secondary)
Ships alternate between them
```

**Broadcast rates vary by situation:**
```
Anchored vessel:    Every 3 minutes (nothing exciting happening)
Vessel at 0-14kn:   Every 10 seconds (moving slowly)
Vessel at 14-23kn:  Every 6 seconds  (normal speed)
Vessel at 23+ kn:   Every 2 seconds  (fast mover, high priority)
```

**As a developer:** The message encoding uses NRZI (Non-Return-to-Zero Inverted) modulation with HDLC framing and 6-bit ASCII encoding. The raw bits look like gibberish. The decoded messages look like ship data. This is exactly why software exists. 😅

### What Equipment You Actually Need

```
Hardware:
- RTL-SDR v3 dongle ($30) — or any SDR that covers VHF
- Marine band antenna or simple VHF dipole
  (even a $10 wire antenna works at close range)

Software (pick one):
- AIS Dispatcher (Windows, free, excellent UI)
- OpenCPN (cross-platform, the "full" marine chart solution)
- GQRX + AIS-catcher (Linux, open source)
- VirtualRadar Server with AIS plugin
- AIS-catcher (the dedicated AIS decoder, highly recommended)
```

**Cost to get started:** Under $50 if you already have an RTL-SDR from your ADS-B adventures.

## The Setup (Embarrassingly Simple) 🛠️

### Step 1: Get AIS-catcher

AIS-catcher is the best dedicated AIS decoder I've found. It handles both channels simultaneously and has a built-in web interface.

```bash
# Linux install
sudo apt install librtlsdr-dev libsqlite3-dev
git clone https://github.com/jvde-github/AIS-catcher
cd AIS-catcher && mkdir build && cd build
cmake .. && make

# Run it
./AIS-catcher -d 0 -v

# With web interface on port 8100
./AIS-catcher -d 0 -x 8100
```

```
[AIS-catcher] Starting...
[AIS-catcher] Listening on 162.000 MHz (covering both channels)
[AIS-catcher] Decoded: MMSI 244010537 - AMSTELBORG - Cargo - 12.1 kn
[AIS-catcher] Decoded: MMSI 219032518 - NORD NEPTUNE - Tanker - 8.4 kn
[AIS-catcher] Decoded: MMSI 636016887 - SEASPAN FRASER - Container - 0.0 kn (anchored)
```

**My first reaction to seeing that output:** Immediate need to open a map.

### Step 2: Visualize It

Point your browser at `localhost:8100` and AIS-catcher shows you a live map of every vessel it's decoded. Or feed the data to MarineTraffic, VesselFinder, or OpenCPN.

```
What I see on my map right now:
- 3 cargo ships heading to the port
- 1 tanker (classified as "Gas Tanker" — LNG or LPG)
- 2 ferries doing their regular route
- 1 pilot boat buzzing around the harbor entrance
- 4 pleasure craft (small boats registered voluntary AIS)
- 1 vessel classified as "Fishing" doing suspiciously random patterns
```

That "fishing" vessel is genuinely doing suspiciously random patterns and I've been watching it for 20 minutes trying to understand what's happening. This is what SDR does to you. 🐟

## The Fascinating Things You'll Discover 📊

### Vessels Have Personalities

Once you watch vessels long enough, patterns emerge:

**Cargo ships:** Steady course, predictable speed, often queue outside ports waiting for a berth
**Ferries:** Clockwork precision — same route, same speed, same stops, all day long
**Tugboats:** Erratic movement, speed varies wildly (they're working!)
**Pilot boats:** Fast, dart out to meet incoming ships, escort them to the dock
**Fishing vessels:** "Creative" interpretation of straight lines

### The Broadcast You Didn't Expect

Most vessels broadcast **voyage data** including cargo type. This is where it gets interesting:

```
Type 5 AIS Message — Voyage Related Data:
Ship Type: 80 = Tanker
Type 80 subcategories:
  80: Tanker (general)
  81: Tanker, hazardous category A
  82: Tanker, hazardous category B
  83: Tanker, hazardous category C
  84: Tanker, hazardous category D
```

Yes. Ships broadcast how hazardous their cargo is. In plain radio waves. Because maritime safety requires this information to be publicly available for emergency responders.

**Developer thought:** "This is the most responsible use of unencrypted radio I've ever encountered." 🙏

### Class A vs Class B

**Class A:** Required on all vessels over 300 gross tons. Full position reporting every 2-10 seconds. Detailed voyage data. Mandatory.

**Class B:** Smaller vessels (fishing boats, pleasure craft, small commercial). Cheaper transponders. Update every 30 seconds. Less detailed.

```
In my area:
Class A vessels: About 40% of what I decode
Class B vessels: About 60% — way more small boats than I expected
```

Those Class B vessels are often yachts, small fishing boats, and the occasional very lost-looking paddleboat that someone equipped with a transponder. 🚣

## Antenna: The Make-or-Break Factor 📡

Unlike ADS-B at 1090 MHz where the RTL-SDR's stock antenna is borderline usable, AIS at 162 MHz needs a proper antenna.

**The options:**

```
Option 1: Commercial VHF marine antenna (~$30-80)
  Pros: Plug-and-play, waterproof, designed for this
  Cons: Costs money, needs coax adapter

Option 2: DIY quarter-wave vertical (free)
  Length: 300,000,000 m/s ÷ 162,000,000 Hz ÷ 4 = 46.3cm wire
  Props: Free, works great, easy to make
  Cons: You're waving a wire around

Option 3: Yagi directional antenna (toward the sea)
  Pros: Maximum range in one direction
  Cons: You miss vessels behind you
```

**In my RF experiments:** A $15 VHF marine whip antenna from a marine supply shop, connected to the RTL-SDR with a PL-259 to SMA adapter, positioned near a window facing the water — massively outperformed the stock RTL-SDR antenna. More ships, further away, fewer decoding errors.

**Rule of thumb for AIS:** Get your antenna UP. Every meter of height doubles your effective range for nearby vessels.

## How Far Can You Actually See? 🌊

AIS is designed for line-of-sight VHF propagation. Your range depends almost entirely on antenna height:

```
Antenna at 1m (desk level):     ~15-20 km
Antenna at 5m (second floor):   ~25-35 km
Antenna on roof (10-15m):       ~40-60 km
Antenna up a mast (30m+):       ~80-120 km
```

**The exception:** Atmospheric ducting. Sometimes VHF signals travel hundreds of kilometers beyond normal line-of-sight due to weather conditions creating a "radio duct" in the atmosphere.

**In my RF experiments:** I had a 15-minute period where I was decoding ships I later identified (via MarineTraffic) as being 340km away. My antenna is at 8m. Normal range is 35km. Atmospheric ducting is real and it's wild. 🌩️

## Legal Stuff: The Good News 📋

AIS is **completely legal to receive** in virtually every country. It's a public safety broadcast system deliberately designed to be received by anyone — port authorities, coast guard, other vessels, and curious software developers with USB dongles.

**What's always legal:**
- Receiving AIS signals (it's a public broadcast)
- Decoding vessel positions and data
- Sharing your AIS data with platforms like MarineTraffic or AISHub
- Using it for maritime situational awareness

**What requires a license (or is illegal):**
- Transmitting AIS signals (requires maritime VHF radio license)
- Using AIS data to facilitate illegal activities (piracy, smuggling lookout)
- Interfering with AIS signals

**The responsible approach:** Use it to learn. Use it to contribute to community tracking networks. Don't be the person who disrupts maritime safety systems.

## Share Your Data: Join the Network 🌐

Here's the thing that sets AIS apart from most SDR projects — you can contribute to the global vessel tracking network.

**AISHub:** Free cooperative network. You share your decoded AIS data, you get access to everyone else's data worldwide.

```bash
# Share with AISHub
./AIS-catcher -d 0 -U aishub.net:1234 -v

# What happens:
# Your data → AISHub servers
# AISHub data → Your local display
# Net result: You see ships everywhere, not just near you
```

I can now see ships in the Strait of Malacca, the English Channel, New York Harbor — anywhere other AIS-catcher stations are running. It's genuinely the most cooperative thing in the SDR hobby.

## Cool Project Ideas 🔨

**1. Maritime Weather Correlation**
Cross-reference vessel speeds with weather data — do ships slow down in certain conditions? Build a dataset. Plot it.

**2. Port Congestion Monitor**
Count anchored vessels waiting for berths. Track wait times. Build alerts when your local port is unusually busy.

**3. Fishing Vessel Pattern Analysis**
Track fishing boats over weeks. Do they return to the same spots? Map the "secret fishing holes" from AIS data.

**4. Anomaly Detection**
Build a system that alerts when a vessel's AIS transmitter goes silent unexpectedly. (Real maritime authorities do this. Smugglers sometimes turn off their transponders.)

**5. Historical Playback**
Log AIS data to SQLite (AIS-catcher has built-in database support). Replay a day of vessel movements. Watch the harbor wake up in the morning.

## Resources to Get Started 🛠️

**Software:**
- **AIS-catcher:** The best AIS decoder — [GitHub](https://github.com/jvde-github/AIS-catcher)
- **OpenCPN:** Full-featured marine navigation software with AIS support
- **AIS Dispatcher:** Windows-friendly GUI option

**Community tracking:**
- **MarineTraffic.com** — Compare what you receive vs. their global network
- **AISHub.net** — Cooperative data sharing network
- **VesselFinder.com** — Another great vessel tracking platform

**Learning:**
- **ITU Resolution 232** — the international standard defining AIS
- **AIVDM/AIVDO NMEA 0183 format** — the raw data format you'll decode

## TL;DR 🚢

AIS is ADS-B for ships — every commercial vessel constantly broadcasts its position, speed, destination, and cargo type on 162MHz VHF. A $20 RTL-SDR dongle and a decent VHF antenna will put every ship within 30-50km on your screen in real-time.

**The setup:** RTL-SDR + VHF antenna + AIS-catcher + 20 minutes.

**What you get:** Live maritime traffic map. Ships with names, types, destinations, speeds.

**What it costs:** ~$30-50 if starting from scratch.

**The part nobody warns you about:** You will start narrating ships to your family like a sports commentator. "Oh! The NORDIC HAWK just picked up speed, she must have gotten her berth assignment!" Nobody will find this as interesting as you do.

They are wrong. The ships are fascinating.

Fair winds and following seas. 📡🌊
