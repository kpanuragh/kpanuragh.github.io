---
title: "ACARS: Reading the Secret Text Messages Planes Send While Flying Over Your House ✈️📡"
date: "2026-03-18"
excerpt: "Aircraft don't just broadcast their position — they send actual text messages to airlines, maintenance crews, and dispatchers in real-time. A $25 USB dongle lets you read every single one. I've been doing this for weeks and I have questions about flight UA447."
tags: ["rf", "sdr", "wireless", "hobby", "acars", "aviation"]
featured: true
---

# ACARS: Reading the Secret Text Messages Planes Send While Flying Over Your House ✈️📡

**Confession:** I've been eavesdropping on airplane text messages for three weeks.

Not the passengers. The *planes themselves.* Turns out commercial aircraft are constantly sending streams of digital text to airline dispatchers, maintenance crews, and air traffic control — weather reports, fuel calculations, engine alerts, gate changes — all broadcast unencrypted into the open air. On 130 MHz. For anyone with a $25 USB dongle to read.

I am that anyone. And now I can't stop.

Welcome to **ACARS** — the aircraft messaging system that's been hiding in plain sight since 1978, and the rabbit hole that made my RTL-SDR hobby significantly more expensive in terms of time. 📡

## What Even Is ACARS? 🤔

**ACARS** = Aircraft Communications Addressing and Reporting System

**What normal people think:** Planes just... fly. They tell you when you're there.

**What's actually happening:** Aircraft are having constant digital conversations with the ground. Engine performance data. Gate assignments. Weather uplinks. Crew messages. Maintenance requests. ATIS (airport weather info). All of it flying through the air as text, right now, over your house.

Think of ACARS as the **SMS system for commercial aviation**. It predates text messaging by about 15 years — airlines needed a way to digitally communicate with aircraft way back in the pre-smartphone era. They built a VHF radio data link. They never bothered to encrypt it.

In 2026, every commercial aircraft still uses it. Still unencrypted. Still broadcasting. 😅

**As a developer exploring radio frequencies**, my brain short-circuited when I realized: I've been tracking aircraft positions with ADS-B for months, but the whole time, those same planes were also *texting* right at me and I wasn't reading it.

## My First ACARS Message (Reader, I Was Not Ready) ✨

I had my RTL-SDR running, tuned to 129.125 MHz (a common ACARS frequency in North America), and fired up `acarsdec`. Within 30 seconds:

```text
[2026-03-15 14:23:11] [VHF-2]
Aircraft: UAL2847
Registration: N37281
Flight: UA2847 / SFO→ORD
Mode: 2
Label: Q0  (Position Report)
Block ID: 4

MSG: /POS.WI1
POSREP/ORD.ARRV/ETA.1632/FUEL.128/PAXS.168
```

**Translation:** United Airlines flight 2847, registration N37281, en route from San Francisco to Chicago, expected arrival 16:32, 12.8 thousand pounds of fuel remaining, 168 passengers aboard.

A plane I could vaguely hear overhead just texted me. Accidentally. I wasn't supposed to be reading this. Except, legally, I was allowed to. And now I wanted more.

**What fascinated me about SDR** is these moments when you realize how *busy* the invisible world is. 📻

## What Types of Messages Fly Through the Air? 📬

This is where it gets genuinely interesting for developer-types. ACARS messages have "labels" that describe their content. After weeks of logging, here's what I've been collecting:

### Label H1 — Position Reports 📍

The bread and butter. Aircraft automatically send position updates:

```text
Label: H1
/POS.N37.52/W095.44/ALT.37000/SPD.485/HDG.092/WIND.240/32
```

Coordinates, altitude, speed, heading, and wind at cruise altitude. Automatically sent. Nobody typed this — it came straight from the flight computer.

### Label Q0 / QU — OOOI Messages ⏱️

**OOOI** = Out of gate, Off ground, On ground, In gate

These four events trigger automatic messages. Every time a plane pushes back from a gate, you get a timestamp. Every takeoff. Every landing. Every arrival at gate.

```text
Label: QU
OUT.1421/OFF.1437/ETA.1732/DEST.ORD
```

Out of gate at 14:21. Wheels up at 14:37. Expected at destination 17:32. Automatically transmitted. Airlines use this for real-time fleet tracking.

### Label 80 — Digital ATIS 🌤️

