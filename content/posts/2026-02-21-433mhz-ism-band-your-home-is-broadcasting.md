---
title: "Your Home Is Broadcasting Secrets on 433MHz (And So Is Your Neighbor's) 📻⚡"
date: "2026-02-21"
excerpt: "I pointed my RTL-SDR at 433MHz and my living room erupted in signals. My neighbor's weather station. Someone's wireless doorbell. A car key fob three houses down. A tire pressure sensor from a passing Toyota. All of them broadcasting in plain text, totally unencrypted, to literally anyone listening. Including me. Including you."
tags: ["rf", "sdr", "wireless", "hobby", "iot"]
featured: true
---

# Your Home Is Broadcasting Secrets on 433MHz (And So Is Your Neighbor's) 📻⚡

**Real talk:** I opened SDR# on a lazy Sunday, tuned to 433MHz, and my waterfall display looked like a fireworks show.

Dozens of signals. Constant, regular bursts. Coming from everywhere.

My first thought: "Is someone running an illegal transmitter on my street?"

My second thought, after five minutes of Googling: "Wait... this is just... everyone's wireless weather station? Their doorbell? Their tire pressure sensor?"

**My third thought:** "None of this is encrypted. AT ALL."

Welcome to 433MHz — the ISM band where your smart home devices throw a constant unencrypted party and I'm the uninvited guest with a $20 USB dongle and a bag of chips. 🎉

## What Even IS 433MHz? 🤔

**ISM = Industrial, Scientific, Medical**

It's a set of radio frequencies anyone can use without a license for low-power devices. In Europe and most of Asia, **433.92 MHz** is THE frequency for cheap wireless gadgets. In North America, 915 MHz is common, but 433MHz devices are EVERYWHERE globally.

Think of it as the "no-registration required" Wi-Fi of the radio world — except instead of internet traffic, it's carrying:

```
- Wireless weather station sensor readings (temperature, humidity)
- Remote-controlled power outlets (on/off states)
- Wireless doorbells (button press events)
- Tire Pressure Monitoring Systems / TPMS (pressure, temperature)
- Car key fobs (lock/unlock signals — but these ARE encrypted, thankfully)
- Wireless alarm sensors (door open/close events!)
- Remote controls for ceiling fans, blinds, garage doors
- Animal tracking tags
- Remote temperature loggers
```

**What fascinated me as a developer:** Every time your outdoor thermometer sends a temperature update, it's shouting that data into the air for anyone with the right equipment to hear. No TLS. No encryption. Just raw sensor data, sprayed in all directions. 📡

## How I Fell Into This Rabbit Hole 🐰

### The Accidental Discovery

I'd been doing ADS-B plane tracking for weeks and was bored during a lull in air traffic. So I just... dragged the frequency slider around in SDR# looking for interesting signals.

At 433MHz, the waterfall exploded.

Not one signal — dozens. Popping up every few seconds, all over the sub-band, with distinctive short burst patterns.

```
Tuned to: 433.920 MHz
What I saw: Short 100ms bursts, every 30-60 seconds, multiple sources
My reaction: "What IS all this?!"
Google: "rtl_433 — decode common ISM band devices"
```

Ten minutes later, I had `rtl_433` running and it was printing decoded messages to my terminal like a confession booth:

```
time      : 2026-02-21 09:23:41
model     : Nexus-TH
id        : 42
channel   : 1
Battery   : OK
Temperature: 18.3 C
Humidity  : 67 %
```

My neighbor's wireless thermometer. Temperature: 18.3°C. Humidity: 67%.

**My neighbor doesn't know I know this.** 🌡️

### The Escalating Obsession

In my RF experiments, 433MHz turned out to be the richest vein I'd ever struck. Within one hour of running `rtl_433`:

```
📡 Oregon Scientific weather sensor from 2 houses away
📡 A mystery Acurite weather station (someone has a garden!)
📡 3 different TPMS sensors from cars driving past my window
📡 A wireless doorbell button press (someone rang their doorbell!)
📡 What appears to be 2 wireless power outlet remotes
📡 An unidentified device transmitting every 8 seconds like clockwork
```

