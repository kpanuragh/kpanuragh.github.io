---
title: "Airlines Are Texting Their Planes and You Can Read Every Message 📡✈️"
date: "2026-02-28"
excerpt: "ACARS is the SMS system airlines have been using since 1978 to communicate with their aircraft. It runs on VHF radio. It broadcasts in plain air. And with a $20 RTL-SDR and free software, I'm now reading actual operational messages between airlines and their planes in real time. Nobody told me this was possible. I'm mildly furious."
tags: ["rf", "sdr", "wireless", "hobby", "acars", "aviation"]
featured: true
---

# Airlines Are Texting Their Planes and You Can Read Every Message 📡✈️

**Here's a sentence I didn't expect to type when I started this SDR hobby:** I am currently watching an airline text its plane asking for its fuel consumption figures.

The plane is cruising at 37,000 feet somewhere over the Atlantic. The message is in plaintext. On VHF radio. Broadcast to literally anyone willing to listen on 129.125 MHz.

I am listening. With a USB dongle that cost less than a takeaway meal. ☕

Welcome to ACARS — the ancient, unencrypted, absolutely-still-running-in-2026 text messaging system that aviation has been using since *1978*. And welcome to the part of this hobby where I have to sit down and process the fact that commercial aviation has been broadcasting operational text traffic in the clear for nearly fifty years.

## What Even IS ACARS? 🤔

**ACARS = Aircraft Communications Addressing and Reporting System**

**Developer translation:** It's SMS. For planes. From 1978. Running on VHF radio. Still unencrypted.

ACARS is how airlines and planes talk to each other when they need to exchange short text messages. Think of it as the aviation industry's original messaging protocol — predating the internet, predating GSM, predating literally everything you'd use today. And because it was designed in an era when "encryption" wasn't something you bolted onto a radio system, the messages go out in plain air for anyone to receive.

What gets sent over ACARS?

```
Aircraft → Airline (Downlinks):
  - Engine performance data (fuel burn, oil temps, EGT readings)
  - Position reports (lat/lon/altitude every 10-30 minutes)
  - OOOI events (Out of gate, Off ground, On ground, In at gate)
  - Meteorological data (weather observation from the cockpit)
  - Flight plan deviations
  - Maintenance alerts and fault codes
  - "We've landed" confirmation to dispatch

Airline → Aircraft (Uplinks):
  - Gate assignment changes
  - Crew messages ("Your hotel has been changed to X")
  - Weather updates for destination
  - Air Traffic Control pre-departure clearances (PDC)
  - Oceanic track assignments
  - Company operational data
```

**What fascinated me as a developer:** ACARS is basically a publish-subscribe messaging system with a 7-bit ASCII payload, running over VHF FM radio, with messages wrapped in a fixed-format protocol. As someone who's built REST APIs and message queues, the architecture is recognizable. As someone who assumed aviation comms would be encrypted, the complete lack of TLS was a surprise. 🤔

## How I Fell Into This Rabbit Hole 🐰

### The Accidental Discovery

I had been tracking ADS-B plane positions for a few weeks — watching flight paths on a map, getting smug about knowing where every aircraft overhead was going. Position data is satisfying but impersonal. You're watching dots move. The dots don't communicate.

Then I was scanning around the VHF aviation band and noticed bursts of digital data that weren't voice. Rapid, organized bursts. Every few seconds, something was transmitting on 129.125 MHz.

```
Me: *opens GQRX, hears digital bursting*
Me: "That's data. That's not a voice radio."
Google: "VHF digital aviation 129.125"
Google: "ACARS"
Me: "...airlines are texting their planes??"
Me: *installs acarsdeco2*
Me: *reads first decoded message*

Message from EK203:
  Type: Engine Data Report
  Engine 1 N1: 87.3%
  Engine 2 N1: 87.1%
  Fuel flow: 4,820 kg/hr total
  OAT: -54°C

Me: *stares at Emirates 777 fuel burn figures*
Me: "I need to sit down."
```

That first decoded message took about 25 minutes to set up from scratch. The message was from a real plane, a real airline, real operational data. Floating through my apartment, through my antenna, through my RTL-SDR, onto my screen. In 2026. Unencrypted. 📡

### The "Oh No, This Is Deep" Moment

As a developer exploring radio frequencies, what really got me was the protocol structure. ACARS messages have a proper format:

