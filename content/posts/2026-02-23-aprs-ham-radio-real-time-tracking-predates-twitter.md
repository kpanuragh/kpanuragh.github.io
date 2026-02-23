---
title: "APRS: Ham Radio Invented Real-Time GPS Tracking Before Smartphones Existed 📡"
date: "2026-02-23"
excerpt: "I tuned my RTL-SDR to 144.800 MHz and suddenly the airwaves were alive with position reports, weather data, and text messages — from amateur radio operators moving around my city in real time. Ham radio has had its own Twitter-before-Twitter since 1992, and most software developers have no idea it exists."
tags: ["rf", "sdr", "wireless", "hobby", "aprs", "ham-radio"]
featured: true
---

# APRS: Ham Radio Invented Real-Time GPS Tracking Before Smartphones Existed 📡

**An honest confession:** I thought ham radio was old people with massive antenna towers talking slowly about the weather.

I was so embarrassingly wrong.

Last month I pointed my RTL-SDR at 144.800 MHz and discovered that amateur radio operators in my city have been running their own real-time GPS tracking, messaging, and telemetry network since **1992**. Thirty-four years. Before GPS was even fully operational. Before smartphones. Before Twitter. Before the "Internet of Things" was a marketing phrase anyone had invented yet.

Bob Bruninga, WB4APR, built a real-time situational awareness network out of packet radio and determination, and it's still running today — with thousands of stations broadcasting position reports, weather data, objects, and messages on 144.800 MHz (in most of the world).

Welcome to **APRS — the Automatic Packet Reporting System**. Let me ruin your evening plans.

## What Even IS APRS? 🤔

**APRS = Automatic Packet Reporting System**

**Translation:** A radio protocol where amateur radio operators (and their cars, weather stations, balloons, and occasionally their cats) broadcast short data packets containing position, status, and messages. Anyone on the right frequency can receive them.

Think of it as a mesh network of RF-capable social media posts — but from 1992, when "social media" meant a BBS you dialed into at 2400 baud.

A typical APRS packet contains things like:

```
Callsign:  W6ABC-9
Position:  37.7749° N, -122.4194° W
Symbol:    /> (moving car icon)
Speed:     35 km/h
Heading:   270° (heading west)
Comment:   "Commuting home, 73!"
Timestamp: 2026-02-23 18:42:15 UTC
```

But APRS isn't just position reports. In my SDR experiments I've decoded:

- **Weather stations** broadcasting wind speed, temperature, humidity, rainfall — automatically
- **Digipeaters** — relay stations that rebroadcast packets to extend range
- **Objects** — fixed points of interest (events, hazards, repeaters)
- **Messages** — actual text messages between operators, with acknowledgement
- **Telemetry** — sensor data from balloon flights, solar arrays, remote monitoring
- **Emergency beacons** — special APRS traffic from search and rescue operations

**What fascinated me as a developer:** APRS is fundamentally a distributed, store-and-forward messaging system implemented in radio. It has routing logic, addressing, acknowledgements, and the internet gateway (APRS-IS) feeds everything into a global database. Someone in the 1990s built a federated social network out of RF packets and it *still works*. 🤯

## How I Fell Down This Rabbit Hole 🐰

### The "Wait, That's a Thing?" Moment

**Me:** *Finishing my AIS ship tracking setup, feeling smug*

**Me:** *Wondering what else is on VHF*

**Random SDR forum post:** "Have you tried APRS at 144.800 MHz?"

**Me:** "Ham radio? That's just old guys talking into microphones."

**Me:** *Tunes to 144.800 MHz out of mild curiosity*

```
[APRS] W6ABC-9>APRS,WIDE1-1,WIDE2-1: !3745.30N/12225.18W>035/030
       Decoded: Car at 37.755° N, -122.420° W, heading 30°, 35 km/h

[APRS] KJ4XYZ-13>BEACON,RF*: @232018z3745.50N/12225.00W_270/003g005t068r000h72b10253
       Decoded: Weather station: temp 68°F, humidity 72%, pressure 1025.3 hPa

[APRS] N6QQQ>APRS,WIDE2-2: :W6ABC-9 :Hi! Heard you on the repeater last night {001
       Decoded: Text message from N6QQQ to W6ABC-9
```

