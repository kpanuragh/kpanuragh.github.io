---
title: "APRS: The Radio Protocol That Puts Ham Operators on a Live Map 📡"
date: "2026-03-09"
excerpt: "I discovered APRS — a ham radio protocol that broadcasts GPS positions, weather data, and text messages over radio, and someone built a live world map out of it. Here's how I decoded it with a $25 SDR and got absolutely hooked."
tags: ["\"rf\"", "\"sdr\"", "\"wireless\"", "\"hobby\"", "\"aprs\"", "\"ham-radio\""]
featured: "true"
---

# APRS: The Radio Protocol That Puts Ham Operators on a Live Map 📡

**Hot take:** There's a live, real-time map of ham radio operators, weather stations, hikers, and emergency vehicles powered entirely by radio transmissions — and you can tap into the raw data stream with a $25 dongle and a piece of wire.

That's APRS. And the first time I decoded a packet from a weather station 40 miles away while sitting in my apartment, I got that same feeling I had when I first used `curl` to hit an API and got back actual data. "Wait… this is just packets. Radio packets."

I've been obsessed ever since.

## What Even IS APRS? 🤔

**APRS = Automatic Packet Reporting System**

Invented in the 1990s by Bob Bruninga (WB4APR), APRS is a digital radio protocol that lets amateur radio operators broadcast:

- **GPS coordinates** (your location, updated in real-time)
- **Weather data** (temperature, wind speed, rainfall from radio-connected weather stations)
- **Text messages** (yep, SMS over radio, no cell towers needed)
- **Status updates** ("Driving from Mumbai to Pune, testing mobile rig")
- **Objects** (marking the position of a disaster zone, event, or repeater)

**The magic:** All of this is broadcast on a single shared frequency — **144.390 MHz** in North America (144.800 MHz in Europe) — and volunteer internet-connected stations (called "IGates") relay the packets to a global internet database.

That database? It's at **aprs.fi** — a live world map where you can watch radio packets arrive in real time. It's basically Twitter for radio operators, except it runs on ham radio and has been doing it since before Twitter existed.

## How I Stumbled Into This Rabbit Hole 🐰

I was scanning my local 2-meter band with GQRX when I hit 144.390 MHz and heard something weird. Not music. Not voice. A rapid, scratchy, digital-sounding burst. About one second long. Repeated every few minutes from different sources.

```
beeeeep-brrrrp-beeee-brrrp
```

**Me:** "What IS that?"

**Google:** "That's APRS. It's AX.25 packet radio."

**Me:** "There's a packet protocol running on radio and I never knew about this??"

Down the rabbit hole I went. Three weeks later I had a live dashboard on my wall showing every APRS packet decoded within 100 miles of my house.

## How APRS Actually Works (Developer Explanation) 🔬

As a developer exploring radio frequencies, the first thing I wanted to understand was the protocol stack. Turns out it's surprisingly neat:

**Layer 1 (Physical):** FM radio signal on 144.390 MHz

**Layer 2 (Data Link):** AX.25 — an amateur radio adaptation of the X.25 packet protocol from the 1970s. Think of it like Ethernet frames, but for radio. Each frame has source callsign, destination, path (repeater hops), and payload.

**Layer 3 (Application):** APRS information field — a text format encoding location, weather, messages, etc.

**An APRS packet looks like this:**

```
KB5WIA-9>APRS,WIDE1-1,WIDE2-1:!3322.75N/09634.54W>078/045/A=001155 Mobile
```

Breaking that down:
- `KB5WIA-9` — source callsign (the "-9" means mobile)
- `APRS` — destination (tells digipeaters this is an APRS frame)
- `WIDE1-1,WIDE2-1` — path (asking to be relayed by 2 digipeater hops)
- `!` — position report (real-time, no timestamp)
- `3322.75N/09634.54W` — latitude/longitude (NMEA-like format)
- `>` — symbol table + symbol code (car icon on the map!)
- `078/045` — course 78°, speed 45 km/h
- `A=001155` — altitude 1155 feet
- `Mobile` — free-text comment

**What fascinated me as a developer:** It's literally a text-based protocol over radio packets. Once you understand the format, reading APRS data is like reading log lines. Just… transmitted by radio across hundreds of miles.

## Setting Up an APRS Decoder with RTL-SDR 📻

You need three things:

1. **RTL-SDR dongle** (~$25) — receives 144.390 MHz
2. **Simple VHF antenna** — even a telescoping antenna works; a proper 1/4-wave (~51cm) is better
3. **Direwolf software** — open-source APRS decoder (and also a full TNC/modem)

### Step 1: Install Direwolf

```bash
# Ubuntu/Debian
sudo apt-get install direwolf

# macOS
brew install direwolf

# From source (for latest features)
git clone https://github.com/wb2osz/direwolf.git
cd direwolf
mkdir build && cd build
cmake ..
make -j4
sudo make install
```