```
[STX] Mode Reg  FlightID   Label  BlockID [ETX] CRC
 02   2   .N654AA AA1234    5Z     B       03    A7F3

Translation:
  Mode:     Normal ASCII message
  Reg:      N654AA (the aircraft tail number!)
  FlightID: AA1234 (American Airlines flight 1234!)
  Label:    5Z (message type code — in this case, ETA)
  BlockID:  B (sequence number within multi-block messages)
  CRC:      A7F3 (error detection)
```

The label codes are the fun part — there are hundreds of them, each meaning something specific: position reports, weather, engine data, gate changes, crew messages. Decoding the label table is like reading a secret vocabulary the airline industry has had for decades.

## How ACARS Actually Works 🔧

### The Technical Bits

ACARS runs on a handful of **VHF frequencies** in the 129–136 MHz range (though the exact frequencies vary by region):

```
Primary ACARS frequencies (North America):
  129.125 MHz — primary US frequency (busiest)
  130.025 MHz — secondary
  130.450 MHz — oceanic
  131.125 MHz — common secondary
  131.550 MHz — Satcom ACARS edge cases

Europe/Asia:
  129.125, 130.025, 130.425, 130.450, 131.475, 131.525, 131.725 MHz
```

The modulation is **VHF AM** with **MSK (Minimum Shift Keying)** data at **2400 baud**. Each message is short — typically under a few hundred bytes. The aircraft transmits down, the airline ground system or a VHF Data Link (VDL) ground station receives it and routes it.

**Modern note:** ACARS is migrating toward VHF Digital Link Mode 2 (VDL2), which is slightly different and more efficient, but the old ACARS format is still everywhere because aviation moves at the speed of "if it works, it flies for 40 years."

### What Equipment You Need

```
Hardware:
  - RTL-SDR dongle (any version covering 129 MHz — they all do)
  - A decent VHF antenna
    (the stock RTL-SDR rubber duck works! ACARS is forgiving.)
    (a simple dipole cut for ~130MHz is much better)

Software (pick one):
  - acarsdeco2 (Linux/Mac, most popular)
  - JAERO (for satellite ACARS decoding — bonus!)
  - PlanePlotter with ACARS plugin (Windows)
  - ACARS on Linux (classic, open source)
  - RTL-ACARS (lightweight CLI option)
```

**Cost:** You likely already have everything if you've done any SDR project. ACARS works with the same RTL-SDR you use for ADS-B.

## The Setup (Mercifully Simple) 🛠️

### Step 1: Install acarsdeco2

`acarsdeco2` by Thierry Leconte is the gold standard for ACARS decoding. It handles multiple frequencies simultaneously, has a web interface, and plays nicely with RTL-SDR.

```bash
# Linux (Debian/Ubuntu/Raspberry Pi)
# acarsdeco2 is a compiled binary — grab the release from:
# https://github.com/TLeconte/acarsdeco2

# Quick start: monitor primary US frequency
./acarsdeco2 --device 0 --freq 129125000 --freq 130025000 --freq 131550000

# With web interface on port 8080
./acarsdeco2 --device 0 \
  --freq 129125000 --freq 130025000 --freq 131550000 \
  --beat 10 --web 8080
```

Open `http://localhost:8080` and you get:

```
- Live decoded ACARS messages scrolling in real time
- Message type breakdown
- Aircraft registrations you've heard
- Flight IDs seen
- Option to log everything to file or database
```

### Step 2: Watch the Messages Roll In

Within minutes of starting in a busy airspace, you'll see something like this:

```
[2026-02-28 14:23:11] 129.125 MHz
  Aircraft: G-EUPJ
  Flight:   BA0117
  Label:    H1 (Position Report)
  Message:
    ADS POS REPORT
    LAT: 51.47N LON: 001.82W ALT: FL350
    GS: 487KT TAS: 468KT HDG: 274
    WIND: 270/45KT OAT: -54C
    ETA EGLL: 1538Z

[2026-02-28 14:24:03] 130.025 MHz
  Aircraft: D-AIBY
  Flight:   LH0902
  Label:    16 (Engine Data)
  Message:
    ENG DATA RPT
    ENG1: N1=86.4 EGT=871 FF=3847
    ENG2: N1=86.6 EGT=875 FF=3891
    FUEL ONBOARD: 28420 KG

[2026-02-28 14:26:44] 129.125 MHz
  Aircraft: N78511
  Flight:   UA1450
  Label:    Q0 (OOOI — Out Of Gate)
  Message:
    OUTT=1423 BLOFF=1423
    FUEL=21340
    POB=187
```

That last one? **POB = People On Board.** You just decoded how many passengers are on a United Airlines flight. In plaintext. From your desk.

