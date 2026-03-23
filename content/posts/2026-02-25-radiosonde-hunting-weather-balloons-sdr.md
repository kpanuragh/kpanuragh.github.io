---
title: "Radiosonde Hunting: Chasing Weather Balloons Falling from the Edge of Space 🎈📡"
date: "2026-02-25"
excerpt: "Twice a day, weather services launch balloons to the edge of space, each carrying a transmitter broadcasting GPS, temperature, and pressure data in the clear. With a $20 RTL-SDR, you can decode the signal, predict where the hardware lands, and go pick it up. It's geocaching if geocaching involved actual space hardware falling out of the sky."
tags: ["\"rf\"", "\"sdr\"", "\"wireless\"", "\"hobby\"", "\"radiosonde\"", "\"weather\""]
featured: "true"
---

# Radiosonde Hunting: Chasing Weather Balloons Falling from the Edge of Space 🎈📡

**Here's something nobody tells you when you buy an RTL-SDR:** at this very moment, there are weather balloons ascending to 30 km altitude somewhere near you, each one attached to a small radio transmitter broadcasting GPS coordinates, altitude, temperature, and pressure in plaintext to anyone willing to listen on 400–406 MHz.

When the balloon bursts — as it always does, at around 30 km where the atmosphere is too thin to hold it — the transmitter comes back to Earth under a parachute, still broadcasting.

You can decode that signal, watch the descent in real time, predict the landing spot, and *drive there and pick it up*.

It's geocaching. Except the cache was just in near-space. And it fell out of the sky. And you found it using a radio receiver you bought for the price of a mediocre dinner. 🎯

## What Even Is a Radiosonde? 🤔

**Radiosonde** = a small instrument package launched on a weather balloon.

Weather services worldwide — NOAA in the US, the Met Office in the UK, hundreds of others globally — launch these things **twice per day**, every single day, from roughly 900 stations around the world. That's about 1,800 balloon launches per day, globally, as routine weather data collection.

