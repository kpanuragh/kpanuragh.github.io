---
title: "Chasing Weather Balloons with a $25 Dongle: Radiosonde Hunting is the Nerdiest Treasure Hunt 🎈"
date: "2026-03-12"
excerpt: "Weather services launch balloons twice a day carrying sensors that radio back temperature, humidity, and GPS data. You can decode all of it with RTL-SDR — and some people actually go find the fallen balloons. I became one of those people."
tags: ["\\\"rf\\\"", "\\\"sdr\\\"", "\\\"wireless\\\"", "\\\"hobby\\\"", "\\\"radiosonde\\\"", "\\\"weather\\\""]
featured: "true"
---

# Chasing Weather Balloons with a $25 Dongle: Radiosonde Hunting is the Nerdiest Treasure Hunt 🎈

**Hot take:** Every single day, weather agencies around the world inflate latex balloons the size of a car, attach a cardboard box full of sensors, and launch them 30+ km into the stratosphere — and those sensors radio back their position, temperature, humidity, and pressure the ENTIRE way up. You can decode every single transmission with a USB dongle and a piece of wire.

And when the balloon eventually pops and the payload parachutes back down to earth? Some people *go find them.*

I became one of those people. I have no regrets.

## What Even Is a Radiosonde? 🤔

A **radiosonde** (from French "radio" + "sonde" = probe) is the sensor package attached to a weather balloon. It's a small device — about the size of a thick paperback book — that:

- Measures **temperature**, **humidity**, **air pressure**, and **wind speed/direction**
- Has a **GPS receiver** tracking its position the entire flight
- Transmits all this data back to Earth via a radio signal on **400–406 MHz** every 1-2 seconds
- Reaches altitudes of **30–38 km** (the stratosphere!) before the balloon pops
- Falls back to Earth under a small parachute

The National Weather Service (US), IMD (India), Met Office (UK), and pretty much every national weather agency launches these **twice daily, worldwide** — at 00:00 and 12:00 UTC — from hundreds of stations. That's thousands of balloons every single day, all beaming radio telemetry.

**As a developer exploring radio frequencies**, the moment I learned this, I had one thought: "Wait. Those signals are just... floating above my city right now, and I could be reading them?"

Yes. You can. Let's do it.

## Why This Is Nothing Like My NOAA Satellite Post 🛰️

Quick clarification since I've written about receiving NOAA weather satellite images before: **these are completely different things.**

| NOAA APT Satellites | Radiosondes |
|---------------------|-------------|
| Orbiting satellites at 850 km altitude | Balloons at 0–38 km altitude |
| 137 MHz, continuous FM signal | 400–406 MHz, pulsed digital telemetry |
| Send low-res cloud images | Send sensor readings + GPS |
| Stays up for years | Flies for ~2 hours, then falls |
| You can't find the satellite | You can actually go find the payload |

Radiosondes are ground-launched, short-lived, and **recoverable**. That last part is what makes this the nerdiest treasure hunt I've ever participated in.

## How I Got Into This Rabbit Hole 🐰

In my RF experiments, I was scanning the 400 MHz range with GQRX one morning when I spotted something odd — a pulsed signal around 404 MHz. Regular, repeating bursts. Not quite like anything I'd decoded before.

Shout out to **sigidwiki.com** (the signal identification wiki) which I opened in a panic and immediately found: "RS41 Radiosonde — digital telemetry from weather balloons."

I nearly fell off my chair.

I started Googling "where are weather balloons near me" and found out the nearest launch site was about 150 km away. That balloon was at 22 km altitude. And I was receiving its signal from my apartment.

**Line of sight at 22 km altitude:** at that height, a radiosonde has radio line-of-sight to receivers hundreds of kilometers away. The curvature of the Earth barely matters. My little rubber duck antenna could pick it up because there is quite literally nothing between me and a transmitter floating in the stratosphere.

That was the moment I understood, viscerally, why "altitude = range" matters in radio.

