---
title: "I Built a Real-Time Radar with a $25 USB Stick ✈️"
date: "2026-03-06"
excerpt: "Every commercial airplane overhead is screaming its GPS position, altitude, speed, and callsign at 1090 MHz — unencrypted — for anyone to receive. I tuned in with my RTL-SDR and suddenly had my own live air traffic radar. FlightRadar24 doesn't know what I know."
tags: ["\\\"rf\\\"", "\\\"sdr\\\"", "\\\"wireless\\\"", "\\\"hobby\\\"", "\\\"adsb\\\"", "\\\"aviation\\\""]
featured: "true"
---

# I Built a Real-Time Radar with a $25 USB Stick ✈️

**Hot take:** Every commercial airplane flying over your house right now is broadcasting its exact GPS coordinates, altitude, speed, flight number, and aircraft type — completely unencrypted — at 1090 MHz. To anyone. Including you. With a $25 USB dongle and free software.

I found this out at 11 PM on a random Tuesday, set up the receiver in 20 minutes, and did not sleep because I was too busy watching planes arc across my screen like I was an air traffic controller. My partner was not impressed. The planes were.

As a developer exploring radio frequencies, ADS-B was my "wait, WHAT?!" moment. This is the project I recommend to literally every developer who asks me how to get into SDR. It works the first time. The payoff is immediate. And you'll never look at an airplane the same way again. 📡

## What Is ADS-B? (The Protocol Airplanes Use to Gossip) 📻

**ADS-B = Automatic Dependent Surveillance–Broadcast**

**Translation:** Every modern commercial aircraft has a transponder that continuously broadcasts a packet every ~0.5 seconds on 1090 MHz containing:

- ✈️ Aircraft's GPS position (latitude, longitude)
- 📏 Altitude (to within 25 feet)
- 🚀 Ground speed and vertical rate
- 🧭 Heading/track
- 🆔 ICAO 24-bit aircraft address (unique ID per aircraft)
- 📋 Callsign / flight number
- ✈️ Aircraft category (heavy jet, small prop, helicopter...)

No handshake. No authentication. No encryption. Just a continuous radio broadcast into the void. The FAA mandates ADS-B Out on all aircraft in US controlled airspace as of 2020. EASA mandates it in Europe too. It's everywhere.

**What fascinated me as a developer:** ADS-B is essentially UDP at 1090 MHz. The aircraft sends, and anyone who can hear it receives. No ACK. No error correction (beyond basic CRC). No security whatsoever. It was designed for ground radar stations to receive, but nobody said *you* couldn't receive it too. 🤷

## My Discovery Story 🐰

### The Reddit Comment That Changed My Tuesday Night

I was on r/RTLSDR looking for project ideas with my new RTL-SDR dongle when someone casually mentioned:

> "dump1090 is probably the fastest way to see SDR magic — planes show up in like 5 minutes."

**5 minutes.** That's not a typo.

I had a map full of real-time aircraft before I finished my tea. I spent the next two hours just... watching planes. There's something hypnotic about seeing the actual flight paths, the holding patterns, the approach corridors. FlightRadar24 shows you the same data — but *you're receiving it yourself*. Different feeling entirely.

In my RF experiments, nothing closes the gap between "I understand this theoretically" and "oh this is real" faster than ADS-B. The data is unambiguous. That blip on your map IS that airplane overhead. Step outside and look up. Yep. There it is.

## How ADS-B Actually Works 🔬

Here's the nerdy bit, kept short:

**The transponder transmits Mode S packets at 1090 MHz.** Each packet is 112 bits long (extended squitter format). The message format looks like:

```
[DF][CA][ICAO Address][ME Field][PI/CRC]
 5    3       24          56      24
bits bits   bits          bits   bits
```

- **DF (Downlink Format):** Message type. DF17 = ADS-B squitter (the one we want)
- **ICAO Address:** 24-bit unique aircraft ID, globally unique per aircraft
- **ME Field:** The payload — position, velocity, identification, or status
- **PI/CRC:** 24-bit parity check

