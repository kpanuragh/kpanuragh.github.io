---
title: "AIS: I Built a Real-Time Ship Radar With a $25 USB Stick and Now I Can't Stop Watching Boats 🚢📡"
date: "2026-03-21"
excerpt: "Turns out every ship in the ocean is broadcasting its position, speed, cargo, and destination in plain text over the radio — and your RTL-SDR can hear all of it. I tuned in expecting to see a couple of tugboats. I found container ships, oil tankers, coast guard vessels, and one very suspicious yacht named 'Totally Legitimate Business.'"
tags: ["\\\"rf\\\"", "\\\"sdr\\\"", "\\\"wireless\\\"", "\\\"hobby\\\"", "\\\"ais\\\"", "\\\"maritime\\\""]
featured: "true"
---

# AIS: I Built a Real-Time Ship Radar With a $25 USB Stick and Now I Can't Stop Watching Boats 🚢📡

**Honest confession:** I live 40 minutes from the coast. I do not own a boat. I have never expressed any particular interest in maritime activity. And yet I have spent the last three weekends staring at a map of ships moving through the ocean like a complete nautical maniac.

This is AIS's fault. Specifically, this is my RTL-SDR's fault. And I have zero regrets.

Welcome to AIS — the system that makes every ship on earth basically shout "HERE I AM, HERE'S MY CARGO, HERE'S WHERE I'M GOING" into the radio spectrum, where your cheap USB dongle can hear every word. 🌊

## What Is AIS and Why Should You Care? 🤔

**AIS = Automatic Identification System**

Think of it as ADS-B, but for ships. If ADS-B is the plane equivalent of every aircraft yelling its location, AIS is every vessel doing the same thing at sea.

**Why does it exist?** Collision avoidance. When you're a 300-meter container ship carrying 20,000 containers, you need a way to tell other ships "I exist, I'm enormous, please don't hit me." GPS and radio solve this beautifully.

**What does AIS actually broadcast?**

```text
MMSI: 338234567          ← Unique ship ID (like a tail number)
Name: PACIFIC VOYAGER    ← Ship name
Position: 37.8°N 122.4°W ← Exact GPS coordinates
Speed: 14.2 knots        ← How fast
Course: 245°             ← Direction
Heading: 247°            ← Which way the bow is pointing
Status: Under way        ← What it's doing
Type: Container ship     ← What kind of vessel
Destination: SHANGHAI    ← Where it's going
ETA: 03/28 06:00         ← When it expects to arrive
```

**All of this. Unencrypted. In plain text. Being broadcast on 161.975 MHz and 162.025 MHz right now.** Including that suspicious yacht. 👀

## My AIS Discovery Moment ⚡

I was already running dump1090 for aircraft tracking when I found a Reddit thread: "RTL-SDR + AIS = free ship radar." I figured I'd try it for twenty minutes before getting bored.

That was six hours ago.

In my RF experiments, I've decoded aircraft, weather satellites, pagers, and IoT sensors. But there's something uniquely hypnotic about watching ships. They move slowly, they carry enormous cargo across vast distances, and when you zoom out on the map, you realize the ocean is absolutely PACKED with vessels you never think about.

As a developer exploring radio frequencies, I started to wonder: *How does a ship even know another ship is nearby?* This is the answer. And now I can see it in real-time from my desk. The shipping lane off the coast looked like a highway at rush hour. 🌊🚢🚢🚢

## How AIS Works (The Technical Bit) 📻

**Frequency:** 161.975 MHz and 162.025 MHz (VHF marine channels 87B and 88B)

**Modulation:** GMSK (Gaussian Minimum Shift Keying) — a digital mode your SDR can decode

**Transmission rate:**
- Moving vessels: every 2-10 seconds
- Anchored vessels: every 3 minutes
- Large ships at speed: every 2 seconds

**Range:** 15-40 nautical miles for sea-level receivers. From a high elevation, you can receive ships 60+ miles away!

**Message types:**
- **Type 1/2/3:** Standard position reports (speed, heading, position)
- **Type 5:** Voyage data (name, destination, cargo type, dimensions)
- **Type 18:** Class B (smaller vessels, pleasure boats)
- **Type 21:** Aid-to-navigation (buoys, lighthouses!)
- **Type 24:** Static data (vessel name, call sign)

**The beautiful thing for developers:** AIS data is structured, consistent, and arrives in NMEA format — the same format used by GPS devices. If you've ever parsed GPS data, AIS will feel immediately familiar. 🎯

## Setting Up Your Ship Radar (Seriously Easy) 🛠️

### What You Need

- **RTL-SDR dongle:** ($25) — the usual suspect
- **Antenna:** The included antenna works, but a simple 162 MHz dipole is better
- **Software:** Free! AIS decoder software runs everywhere

### The Software Stack

**On Linux (my favorite way):**