## Decoding Radiosonde Signals: The Setup 📻

The most common radiosonde in the world right now is the **Vaisala RS41** — used by weather agencies across North America, Europe, India, and beyond. It transmits on 400–406 MHz using a modulation called **4FSK** (4-frequency shift keying).

You need:
1. **RTL-SDR dongle** (~$25) with a **70cm antenna** (those telescoping antennas work, a quarter-wave whip is better)
2. **RS41Tracker** or **radiosonde_auto_rx** software (free, open-source)
3. About **15 minutes** to set up

### Method 1: Quick and Easy with RS41Tracker

```bash
# Install dependencies (Debian/Ubuntu)
sudo apt-get install rtl-sdr sox

# Clone and build rs41tracker
git clone https://github.com/rs1729/RS.git
cd RS/rs41
make

# Tune to your balloon's frequency and decode
rtl_fm -f 404.0M -M fm -s 15k -r 15k - | ./rs41 --ecc --crc -
```

Within seconds, if a balloon is in range, you'll see output like:

```
[2026-03-12 06:14:22] RS41  SN:P3450217
  GPS: lat=19.0760 lon=72.8777 alt=18432.3m  vel_h=14.7m/s vel_v=4.2m/s
  PTU: T=-42.3C  RH=12.4%  P=72.3hPa
  Freq: 404.000 MHz  RSSI=-78dBm
```

**You're reading stratospheric weather data in real time.** Temperature minus 42°C, humidity 12%, pressure 72 hPa. This is actual meteorological science happening live in your terminal.

### Method 2: The Proper Setup with radiosonde_auto_rx

For the serious hobbyist, **radiosonde_auto_rx** is the full package. It auto-scans for radiosonde frequencies, decodes automatically, uploads to the community tracker at **sondehub.org**, and shows you the balloon on a live map.

```bash
# Full installation
git clone https://github.com/projecthorus/radiosonde_auto_rx.git
cd radiosonde_auto_rx

# Install Python dependencies
pip install -r requirements.txt

# Configure (set your latitude/longitude for range calculation)
cp station.cfg.example station.cfg
nano station.cfg   # Set your callsign and location

# Run it
cd auto_rx
python3 auto_rx.py
```

Open your browser to `http://localhost:5173` and you'll see a live map — your position, the radiosonde's current position, its predicted trajectory, and the predicted **landing zone**.

That landing zone prediction is where this gets exciting. 👀

## The Wild Part: You Can Actually Go Find It 🗺️

Radiosondes fall back to Earth under a small parachute. They land somewhere within a few hundred km of the launch site. And because they're transmitting GPS coordinates the whole way down — including on the ground if the battery survives — you can navigate to exactly where they land.

**This is called radiosonde hunting**, and it has a passionate global community.

**What fascinated me about SDR when I first started:** I thought it would always be passive. Receive signals, look at them, understand them. But radiosonde hunting turns SDR into a field sport. You're tracking a moving target from your laptop, predicting where it'll land, then driving out to retrieve a piece of weather service hardware from a field.

### The Landing Zone Predictor

**SondeHub.org** (and the companion app **SondeFinder**) combines:
- Real-time radiosonde GPS telemetry (uploaded by receivers like yours)
- Weather forecast models (for balloon drift prediction)
- A physics model of balloon ascent/burst/descent

The result is a predicted landing zone that gets more accurate as the balloon descends. When it's at 5 km altitude, the prediction is usually within 1-2 km.

I've driven out to a predicted landing zone, opened my phone app showing the last transmitted GPS coordinate, walked 800 meters across a field, and found the little cardboard-and-foam payload sitting in the grass.

**It felt like finding a literal treasure chest. That had been to space.**

## The Developer Angle: What's Inside These Things 💻

As a developer, I couldn't just track the balloon — I had to understand the data.

The RS41 transmits GFSK-modulated frames at 4800 baud. Each frame is 320 bytes, Reed-Solomon error-corrected, containing:

```
RS41 Frame Structure:
├── Header (8 bytes) — sync word + frame type
├── Encrypted block (1 byte) — subframe counter
├── Main data:
│   ├── GPS data (position, altitude, velocity, satellite count)
│   ├── PTU data (Pressure, Temperature, hUmidity)
│   └── Extended data (GPS raw measurements)
└── Reed-Solomon parity (48 bytes)
```

**The encryption thing is interesting:** Some RS41 fields use XOR with a known keystream (published publicly). It's not real security — it's just obfuscation. The open-source community reverse-engineered it years ago. Real RS41 telemetry is fully decodable.

Here's a Python snippet to parse a decoded RS41 PTU frame:

```python
import struct

def parse_ptu_block(raw_bytes):
    """Parse PTU (Pressure/Temperature/Humidity) block from RS41 frame."""
    # PTU block is at offset 0x48 in decrypted frame
    temp_main = struct.unpack_from('<H', raw_bytes, 0)[0]
    temp_ref1 = struct.unpack_from('<H', raw_bytes, 2)[0]
    temp_ref2 = struct.unpack_from('<H', raw_bytes, 4)[0]

    # Convert raw ADC counts to temperature
    # (Calibration coefficients are in the frame header)
    # Simplified version — actual calibration is 5th-order polynomial
    temperature_c = (temp_main - temp_ref1) / (temp_ref2 - temp_ref1) * 100 - 50

    humidity = struct.unpack_from('<H', raw_bytes, 18)[0] / 100.0

    return {
        "temperature_c": round(temperature_c, 2),
        "humidity_percent": round(humidity, 1)
    }
```

**What I built with this:** A Python script that captures RS41 frames, parses the PTU data, and logs it to a time-series database. Essentially a DIY upper-atmosphere weather station — except the sensor is floating 30 km up and someone else is paying for the helium.

## A Flight I Actually Tracked (Story Time) ⚡

A few weeks ago, I woke up at 5 AM (launch time is 00:00 UTC, which for me is early morning). I set up radiosonde_auto_rx the night before, and by the time I had coffee, it had already acquired a signal.

The balloon was at 8,000 meters and climbing. Temperature outside: -32°C. Humidity: 9%. Pressure: 340 hPa. At sea level on the same morning: 27°C, 72%, 1013 hPa.

Those two data points, separated by 8 km of altitude, tell you everything about why weather forecasting is hard.

The balloon climbed for another 90 minutes. At 31,847 meters the GPS velocity suddenly went to zero — the balloon burst. One second it was transmitting stable telemetry. Next second, altitude dropping at 40 m/s.

I updated the landing predictor and it showed a cornfield about 180 km away.

Did I drive out there? I... considered it for about 20 minutes and then my responsible adult brain intervened. But I have a friend who *did* go, because he's retired and has a lot more time for this than I do. He found it. Sitting in a muddy field next to a collapsed latex balloon the size of a deflated yoga ball.

He now has a collection of Vaisala RS41s on his shelf like trophies. I am extremely jealous.

## Practical Project Ideas 🚀

### Project 1: Receive Station + SondeHub Uploader

Set up a permanent receiver at home that automatically uploads decoded data to SondeHub — the community aggregator. You're contributing to a global distributed network that tracks every radiosonde on Earth.

**Stack:** RTL-SDR → radiosonde_auto_rx → SondeHub API

**Why it matters:** The more receivers in the network, the better the landing predictions for hunters. Your receive station helps someone else find their balloon.

### Project 2: Personal Weather Database

Every RS41 you decode gives you upper-atmosphere weather data. Log it all to InfluxDB or PostgreSQL:

```python
import sqlite3
from datetime import datetime

conn = sqlite3.connect('radiosonde_log.db')
conn.execute('''CREATE TABLE IF NOT EXISTS telemetry (
    timestamp TEXT,
    sonde_id TEXT,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    temperature REAL,
    humidity REAL,
    pressure REAL
)''')

def log_telemetry(sonde_id, lat, lon, alt, temp, rh, pres):
    conn.execute(
        'INSERT INTO telemetry VALUES (?,?,?,?,?,?,?,?)',
        (datetime.utcnow().isoformat(), sonde_id, lat, lon, alt, temp, rh, pres)
    )
    conn.commit()
```

Build a Grafana dashboard showing temperature-altitude profiles. You'll start to see the tropopause — the boundary between troposphere and stratosphere — as a temperature inversion around 10-12 km. You're doing actual atmospheric science with a $25 dongle. 🌡️

### Project 3: Multi-Sonde Tracker

On a busy day, you might hear 2-3 different radiosondes. Build a multi-channel decoder:

```bash
# Use multiple rtl_fm instances with different PIDs
# Or better: use a wideband SDR capture and process in software

# Capture the whole 400-406 MHz band at once
rtl_sdr -f 403M -s 2048000 -g 42 - | tee /tmp/raw.iq | \
    sox -t raw -r 2048000 -e float -b 32 -c 2 - -t wav /tmp/capture.wav
```

Then process the IQ file with multiple parallel decoders offset to each balloon's frequency.

### Project 4: Actual Balloon Recovery (The Ultimate Project)

If you want to actually go find a balloon:

1. Set up radiosonde_auto_rx with SondeHub integration
2. Install the **SondeFinder** app on your phone
3. Wait for a balloon to reach low altitude (under 5 km) with a landing prediction
4. Check if predicted landing is accessible (not in ocean/mountains/private property)
5. Drive toward the zone
6. As it descends below 500m, your app will show real-time GPS
7. Walk to the last known position
8. Find the payload 🎉

**What you'll find:** A foam or cardboard box, a Vaisala RS41 sensor (~€200 value), a small parachute, and a note that says "Please return to [weather agency]." Some countries request return, some don't. **Always follow local regulations.**

Many hunters return them. Some keep them as trophies (where permitted). All of them feel like archaeologists of the sky.

## Other Radiosonde Types 📡

The RS41 is most common, but you'll also encounter:

**Vaisala RS92:** Older model, still in service in many countries. GFSK modulated on 400-406 MHz. Decode with `rs92` tool from the same RS tools package.

**Graw DFM-09/17:** Popular in Germany and central Europe. Narrowband FM on 400-406 MHz. The DFM-17 has a quirky frame format — rs1729's tools handle it.

**InterMet iMet-4:** Used by US military and some civilian agencies. 400-406 MHz, similar structure.

**Meisei RS-11G:** Popular in Japan. Different modulation, but still decodable with open-source tools.

**How to identify which one you're receiving:** The signal will look different in the waterfall. sigidwiki.com has spectrograms for each type. radiosonde_auto_rx auto-identifies them.

## The Legal and Safety Stuff ⚖️

### Receiving: Completely Legal

As with all my SDR hobby work: **receiving is legal everywhere.** You're just passively listening to public radio transmissions. No license required.

### Recovery: Check Local Rules

