---
title: "ADS-B: I'm Tracking Real Planes with a $20 USB Stick! ✈️📡"
date: "2026-02-19"
excerpt: "Forget FlightRadar24 subscriptions — I set up my own live aircraft tracker using a $20 RTL-SDR dongle and a Raspberry Pi. Now I watch every flight over my city on a real-time map I built myself. It's the most satisfying SDR project I've ever done, and it takes ONE afternoon!"
tags: ["\\\"rf\\\"", "\\\"sdr\\\"", "\\\"wireless\\\"", "\\\"hobby\\\"", "\\\"adsb\\\""]
featured: "true"
---




# ADS-B: I'm Tracking Real Planes with a $20 USB Stick! ✈️📡

**Real talk:** I was staring at FlightRadar24 watching a plane fly over my house. Then it hit me: "Someone is RECEIVING those signals right now. Could that someone be... me?"

One Google search later: "RTL-SDR ADS-B aircraft tracking."

Four hours after that: I had a live map of EVERY plane within 200 miles, running on a Raspberry Pi in my living room, updating in real-time, showing callsigns, altitudes, speeds, and routes. FOR FREE.

**My reaction:** "I've been paying for flight tracking apps this whole time? I could've been RECEIVING THE ACTUAL SIGNALS?!" 🤦

Welcome to ADS-B — the beginner SDR project that hooks everyone who tries it. Strap in! 🛫

## What Is ADS-B and Why Is It Everywhere? 🤔

**ADS-B = Automatic Dependent Surveillance-Broadcast**

**Translation:** Every commercial aircraft (and most private planes) has a transponder that constantly shouts "HEY! I'M HERE! Here's my GPS position, altitude, speed, and flight number!"

Think of it like this:
- **Old radar:** Ground stations bounce signals off planes and estimate position (imprecise!)
- **ADS-B:** Planes broadcast their OWN GPS position every second (precise!)

**Frequency:** 1090 MHz (a single, fixed frequency — SUPER easy to receive!)

**What's in each broadcast:**
```
ICAO Address: 4840D6 (unique aircraft ID)
Callsign: UAL1234
Altitude: 35,000 ft
Speed: 520 knots
Heading: 274°
Vertical Rate: 0 ft/min (level flight)
Position: 37.6° N, 122.3° W
```

**What fascinated me as a developer:** ADS-B packets are raw binary data with a simple protocol. I'm literally receiving and decoding aviation communication data from aircraft 30,000 feet above me. With a $20 USB dongle! 📡

## How I Discovered This (The Rabbit Hole) 🐰

### Day 1: The Accidental Discovery

**Me:** *Messing around with my RTL-SDR, scanning 1090 MHz out of curiosity*

**Waterfall display:** Shows rapid short bursts appearing constantly

**Me:** "What ARE these signals? They're so regular..."

**Google:** "Those are ADS-B transponder signals from aircraft"

**Me:** "...I can just... receive plane data? With MY radio?" 😱

### Day 2: First Successful Decode

In my RF experiments, getting the first ADS-B decode was almost embarrassingly easy:

```bash
# Install dump1090 (the ADS-B decoder)
sudo apt-get install dump1090-fa

# Run it and watch planes appear!
dump1090-fa --interactive

# IMMEDIATELY got output:
# ADSB> Hex: 4840D6 Call: UAL1234 Alt: 35000 Lat: 37.6 Lon: -122.3
```

**Time from zero to first plane decode:** Under 5 minutes. FIVE MINUTES! 🎯

### Day 3: The Beautiful Map

The moment I added the web interface and saw the live map with plane icons moving in real-time — that was it. I was completely, irreversibly hooked.

```bash
# Access the built-in web map
dump1090-fa --net
# Open browser: http://localhost:8080
# See real planes on a live map! 🗺️
```

**What I saw:** 23 aircraft within 150 miles of my house. All showing real-time positions, callsigns, altitudes. A United flight from San Francisco to Denver. A Delta regional jet. A Cessna doing circles (training flight). A FedEx cargo plane cruising at 38,000 ft.

**I was watching REAL planes. With a $20 USB stick. From my COUCH.** Mind destroyed. 🤯

## Why ADS-B Is Perfect for SDR Beginners 🎯

As a developer exploring radio frequencies, ADS-B hits the sweet spot:

**1. Single frequency (1090 MHz)**
No frequency hopping, no searching — just point at 1090 MHz and data floods in!

**2. Strong signals**
Aircraft transmit at 125-250 watts. They're 30,000 feet up with line-of-sight. You'll get signals from 200+ miles away even with a basic antenna!

**3. Existing tools (FREE!)**
dump1090, Mode S Beast, ADS-B Exchange — incredible open-source ecosystem!

**4. Immediate visual feedback**
Within minutes of setup, you see live planes on a map. Instant gratification. 🗺️

**5. It's legal everywhere**
ADS-B is passive receive. You're not transmitting anything. You're just listening to public safety broadcasts that planes are REQUIRED to make!

## The Hardware Setup (Embarrassingly Cheap!) 🛠️

### What You Need

**Option 1: Minimal Setup ($20)**
- RTL-SDR Blog v3 dongle: $20
- Stock whip antenna included
- Any laptop or Raspberry Pi you have

**Option 2: Proper Setup ($50)**
- RTL-SDR Blog v3 dongle: $20
- 1090 MHz dedicated antenna: $15 (huge range improvement!)
- Low-noise amplifier (LNA): $15 (even better range!)

**Option 3: The Full Station ($120)**
- FlightAware Pro Stick Plus (built-in LNA): $30
- 1090 MHz "spider" antenna: $40
- Raspberry Pi 4: $50
- Runs 24/7 as a permanent flight tracker!

**My setup:** FlightAware Pro Stick + spider antenna on my roof + Raspberry Pi 4. I see planes up to 250 miles away on a good day! ✈️

### The Antenna Matters HUGELY

**Bad antenna (stock whip):** 50-80 miles range

**Good 1090 MHz antenna (mounted outside):** 150-250 miles range

**What I use:**
```
The "spider" antenna design:
- 1 vertical element: 65mm (quarter wavelength at 1090 MHz)
- 4 ground plane radials: 65mm each
- Total cost to build: $5 in wire!
- Range improvement over stock: 3x-5x
```

**What fascinated me:** A properly cut wire dramatically outperforms a "professional" stock antenna. Physics doesn't care about branding! 📡

## Software Setup (Free and Open Source!) 💻

### Step 1: Install dump1090

```bash
# On Raspberry Pi / Debian / Ubuntu
sudo apt-get update
sudo apt-get install dump1090-fa

# OR install FlightAware's fork (best maintained)
curl -L https://flightaware.com/adsb/piaware/install | bash
sudo apt-get install dump1090-fa

# Plug in your RTL-SDR dongle
# Start dump1090
dump1090-fa --net --net-http-port 8080
```

### Step 2: View Your First Planes

```bash
# Interactive terminal view
dump1090-fa --interactive

# You'll see something beautiful:
#
# Hex     Flight  Alt    Speed  Lat       Lon
# 4840D6  UAL1234 35000  520kt  37.6182  -122.3574
# A1B2C3  DAL567  12000  280kt  37.8901  -122.0231
# BEEF42  N12345  2500   120kt  37.4512  -122.6789
#         (Cessna)
```

### Step 3: The Beautiful Web Map

```bash
# Open your browser
open http://localhost:8080

# What you get:
# - Live aircraft positions on a map 🗺️
# - Trails showing where each plane has been
# - Click any plane for details
# - Updates every second!
```

**My favorite feature:** The trails. You can see exactly what path each plane took over your area. Commercial flights follow such precise airways — it's mesmerizing to watch! ✈️

### Step 4: Decode the Binary Data Yourself

As a developer, I wanted to understand the protocol. ADS-B packets are 112-bit binary messages:

```python
# ADS-B packet structure (simplified)
# *8D4840D6202CC371C32CE0576098;   <- raw hex from dump1090

def decode_adsb_packet(hex_string):
    """Decode a raw ADS-B packet"""
    data = bytes.fromhex(hex_string)

    # Downlink Format (bits 1-5)
    df = (data[0] >> 3) & 0x1F

    # ICAO Aircraft Address (bits 9-32)
    icao = data[1:4].hex().upper()

    # Message Type Code (bits 33-37)
    tc = (data[4] >> 3) & 0x1F

    if tc >= 9 and tc <= 18:
        msg_type = "Airborne Position"
    elif tc >= 1 and tc <= 4:
        msg_type = "Aircraft Identification"
    elif tc == 19:
        msg_type = "Airborne Velocity"

    return {
        'df': df,
        'icao': icao,
        'type_code': tc,
        'message_type': msg_type
    }

# Example output:
# {'df': 17, 'icao': '4840D6', 'type_code': 11, 'message_type': 'Airborne Position'}
```