**That last one kept me up for two hours.** What transmits EXACTLY every 8 seconds? Turned out to be a cheap wireless soil moisture sensor. The garden down the street is being monitored. The garden doesn't know it's being monitored.

**I now know more about my neighborhood's ambient temperature than anyone who lives in it.** This hobby does things to you. 📊

## The Technical Bit (Explained Simply) ⚙️

### How These Devices Transmit

Most 433MHz IoT devices use **OOK (On-Off Keying)** — the simplest possible digital modulation:

```
OOK = "Turn the transmitter ON for a 1, OFF for a 0"

Like Morse code, but digital:
Binary 1 = Transmitter ON  (you see a signal on waterfall)
Binary 0 = Transmitter OFF (silence on waterfall)

A temperature packet might look like:
11001010 00110101 10110001 ...
(each group encodes part of the sensor ID, temperature, humidity)
```

**What this means for receiving:** Any RTL-SDR can demodulate OOK perfectly. You don't need fancy hardware. You just need to know the timing.

**What this means for security:** There's no encryption layer. The sensor broadcasts raw sensor data in the clear. Anyone who knows the packet format can decode it.

As a developer exploring radio frequencies, this felt like finding a REST API with no authentication. The data is just... there. For anyone who asks. 😅

### Why There's No Encryption (The Sad Truth)

```
Battery-powered outdoor sensor constraints:
- Tiny battery (AA or coin cell)
- Must last 1-2 YEARS on that battery
- Transmitting uses most of the power budget
- Encryption adds computation = more power drain
- Cost target: $5-15 for the whole sensor

The math:
Encryption overhead → more CPU cycles → more power → battery dies in 3 months
No encryption → raw data → years of battery life → happy customers → more sales

Security? Not the target market's problem.
(Until now, apparently, when randos with RTL-SDRs start logging their temperatures.)
```

**The irony:** The weather station broadcasting your exact home temperature is less secure than a 1950s postcard. But your neighbor's front door is still locked. So it's fine. Probably. 🔓

## Setting Up rtl_433 (Your New Favorite Tool) 💻

`rtl_433` is the single best tool in the SDR hobbyist toolkit. It supports **hundreds** of device protocols and auto-detects transmissions.

### Installation

```bash
# Ubuntu / Debian / Raspberry Pi
sudo apt-get install rtl-433

# OR build from source (more up-to-date)
sudo apt-get install cmake libusb-1.0-0-dev librtlsdr-dev
git clone https://github.com/merbanan/rtl_433
cd rtl_433
mkdir build && cd build
cmake ..
make
sudo make install

# macOS with Homebrew
brew install rtl_433
```

### First Run — Just Let It Listen

```bash
# Plug in your RTL-SDR dongle
# Run with auto-detection:
rtl_433

# rtl_433 will scan around 433.92 MHz and decode whatever it finds
# Give it a few minutes in a suburban area

# Expected output (your results will vary!):
# time      : 2026-02-21 09:23:41
# model     : Oregon-THGR810
# id        : 150
# channel   : 1
# Battery   : OK
# Temperature: 21.5 C
# Humidity  : 55 %
#
# time      : 2026-02-21 09:24:03
# model     : Acurite-Tower
# id        : 6140
# channel   : B
# Battery   : OK
# Temperature: 19.8 C
# Humidity  : 61 %
```

**If you see nothing:** Give it 5-10 minutes. Weather stations typically transmit every 30-60 seconds. Patience! 🕐

### List All Supported Devices

```bash
# See what rtl_433 can decode (spoiler: it's a LOT)
rtl_433 -R help

# As of recent versions: 200+ device protocols!
# Includes: Oregon Scientific, Acurite, Nexus, TPMS, alarm sensors,
# pool thermometers, BBQ probes, LaCrosse, ambient weather, and more!
```

**What fascinated me:** When `rtl_433` decoded a device I didn't recognize, I pulled up the GitHub repo and found the protocol had been reverse-engineered by hobbyists who captured raw packets and painstakingly figured out the bit patterns. Community-driven open source at its finest! 🧪

### Log to JSON — The Developer Version