### Step 2: Pipe RTL-SDR into Direwolf

```bash
# Tune to 144.390 MHz, FM demod, pipe audio to Direwolf
rtl_fm -f 144.390M -M fm -s 22050 -r 22050 - | \
    direwolf -c /dev/stdin -r 22050 -D 1 -
```

**What this does:**
- `rtl_fm` tunes to APRS frequency and demodulates FM
- Output is raw audio (the "scratchy sounds" I heard)
- Direwolf acts as a software modem (AFSK demodulator)
- Decodes AX.25 frames from the audio tones
- Prints decoded APRS packets to terminal

### Step 3: Watch the Packets Roll In 🎉

In my RF experiments, within 30 seconds of starting this on a weekend afternoon I saw:

```
Heard: W5KA-15>APRS,WB5KSD-3*,WIDE2-1:!3547.43N/09718.52W>042/023 En route
Heard: WD5GNR-3>APZWXSV,WB5KSD-3*:@100523z3554.08N/09711.35W_260/003g006t072r000
Heard: KA5RCE-1>APZ19N,WB5KSD-3*,WIDE2-1:/010526z3604.11N/09717.15WO270/000/A=001200
```

**Translation:**
- A mobile station (car) moving at 23 km/h heading northeast
- A weather station reporting 72°F, wind 3 mph from 260°
- A balloon (the `O` symbol!) at 1200 feet altitude!

**A BALLOON. I was tracking an amateur radio balloon.** From my apartment. With a USB dongle. For free. I nearly knocked over my coffee.

## Reading the Data Like a Developer 💻

Direwolf outputs decoded data, but if you want to actually *do* something with it, you want structured output. Enter **APRSdroid** (Android), **YAAC** (Java GUI), or just piping Direwolf to a script.

Here's how I built a simple Python parser to capture packets:

```python
import subprocess
import re
from datetime import datetime

# Start Direwolf as subprocess, capture output
proc = subprocess.Popen(
    ['direwolf', '-c', '/dev/stdin', '-r', '22050', '-D', '1', '-'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL,
    text=True
)

# Parse the decoded packet lines
for line in proc.stdout:
    line = line.strip()

    # Direwolf outputs decoded callsign and data
    if line.startswith('Heard:'):
        parts = line.split(':', 2)
        if len(parts) >= 3:
            header = parts[1].strip()
            payload = parts[2].strip()
            callsign = header.split('>')[0]

            print(f"[{datetime.now().strftime('%H:%M:%S')}] {callsign}: {payload[:60]}")
```

**What I built with this:**
- A local SQLite database of every packet I've heard
- A web dashboard (Flask + Leaflet.js) showing stations on a map
- A Slack bot that alerts when specific callsigns are heard (hi Dad!)

## The APRS.fi Shortcut (For the Impatient) 🗺️

Don't have an SDR yet? Go to **aprs.fi** right now and zoom in to your city.

You'll see:
- Cars with antenna icons moving along roads in real time
- Weather station icons with current readings
- Hiking trails with tracker icons
- Emergency management stations during events
- Weather balloons arcing across the sky

**Every one of those icons is a real radio transmission.** Someone nearby has a radio transmitting packets that are being relayed by volunteer stations to this global map. No cellular, no internet on the transmitting end — just RF.

This is what I mean when I say the air around us is full of data we never think about.

## Practical Project Ideas 🚀

### Project 1: Home Weather Station on APRS

Many consumer weather stations (Davis, Ambient Weather) can output data to an APRS transmitter board. Connect one, get a ham license, and your weather station appears on the global map — available to any radio operator or emergency manager in a disaster.

**Why this matters:** In 2011 Japan earthquake, cell towers went down. APRS networks still worked. Ham operators with APRS rigs provided real-time position data to emergency coordinators.

### Project 2: APRS Packet Analyzer

Build a local receiver that:
- Logs every packet heard (callsign, timestamp, coordinates, comment)
- Stores in SQLite/PostgreSQL
- Builds heatmaps of where you hear the most traffic
- Tracks which digipeaters are relaying packets in your area

**Stack:** RTL-SDR → Direwolf → Python parser → PostgreSQL → Grafana

It's a legitimately useful "where is radio infrastructure in my area" tool.

### Project 3: APRS Balloon Tracker

If you get your ham license, you can build an APRS tracker for $50 and launch a high-altitude balloon. The community will watch your balloon on aprs.fi, radio operators along its path will hear it, and when it lands you'll have GPS coordinates to find it.

**Cost breakdown:**
- Tracker board (TTGO T-Beam ESP32 with LoRa): ~$30
- Helium balloon: ~$15
- Total: less than a fancy dinner