Airports broadcast weather and runway info via ATIS (Automatic Terminal Information Service). Modern aircraft receive it digitally via ACARS:

```text
Label: 80
INFORMATION NOVEMBER 1429Z
WIND 270/08 VISIBILITY 10
FEW 2500 TEMP 12 DEW POINT 4
ALTIMETER 2995
ILS APPROACH RUNWAY 27R IN USE
NOTAM: TWY ALPHA CLOSED FOR CONSTRUCTION
```

Aircraft receive this before descent to know what runway they're landing on and current weather. I now read airport weather reports live. My friends think this is less cool than I do.

### Label 44 — Free Text Messages ✉️

This is the one that made me feel like I was reading someone's diary.

```text
Label: 44 (Airline to Aircraft)
CAPTAIN JOHNSON, GATE CHANGE ON ARRIVAL.
NOW GATE B14 INSTEAD OF C22.
CATERING DELAY, EXPECT 45 MIN TURN.
```

Airline ops just texted the captain about a gate change. I saw it before he could reply. I felt slightly guilty. Only slightly. 😅

### Label 15 — Engine Performance Data 🔧

Aircraft engines report performance metrics mid-flight for real-time maintenance monitoring:

```text
Label: 15
ENG1.N1.94.2/ENG2.N1.94.1
OIL1.PRESS.62/OIL2.PRESS.63
VIBR.1.2.3
FUEL.FLOW.5842
```

Maintenance crews at the destination are already looking at engine data before the plane lands. If something's off, they'll have parts waiting at the gate.

**As a developer, this is fascinating:** These are basically IoT sensor readings from a tube flying at 500 mph at 35,000 feet, automatically sent over radio. The architecture is just... industrial IoT, except from 1978 and still running.

## Getting Set Up (Easier Than You Think!) 🛠️

You need three things:

### Hardware

- **RTL-SDR Blog V3 dongle** (~$25) — the standard beginner SDR
- **Any decent antenna** — the stock telescopic antenna actually works for ACARS since aircraft are overhead and powerful
- **Optional: A good VHF antenna** at 130 MHz optimized length gives better range

If you already own an RTL-SDR for ADS-B aircraft tracking, you literally already have everything you need. Same hardware, different frequency, different software.

### Software

```bash
# Linux — install acarsdec (the best ACARS decoder)
sudo apt-get install acarsdec

# Or build from source for latest version
git clone https://github.com/TLeconte/acarsdec.git
cd acarsdec
mkdir build && cd build
cmake .. -Drtl=ON
make && sudo make install

# Mac
brew install acarsdec  # might need to build from source

# Run it! Monitor common NA frequencies:
acarsdec -r 0 129.125 130.025 130.450 131.125

# JSON output (developer mode!)
acarsdec -j -r 0 129.125 130.025 130.450 131.125
```

The `-r 0` means RTL-SDR device 0. The frequencies are the most common ACARS channels in North America — run all four simultaneously!

**What you'll see within 60 seconds** if you're anywhere near a flight path:

```json
{
  "timestamp": "2026-03-18T10:23:45Z",
  "channel": "129.125",
  "flight": "DAL1847",
  "registration": "N302DQ",
  "label": "H1",
  "block_id": "7",
  "ack": "!",
  "text": "/POS.N42.21/W083.34/ALT.28600/SPD.445"
}
```

**Welcome to aviation data.** 📊

## My Actual Project: ACARS Flight Logger 📊

Once I had JSON output, my developer brain kicked in immediately. Here's the Python script I built over a weekend to log everything and extract useful data:

```python
import subprocess
import json
import sqlite3
from datetime import datetime

# Database setup
conn = sqlite3.connect('acars_log.db')
conn.execute('''
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        timestamp TEXT,
        flight TEXT,
        registration TEXT,
        label TEXT,
        raw_text TEXT
    )
''')
conn.execute('''
    CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY,
        timestamp TEXT,
        flight TEXT,
        lat REAL,
        lon REAL,
        altitude INTEGER,
        speed INTEGER
    )
''')

def parse_position(text):
    """Extract lat/lon from position report text"""
    # Position format: /POS.N42.21/W083.34/ALT.28600/SPD.445
    import re
    match = re.search(
        r'N(\d+\.\d+)/W(\d+\.\d+)/ALT\.(\d+)/SPD\.(\d+)',
        text
    )
    if match:
        return {
            'lat': float(match.group(1)),
            'lon': -float(match.group(2)),  # West = negative
            'alt': int(match.group(3)),
            'spd': int(match.group(4))
        }
    return None

# Stream acarsdec JSON output
proc = subprocess.Popen(
    ['acarsdec', '-j', '-r', '0',
     '129.125', '130.025', '130.450', '131.125'],
    stdout=subprocess.PIPE,
    stderr=subprocess.DEVNULL
)

print("📡 Listening for ACARS messages...")

for line in proc.stdout:
    try:
        msg = json.loads(line)
        flight = msg.get('flight', 'UNKNOWN').strip()
        reg = msg.get('tail', '').strip()
        label = msg.get('label', '')
        text = msg.get('text', '')

        # Log everything
        conn.execute(
            'INSERT INTO messages VALUES (NULL,?,?,?,?,?)',
            (datetime.utcnow().isoformat(), flight, reg, label, text)
        )

        # Parse position reports
        if label in ('H1', 'QU') and '/POS.' in text:
            pos = parse_position(text)
            if pos:
                conn.execute(
                    'INSERT INTO positions VALUES (NULL,?,?,?,?,?,?)',
                    (datetime.utcnow().isoformat(), flight,
                     pos['lat'], pos['lon'], pos['alt'], pos['spd'])
                )
                print(f"✈️  {flight} @ FL{pos['alt']//100}"
                      f" — {pos['lat']:.2f}N {abs(pos['lon']):.2f}W"
                      f" — {pos['spd']} knots")
        else:
            print(f"📨  {flight or reg} [{label}]: "
                  f"{text[:60]}{'...' if len(text)>60 else ''}")

        conn.commit()

    except (json.JSONDecodeError, KeyError):
        pass
```

**Running this for 24 hours in my apartment gave me:**
- 847 messages from 203 unique aircraft
- Position data for 89 flights
- Gate change notices, weather reports, engine data
- One maintenance alert that I genuinely hope they addressed (Label 15, engine vibration reading higher than the others 👀)

## Wait, Is Reading This Legal? 🚨

**Yes. And here's the full picture:**

### What's Definitely Legal

- ✅ **Receiving ACARS** is legal in the US and most countries — it's a radio broadcast
- ✅ **RTL-SDR is receive-only** — you can't transmit, so no interference possible
- ✅ **Aviation data is largely public** — ATC frequencies, ACARS frequencies, ATIS — all intentionally broadcast
- ✅ **Logging for personal/educational use** — completely fine

### The Important Nuances

- ⚠️ **ACARS is communications data** — in the US, the Electronic Communications Privacy Act has nuances around aviation communications. Generally, receive-only passive monitoring of broadcast data is fine. "Acting on" intercepted communications for financial gain (e.g., trading on airline operational data) is not.
- ⚠️ **Don't republish sensitive operational data** — maintenance alerts, crew messages, and operational details aren't yours to broadcast
- ❌ **Don't transmit on ACARS frequencies** — requires aeronautical radio license and you could disrupt actual aviation safety systems. Seriously, don't.

**My personal rule:** I log and analyze for learning and fun. I don't share sensitive operational data publicly. I don't interfere with anything. I'm a curious hobbyist, not a liability.

The FAA explicitly notes that receiving aviation communications for personal, non-commercial monitoring is generally permitted. But know your local laws — this varies by country. 📜

## Combining ACARS + ADS-B: The Full Picture 🗺️

Here's where it gets *really* interesting for developers.

ADS-B gives you position, altitude, speed, and flight number.
ACARS gives you the *conversation* — messages, status, engine data, crew comms.

Combine them by matching flight numbers:

```python
# Match ACARS messages to ADS-B position tracks
# When you see flight UA2847 in ADS-B at 35,000 ft
# AND you decode an ACARS position report from UA2847...
# You can correlate the full flight picture.

# I built a small dashboard that shows:
# - Live position (from ADS-B / dump1090)
# - Latest ACARS message type and timestamp
# - OOOI events (departure/arrival times)
# - Any maintenance flags from Label 15 messages

# The combined view is genuinely impressive —
# you understand the full operational picture of a flight.
```

The first time I saw a flight's ADS-B track line up perfectly with its ACARS position reports, I had that "this is too much power for a $25 USB stick" moment again.