```bash
# Output in JSON format — pipe to anything you want!
rtl_433 -F json

# Sample output:
# {"time":"2026-02-21 09:23:41","model":"Nexus-TH","id":42,"channel":1,"battery_ok":1,"temperature_C":18.3,"humidity":67}
# {"time":"2026-02-21 09:24:09","model":"Acurite-Tower","id":6140,"channel":"B","battery_ok":1,"temperature_C":19.8,"humidity":61}

# Log to file:
rtl_433 -F json:/tmp/433_log.json

# Pipe to MQTT (home automation integration!):
rtl_433 -F "mqtt://homeassistant.local:1883,retain=0,devices=rtl_433[/model]"
```

**That MQTT integration is where things get REALLY fun.** But first — let's build something ourselves. 🏗️

## Projects I Actually Built 🚀

### Project 1: My Personal Neighborhood Weather Network

**The idea:** Log every temperature sensor I can receive and build a heat map of my street.

```python
#!/usr/bin/env python3
"""
433MHz Neighborhood Weather Logger
Turns your RTL-SDR into a hyperlocal weather network spy station
"""

import json
import sqlite3
import subprocess
from datetime import datetime

# Connect to database
conn = sqlite3.connect('neighborhood_weather.db')
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE IF NOT EXISTS readings (
        timestamp TEXT,
        model TEXT,
        device_id INTEGER,
        channel TEXT,
        temperature_c REAL,
        humidity INTEGER,
        battery_ok INTEGER
    )
''')
conn.commit()

def process_rtl433_output():
    """Run rtl_433 and log everything to SQLite"""
    process = subprocess.Popen(
        ['rtl_433', '-F', 'json', '-M', 'utc'],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True
    )

    print("🎙️ Listening for 433MHz devices...")
    print("Your neighborhood is about to get very transparent.\n")

    for line in process.stdout:
        try:
            data = json.loads(line.strip())

            # Only log temperature sensors (the juicy stuff)
            if 'temperature_C' in data:
                cursor.execute('''
                    INSERT INTO readings VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    data.get('time', datetime.utcnow().isoformat()),
                    data.get('model', 'Unknown'),
                    data.get('id', 0),
                    str(data.get('channel', '?')),
                    data.get('temperature_C'),
                    data.get('humidity'),
                    data.get('battery_ok', 1)
                ))
                conn.commit()

                print(f"📡 {data['model']} (ID:{data.get('id','?')}) → "
                      f"{data['temperature_C']}°C / {data.get('humidity','?')}% RH")

        except json.JSONDecodeError:
            pass  # Skip non-JSON lines

if __name__ == "__main__":
    process_rtl433_output()
```

**Results after 24 hours:** I identified **7 distinct weather sensors** within range of my apartment. I could see:

```
Sensor A (strongest signal, probably next door): 21.3°C → 22.1°C in afternoon sun
Sensor B (weaker signal, maybe 2 houses?): Consistently 0.8°C cooler
Sensor C (weird — only appears afternoons): 28°C (someone's BBQ area???)
```

Sensor C transmits a suspiciously high temperature only between 5 PM and 7 PM on weekends. Someone is definitely grilling. I now know their BBQ schedule better than they realize. 🍖

### Project 2: TPMS Watcher — Track Cars by Their Tires

This is the one that made my developer brain short-circuit.

**What TPMS is:** Tire Pressure Monitoring System — legally required in all cars sold in the US since 2008. Each tire has a wireless sensor that broadcasts pressure and temperature every ~60 seconds while driving.

**What TPMS broadcasts on 433MHz:**

```bash
# Example rtl_433 TPMS output:
time      : 2026-02-21 10:15:32
model     : Toyota/Lexus TPMS
type      : TPMS
id        : A3F22B1C
status    : 0x00
Pressure  : 36.25 PSI
Temperature: 22.00 C
```

**That `id` field.** That's a unique identifier for that SPECIFIC tire sensor. It's the same every transmission. It doesn't change.

**The implication:** Every car driving past your window is broadcasting a unique ID for each tire. If you log these IDs, you can detect when the same car passes again. Indefinitely.