**What blew my developer brain:** The position encoding uses a clever algorithm called Compact Position Reporting (CPR). You need TWO consecutive packets from the same aircraft to calculate the actual latitude/longitude. It's an elegant solution to sending position with fewer bits! 🧠

## Cool Projects I Built with ADS-B Data 🚀

### Project 1: Personal Flight Logger

**The goal:** Log every flight that passes over my house

```python
#!/usr/bin/env python3
import requests
import sqlite3
import time
from datetime import datetime

def get_aircraft():
    """Get live aircraft data from dump1090"""
    response = requests.get('http://localhost:8080/data/aircraft.json')
    return response.json()['aircraft']

# Database setup
conn = sqlite3.connect('flights.db')
cursor = conn.cursor()
cursor.execute('''
    CREATE TABLE IF NOT EXISTS flights (
        icao TEXT,
        callsign TEXT,
        altitude INTEGER,
        speed INTEGER,
        lat REAL,
        lon REAL,
        timestamp TEXT
    )
''')

# Log every aircraft every 30 seconds
while True:
    aircraft = get_aircraft()
    timestamp = datetime.now().isoformat()

    for plane in aircraft:
        if 'lat' in plane and 'lon' in plane:
            cursor.execute(
                'INSERT INTO flights VALUES (?, ?, ?, ?, ?, ?, ?)',
                (
                    plane.get('hex', ''),
                    plane.get('flight', '').strip(),
                    plane.get('altitude', 0),
                    plane.get('speed', 0),
                    plane['lat'],
                    plane['lon'],
                    timestamp
                )
            )

    conn.commit()
    print(f"Logged {len(aircraft)} aircraft at {timestamp}")
    time.sleep(30)
```

**Result:** After a week, I had data on 4,847 unique flights! I built charts showing peak traffic hours (Tuesday morning = chaos!), most common airlines, and average altitude over my house. Data nerd paradise! 📊

### Project 2: Airplane Overhead Alerter

**The idea:** Ping me when interesting flights pass overhead

```python
import requests
import subprocess
from math import radians, cos, sin, asin, sqrt

def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance between two GPS points in miles"""
    R = 3956  # Earth radius in miles
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    return 2 * R * asin(sqrt(a))

MY_LAT = 37.7749   # Your location
MY_LON = -122.4194
ALERT_RADIUS = 5   # Miles

def check_overhead():
    aircraft = requests.get('http://localhost:8080/data/aircraft.json').json()['aircraft']

    for plane in aircraft:
        if 'lat' not in plane:
            continue

        distance = haversine(MY_LAT, MY_LON, plane['lat'], plane['lon'])

        if distance < ALERT_RADIUS:
            callsign = plane.get('flight', 'Unknown').strip()
            altitude = plane.get('altitude', 0)
            speed = plane.get('speed', 0)

            # Desktop notification (macOS)
            subprocess.run([
                'osascript', '-e',
                f'display notification "✈️ {callsign} overhead at {altitude}ft!" with title "Aircraft Alert"'
            ])

            print(f"OVERHEAD: {callsign} at {altitude}ft, {speed}kt")
```

**Best alert I ever got:** Air Force One flew over my city during a presidential visit. My script caught it (BLOCKED callsign, military transponder type) before I even heard the news! 🤩

### Project 3: 24/7 Permanent Ground Station

**The upgrade:** Run everything on a Raspberry Pi mounted near my window

```bash
# Raspberry Pi setup
sudo apt-get install raspi-config
# Enable auto-start

# Install PiAware (FlightAware feeder)
# Now your data feeds FlightAware AND you get free premium account!

sudo systemctl enable dump1090-fa
sudo systemctl enable piaware
sudo systemctl start dump1090-fa
sudo systemctl start piaware
```

**What contributing to FlightAware gets you:**
- Free FlightAware Enterprise account ($89/month free!)
- Live aircraft data on their global platform
- Your receiver added to their coverage map
- The satisfaction of contributing to global aviation safety! ✈️