In my RF experiments, the weirdest message I decoded was a crew scheduling update telling a flight attendant on a plane at altitude that their hotel had been changed. The plane was somewhere over the Alps. I was in my living room. The message was for a specific crew member. I could read it. Aviation, you wild thing. 🏨

## The Messages You Won't Believe Are Real 📨

### Engine Performance Data

Airlines use ACARS to receive real-time engine health data. When you decode `Label 16` or similar engine report labels, you're seeing:

```
N1 speed (main engine fan speed %)
EGT (Exhaust Gas Temperature — if this is too high, bad)
Fuel flow per engine (in kg/hour)
Oil pressure, oil temperature
Vibration levels
```

Airlines use this for engine health monitoring. If something trends wrong, they can divert the aircraft before it becomes a problem. The data flows over the same VHF link I'm reading with a $20 dongle.

### OOOI Events — The Heartbeat of Flight Operations

Every commercial flight broadcasts four critical events:

```
OUT:  Aircraft pushes back from gate (wheels move)
OFF:  Aircraft lifts off the runway
ON:   Aircraft touches down at destination
IN:   Aircraft arrives at destination gate (engines off)
```

Airlines use OOOI data for everything: billing, crew duty time calculation, gate scheduling, baggage coordination. The moment a plane's wheels leave the ground, the ACARS system sends an `OFF` message and a hundred downstream processes kick off.

When I see an OOOI event decode, I know exactly when a real plane just took off or landed, before any website updates. The data is fresher than FlightAware.

### Pre-Departure Clearances

In some regions, ATC issues departure clearances to aircraft via ACARS uplink (rather than voice radio). You'll decode messages like:

```
CLEARANCE: UA1234
  CLRD TO KLAX
  MAINTAIN 5000FT
  EXPECT FL350 10MIN AFTER DEP
  SQUAWK: 4271
  DEPARTURE FREQ: 119.1
```

That's a real ATC clearance. For a real flight. That you just read before the pilots have even read it off their screen. 🛫

## Satellite ACARS: JAERO and the High Seas ✈️🌊

Here's where it gets even more interesting. For oceanic flights — crossing the Atlantic or Pacific — VHF ACARS doesn't work (too far from land). So these flights use **satellite ACARS** through Inmarsat satellites.

The ground stations re-broadcast that satellite data on L-band frequencies around **1545.9 MHz** (and others). With an RTL-SDR, a cheap L-band patch antenna (~$15), and **JAERO** software, you can decode:

- Position reports from flights over the middle of the Atlantic Ocean
- Engine data from planes that won't see land for six more hours
- Operational messages from airlines managing long-haul operations

```bash
# JAERO setup (handles satellite ACARS)
# Works with RTL-SDR tuned to 1545.9125 MHz (Inmarsat C burst)
# Requires: patch antenna facing satellite + LNA recommended

# Install JAERO (Windows/Linux)
# Point at 1545.9125 MHz, JAERO auto-detects the sub-channels
```

In my RF experiments, decoding a position report from a flight over the middle of the Atlantic — a plane with 300 people on it, six hours from the nearest airport, whose signal bounced off a satellite 36,000km above the equator and then hit my apartment window — was one of those "wait, what kind of magic is this" moments that the SDR hobby keeps delivering. 🛸

## Feeding the Community Network 🌐

**airframes.io** is the ACARS equivalent of FlightAware — a community database of decoded ACARS messages fed by hobbyists worldwide. You can contribute your decoded messages:

```bash
# Feed airframes.io with acarsdeco2
./acarsdeco2 --device 0 --freq 129125000 --freq 130025000 \
  --aircrafts /path/to/aircrafts.json \
  --output json:airframes.io:5550
```

What you get back: access to the global ACARS archive. Messages from stations worldwide. Historical data. The full richness of what thousands of stations are receiving.

**acars.io** is another excellent community platform — and if you set up multiple SDRs, you can decode multiple frequencies simultaneously and contribute more.

## Project Ideas for Developer Types 💻

**1. Flight Operations Dashboard**
Parse OOOI events and build a real-time display of your local airport's actual departure/arrival times — before they hit the official APIs.

**2. Engine Health Trending**
Log engine data ACARS messages for flights you regularly see (commuter routes, cargo carriers). Build time-series charts. Spot anomalies.

**3. Fuel Burn Analysis**
Collect fuel-on-board messages from the same aircraft type over weeks. Build a model. Compare against published fuel figures. Get nerd-sniped into reading ICAO fuel consumption manuals.

**4. Alert on Interesting Labels**
Write a quick script that alerts you when specific ACARS label types appear — mechanical irregularity reports, diversion notifications, or anything that isn't routine position data.