```python
# TPMS vehicle re-identification (for educational/research purposes)
# This is the thing that privacy researchers have been warning about since 2010

import json
import subprocess
from collections import defaultdict
from datetime import datetime

seen_vehicles = defaultdict(list)

process = subprocess.Popen(
    ['rtl_433', '-F', 'json', '-R', '131'],  # -R 131 = TPMS protocols only
    stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
)

print("🚗 TPMS Tracker Running (research mode)")
print("Watching for tire pressure sensors...\n")

for line in process.stdout:
    try:
        data = json.loads(line.strip())
        if 'id' not in data:
            continue

        sensor_id = data['id']
        timestamp = datetime.now().isoformat()
        seen_vehicles[sensor_id].append(timestamp)

        count = len(seen_vehicles[sensor_id])
        if count == 1:
            print(f"🆕 New vehicle: {sensor_id} | "
                  f"PSI: {data.get('pressure_PSI', '?')} | "
                  f"Temp: {data.get('temperature_C', '?')}°C")
        else:
            first_seen = seen_vehicles[sensor_id][0]
            print(f"🔁 Returning vehicle: {sensor_id} | "
                  f"Seen {count}x | First: {first_seen}")

    except json.JSONDecodeError:
        pass
```

**What I found running this near a busy intersection:** I could reliably identify "regulars" — cars that passed at similar times each day. A vehicle (presumably commuting to work) appeared between 8:05 and 8:20 AM every weekday. Another appeared around 5:45 PM. No idea whose cars these are, but their tires told me their schedule.

**This is why security researchers have been screaming about TPMS since 2010.** The radio just doesn't care. 📻

### Project 3: Home Assistant Integration (The Smart Home Upgrade)

The most practical project: Turn random neighborhood 433MHz sensors into a proper home dashboard.

```yaml
# Home Assistant configuration.yaml
# Use rtl_433 as a data source via MQTT

mqtt:
  broker: localhost

sensor:
  - platform: mqtt
    name: "Backyard Temperature (Neighbor's Station)"
    state_topic: "rtl_433/Nexus-TH/42/temperature_C"
    unit_of_measurement: "°C"
    device_class: temperature

  - platform: mqtt
    name: "Backyard Humidity"
    state_topic: "rtl_433/Nexus-TH/42/humidity"
    unit_of_measurement: "%"
    device_class: humidity
```

```bash
# Run rtl_433 feeding into Home Assistant's MQTT broker
rtl_433 -F "mqtt://localhost:1883,retain=0,devices=rtl_433[/model][/id]"
```

**What I now have on my Home Assistant dashboard:**
- Temperature readings from my neighbor's garden sensor (with their knowledge? Unclear)
- Humidity trends from 3 different neighborhood stations
- TPMS alerts when my OWN car's tires drop below 32 PSI (I added my tire IDs to a watchlist)

**Is it slightly invasive that my smart home uses my neighbor's weather sensor? Yes. Is it helpful? Also yes. Have I mentioned this to my neighbor? ...No. 😬**

## The Security Angle (It Gets Interesting) 🔐

### What's Transmitting in Clear Text on 433MHz

Beyond weather stations, there's some genuinely eye-opening stuff on this band:

**Wireless alarm door/window sensors:**
```bash
# Yes, some cheap alarm systems use 433MHz
# rtl_433 can decode them:
time      : 2026-02-21 11:00:01
model     : Generic-Security
id        : 12345
state     : OPEN
```

**The security implication:** Some budget alarm systems broadcast "FRONT DOOR OPEN" in clear text on 433MHz. This is a known issue in security research, and yes, properly designed alarm systems use encrypted protocols. But plenty of cheap ones still don't.

**What to do about it:** If you're using wireless alarm sensors, verify they use a proprietary encrypted protocol (most modern systems from reputable brands do). If `rtl_433` can decode your alarm sensors without any setup, consider an upgrade.

**Remote-controlled power outlets:**
```bash
# The classic 433MHz outlet controllers (the ones with 4 buttons)
time      : 2026-02-21 14:22:17
model     : HomeEasy
id        : 16578412
channel   : 1
command   : on
```