**My stats after 30 days running 24/7:**
- Aircraft tracked: 127,432
- Positions reported: 4.2 million
- Max range: 241 miles (Alaska Airlines over Pacific!)
- FlightAware account value: $89/month → FREE! 🎉

## What the Data Tells You (Developer's Perspective) 📊

As someone who thinks in APIs and data structures, ADS-B data is GOLD:

```json
// Live aircraft JSON from dump1090
{
  "hex": "a4dc07",
  "type": "adsb_icao",
  "flight": "SWA1234 ",
  "alt_baro": 37000,
  "alt_geom": 37275,
  "gs": 498.3,
  "track": 85.2,
  "baro_rate": 0,
  "squawk": "2341",
  "emergency": "none",
  "category": "A3",
  "nav_qnh": 1013.6,
  "nav_altitude_mcp": 37008,
  "nav_heading": 85.0,
  "lat": 37.618,
  "lon": -121.943,
  "nic": 8,
  "rc": 186,
  "seen_pos": 0.2,
  "version": 2,
  "nic_baro": 1,
  "nac_p": 10,
  "nac_v": 2,
  "sil": 3,
  "sil_type": "perhour",
  "gva": 2,
  "sda": 2,
  "rssi": -14.8,
  "messages": 1847,
  "seen": 0.1
}
```

**Cool data fields I explore:**

- `rssi`: Signal strength — how close/strong the aircraft is!
- `nic`: Navigation Integrity Category — GPS accuracy metric
- `squawk`: 4-digit emergency code (7700 = emergency, 7500 = hijacking!)
- `alt_baro` vs `alt_geom`: Barometric vs GPS altitude — spot the difference!
- `messages`: How many packets received — shows link quality! 📡

## The Military Exclusion Zone Discovery 🎖️

**Most interesting thing I found in my ADS-B data:**

I noticed blank zones where NO aircraft appear — even when FlightAware showed them there. These are military aircraft that either:

1. Don't broadcast ADS-B (military exemption)
2. Broadcast with encrypted military Mode 5 transponders
3. Are deliberately excluded from civilian tracking databases

I live near a military base, so I started seeing patterns. Regular "phantom" radar paint returns near the base but no ADS-B identity. Helicopters that appear on my spectrum analyzer at 1090 MHz but show as "??" in dump1090.

**What this taught me:** ADS-B is not the ONLY transponder system! There's Mode A/C (altitude only), Mode S (full data), ADS-B (GPS + data), and military Mode 5. The sky has layers of RF communication we civilians can only partially see! 🛡️

## The Night That Made Me a True ADS-B Addict 🌙

Two months into running my station, it was 2 AM and I couldn't sleep. I opened my ADS-B map expecting nothing.

**What I saw:** 47 aircraft over the Pacific Ocean. Container ships don't show up on ADS-B... but their regular cargo flights do. Fedex, UPS, DHL cargo jets crossing the ocean. A Hawaiian Airlines red-eye. A Korean Air 747 at 41,000 feet.

All of them broadcasting their position to anyone listening. And there I was — a sleep-deprived developer with a $20 USB stick — watching the invisible global air traffic network at 2 AM.

**I felt like I had a superpower.** The ability to see something invisible that's been there my entire life. And it cost me less than dinner. 🌎

## Legal & Safety Stuff ⚖️

### The Beautiful Truth: It's All Legal! ✅

**ADS-B receiving is:**
- ✅ 100% legal worldwide (passive reception)
- ✅ You're receiving PUBLIC safety broadcasts
- ✅ No license required
- ✅ Aircraft are REQUIRED to transmit this data
- ✅ Commercial services like FlightRadar24 do exactly this!

