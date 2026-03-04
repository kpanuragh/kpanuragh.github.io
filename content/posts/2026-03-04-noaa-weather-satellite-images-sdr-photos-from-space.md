---
title: "I Received Photos from Space with a $25 USB Stick 🛰️"
date: "2026-03-04"
excerpt: "NOAA weather satellites are orbiting Earth RIGHT NOW, screaming their cloud images at 137 MHz for anyone to receive. I built a wire antenna, pointed it at the sky, and pulled down live satellite photos. No telescope. No dish. Just a USB dongle and some wire."
tags: ["rf", "sdr", "wireless", "hobby", "satellites"]
featured: true
---

# I Received Photos from Space with a $25 USB Stick 🛰️

**Real talk:** I was watching a weather forecast on TV when it hit me — that radar image, those cloud swirls over the continent... where does that data *come* from? Satellites. Big expensive government satellites. And then my brain went: "Can I receive those satellite signals myself?"

Spoiler: YES. And you can do it with a $25 RTL-SDR dongle, a few meters of wire, and an afternoon of nerdy tinkering.

As a developer exploring radio frequencies, this was the project that made my jaw drop hardest. Weather satellites are *literally broadcasting live images from space* to anyone with ears to listen at 137 MHz. They've been doing it since the 1960s. It's called APT — Automatic Picture Transmission — and it's the friendliest thing in the radio spectrum. 📡

## What Is APT? (And Why Are These Satellites So Generous?) 🛰️

**APT = Automatic Picture Transmission**

**Translation:** NOAA weather satellites continuously beam low-resolution infrared + visible images at 137 MHz — in a format your $25 USB dongle can hear.

The three satellites you want:
- **NOAA-15:** 137.620 MHz
- **NOAA-18:** 137.9125 MHz
- **NOAA-19:** 137.100 MHz

These are ancient, orbiting relics from the early 2000s that NASA has kept running because... they still work? They're in Low Earth Orbit (~850 km altitude), zipping around every 100 minutes. Each satellite is visible from your location for about **12-15 minutes** per pass.

**What fascinated me as a developer:** APT is essentially slow-scan FM image transmission. The satellite converts image rows to audio tones (2400 Hz carrier, frequency modulated), and your software decodes the audio back into pixels. It's JPEG from space, but invented decades before JPEG! 🖼️

## My Discovery Story (The Rabbit Hole Was Deep) 🐰

### Week 1: The Question Nobody Warned Me About

**Me:** "Can I receive satellite signals with my RTL-SDR?"
**Reddit r/RTLSDR:** "Sure, NOAA APT is a great first satellite project!"
**Me:** "How hard is it?"
**Reddit:** "Oh, you just point a wire at the sky..."

*Four hours later, having built three different antennas and argued with satellite prediction software:*

**Also me:** "I HAVE A PHOTO OF THE ATLANTIC OCEAN FROM SPACE AND I'M CRYING"

### The First Image

My first decoded APT image was terrible. Diagonal stripes. Static noise. Half the image was missing. But in the middle — undeniably — were cloud formations over the Atlantic. From. Space. I took that photo from my apartment. With wire.

In my RF experiments, I've decoded FM metadata, tracked airplanes, and decoded pager messages. Nothing hit like pulling an image out of space with gear that cost less than a takeout dinner.

## How APT Actually Works 🔬

Here's the simplified version (I promise, it's interesting):

**Step 1: Satellite Camera**
The satellite scans Earth in two channels — one visible light, one infrared thermal (works at night!). Each channel is 909 pixels wide.

**Step 2: Convert Image to Audio**
Pixel brightness → audio frequency. White pixels = high tone, black pixels = low tone. The satellite transmits 2 image lines per second at 2400 Hz FM.

**Step 3: You Receive the FM Audio**
Your RTL-SDR captures the raw RF at 137 MHz. You record the FM audio with SDR software.

**Step 4: Decode Audio → Image**
Software reads the audio and converts frequency shifts back to pixel values. Left channel = infrared, right channel = visible. Line by line, you build a complete image!

**What I love about this:** It's just audio encoding. The satellite is literally *playing you a picture* as sound! The "image" is a WAV file before it's a JPG. 🎵

## The Setup: What You Need 🛠️

### Hardware (Under $30 Total!)

**RTL-SDR Dongle:** $25
Any RTL-SDR v3 works. The same one you use for everything else!

**V-Dipole Antenna:** FREE (you build it from wire)

This is the secret weapon. The telescoping antenna that ships with RTL-SDR is terrible for satellites. But a V-dipole built from *coat hanger wire* beats it dramatically.