Each radiosonde:
- Measures temperature, humidity, pressure, and wind speed at every altitude
- Has a GPS receiver tracking its exact position
- Has a small radio transmitter broadcasting all of this on **400–406 MHz**
- Is designed to be **disposable** (agencies don't usually recover them)

The transmission is **not encrypted**. It's not even obscured. It's designed to be received by dedicated ground stations, but nothing stops you from receiving it yourself with an RTL-SDR.

```text
Typical radiosonde transmission (Vaisala RS41, most common type):
  Frequency:    ~402–403 MHz
  Modulation:   FSK (frequency-shift keying)
  Baud rate:    4800 baud
  Data:         GPS position, altitude, temperature, humidity, pressure
  Update rate:  Every second
  Power:        ~60 mW — tiny, but easily picked up within ~100 km line-of-sight
```

In my RF experiments, I first spotted a radiosonde signal completely by accident. I was scanning around 400 MHz looking for nothing in particular, saw a clean FSK burst repeating every second, and thought "that looks organized." Twenty minutes later I'd decoded it and was watching a weather balloon rise over the horizon. 🎪

## The Developer's RF Rabbit Hole Deepens ⬇️

What fascinated me about radiosonde hunting isn't just that you can receive the signal. It's that the entire thing — receive, decode, predict, recover — is a software problem with a radio front end.

The pipeline looks like this:

```
Atmosphere
    ↓
RTL-SDR dongle + antenna
    ↓
radiosonde_auto_rx (Python/C software)
    ↓
GPS coordinates (lat, lon, alt) every second
    ↓
Burst prediction model (balloon physics)
    ↓
Landing zone estimate on a map
    ↓
You, driving somewhere interesting
    ↓
Actual radio hardware from near-space in your hands
```

Each of those steps is understandable. The software is open source. The physics is documented. The fun scales with how deep you want to go.

## Getting Set Up: The Hardware Side 🔧

You probably already have everything you need.

**What you need:**
- RTL-SDR dongle (RTL-SDR Blog V3 recommended — $25)
- Antenna — the key upgrade here

**The antenna matters more than anything else for this application:**

```
Default rubber duck (included with dongle):
  Works, but barely. Good for testing.

Wideband dipole tuned for 400 MHz:
  Big improvement. Cut two wires to ~18.5 cm each.
  Total cost: $0 if you have wire around.

Yagi antenna (directional, homemade or ~$30):
  Lets you receive from 200+ km line of sight.
  Game-changer for catching distant balloons.
```

**The DIY 400 MHz dipole (seriously, do this first):**

```
Cut two pieces of wire to exactly 18.5 cm each.
Connect to SO-239 or SMA socket as a V-dipole.
Point upward (or V-shape at ~120 degrees apart).
Total cost: $2 in wire + a connector.
Performance: Night and day vs. the stock antenna.
```

As a developer exploring radio frequencies, this was my first antenna build. The physics is satisfying — the wavelength at 402 MHz is about 74.5 cm, you want a quarter-wave element, which is 18.6 cm. Math turns into physical objects that catch signals from balloons at 30 km altitude. 🤯

## The Software: `radiosonde_auto_rx` 📻

The open-source tool that does the heavy lifting is **radiosonde_auto_rx**, written by Mark Jessop (VK5QI) and a bunch of contributors. It's a full radiosonde receiving pipeline: auto-scan, decode, upload, predict.

```bash
# Install on Linux (Raspberry Pi works great for this!)
sudo apt-get install git python3 python3-pip cmake

# Clone the project
git clone https://github.com/projecthorus/radiosonde_auto_rx.git
cd radiosonde_auto_rx

# Install dependencies
pip3 install -r requirements.txt

# Build the decoders
cd auto_rx && bash build.sh

# Configure
cp station.cfg.example station.cfg
nano station.cfg
# Set your latitude, longitude, altitude, RTL-SDR gain

# Run it
python3 auto_rx.py
```

Open `http://localhost:5000` in your browser and you get:

```
- Live waterfall display showing any radiosonde signals in range
- Real-time balloon position on a map
- Altitude/time graph
- Burst prediction (where will it land?)
- Option to upload to sondehub.org (community tracking network)
```

**sondehub.org** is the global radiosonde tracking network. If you enable uploads, you're contributing real meteorological data to a community map that thousands of people use. Citizen science with a USB dongle. 🌍

## The Prediction Part Is Where It Gets Exciting 🗺️

Okay, so you've got a decoded radiosonde on your screen. It's at 25,000 meters, rising at 5 m/s. At some point — typically around 30–33 km — the balloon skin can no longer stretch to compensate for the thinning atmosphere, and it explodes.

The **burst predictor** at sondehub.org (or the built-in prediction in radiosonde_auto_rx) uses:
- Current GPS position and altitude
- Ascent rate (calculated from the data stream)
- Expected burst altitude (tunable, usually around 30 km)
- Descent rate under parachute (~8 m/s typical)
- Wind model from global weather forecasting data

Output: a map marker showing where the radiosonde is predicted to land, with a confidence radius. Updated live as new GPS points come in.

```
Example prediction output:
  Current position: 48.xxx°N 11.xxx°E, 27,400m altitude
  Ascent rate: 4.8 m/s
  Expected burst: ~31,000m (est. 7 minutes from now)
  Predicted landing: 48.yyy°N 11.yyy°E
  Landing time: ~35 minutes from now
  Confidence radius: ~3 km
```

That confidence radius shrinks as the balloon gets lower and the wind uncertainty decreases. By the time it's under parachute at 5,000m, you're often looking at a 500m landing prediction. *That's tight enough to drive to the field and wait for it to land.*

In my RF experiments, the first time I watched a prediction shrink from "somewhere in this county" to "that specific farm field, probably near the east fence line" — while tracking the descent in real time — was one of the most satisfying things I've done in this hobby. 🎯

## Actually Going to Get It 🚗

This is where it turns from a software project into an adventure.

**Things I've learned from recovery attempts:**

**The balloon is bigger than you think.** A burst latex weather balloon comes down as shredded rubber strips wrapped around a parachute. It's surprisingly visible on the ground once you're in the right field.

**The radiosonde keeps transmitting on the ground.** Your SDR software will tell you the exact landing position. GPS accuracy on the radiosonde is typically better than 5 meters. You're looking for a small white or orange box roughly the size of a thick paperback book.

**Always ask permission.** If it lands on private farmland (and it often does), knock on the door. In my experience, farmers find the whole thing fascinating and are happy to let you search their field.

**The hardware is interesting.** The most common type worldwide is the **Vaisala RS41** — a small PCB with temperature/humidity sensors, GPS, pressure sensor, and an STM32 microcontroller. There's an active community hacking these for use as APRS trackers, LoRa nodes, and general embedded platforms. Firmware is documented. The boards are genuinely capable.

```
Recovered RS41 hardware (what you'll likely find):
  STM32F100 microcontroller
  ublox GPS module
  SX1278 LoRa radio (yes, it has a LoRa chip!)
  Temperature, humidity, and pressure sensors
  400 MHz transmission capability

After recovery (with community firmware):
  - Use as an APRS tracker
  - Use as a LoRa node
  - Use as a high-altitude balloon payload (with a license!)
  - Use as a cheap STM32 + LoRa development board
```

## Safety and Legal Stuff 🚨

**Receiving: Completely legal everywhere.** Radiosondes broadcast in the clear, on public spectrum. Receiving them is no different from receiving FM radio.

**Recovery: Generally fine, with caveats.**
- ✅ You can legally pick up a radiosonde from public land
- ✅ You can keep it (weather agencies generally don't want them back — they're budgeted as disposables)
- ⚠️ Get permission before entering private land
- ⚠️ Stay away from airports and airfields — the parachute/string assembly can be a hazard near runways. If a radiosonde lands near an airport, alert the relevant authority rather than going to retrieve it yourself
- ❌ Don't transmit on radiosonde frequencies without appropriate licensing

**RF safety:** The transmitter outputs ~60 mW. Completely safe. Your phone radiates more. Don't worry about it.

## Resources Worth Bookmarking 📚

**Software:**
- **radiosonde_auto_rx** — The main receiving pipeline (GitHub: projecthorus/radiosonde_auto_rx)
- **SondeHub** — Community tracking network (sondehub.org)
- **Habhub Predictor** — Burst prediction tool (predict.sondehub.org)

**Community:**
- **r/amateurradio** — Welcoming to SDR folks
- **#radiosonde channel on many ham radio Discord servers**
- **sondehub.org** — See what's flying near you right now (and who else is tracking it)

**Hardware:**
- **RS41 Hacking Community** — rs41hup firmware for recovered radiosondes

## TL;DR 🎈

Weather services launch ~1,800 GPS-equipped radio transmitters to the edge of space every single day, and they're all broadcasting plaintext GPS data on 400–406 MHz.

With an RTL-SDR, `radiosonde_auto_rx`, and a homemade dipole antenna, you can:
- Decode their transmissions in real time
- Watch balloon ascent live on a map
- Predict the landing site to within 500 meters
- Drive there and pick up a piece of near-space hardware for free

As a developer exploring radio frequencies, this hit differently than other RF projects. It's not just receiving — it's using received data to make a physical decision (drive here, now) with a time constraint. The signal is real. The hardware is real. The space the balloon traveled through is very, very real.

Also, the look on your face when the radiosonde lands 40 meters from where you're standing, still beeping, after it just fell from 30 km up?

Absolutely worth the drive. 📡

---

**Want to compare radiosonde hunting stories?** Connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm always keen to find others who've gone full send on a balloon chase.

**RF projects and decoded signal logs:** [GitHub](https://github.com/kpanuragh) — slowly automating the whole pipeline to text me when a balloon is about to land within driving range.

*73 de the person who now keeps a folding antenna in their car Just In Case.* 🎈

---

**P.S.** The first time you see a radiosonde at 1,000 meters altitude on your screen, update the map, see the prediction arrow pointing at the park two blocks from your house, grab your keys, and jog to the park — and then stand there watching it descend on your phone while the neighbor's dog is giving you a very confused look — you will understand why this hobby has no off switch.

**P.P.S.** Vaisala RS41 boards have a LoRa radio chip on them. Someone already wrote replacement firmware. You are one recovered radiosonde away from a free LoRa node. The math makes the chase even more compelling.