**What ADS-B is NOT:**
- ❌ Aircraft radar (that's different tech)
- ❌ Air traffic control comms (those are VHF voice)
- ❌ Private communication

**One important thing:** Some aircraft DO opt out of public tracking databases (celebrities, private jets). Technically their ADS-B signals are still there on 1090 MHz — but it's considered respectful to filter them out of public maps. The commercial services do this. Your local dump1090 instance sees everything (by design — safety first!)

**Never transmit on aviation frequencies.** Receiving = fine. Transmitting on aviation bands without a license and reason = very illegal. Listen only! 🎧

## Getting Started This Weekend 🚀

### Saturday Morning: Basic Setup

**What you need:**
1. RTL-SDR Blog v3 dongle ($20) — or any RTL-SDR you have
2. A computer (Raspberry Pi, laptop, desktop)
3. 30 minutes

**The commands:**
```bash
# Install driver and dump1090
sudo apt-get install rtl-sdr dump1090-fa

# Plug in your RTL-SDR
# Test the dongle works
rtl_test

# Start receiving planes!
dump1090-fa --interactive --net

# Open map
# Browser → http://localhost:8080
```

**What you'll see in the next 5 minutes:** Your first real aircraft on your map! I guarantee it (unless you're in a very rural area!).

### Sunday: Level Up

1. Connect Pi to a window-mounted antenna
2. Install PiAware and contribute to FlightAware
3. Write your first Python script to log and analyze flights
4. Find the aircraft that fly the most consistent routes over your house

## Resources for Getting Started 📚

**Software (FREE!):**
- [dump1090-fa](https://github.com/flightaware/dump1090) — the gold standard decoder
- [tar1090](https://github.com/wiedehopf/tar1090) — better web interface with history
- [PiAware](https://www.flightaware.com/adsb/piaware/) — feed FlightAware, get free premium account

**Hardware:**
- RTL-SDR Blog v3 ($20) — great all-around dongle
- FlightAware Pro Stick Plus ($30) — has built-in LNA for ADS-B
- Any 1090 MHz antenna (even DIY spider works great!)

**Learning the Protocol:**
- [The 1090 Megahertz Riddle](https://mode-s.org/decode/) — FREE book on ADS-B decoding
- [ADS-B Exchange](https://www.adsbexchange.com/) — community aggregator, all unfiltered data
- r/RTLSDR — best community for SDR beginners

**Communities:**
- r/RTLSDR — where I learned everything
- r/flightradar24 — for the plane-watching obsessives
- OpenSky Network — research dataset from community receivers

## The Bottom Line 💡

ADS-B is the gateway drug of SDR hobbies. It's the project that answers "OK, I have this SDR dongle... now what?" with "NOW YOU TRACK PLANES."

**What I learned as a developer exploring radio frequencies:**

The sky above your head is full of data. Right now, as you read this, there are aircraft broadcasting their GPS coordinates, speeds, and callsigns to anyone with the right $20 hardware. It's not hidden. It's not secret. It's just... invisible. Until you build a receiver.

**After six months of running my ADS-B station**, I've logged over 600,000 unique flights, caught three squawk 7700 emergencies, spotted a presidential flight, and watched the overnight Pacific cargo network like it's a live TV show.

And it started with a $20 USB stick and a search for "what is this signal at 1090 MHz."

Welcome to ADS-B. Your sky will never look the same again. ✈️📡

## TL;DR

- Planes broadcast GPS position every second on 1090 MHz
- $20 RTL-SDR dongle + free software = live aircraft tracker
- Works in 30 minutes, costs nothing beyond the hardware
- 100% legal everywhere (passive receive only)
- Contributes to aviation safety infrastructure
- Turns you into someone who stares at the sky differently forever 🛫

---

**Built a plane tracking station?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your max range record!

**Want to see my ADS-B projects?** Check out my [GitHub](https://github.com/kpanuragh) — flight loggers, overhead alerters, and data analysis scripts!

*Now go plug in that RTL-SDR and watch the sky wake up. Welcome to the global air traffic network — you've been invited!* ✈️📡🗺️

---

**P.S.** The first time squawk 7700 (emergency) appears on your display, your heart rate matches the pilot's. I watched a Southwest flight declare emergency, divert to the nearest airport, and land — all tracked live on my homemade receiver. That's when this stopped being a hobby and became something else entirely. 🚨

**P.P.S.** I now travel with my RTL-SDR dongle. First thing I do in a hotel room? Set up dump1090, open the map, and watch which aircraft are around. My friends have given up understanding me. That's fine. MORE BANDWIDTH FOR ME. 📡

**P.P.P.S.** Warning: You WILL start explaining ADS-B to anyone who asks why you keep staring at your laptop screen at airports. "Oh, I'm not using the airport WiFi, I'm receiving the transponder signals from that United 737 at gate B7 and verifying the ICAO hex matches the tail number." They will walk away. You won't care. 🤓