Some of these have no rolling codes — the same signal turns the outlet on every single time. In theory, you could learn the signal and replay it. In practice, nobody is breaking into houses to control their floor lamps.

**The nuanced view:** 433MHz "vulnerabilities" are largely theoretical risk for consumer IoT. The real value is in understanding how these systems work and making informed purchasing decisions.

## Legal and Ethical Stuff (Important!) ⚖️

### Receiving: Almost Always Legal ✅

**In most countries:**
- ✅ Passive receive on 433MHz = legal
- ✅ No license required to listen
- ✅ These are PUBLIC radio transmissions
- ✅ Any radio can pick up these signals

**What's NOT okay:**
- ❌ Transmitting on 433MHz at high power without authorization
- ❌ Jamming other people's devices (illegal everywhere)
- ❌ Using received data to stalk, harass, or harm anyone
- ❌ Intercepting encrypted communications (different laws apply in different jurisdictions)

### The Privacy Ethics Conversation

TPMS tracking and neighbor sensor logging sit in a legally gray but ethically thoughtful zone:

**My rule of thumb:**
- ✅ Logging for learning and personal experimentation = fine
- ✅ Using signals to improve your own home automation = fine
- ✅ Security research and responsible disclosure = important
- ❌ Building a tracking database of neighbors' movements = not okay
- ❌ Acting on alarm sensor data that isn't yours = very illegal

The signals are technically public because the radio doesn't care about property lines. Using them to actively violate someone's privacy is a different matter entirely.

**If in doubt:** Delete the data, don't act on it, and focus on your own devices. 🛡️

## Why This Is Perfect for Developers 🧑‍💻

As a software developer who got into RF, 433MHz IoT is my favorite band because:

**The protocols are simple:**
OOK modulation + simple binary packet formats = approachable for anyone comfortable with bit manipulation and data structures.

**rtl_433 is open source:**
Every supported device protocol is documented in C code. Reading the source is genuinely educational — you can see exactly how hobbyists reverse-engineered each device.

```c
// Real example from rtl_433 source: Nexus temperature sensor decoder
// The packet structure, decoded from radio captures:
// 36 bits: [8 bit id] [1 bit batt] [1 bit ???] [2 bit channel] [12 bit temp] [4 bit ???] [8 bit humidity]
// Temperature is coded as ((temp*10)+1000) and humidity is raw %RH
```

**The feedback loop is immediate:**
Unlike web development where you need a browser and a server to see results, 433MHz gives you instant gratification. Point the dongle at the window, run `rtl_433`, and within minutes your neighbor's garden is talking to your terminal.

**It bridges hardware and software:**
You're dealing with physical radio signals, converting them to digital data, processing them in Python, and piping them into databases and dashboards. The full stack, but with antennas. 📡

## Getting Started This Weekend 🚀

### Saturday: First 433MHz Captures

```bash
# Install rtl_433
sudo apt-get install rtl-433  # Or build from source

# Plug in your RTL-SDR dongle (any RTL-SDR works!)
# Run with auto-detection
rtl_433

# Wait 5-10 minutes in a suburban area
# You WILL see signals unless you live in the wilderness
```

**If you're not getting signals:** Try near a window. Walls attenuate 433MHz somewhat. Direct line to outdoors helps.

**If you get a flood of signals:** Welcome to suburban living. You'll need to identify which IDs are your own devices.

### Sunday: Build Something

**Option A: Personal weather dashboard** — Log all your received sensors to SQLite, build a simple Flask API, display on a web page.

**Option B: Home Assistant integration** — Feed `rtl_433` into your MQTT broker and add neighborhood sensors to your smart home.

**Option C: TPMS watchdog** — Record your own car's tire sensor IDs, set up alerts when pressure drops below threshold. Actually useful!

**Option D: Reverse engineer your own devices** — Buy a cheap 433MHz remote and sensor kit from Amazon (~$10). Use `rtl_433` in raw mode to capture the signals. Try to figure out the protocol. It's addictive puzzle-solving. 🧩

## Resources for Getting Started 📚