## Three Things That Genuinely Surprised Me 🤯

**1. How chatty aircraft are.** A single flight from takeoff to landing might send 50-200 ACARS messages. Engine data, weather uplinks, crew requests, position reports. It's a fire hose of data.

**2. How old this technology is.** ACARS launched in 1978. The basic protocol is largely unchanged. You're decoding messages using specs written before personal computers were common. Yet here I am, piping them into SQLite in 2026.

**3. How much airlines rely on it.** That gate change message? Captain actually needs it. The weather uplink to the cockpit? Real operational data. Monitoring engine performance in real-time? Maintenance crews act on it. This wheezy old unencrypted 1978 protocol is genuinely critical infrastructure.

**As a developer exploring radio frequencies**, that last point keeps me up at night a little. Not in a malicious way — I'm just fascinated by how much of real-world infrastructure runs on decades-old, unencrypted radio protocols that anyone can decode. It's a wild reminder that "working" and "secure" are different things. 🔐

## Tools Worth Knowing 🔧

**Software:**
- **acarsdec** — Best RTL-SDR ACARS decoder, active development, JSON output
- **JAERO** — Windows ACARS decoder with nice GUI
- **VDL2dec** — For decoding VDL Mode 2 (the newer ACARS-over-digital replacement)
- **acarshub** — Docker-based ACARS aggregation + web dashboard (self-hosted!)

**Resources:**
- **airframes.io** — Community ACARS aggregation, see what others are decoding globally
- **ACARS wiki (on Signal ID Wiki)** — Everything about the format
- **r/RTLSDR** — Always helpful for troubleshooting

**A note on acarshub:** If you run it 24/7 on a Raspberry Pi, it gives you a beautiful web dashboard of all decoded messages with flight correlation. I've been running mine for two weeks. My Raspberry Pi has decoded 14,000+ messages. I should probably touch grass at some point. 🌱

## Practical Project Ideas for Developers 💡

**Beginner:** Run `acarsdec` for an afternoon and just read the messages. Build intuition for what aircraft say.

**Weekend project:** Build a logger that stores all messages in SQLite, then write SQL queries to find: most talkative aircraft, most common message types, busiest time of day for flights overhead.

**Longer project:** Correlate ACARS + ADS-B data to build a "full picture" view of flights. When an aircraft sends a OOOI "on ground" message, cross-reference with when ADS-B last saw it descending. Compare the airline's reported ETA vs actual arrival.

**Advanced:** Contribute to acarshub or acarsdec. Both are open-source and actively maintained. Adding a new message parser, improving the UI, or adding database backends — all valuable contributions.

## TL;DR 📋

- **ACARS** is the 1978-era text messaging system all commercial aircraft use, still unencrypted, still broadcasting
- Your $25 RTL-SDR dongle + `acarsdec` software can decode it in minutes
- Messages include position reports, gate changes, engine data, weather uplinks, and crew communications
- Completely legal to receive passively (don't transmit, don't act on data commercially)
- Combine with ADS-B for the full aviation operational picture
- As a developer, the JSON output makes this trivially easy to log, analyze, and build dashboards from

After three weeks of running ACARS logging in the background, I now have a better understanding of local air traffic patterns than my city's airport website provides. I've seen maintenance flags, gate chaos during storms, and exactly how much fuel wide-body aircraft carry on long-haul routes.

**The air is full of data. You just need to listen.** 📡

---

**Questions about my setup or the scripts?** Reach out on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love talking about RF experiments with other enthusiasts.

**Want to see the full ACARS logger code?** Check my [GitHub](https://github.com/kpanuragh) — I'm cleaning it up for a proper release.

*Fly safe out there. And know that somewhere, a nerd with a USB stick is reading your plane's text messages. We mean well.* ✈️📡

---

**P.S.** The most interesting ACARS message I've decoded so far was a flight requesting a medical diversion, all the coordination happening in real-time over ACARS while ADS-B showed the aircraft turning. Both systems together painted a complete picture in real-time. The plane diverted, landed safely, and I watched the whole thing unfold on my laptop from my living room. Aviation is incredible.

**P.P.S.** I tried explaining ACARS to a non-tech friend. Their response: "So you're reading the plane's texts?" Yes. That's exactly what I'm doing. It's fine.