- **US:** FAA says you can keep a radiosonde found on your property. The weather service *requests* (but doesn't require) return. Many carriers include a prepaid return envelope.
- **Europe:** Varies by country. Some weather services request return; most won't pursue you if you keep it.
- **India:** IMD requests return of radiosondes. Contact the nearest IMD station.
- **General rule:** Don't trespass to retrieve one. If it lands on private property, ask permission before entering.

### Transmitting: Need a Ham License

If you build your own radiosonde or want to transmit balloon telemetry, you need an amateur radio license. Same as always — receive freely, transmit legally.

### Aviation Safety

High-altitude balloons require notification to aviation authorities in most countries. If you ever decide to *launch* your own balloon, check NOTAM requirements for your region. Don't launch without proper clearance.

## What This Did to My Worldview 🌍

In my RF experiments, nothing quite changed how I see weather data like this did.

Before: Weather forecasts are just a number on my phone app. After: Weather forecasts are the product of thousands of data points collected from radiosondes launched every 12 hours by a global network of weather stations, decoded from radio signals, ingested into numerical weather prediction models, and spat out as "30% chance of rain."

The next time you check a weather app, somewhere above your head there's a balloon transmitting temperature readings at -50°C, humidity at 5%, pressure at 10 hPa, and that data is feeding the forecast model that told you to bring an umbrella.

With a $25 RTL-SDR and a morning coffee, you can read that data in real time.

**The sky is not just something you look at. It's a radio medium, and it's full of data.** 🌤️

## Getting Started This Weekend 📅

**What you need:**
1. RTL-SDR Blog V3 dongle ($25)
2. Any antenna with coverage around 400 MHz (a telescoping one works fine to start)
3. `radiosonde_auto_rx` installed
4. ~30 minutes

**Do this:**
1. Check SondeHub.org for any active flights near you — this tells you if radiosondes are in range RIGHT NOW
2. Install `radiosonde_auto_rx` and configure your location
3. Run it and watch it auto-scan for signals
4. Stare at your terminal as stratospheric weather data appears

**If nothing's in range:** Check launch schedules. In the US, most stations launch at 00:00 UTC and 12:00 UTC. The 12:00 UTC launch is 8 AM Eastern, noon in India. Plan your decoding session around launch time.

**If you want to go hunting:** Install SondeFinder on your phone and join your local radiosonde hunting group (search Reddit, Facebook, or SondeHub forums).

## Resources 📚

- **SondeHub.org** — live global radiosonde tracker, essential
- **SondeFinder app** — Android/iOS tracker for balloon hunting
- **radiosonde_auto_rx** — best all-in-one decoder/uploader (GitHub: projecthorus)
- **rs1729/RS** — low-level decoder tools for all radiosonde types (GitHub)
- **sigidwiki.com** — signal identification when you find a mystery signal
- **r/amateurradio** — community always happy to help with SDR questions
- **Vaisala RS41 Technical Documentation** — free PDF, impressively detailed

## TL;DR 💡

Weather agencies launch sensor-equipped balloons twice daily from hundreds of stations worldwide. Each balloon broadcasts GPS coordinates, temperature, humidity, and pressure on 400-406 MHz for its entire 2-hour flight to 30+ km altitude.

With a $25 RTL-SDR and free software, you can decode every transmission in real time — watching a sensor rise from your city into the stratosphere, reporting -50°C temperatures, and eventually bursting and parachuting back down. The community at SondeHub.org tracks all of them live.

And if you're feeling ambitious? Follow it to the ground. It's the nerdiest treasure hunt imaginable — a GPS-transmitting cardboard box, somewhere in a field, that just traveled to the edge of space and back.

The sky above you is full of data. All you need is a USB dongle and the curiosity to listen. 📡

---

**Decoded a radiosonde? Gone on a hunt?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I want to hear your recovery stories!

**My decode scripts and SondeHub integration code** live on [GitHub](https://github.com/kpanuragh) — feel free to fork and build your own upper-atmosphere weather logger.

*Listen legally, hunt responsibly, and always thank the meteorologists who've been quietly running this global balloon network since 1930.* 🎈

---

**P.S.** I've spent a lot of time on this post thinking about what I'd say to my 2019-self who thought "radio" meant "the thing in my car." Short version: the air around you is a medium, it carries data, and $25 of hardware can make you a passive observer of a global scientific infrastructure that runs around the clock, every day, regardless of whether anyone's listening. Someone might as well be. Might as well be you.

**P.P.S.** The first time I saw a balloon burst on my altitude graph — this perfectly smooth climb, then a sudden drop at 40 m/s — felt oddly emotional. The balloon is dead. The data lives on. Very poetic for 5:47 AM. ☁️