**V-dipole build:**

```
Element length calculation:
Speed of light / Frequency / 4 = quarter-wave length
300,000,000 m/s / 137,500,000 Hz / 4 = 0.545 meters

Two elements, each 54.5 cm long
Spread at 120° angle (the V shape)
Connect center to your coax feed point
```

**What I used:** Two 55cm pieces from a metal coat hanger. Taped to a piece of wood in a V shape. Connected to my RTL-SDR with a cheap SMA connector. Total cost: $2 and 20 minutes.

**Result:** The difference vs. the stock antenna is like going from AM radio in a tunnel to crystal-clear FM. 📡

### Software Stack

**For Pass Prediction:**
- **Gpredict** (Linux/Mac) — tracks satellites in real-time, shows when NOAA passes over your location
- **N2YO.com** — browser-based, no install needed, shows 10-day pass schedule

**For Receiving:**
- **GQRX** (Linux/Mac) — tune to the satellite frequency, record the audio
- **SDR#** (Windows) — same but Windows
- **SDR++** — works everywhere, my current favorite

**For Decoding:**
- **SatDump** — the modern option, does everything automatically
- **WXtoImg** — classic (abandoned but works), lots of tutorials

**The full pipeline:**
```
Satellite passes overhead
       ↓
Gpredict alerts you (check schedule!)
       ↓
Open SDR++ → tune to 137.620 MHz → record audio
       ↓
SatDump → load your recording → decode image
       ↓
You have a weather satellite photo 🛰️
```

## Your First Satellite Pass: Step by Step 📅

### Night Before: Schedule the Pass

```bash
# Check upcoming NOAA passes at your location
# Open Gpredict or visit n2yo.com
# Look for passes with elevation > 30° (higher = better!)
# Note: NOAA-19 at 70° elevation at 2:47 PM tomorrow
```

**Elevation matters a lot:**
- **10°:** Barely skims the horizon, lots of noise
- **30°+:** Decent image quality
- **60°+:** Excellent, nearly overhead — grab these!
- **90°:** Directly overhead, *chef's kiss* 🤌

### During the Pass: Record!

```
1. Open SDR++ (or GQRX)
2. Set frequency: 137.100 MHz (NOAA-19)
3. Set mode: WFM (Wide FM), bandwidth: 36-40 kHz
4. Hit record 2 minutes BEFORE the pass starts
5. Watch the signal appear as the satellite rises
6. Listen: you'll hear a distinctive "chirping" — that's the image data!
7. Record until signal fades (12-15 minutes)
8. Stop recording
```

**The chirping sound:** APT has a distinctive beeping/chirping quality. When you first hear it — that weird alien sound — you'll know immediately: "That's coming from space." It doesn't sound like music. It sounds like a robot is describing clouds. Because it is.

### After the Pass: Decode!

```bash
# Using SatDump (recommended)
satdump live noaa_apt /dev/null --source file \
  --file your_recording.wav \
  --samplerate 48000

# Or drag-and-drop the WAV into SatDump GUI
# Select: NOAA APT decoder
# Hit Decode
# Wait ~10 seconds
# SPACE PHOTO ACQUIRED 🛰️
```

## Common Mistakes I Made (So You Don't Have To) 😅

### Mistake #1: Forgetting Doppler Shift

**The problem:** The satellite moves FAST (~7 km/s). As it approaches, the signal is Doppler-shifted ~3 kHz higher than nominal. As it recedes, 3 kHz lower.

**What happened to me:** I locked my frequency and half the image was distorted because I drifted off the signal.

**The fix:** Enable "Doppler correction" in Gpredict, which can auto-tune SDR++ in real-time. Or use SatDump's live mode which handles it automatically. Don't manually chase it — that's a full-time job!

### Mistake #2: Indoor Antenna

**Me:** "I'll just point it out the window—"
**Result:** Beautiful image of my apartment wall static.

**Lesson:** Take the antenna OUTSIDE. Even a balcony with clear sky view helps massively. Trees, buildings, and walls eat 137 MHz signals for breakfast. The satellite is only 10-15 minutes above your horizon — make those minutes count!

### Mistake #3: Bad Pass Selection

**Me:** Excitedly set up for a 5° elevation pass. Received nothing.

**Lesson:** Skip any pass under 20° elevation for your first attempts. Wait for the 50°+ passes — they're worth it!

### Mistake #4: Not Building a Proper Antenna

**The stock antenna:** Designed for 1 GHz range, terrible at 137 MHz.