**Essential Software (all FREE!):**
- [rtl_433](https://github.com/merbanan/rtl_433) — THE tool for this band, 200+ supported devices
- [SDR#](https://airspy.com/download/) — visualize the waterfall, see what's out there
- [GQRX](https://gqrx.dk/) — Linux/Mac alternative with great UI

**Learning the Protocols:**
- [rtl_433 device list](https://github.com/merbanan/rtl_433/blob/master/README.md) — what it can decode
- [PySDR.org](https://pysdr.org) — free book: learn digital signal processing with Python
- r/RTLSDR — the best community for SDR beginners, very welcoming
- [sigidwiki.com](https://www.sigidwiki.com) — identify mystery signals by their waterfall appearance

**Hardware:**
- RTL-SDR Blog v3 ($20) — the standard recommendation, works great on 433MHz
- Any standard whip antenna included with RTL-SDR kits works at 433MHz
- For better range: a dedicated 433MHz yagi (~$15) pointed toward a busy street

## The Bottom Line 💡

433MHz is the SDR project that makes you look at your own house differently.

Every wireless gadget you own — the weather station, the remote thermometer, the tire pressure sensors — is shouting data into the air constantly. Unencrypted. Unaware. Available to anyone with the right $20 hardware and a free afternoon.

**What I learned as a developer exploring radio frequencies:**

The radio spectrum around your home is dense with information. Unlike the internet (where data travels through wires and servers and hopefully some encryption), radio just... propagates. Through walls, through windows, into the next house over. Protocol designers in the 2000s made pragmatic tradeoffs: battery life won over encryption. And those decisions are still echoing through the airwaves today.

**After a month of 433MHz logging**, I've catalogued 11 distinct devices within range of my apartment. I know which sensors have weak batteries (the transmission interval gets erratic). I know when someone moved house because their familiar sensor ID disappeared and a new one appeared. I know the ambient temperature of my entire block.

Is it weird that my laptop knows the temperature of my neighbor's garden? Absolutely. Is it legal and technically impressive? Also yes. Did learning about this make me immediately check whether MY alarm sensors use encrypted protocols?

Oh yes. Yes it did. 🔐

The 433MHz band is the radio equivalent of a conversation in a crowded café — technically public, practically ignored. Until someone sits down next to you with a receiver and a Python script.

I am that person. And now, so are you.

## TL;DR

- 433MHz is the ISM band where hundreds of cheap IoT devices transmit sensor data
- `rtl_433` + any RTL-SDR dongle = instant decoder for 200+ device types
- Typical suburban area: 5-15 decodable devices within range
- Weather stations, TPMS tire sensors, doorbells, remote outlets all broadcast in clear text
- 100% legal to receive (passive only), ethically use for your own devices and learning
- The privacy implications of TPMS tracking are real — good research topic!
- Best beginner SDR project after ADS-B: immediate results, tons of devices to find

---

**Decoded your first 433MHz sensor?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and tell me the weirdest device you found!

**Want my neighborhood logging scripts?** Check out my [GitHub](https://github.com/kpanuragh) — SQLite logger, Home Assistant integration config, and TPMS watchdog scripts!

*Now go run `rtl_433` near your window. Your neighborhood has been talking for years. It's time to start listening.* 📻📡⚡

---

**P.S.** The exact moment I realized my upstairs neighbor has a wireless BBQ meat thermometer — because `rtl_433` started printing "Maverick-ET733: Probe 1: 78°C (Meat), Probe 2: 190°C (Pit)" every Sunday — was the moment I felt both invasive and deeply impressed by the range of that thermometer. Perfect ribs, by the way. The data doesn't lie.

**P.P.S.** I put a strip of tape labeled "YOUR TIRE ID" on my phone with my car's TPMS sensor hex codes. Now when I'm testing my receiver setup, I can walk around my own car in the parking lot and see my own tires check in. My neighbors have given up asking why I wave a USB dongle at car wheels. It's fine. This is normal hobbyist behavior.

**P.P.P.S.** Warning: Once you decode your first 433MHz packet, you WILL start looking at every wireless gadget you own and wondering "is this transmitting something?" The answer is almost certainly yes. Welcome to the paranoid club. We meet on 433.92 MHz. Bring your RTL-SDR. 🔍