Three different packet types in under a minute. A moving car. A weather station. A text message.

My preconceptions evaporated. This was fascinating.

**Four hours later:** I had a map of every APRS station in my area. Cars, cyclists, weather stations, fixed repeaters. A continuous stream of data about who was where, what the weather was doing, and what people were saying to each other.

I missed dinner. It was worth it.

### The Part That Really Got Me

As a developer, what hit hardest was the *architecture* of APRS.

Each APRS packet has a **path** — a routing instruction that tells digipeaters how to relay it:

```
WIDE1-1,WIDE2-1
```

That means: "Relay me once on local digipeaters, then relay me once more on wide-area digipeaters." It's **source routing** over a wireless mesh network, implemented in the early 1990s with hardware that had kilobytes of RAM.

The APRS-IS (Internet Service) gateways pick up RF packets and upload them to a global server network. You can access all of this at **aprs.fi** and see every APRS station on Earth.

Someone in 1992 designed a protocol for distributed position-aware messaging over radio, and it accidentally scaled to a global mesh network. As a developer, I have enormous respect for this.

## How APRS Actually Works 🔧

### The Technical Bits (Developer Edition)

APRS runs on **AX.25 packet radio** — a radio adaptation of the X.25 networking protocol (yes, the same lineage as modern networking). The modulation is typically **AFSK (Audio Frequency-Shift Keying) Bell 202** — a 1200 baud audio modem signal.

Yes. 1200 baud. The same as a 1980s telephone modem. And it works great for short position packets, because the physics of VHF radio are what they are.

```
Audio tones:
  Mark (1):   1200 Hz
  Space (0):  2200 Hz
  Data rate:  1200 baud
  Frequency:  144.800 MHz (most of world) / 144.390 MHz (North America)

Packet structure:
  [FLAG][DST_ADDR][SRC_ADDR][PATH][CTRL][PID][DATA][FCS][FLAG]
```

**The beauty:** Because it's just audio, your RTL-SDR receives it like any other FM signal. The decoding happens entirely in software. No special hardware. No obscure chipsets. Just a USB dongle, an antenna, and the right software.

### Frequencies by Region

```
North America:  144.390 MHz  (the one exception to the world standard)
Europe/Africa:  144.800 MHz
Australia:      145.175 MHz
New Zealand:    144.575 MHz
Japan:          144.640 MHz
```

**In my RF experiments:** I'm in Europe, so 144.800 MHz is my home base. If you're in North America, tune to 144.390 MHz and you'll find your local traffic.

## The Setup: Embarrassingly Simple 🛠️

### What You Need

```
Hardware:
- RTL-SDR v3 dongle ($30) — yes, the same one for everything
- Any VHF antenna (the stock antenna works; a proper VHF dipole works better)

Software:
- Direwolf — the de-facto APRS TNC (Terminal Node Controller) for software
- APRS-IS gateway (built into Direwolf)
- Any APRS client (APRSISCE/32, Xastir, APRSdroid, or just aprs.fi)
```

### Step 1: Install Direwolf

Direwolf is the Swiss Army knife of APRS software. It handles decoding the audio from your SDR, parsing the packets, and optionally uploading to the APRS-IS network.

```bash
# Debian/Ubuntu
sudo apt install direwolf

# Or build from source
git clone https://github.com/wb2osz/direwolf
cd direwolf && mkdir build && cd build
cmake .. && make
```

### Step 2: Pipe SDR Audio to Direwolf

```bash
# Start rtl_fm pointed at the APRS frequency (144.800 or 144.390)
# Pipe audio to Direwolf via virtual audio device

# Option A: Using rtl_fm (built-in SDR tool)
rtl_fm -f 144.800M -o 4 - | direwolf -r 24000 -D 1 -

# Option B: Use GQRX and route audio to Direwolf via PulseAudio/JACK

# Option C: SDR++ → Virtual Audio Cable → Direwolf (Windows-friendly)
```