```bash
# Install rtl-sdr tools
sudo apt install rtl-sdr

# Install AIS decoder
sudo apt install aisdecoder

# Or grab the excellent rtl-ais (dedicated tool)
git clone https://github.com/dgiardini/rtl-ais
cd rtl-ais && make

# Run it! Pipe raw SDR to the decoder
rtl_fm -f 162.0M -s 48k - | aisdecoder -h 127.0.0.1 -p 10110 -a file -c stereo

# OR use rtl-ais directly (handles both AIS channels automatically!)
./rtl-ais
```

**On Windows:**
- **SDR#** + **AISmon plugin** — just works
- **ShipPlotter** — paid but polished, with great maps

**On Mac:**
- **CubicSDR** + pipe to **aisdecoder**
- **AIS Dispatcher** via Homebrew

### The Map That Will Ruin Your Weekend

Once you've got AIS data flowing, you need a map to visualize it:

```bash
# OpenCPN - the gold standard free chart plotter
sudo apt install opencpn

# Or run the lightweight AIS dispatcher
# and pipe to OpenSeaMap in your browser
```

**Five minutes after starting my setup:**

My terminal was printing boat names. There was a container ship named EVER GIVEN (yes, THAT one's sister ship!) 30 miles offshore. A coast guard cutter patrolling the harbor entrance. A tugboat pushing a barge. A fishing vessel moving very slowly in suspicious circles.

**I did not close the laptop for six hours.** 🗺️

## What You'll Actually See 👁️

### The Shipping Lanes (They're Wild)

Here's what fascinated me: if you're anywhere near a coast, you can see that the ocean has **lanes** just like highways. Ships travel established routes for efficiency and safety. When you visualize this on a map, you can literally see the arteries of global trade moving in slow motion.

I watched a container ship loaded in China — carrying electronics, clothing, maybe the very phone I'm typing this on — cross the Pacific and enter San Francisco Bay. That took three weeks. My $25 dongle caught the final leg. 🌏

### The Weird and Wonderful Traffic

Once you're watching, you start categorizing everything:

- **Massive container ships** moving at 18 knots like slow-motion freight trains
- **Tankers** heavy with oil, riding low in the water (you can tell by the draft in their Type 5 data)
- **Car carriers** — enormous floating parking garages
- **Cruise ships** (status: "moored" for 18 hours means port day!)
- **Tug boats** going everywhere fast
- **Fishing vessels** doing their chaotic zigzag pattern
- **Pleasure boats** with delightful names like "FINANCIAL FREEDOM" and "SECOND MORTGAGE"
- **Military vessels** (they often transmit too, just with less detail)
- **Coast guard cutters** quietly patrolling

**The most exciting moment:** Watching a ship declare an emergency status. "Not under command" means the engine or steering failed. You can see it broadcast in real-time while coast guard vessels converge on it from three directions. Reality is dramatic! 🚨

## Building Something Useful: Feed the Network 🌍

Just like ADS-B has FlightAware, AIS has aggregation networks where your data makes the global picture more complete:

**MarineTraffic** — the biggest ship tracking site. Feed them your AIS data and get a free premium account.

```bash
# Install the VesselFinder or MarineTraffic feeder
# (they provide step-by-step installers — very beginner friendly!)
# Your receiver becomes part of the global maritime radar network!
```

**What I love about this:** I'm in my apartment, listening to radio waves, and feeding live data into a database that shipping companies, port authorities, and search-and-rescue teams around the world actually use. That $25 dongle is doing real work! 💪

## DIY Antenna for Better Range 📡

The included RTL-SDR antenna works fine for nearby ships, but a properly tuned antenna for 162 MHz makes a huge difference:

**Quick DIY VHF dipole (takes 20 minutes):**

```text
Total wire needed: ~90 cm of copper wire or coat hanger wire
Each element: 45 cm (quarter wavelength at 162 MHz)
Arrange in a "V" shape at 120° angle
Connect center conductor to one element, shield to other
```

**What changed after I made this:** Ships 40+ miles offshore started appearing. I could suddenly see traffic I was completely missing before. The physics of antennas is not magic — it's just tuned resonance. But it FEELS like magic. 🪄

## Connecting to the NMEA Data Stream (Developer Mode) 💻

This is where it gets fun for programmers. AIS data streams over a TCP port in standard NMEA format:

```python
import socket

# Connect to your local AIS decoder
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(('127.0.0.1', 10110))

# Parse incoming NMEA sentences
while True:
    data = sock.recv(1024).decode()
    for line in data.strip().split('\n'):
        if line.startswith('!AIVDM'):
            print(f"AIS message: {line}")
            # Parse with pyais library!
```

**pyais** is the Python library you want:

```bash
pip install pyais

# Now decode like a pro:
from pyais import decode
msg = decode(b"!AIVDM,1,1,,B,15M67N0P00G?Uf6E`FepT@3n00Sa,0*73")
print(msg.decode())
# → {'mmsi': 366268061, 'speed': 0.0, 'lat': 37.808, 'lon': -122.476, ...}
```

**Project idea:** Build a web dashboard showing real-time ship positions on a Leaflet.js map, fed by your own RTL-SDR. Full-stack developer meets radio hobbyist. This is exactly the kind of project that makes other developers say "wait, you built WHAT?" 😎

## Legal and Ethical Stuff 🚨

**The short version:** AIS is intentionally broadcast to be received publicly. This is not a privacy issue — it's a safety system. Ships are legally required to transmit AIS in most cases.

**What's fine:**
- ✅ Receiving and viewing AIS data (completely legal everywhere)
- ✅ Feeding data to aggregation networks like MarineTraffic
- ✅ Building your own tracking applications
- ✅ Using the data for research, hobby projects, journalism

**What to avoid:**
- ❌ Using vessel positions to facilitate piracy or illegal boarding (obviously)
- ❌ Jamming or interfering with AIS transmissions (illegal, dangerous, ruins the safety system)
- ❌ Acting on information about cargo to commit crimes

**Important note:** Some vessels do spoof or disable AIS for various reasons (evading sanctions, fishing illegally, etc.). This is a real and interesting area of research. The Global Fishing Watch project uses AIS gaps to detect illegal fishing. Citizen science is powerful! 🌊

## The Data Is Surprisingly Revealing 🕵️

Once you start pulling Type 5 messages, you see:

- Exact cargo type ("PETROLEUM PRODUCTS", "VEHICLES", "GRAIN")
- Draught (how deep the ship sits — tells you how loaded it is)
- Dimensions (some ships are truly incomprehensible in size)
- IMO number (cross-reference with public vessel databases)
- Call sign (look up the owner, history, flags of convenience)

As a developer exploring radio frequencies, I built a little script to log every unique vessel I received over 30 days. I ended up with a database of 847 unique ships, 23 nationalities, and cargo from 40+ countries. It's accidental data journalism! 📊

## Resources to Get Started 🔧

**Software:**
- **rtl-ais** (GitHub: dgiardini/rtl-ais) — dedicated RTL-SDR AIS decoder
- **OpenCPN** — free professional chart plotter
- **pyais** — Python library for parsing AIS data

**Web Tools (No Hardware Required to Explore):**
- **MarineTraffic.com** — global ship tracking map
- **VesselFinder.com** — alternative with great detail
- **ShipXplorer.com** — excellent AIS data visualization

**Learning:**
- ITU Radio Regulations (AIS spec) — the actual protocol document if you want the geeky details
- r/RTLSDR — lots of AIS posts and success stories
- MarineTraffic's feeder setup guide — best onboarding for contributing data

## TL;DR — Your Weekend Maritime Adventure Plan 🗺️

**Total cost:** $25 (you already have the dongle if you've read my other posts!)

**Saturday:**
1. Install rtl-ais or configure SDR# with AISmon plugin
2. Tune to 162.0 MHz and watch the NMEA sentences roll in
3. Set up OpenCPN or connect to a web dashboard
4. Find your nearest shipping lane and watch global trade move in real-time
5. Lose entire afternoon. Order takeout. Do not regret.

**Sunday:**
1. Build a simple DIY dipole antenna for better range
2. Sign up to feed MarineTraffic (free premium account!)
3. Start logging data with Python + pyais
4. Build something — a local port dashboard, a cargo-type tracker, a tweet bot that announces ship names (trust me, ship names are HILARIOUS)

**After three weeks of AIS monitoring**, I now know more about maritime shipping than I ever expected. I know which routes the big container ships favor. I know when the cruise ships rotate in and out of port. I know that there's always at least one vessel with a name that sounds like a bad band name (current favorite: "MYSTERIOUS HORIZON"). 🚢

The electromagnetic spectrum keeps revealing hidden worlds. Aircraft with ADS-B, pagers with POCSAG, IoT sensors on 433 MHz — and now an entire ocean full of ships, all talking, all the time, waiting for someone with a $25 USB stick to listen.

The sea is alive with signals. Go find them. 📡

---

**Tracking ships with SDR?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share what's passing your coastline!

**Check out my data logging scripts and SDR projects** on [GitHub](https://github.com/kpanuragh) — including the little AIS vessel database I've been building!

*Next time you see a "Made in China" label, remember: the ship that carried it was broadcasting its exact position the whole way across the Pacific. You could have tracked it yourself. You still can.* 🌊📡

---

**P.S.** My most received ship name in 30 days of logging: "EVER FORTUNE." I choose to take this as a sign. 🍀

**P.P.S.** Yes, I checked — there IS an AIS receiver pointed at the Suez Canal, and yes, you CAN watch for another container ship to get stuck. I have a cron job ready. I'm not proud of this but I'm not not proud of it either.