```python
import subprocess, json, requests

# Watch acarsdeco2 JSON output and alert on interesting labels
INTERESTING_LABELS = ['MR', 'H2', 'Q2']  # mechanical, divert, misc

for line in subprocess.Popen(['./acarsdeco2', '--output', 'json'],
                              stdout=subprocess.PIPE).stdout:
    msg = json.loads(line)
    if msg.get('label') in INTERESTING_LABELS:
        print(f"ALERT: {msg['flight']} sent label {msg['label']}: {msg['text']}")
```

## Safety and Legal Stuff 🚨

**Receiving: 100% legal.** ACARS is a broadcast communication intended for ground station infrastructure. Receiving it is no different from receiving FM radio. Every country I'm aware of permits passive reception of civil aviation transmissions.

**Decoding: Also fine.** The messages are unencrypted. Decoding publicly broadcast signals for personal use is legal in virtually every jurisdiction.

**Sharing:** Community platforms like airframes.io operate on the understanding that received signals are publicly broadcast. Sharing decoded data with these platforms is accepted practice.

**What to avoid:**
- ❌ Don't transmit on aviation frequencies — ever, without proper licensing
- ❌ Don't interfere with aviation communications infrastructure
- ❌ Don't use decoded crew/passenger information for anything creepy
- ⚠️ Some jurisdictions restrict *using* intercepted communications even when receiving is legal — "receiving is fine, don't do anything weird with it"

**The ethical lens:** This data is broadcast because aviation safety requires it. Ground stations, airports, and airlines all receive it legitimately. You're a citizen receiving public broadcasts. Don't be the person who makes regulators feel the need to encrypt things.

## Resources to Get Started 📚

**Software:**
- **acarsdeco2** — Best multi-frequency ACARS decoder (GitHub: TLeconte/acarsdeco2)
- **JAERO** — Satellite ACARS decoder (jaero.io)
- **RTL-ACARS** — Lightweight alternative

**Community platforms:**
- **airframes.io** — ACARS community database, accepts contributions
- **acars.io** — Another excellent community tracker
- **ACRARS.io Discord** — Active community of ACARS hobbyists

**Learning:**
- **ACARS label codes table** — Search "ARINC 618 label codes" for the full message type list
- **airframes.io/about** — Overview of what's decodable and how to contribute

## TL;DR ✈️

ACARS is the unencrypted VHF text messaging system airlines have used since 1978 to communicate with their aircraft. Position reports, engine data, passenger counts, crew messages, ATC clearances — all of it, in plaintext, on VHF frequencies between 129–136 MHz.

With an RTL-SDR (that you probably already own), acarsdeco2 (free), and the stock antenna (or better), you can:
- Read engine health reports from planes overhead
- See OOOI events before any flight tracking site updates
- Decode pre-departure ATC clearances
- Watch airline ops centers message their crews in flight
- With a $15 patch antenna, extend to satellite ACARS and track oceanic flights

**Setup time:** 30 minutes, tops.

**Cost:** Free if you have an RTL-SDR. Under $50 from scratch.

**The part nobody warns you about:** Once you know that every plane overhead is constantly broadcasting operational text traffic, the sky looks different. Every contrail overhead is now a moving radio station, shouting its fuel state and engine health into the air.

As a developer exploring radio frequencies, ACARS hit different. It's not just "look, a signal" — it's parsing a real protocol, reading real operational data, understanding a real system that real airlines depend on. The protocol is old and simple and kind of beautiful in its straightforwardness.

The fact that it's been unencrypted for 48 years is a feature. For us, anyway. 📡

---

**Spotted something weird in your ACARS feed?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm cataloguing unusual label codes I've decoded and always looking for compare notes.

**ACARS logging scripts and label decoders:** [GitHub](https://github.com/kpanuragh) — slowly building a dashboard that correlates ACARS engine data with actual flight paths.

*73 de the person who now looks at every plane and wonders what messages it's currently sending.* ✈️

---

**P.S.** The weirdest thing I've decoded: a message where the label type translated to "Free Text — Company Operational." The content was an airline operations center telling a crew that their return flight had been cancelled and they'd be overnighting at the destination. The crew was currently at 35,000 feet over somewhere and about to find out their evening plans had just changed. Radio is weird and intimate and I wasn't ready for that.

**P.P.S.** JAERO + a $15 patch antenna pointing at Inmarsat 3F-2 will decode oceanic ACARS from flights you'll never see or hear. Planes over the middle of the Atlantic. Their engines, their fuel, their ETA. Six hours from land, broadcasting to you. Completely wild.