```
Direwolf 1.7 - WB2OSZ
Audio device for receive: stdin
Channel 0: 144.800 MHz, FM, 1200 baud

[0.4] W6ABC-9 audio level = 56(14/9)   [SINGLE]
[0.4] ---
[0.4] W6ABC-9>APRS,WIDE1-1,WIDE2-1:!3745.30N/12225.18W>035/030 Going home
Position with time: 37.755° N, 122.420° W, course 35°, speed 30 knots
```

**My first decoded packet reaction:** Immediately googled the callsign on QRZ.com to figure out who this person was. You can look up licensed ham radio operators by callsign. The ham radio community is very open about this — it's part of the culture.

### Step 3: Put It on a Map

Direwolf can forward decoded packets to any APRS application. I use **APRSISCE/32** on Windows and **Xastir** on Linux — both show live maps with station icons.

Or just open **aprs.fi** and compare what you're receiving to the global picture. Seeing a station appear on your local decode and on aprs.fi simultaneously is genuinely satisfying.

## The Fascinating Things You'll Discover 📊

### The Icon Language

APRS has a symbol system for different station types. Once you learn to read them, you see a whole ecosystem:

```
/>  Moving car (common — lots of hams have mobile trackers)
/-  House (home station)
/W  Weather station (look for these — they broadcast great data!)
/[  Jogger/runner (yes, people track their morning runs on APRS)
/O  Balloon (high-altitude weather/experiment balloons)
/j  Jeep (off-road events use APRS extensively)
/k  Truck
/X  Helicopter (air shows, medical helicopters)
```

In my area, I see a delivery truck driver who apparently runs APRS all day, a weather station in the hills that's been broadcasting data for 11 years, and one very dedicated person who jogs with an APRS tracker every morning at 6:30am. I now mentally root for them.

### The Weather Station Goldmine

APRS weather stations are a revelation. Amateur radio weather observers put proper instruments on towers, connect them to APRS, and share hyperlocal weather data that your phone's weather app doesn't have.

```
KD6ABC-1 Weather Station:
  Temperature: 18.3°C
  Humidity:    78%
  Wind:        NW at 12 km/h, gusting to 23 km/h
  Rain 24h:    2.4mm
  Pressure:    1018.7 hPa
  Timestamp:   Every 5 minutes, automatically
```

**Developer project alert:** Aggregate APRS weather stations in your area into your own hyperlocal weather dashboard. The data is free, public, and refreshes constantly. I built a simple Python script in an afternoon that graphs temperature from 8 local APRS weather stations. It's now my favorite home project.

### The Balloon Flights

High-altitude balloon launches often use APRS for tracking. The balloon ascends to 30,000+ meters, and because it's so high, APRS stations hundreds of kilometers away decode its packets.

```
[BALLOON] KB9XYZ-11>APRS: !5230.00N/01335.00E^/A=089247
          Position: 52.500°N, 13.583°E
          Altitude: 89,247 feet (27,203 meters!)
          Symbol: ^ (balloon)
```

**In my RF experiments:** I've tracked three balloon launches from my home station. Watching a balloon ascend to near-space, seeing its altitude climb in real-time, then watching it burst and descend — all from my desk — is one of the best experiences this hobby offers. 🎈

## Contribute to the Network 🌐

Here's the part that makes APRS special: you can feed your decoded packets back to the global APRS-IS network.

If you get a ham radio license (or use an APRS-IS receive-only feed with a special callsign), you can run an iGate — an internet gateway that takes your locally received RF packets and uploads them to the global network.

```bash
# In direwolf.conf, add your APRS-IS server connection:
IGSERVER rotate.aprs2.net
IGLOGIN YOURCALL-10 12345   # Passcode generated from your callsign

# Direwolf will now:
# 1. Decode RF packets
# 2. Display them locally
# 3. Upload them to APRS-IS for aprs.fi to display
```