### Project 4: The "Who's Nearby" Alert

```python
import requests

def check_aprs_nearby(lat, lon, radius_km=50):
    """Query APRS.fi API for stations near a location."""
    # APRS.fi has a free API (get a key from their site)
    url = "https://api.aprs.fi/api/get"
    params = {
        'name': f'_area={lat-0.5},{lon-0.5},{lat+0.5},{lon+0.5}',
        'what': 'loc',
        'apikey': 'YOUR_KEY',
        'format': 'json'
    }
    response = requests.get(url, params=params)
    stations = response.json().get('entries', [])
    return [(s['name'], s.get('comment', '')) for s in stations]

# Shows every APRS station heard near you in last hour
nearby = check_aprs_nearby(12.9716, 77.5946)  # Bengaluru example
for callsign, comment in nearby:
    print(f"  {callsign}: {comment}")
```

This is how many SAR (Search and Rescue) apps work — they check the APRS network for anyone transmitting near a search zone.

## The Legal and Safety Stuff ⚖️

### Receiving: 100% Legal, No License Needed

Listening to APRS (or any amateur radio) requires zero license. Receiving is always legal. You can decode every APRS packet in your area all day, build dashboards, analyze traffic — perfectly fine.

### Transmitting: Need a Ham License

To *transmit* on 144.390 MHz you need an amateur radio license:
- **India:** NISM (National Institute of Amateur Radio) license
- **US:** FCC Technician license (multiple choice exam, no Morse code required)
- **UK:** Foundation licence (Ofcom)
- **Most countries:** Similar entry-level license exam

The entry-level exam in most countries is beginner-friendly. In the US it's 35 multiple choice questions and you can pass by studying a free question pool for a week.

### Privacy Note

APRS is intentionally public — operators know their transmissions are visible on global maps. Don't stalk people's APRS tracks. The protocol is designed for community awareness and emergency communications, not surveillance. Use it ethically.

## What Blew My Mind Most 🤯

As a developer, I kept comparing APRS to web protocols. And the parallels are wild:

| APRS | Web Equivalent |
|------|----------------|
| Callsign | Username/IP address |
| Digipeater | Router/relay node |
| IGate | Internet gateway |
| aprs.fi | Central aggregation API |
| WIDE1-1,WIDE2-1 | TTL/hop count |
| `>` symbol code | Content-Type header |

**It's a distributed, self-healing mesh network built on radio.** Packets hop through whoever's listening. If one digipeater goes down, packets route around it. It's been doing this since before "mesh networking" was a buzzword.

The engineering elegance of this, designed in the pre-smartphone era, using nothing but amateur radio and volunteer infrastructure — honestly kind of humbling.

## Getting Started This Weekend 📅

**What you need:**
1. RTL-SDR Blog v3 dongle ($25 on Amazon)
2. Any antenna (the included telescoping one works for a start)
3. Direwolf installed on your laptop
4. 30 minutes

**Do this:**
1. Plug in SDR, install Direwolf
2. Run the rtl_fm + Direwolf pipeline above
3. Watch packets decode in your terminal
4. Cross-reference callsigns on aprs.fi
5. Realize you've been surrounded by radio data your entire life

**If you want more range:** A simple J-pole antenna for 144 MHz (~$20 or buildable from copper pipe) will dramatically improve what you hear. I went from 20 miles to 80+ miles with one.

## Resources 📚

- **aprs.fi** — Live APRS map, start here
- **Direwolf GitHub** — Best software APRS decoder/TNC
- **aprsdroid.org** — Android APRS app (receive + transmit)
- **aprs.org** — Original APRS technical documentation by WB4APR
- **r/amateurradio** — Community that loves these questions
- **ARRL Technician License Manual** — If you want to transmit

## TL;DR 💡

APRS is a 1990s ham radio protocol where operators broadcast GPS positions, weather data, and messages on 144.390 MHz. Volunteer stations relay those packets to a global internet database that shows real-time maps of radio traffic worldwide.

You can decode every APRS packet in your area — for free, right now, no license — with a $25 RTL-SDR and Direwolf. Within minutes you'll be watching cars, weather stations, and occasionally balloons pop up on your terminal.

It's basically Twitter over radio, it's been running since 1993, and it's one of the most genuinely useful pieces of amateur radio infrastructure that most people have never heard of.

**The air around you is full of packets. Time to start reading them.** 📡

---

**Playing with APRS or SDR?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to compare decode logs and antenna builds!

**Code for my APRS dashboard** is on [GitHub](https://github.com/kpanuragh) — receiver pipeline, Python parser, and the Leaflet.js map.

*Stay curious, stay legal, and remember: every interesting signal out there is just someone solving a problem with electromagnetics.* ⚡