**V-dipole:** 15 minutes to build, dramatically better. The math is simple:
```
Each element = 300 / (137.5 MHz * 4) = 0.545 meters = 54.5 cm
```

**Do the antenna. It makes all the difference.** 📡

## What You Can Do With Your Space Photos 🖼️

### Basic: Compare Your Image to Official Forecasts

Download NOAA's official images and compare. Your home-decoded image will match! (Yours will be lower resolution — that's normal, APT is the "lite" protocol. HRPT is 4x resolution but much harder to receive.)

### Intermediate: Thermal Analysis

APT gives you two channels:
- **Channel A (visible):** Like a normal photo, shows reflected sunlight
- **Channel B (infrared):** Shows heat — clouds glow cold (white), land glows warm (dark)

**Combine them** and you can identify cloud types, storm intensity, and even sea surface temperatures. Actual meteorology! From your apartment! 🌩️

### Advanced: Build an Automated Station

```python
# Pseudocode for the dream setup:
# 1. Gpredict exports pass schedule
# 2. Script auto-starts SDR++ recording at pass time
# 3. Script calls SatDump after pass ends
# 4. New image auto-posted to your website
# 5. Weather satellite station running 24/7, zero effort
```

I'm building this. It's the nerd equivalent of having a weather station but the sensor is in SPACE.

## The Legal Stuff (Very Simple This Time!) ⚖️

**Receiving satellite signals is legal everywhere on Earth.** No license required. These satellites are broadcasting publicly — NOAA *wants* you to receive them! They're literally providing a free public weather data service.

**The only rule:** Don't retransmit or sell the images commercially without attribution. NOAA images are public domain, but be a good citizen and credit the source!

**That's it.** No FCC license. No permits. Just antenna, SDR, and sky. 🌍

## Resources to Get Started 📚

### Essential Links

- **N2YO.com** — satellite pass predictions for your location (just enter your zip/city)
- **SatDump GitHub** — best modern decoder, excellent documentation
- **RTL-SDR Blog** (rtl-sdr.com) — tons of APT tutorials and antenna guides
- **r/RTLSDR** — incredibly helpful community for beginner questions

### Hardware Shortcut

If you don't want to build an antenna, the **RTL-SDR Blog V-Dipole Kit** (~$10) is a pre-built version of exactly what I described. Great option if you want to skip the coat-hanger phase.

### Going Further: HRPT

Once APT feels easy (it will!), the next challenge is HRPT — the high-resolution version of NOAA imagery at 1.7 GHz. It requires a directional dish antenna you manually track... or a motorized mount... which is a whole other rabbit hole.

## The Bottom Line 💡

**NOAA weather satellites are broadcasting free space photography at 137 MHz, 24/7, to anyone who wants to receive it.** They've been doing this for 60 years. It's one of the most accessible, satisfying, and genuinely useful SDR projects you can do.

For under $30 and an afternoon, you can:
- ✅ Receive live satellite images from 850 km above Earth
- ✅ Learn about satellite orbits, Doppler physics, and signal propagation
- ✅ Build your first purpose-designed RF antenna
- ✅ Impress literally everyone at the next party
- ✅ Feel the specific joy of pulling data from space with wire

**What fascinated me most:** These satellites are so old they predate USB, the internet browser, and most smartphones. They're still flying, still transmitting, still patiently sending cloud images to anyone who listens. In my RF experiments, few things feel as timeless as talking to hardware launched before I was born.

## Your Action Plan 🚀

**Today (30 minutes):**
1. Visit N2YO.com → enter your city → look up NOAA-19 passes
2. Find a pass with 40°+ elevation in the next few days
3. Set a reminder

**Tomorrow (2 hours):**
1. Build the V-dipole antenna (coat hanger + wire + 20 mins)
2. Install SatDump and SDR++
3. Do a test recording of any FM station to confirm your setup works

**This Weekend:**
1. Catch your first satellite pass
2. Decode your first image
3. Show everyone. They will not believe you received it from space. You will be smug for days.

---

**Got your first satellite image?** I want to see it! Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh).

**Want the antenna templates and SatDump configs I use?** It's all on my GitHub — scripts, antenna measurements, the automation setup I'm building.

*The sky is literally full of free data from space. All you need is wire, a USB dongle, and the curiosity to look up.* 🛰️✨

---

**P.S.** The first time you see a real cloud formation you received from 850 km up, you will immediately open Gpredict to schedule your next pass. This is not a phase. This is a lifestyle.

**P.P.S.** My satellite reception automation project now has me waking up to new space photos every morning before coffee. I have become a weather satellite person. There are worse things to become. 📡