**The beautiful part:** Every packet you upload improves coverage in your area. If you're in a location that doesn't have good APRS coverage, you might be filling a real gap in the network. I added about 12 previously uncovered stations to the global map within a week of running my iGate.

## Legal and Licensing 📋

**Receiving APRS:** 100% legal everywhere. It's a public broadcast. Listen away.

**Transmitting APRS** (acting as a digipeater or active station): Requires an **amateur radio license** in most countries. This is actually achievable — the Foundation/Technician license exam focuses on regulations and basic electronics, not advanced theory.

**Using APRS-IS without a callsign:** You can receive-only iGate with a "readonly" connection — no license required. Your packets get received and displayed but not uploaded. Perfect for SDR-only setups.

```
The licensing path (if you want to transmit):
  Foundation/Technician → allows VHF/UHF operation including APRS
  Exam prep: ~2-4 weeks of self-study
  Cost: ~$15-35 depending on your country
  Difficulty: Genuinely manageable if you can pass a basic technical test
```

**The safety rule:** APRS runs on licensed amateur radio spectrum. Don't transmit without a license. Do receive everything you want — that's always fine.

## Cool Project Ideas 🔨

**1. Hyperlocal Weather Aggregator**
Collect all APRS weather stations in a 50km radius. Build a dashboard comparing readings. Find the microclimates in your area.

**2. Commuter Tracker**
If local hams have mobile APRS trackers, you can sometimes see traffic patterns forming. Map the density of APRS mobiles by time of day.

**3. Balloon Chase Alerter**
Monitor for high-altitude balloon flights (altitude >10,000m). Send yourself a push notification when one appears in your decode area. Build a chase calculator.

**4. APRS Statistics Dashboard**
Track which digipeaters are most active. Graph packet volume by time of day. Find the busiest APRS corridors in your region.

**5. Message Monitor**
APRS has a text messaging system with acknowledgements. Monitor the message traffic in your area — it's surprisingly active during events and emergencies.

## Resources to Get Started 🛠️

**Core Software:**
- **Direwolf:** The best software TNC for APRS — [GitHub](https://github.com/wb2osz/direwolf)
- **APRSISCE/32:** Excellent Windows APRS client with maps
- **Xastir:** Cross-platform APRS client (Linux-friendly)
- **APRSdroid:** Android app for mobile APRS

**Web Resources:**
- **aprs.fi** — The definitive global APRS map. Find your nearest stations before you even turn on your SDR
- **aprs.org** — Bob Bruninga's original APRS documentation (historical gold)
- **aprsdirect.com** — Alternative APRS viewer with different filtering options

**Learning:**
- **"APRS — Moving Hams on Radio and the Internet"** by Bob Bruninga — the primary reference
- **r/amateurradio** — Very welcoming to SDR newcomers asking APRS questions

## TL;DR 📡

APRS is a 1992 amateur radio protocol that accidentally invented distributed real-time GPS tracking and messaging before GPS was fully operational. You can receive it with any RTL-SDR dongle on 144.800 MHz (or 144.390 MHz in North America) and see cars, weather stations, and balloon flights moving around your city in real-time.

**The setup:** RTL-SDR + VHF antenna + Direwolf + 30 minutes.

**What you get:** Real-time map of APRS stations in your area. Cars with callsigns. Weather stations. The occasional stratospheric balloon.

**What it costs:** Nothing new if you already have an RTL-SDR.

**The part that'll get you:** You'll look up a car's callsign on QRZ.com, find it belongs to a 67-year-old retired engineer who's had an APRS tracker on his car for 19 years, and you'll feel a profound sense of connection to a community that was building distributed wireless sensor networks decades before "IoT" became a buzzword.

Ham radio was doing IoT before IoT was cool. Respect the OG. 📡

73 de the SDR station. (That means "best regards" in ham radio. I've been infected.)