The position encoding uses a clever scheme called **Compact Position Reporting (CPR)** — you need two consecutive messages to calculate an exact position (one "even" frame and one "odd" frame). Your software handles this automatically.

**The signal itself:** 1 Mbit/s OOK (On-Off Keying) — the simplest digital modulation possible. 1 = carrier on, 0 = carrier off. This is why cheap RTL-SDR dongles can decode it — you don't need fancy DSP. Just detect carrier transitions.

**What I love about this as a developer:** The packet format is fully documented in ICAO Annex 10. You can write your own decoder from scratch. The data structure is basically a bitfield struct you'd recognize from any C/embedded code. Aviation geeks have been reverse-engineering edge cases for decades — the community documentation is phenomenal.

## The Setup: Everything You Need 🛠️

### Hardware

**RTL-SDR dongle:** ~$25
Any RTL-SDR works. The RTL-SDR Blog V3 is the gold standard, but even the cheapest no-name dongles decode ADS-B just fine — the signal is strong and the modulation is simple.

**Antenna:** This matters more than your dongle

The stock whip antenna that ships with RTL-SDR is actually *decent* at 1090 MHz (it's in the right frequency range), but a proper 1090 MHz antenna makes a huge difference:

**Option 1: Use the stock antenna** — works fine for planes within ~50-100 km
**Option 2: Build a coaxial collinear** (2 hours, ~$5 in materials) — triples your range
**Option 3: Buy a 1090 MHz ADS-B antenna** (~$20-30) — best plug-and-play option

For your first test, just use what came in the box. Worry about antenna upgrades when you're hooked (you will be hooked).

**Placement:** As high as possible with clear sky view. A window works. Outdoors is better. Roof is best. Higher placement = more horizon coverage = more planes.

### Software

**dump1090** — the legend, the original, still excellent

```bash
# Install on Linux/Mac
sudo apt install dump1090-fa      # FlightAware fork (best)
# or
brew install dump1090-mutability  # Mac

# Run it
dump1090-fa --interactive --net
```

**dump1090** does it all: receives the signal, decodes the packets, and hosts a web interface on `http://localhost:8080` with a live map. You'll see planes appear within seconds of launch.

**Other options:**
- **Virtual Radar Server** (Windows) — excellent GUI, very polished
- **readsb** — modern high-performance drop-in replacement for dump1090
- **tar1090** — beautiful web frontend for readsb/dump1090

**Full pipeline:**
```
1090 MHz RF signal
       ↓
RTL-SDR dongle (samples raw RF)
       ↓
dump1090 (decodes Mode S/ADS-B packets)
       ↓
JSON output + built-in web map at :8080
       ↓
Live radar in your browser ✈️
```

## Your First 5 Minutes: Quick Start 🚀

```bash
# 1. Plug in RTL-SDR
# 2. Install dump1090-fa
sudo apt install dump1090-fa

# 3. Run it (interactive terminal mode)
dump1090-fa --interactive

# You'll see output like this almost immediately:
# ICAO   Sqwk  Flight   Alt  Spd  Hdg    Lat      Long   Msgs  Age
# 4CA7B4  ----  EIN456   35000  480  273  52.3421  -4.512  241  0.0
# 3C4B12  ----  DLH123   22500  390  127  51.8921  -3.182   89  1.2
# A12345  ----  UAL789   8200   220   45  52.1234  -4.123  156  0.3

# 4. Open browser to see the map
open http://localhost:8080
```

That's it. If there are any planes within reception range, they'll appear. First time I ran this I had 23 aircraft on screen in under 2 minutes.

## What the Data Actually Looks Like 🔍

Here's a real decoded ADS-B message (from my experiments):

```json
{
  "hex": "4ca7b4",
  "flight": "EIN456  ",
  "lat": 52.3421,
  "lon": -4.5123,
  "altitude": 35000,
  "speed": 481,
  "track": 273,
  "vert_rate": -64,
  "squawk": "2271",
  "category": "A3",
  "messages": 1247,
  "seen": 0.2
}
```

**ICAO hex `4ca7b4`** — that's Aer Lingus (4C = Ireland registration). You can look up any ICAO address at `airframes.org` to get the full aircraft registration, type, operator, and even a photo.

**As a developer:** This is clean, structured data arriving in real time. The possibilities are endless:

```python
# Parse the dump1090 JSON output
import requests
import json

data = requests.get("http://localhost:8080/data/aircraft.json").json()

for aircraft in data["aircraft"]:
    if "lat" in aircraft and "alt_baro" in aircraft:
        print(f"{aircraft.get('flight','?').strip()} → "
              f"Alt: {aircraft['alt_baro']}ft, "
              f"Speed: {aircraft.get('gs','?')}kts, "
              f"Pos: {aircraft['lat']:.4f},{aircraft['lon']:.4f}")
```

dump1090 serves a JSON API at `/data/aircraft.json` that updates every second. It's just a REST endpoint. You know what to do with a REST endpoint.

## Cool Things to Build Once You're Running 🛠️

### 1. Altitude Heatmap
Record all positions + altitudes over a week. Generate a heatmap of local flight paths. You'll see the approach corridors, the holding stacks, the oceanic tracks. Real air traffic structure becomes visible.

### 2. "Interesting Aircraft" Alerts
```python
# Alert when military, cargo, or unusual aircraft appear
INTERESTING_OPERATORS = ["RCH", "REACH", "CNV", "DUKE", "SPAR"]
if any(callsign.startswith(op) for op in INTERESTING_OPERATORS):
    send_notification(f"Military aircraft spotted: {callsign}")
```

Military aircraft often have ADS-B too — USAF C-17s, tankers, VIP transport. "SPAR" is the callsign prefix for US government VIP aircraft. Track enough traffic and you'll see some interesting visitors.

### 3. Feed FlightAware or FlightRadar24
Both networks accept ADS-B feeds from ground stations. You feed your local data to them, they give you a free premium subscription. My station in suburban Dublin contributed to their network and I got free FR24 Business tier. Win-win.

```bash
# FlightAware's PiAware (if you're on a Pi)
sudo apt install piaware
piaware-config feeder-id YOUR_FEEDER_ID
```

### 4. Emergency Squawk Monitor
```python
SQUAWK_7700 = "7700"  # General emergency
SQUAWK_7600 = "7600"  # Radio failure
SQUAWK_7500 = "7500"  # Hijack

if aircraft.get("squawk") in ["7700", "7600", "7500"]:
    ALERT_IMMEDIATELY()
```

In two years of running my station, I've seen 7700 declared twice (both were minor issues, resolved quickly). Watching the emergency squawk appear in real-time then seeing the aircraft divert is... tense.

### 5. Range Visualization
Plot your maximum reception range on a polar chart. It shows you exactly where terrain or buildings are blocking signal. Then you can optimize your antenna placement to fix the gaps. It's basically a test-driven approach to antenna positioning.

## How Far Can You See? 📡

With the stock antenna indoors: **50-100 km** on good days.

With a decent 1090 MHz antenna mounted outside at height: **200-300 km** easily.

With a proper setup (outdoor antenna, low-noise amplifier, good cable): **400+ km**. I've decoded flights at 380 km before they were visible on FlightRadar24 with their commercial station network. That felt unreasonably good.

**Why the range is so good:** ADS-B transmitters on aircraft are powerful (up to 250W) and the aircraft are *above the horizon*. Radio propagation to high-altitude targets is nearly line-of-sight, with minimal ground absorption. The main limiting factor is your horizon — literally the curvature of the Earth.

## Legal and Safety Considerations ⚖️

**Receiving ADS-B is completely legal everywhere.** The FAA, EASA, and all aviation authorities broadcast this data publicly. ADS-B Out is mandated specifically so ground stations — commercial AND hobbyist — can receive it. You are doing exactly what the system was designed for.

**What you CANNOT do:**
- ❌ Interfere with transponder frequencies in any way (obvious)
- ❌ Transmit on 1090 MHz without proper aviation certification
- ❌ Use ADS-B data for anything that could endanger flight safety

**What you absolutely CAN do:**
- ✅ Receive and decode all the data
- ✅ Build applications on top of it
- ✅ Feed commercial networks (they want your data!)
- ✅ Do research, track interesting aircraft, build visualizations
- ✅ Feel smug about your personal radar system

**Privacy note:** ADS-B is public. Some private/business aircraft use ADS-B privacy extensions or simply turn off their transponders in non-mandatory airspace. The military flies with ADS-B sometimes and sometimes not. Tracking real people's movements with this data is legal but... be thoughtful about what you do with it.

## Resources to Get Started 📚

- **dump1090-fa GitHub** — the FlightAware fork, best documented version
- **rtl-sdr.com/adsb** — tutorials for every OS, antenna designs, optimizations
- **airframes.org** — look up any ICAO hex code to identify the aircraft
- **r/RTLSDR** — ADS-B is the most common first project, endless help available
- **1090mhz.uk** — excellent deep-dive into the message format if you want to write your own decoder
- **FlightAware PiAware** — if you want to feed your data to their network

**Recommended antenna upgrade:** The **FlightAware 1090 MHz antenna** (~$25) is the community standard. Magnetic mount, excellent gain, plug and play. Worth it after your first week.

## The Bottom Line 💡

**Every plane overhead is broadcasting its exact position for free.** The protocol is open, the software is free, the hardware costs $25, and it works in 5 minutes. This is the SDR project that converts skeptics into believers.

For under $30 and one evening, you can:
- ✅ See every aircraft within 200+ km in real-time
- ✅ Decode actual aviation data packets from scratch
- ✅ Build a personal radar that rivals commercial flight trackers
- ✅ Learn about digital modulation, packet protocols, and RF propagation
- ✅ Contribute to global flight tracking networks for a free premium subscription

**What fascinated me most:** The sheer openness of it. This data streams from 30,000 feet to my $25 USB stick, through open-source software, onto my browser as a live radar — with no subscription, no API key, no permission required. Aviation decided decades ago that sharing position data made flying safer for everyone. They were right. And as a side effect, nerds with USB dongles get free radar.

In my RF experiments, nothing made me feel more like I was part of the infrastructure of modern life than watching a transatlantic flight appear on my self-hosted radar 350 km out and track it all the way to the runway. The system works. And now so does yours.

## Your Action Plan 🚀

**Tonight (15 minutes):**
1. Plug in your RTL-SDR
2. `sudo apt install dump1090-fa && dump1090-fa --interactive --net`
3. Open `http://localhost:8080`
4. Watch the planes

**This week:**
1. Mount your antenna as high as possible with sky view
2. Check your maximum range (plot it with tar1090)
3. Set up a Raspberry Pi as a permanent station

**When you're hooked:**
1. Build an interesting-aircraft alert script
2. Sign up to feed FlightAware or FlightRadar24
3. Upgrade to a proper 1090 MHz antenna
4. Start logging historical data

---

**Running your own ADS-B station?** Tell me your max range and location (rough) — I'm genuinely curious how much geography affects reception. Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh).

**Want my dump1090 setup scripts, the Python real-time parser, and the interesting-aircraft alert config?** It's all on my GitHub. Including the squawk 7700 notifier that has startled me awake twice.

*The sky is full of data. All you need is a $25 USB dongle and the curiosity to look up.* ✈️📡

---

**P.S.** After three days of running this, I started narrating planes to my partner. "Oh, that's a Ryanair 737-800 descending into Dublin, must be the 22:45 from Stansted." She has since hidden my RTL-SDR. I found it. The radar runs again.

**P.P.S.** If you set up FlightAware feeding and see your own station on their map, that specific feeling of "I am infrastructure now" is difficult to describe and impossible to unlearn. Welcome. 📡
