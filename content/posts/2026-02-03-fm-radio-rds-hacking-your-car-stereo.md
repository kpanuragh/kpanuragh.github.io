---
title: "FM Radio Hacking: How I Made My Car Display 'HACKED BY ME' (Legally!) 📻"
date: "2026-02-03"
excerpt: "Ever wonder how your car radio knows the song name and artist? I decoded RDS (Radio Data System) with my SDR and learned how FM radio actually works. Then I built a tiny transmitter and became my own radio station!"
tags: ["rf", "sdr", "wireless", "hobby", "fm-radio"]
featured: true
---

# FM Radio Hacking: How I Made My Car Display 'HACKED BY ME' (Legally!) 📻

**Real talk:** I was driving to work when my car stereo displayed "NOW PLAYING: Bohemian Rhapsody - Queen" and I thought... wait, how does my 2015 Honda know what song is playing on FM radio? Does the radio station TRANSMIT the song name?

This rabbit hole led me to discover RDS (Radio Data System), decode it with my SDR, and eventually build a tiny FM transmitter that made my car stereo display custom messages. My dashboard literally said "HACKED BY ANURAGH" while playing my favorite playlist. 🎵

**Legal disclaimer right up front:** I'm talking about LOW POWER transmitters (under 200 feet range) which are legal in most countries without a license. I'm not teaching you to start a pirate radio station! We're staying legal, folks. 🚓

## What the Heck Is RDS? 🤔

**RDS = Radio Data System**

**Translation:** A secret digital data channel embedded in FM radio broadcasts that sends text, time, traffic alerts, and other metadata alongside the audio!

Think of it like this:
- **FM Audio:** The music you hear (88-108 MHz)
- **RDS Data:** Digital text piggybacking on the same signal (invisible to your ears!)
- **Your Radio:** Decodes both and displays "Station Name" and "Song Title"

**Mind blown moment:** Every FM radio station is transmitting DATA constantly. You just can't hear it because it's encoded at 57 kHz (humans hear 20 Hz - 20 kHz). But your radio sees it! 👀

## How I Discovered This (Down the Rabbit Hole) 🐰

### Week 1: The Question

**Me in car:** "How does my radio know the song name?"
**Google:** "RDS - Radio Data System"
**Me:** "That sounds hackable... 🤔"

### Week 2: The SDR Experiment

I had my RTL-SDR dongle from aircraft tracking experiments (different hobby, same obsession). I wondered: can I SEE the RDS data?

**Spoiler:** YES! Here's what I did:

```bash
# Install GNU Radio (signal processing toolkit)
sudo apt-get install gnuradio

# Install RDS decoder
pip3 install gr-rds

# Run RTL-SDR and decode FM + RDS
rtl_fm -f 95.5M -M fm -s 200k -r 48k - | \
    multimon-ng -t raw -a RDS /dev/stdin
```

**Output on screen:**
```
RDS: PI=5402 PS=WXYZ_FM_ RT=Now Playing: Rick Astley - Never Gonna Give You Up
```

**My reaction:** "I'M DECODING SECRET DATA FROM RADIO WAVES IN MY APARTMENT!" 🎉

### Week 3: The Deep Dive

In my RF experiments, I learned RDS can transmit:

- **PS (Program Service):** Station name (8 chars, e.g., "WXYZ FM")
- **RT (Radio Text):** Song info, ads, messages (64 chars!)
- **CT (Clock Time):** Exact time sync
- **TP/TA (Traffic Program/Announcement):** Traffic alert flags
- **PTY (Program Type):** Genre (Rock, News, Jazz, etc.)
- **AF (Alternative Frequencies):** Other frequencies for same station
- **TMC (Traffic Message Channel):** Real-time traffic data for GPS!

**The coolest part:** All of this fits in a 1,187.5 Hz bandwidth! It's like sneaking a USB drive into a concert - nobody notices it, but the data is THERE! 💾

## How RDS Actually Works (Simplified!) 🔬

**Step 1: FM Station Broadcasts Audio**
- Frequency: Let's say 95.5 MHz
- Audio: Music, DJ talking, ads

**Step 2: Station Adds a 57 kHz Subcarrier**
- Think of it like a "hidden track" in the signal
- Modulated with digital data (1,187.5 bits per second)
- Encoded using something called "differential BPSK" (fancy phase shifting)

**Step 3: Your Car Radio Receives It**
- Tunes to 95.5 MHz (the main signal)
- Separates the 57 kHz RDS subcarrier
- Decodes the digital data
- Displays "Station: WXYZ FM" and "Now Playing: [song info]"

**What fascinated me as a software developer:** It's literally a multiplexed data protocol running alongside analog audio! Like having HTTP and WebSocket on the same port. Physics is COOL! 🌟

## Building My Own FM Transmitter (The Legal Way) 📡

After weeks of receiving and decoding, I thought: "Can I TRANSMIT my own RDS data?"

**Spoiler:** Yes! And it's easier than you think.

### The Hardware (Under $40!)

**Option 1: Raspberry Pi + FM Transmitter Board ($35)**

I used a Raspberry Pi Zero W with a simple GPIO antenna hack. The Pi has a PWM pin that can generate FM signals!

**Hardware list:**
- Raspberry Pi (any model with GPIO)
- Wire antenna (literally just wire, I used a 75cm piece)
- Power supply
- That's it!

**Option 2: Cheap FM Transmitter Module ($10-20)**

You can buy pre-made FM transmitter modules on Amazon/AliExpress that accept audio + RDS input via I2C. Even easier!

### The Software (The Fun Part!) 💻

I used PiFmRds, an open-source Raspberry Pi FM transmitter with RDS support!

```bash
# Install on Raspberry Pi
git clone https://github.com/ChristopheJacquet/PiFmRds.git
cd PiFmRds/src
make

# Transmit FM with RDS!
sudo ./pi_fm_rds \
    -freq 107.9 \
    -audio music.wav \
    -ps "ANURAGH" \
    -rt "Welcome to my car! You are now listening to my playlist!" \
    -pi 1234
```

**What this does:**
- Transmits FM radio on 107.9 MHz
- Plays `music.wav` as audio
- RDS PS: "ANURAGH" (station name)
- RDS RT: Custom message!
- Power: VERY low (legal range ~50-200 feet)

**The magical moment:** I walked to my car, tuned to 107.9 FM, and my dashboard lit up with "ANURAGH" and my custom message. I CREATED A RADIO STATION! 🎙️

### The Antenna Hack 📶

**Pro tip:** Antenna length matters for FM!

**FM wavelength calculation:**
```
Wavelength (m) = 300 / Frequency (MHz)
For 107.9 MHz: 300 / 107.9 = 2.78 meters
Quarter-wave antenna: 2.78 / 4 = 0.695 meters ≈ 70cm
```

**What I did:** Soldered a 75cm wire to GPIO pin 4 on the Pi. Boom - instant FM antenna! Reception improved from 10 feet to 150+ feet. 📡

**Important:** Longer antenna = better range, BUT more likely to be illegal! Keep it under 200 feet range to stay legal in most countries.

## Cool Projects I Built With RDS 🚀

### Project 1: Car Dashboard Messenger

**The idea:** Send custom messages to my car stereo display

**What I built:**
- Web interface to type messages
- Raspberry Pi receives via Wi-Fi
- Updates RDS RT field in real-time
- My car displays the message!

**Use cases:**
- "Welcome back!" when I get in car
- "Gas is low, fill up!" reminders
- "Drive safe! Love, [wife's name]" messages
- Rick-rolling myself (it had to be done)

**Coolness factor:** 10/10 - My friends thought it was MAGIC! ✨

### Project 2: Bluetooth to FM Bridge

**The problem:** My old car stereo doesn't have Bluetooth

**My solution:**
1. Raspberry Pi with Bluetooth receiver
2. Receives audio from phone
3. Transmits to FM with RDS showing song info
4. Car stereo displays artist + song name!

**Cost:** $35 Raspberry Pi vs. $200+ new car stereo. I WIN! 💰

### Project 3: Multi-Language RDS Scrolling Messages

**What:** Rotating messages in different languages on my car stereo

```python
import time
import subprocess

messages = [
    "Welcome to Anuragh FM! 📻",
    "Now Playing: Your Favorite Songs",
    "¡Hola! Bienvenido!",
    "こんにちは！ (Japanese works too!)",
    "Signal strength: MAXIMUM 💪"
]

for msg in messages:
    subprocess.call([
        'sudo', './pi_fm_rds',
        '-freq', '107.9',
        '-rt', msg,
        '-ps', 'ANURAGH'
    ])
    time.sleep(30)  # Display each message for 30 seconds
```

**What fascinated me:** RDS supports Unicode! You can send emojis (mostly) and international characters. My car stereo became multilingual! 🌍

## Decoding RDS from Real Radio Stations 🔍

Want to spy on what radio stations are really transmitting? Here's how:

### Method 1: RTL-SDR + Multimon-NG

```bash
# Tune to your favorite station (e.g., 101.1 FM)
rtl_fm -f 101.1M -M fm -s 200k -r 48k - | \
    multimon-ng -t raw -a RDS /dev/stdin

# You'll see decoded RDS data:
# PS: RADIO101
# RT: Now Playing: Taylor Swift - Shake It Off
# PTY: 10 (Pop Music)
# TP: Traffic Program Available
```

**What I discovered:** Some stations send WAY more data than others. NPR sends time sync. Pop stations send song info. Talk radio barely uses RDS at all!

### Method 2: GNU Radio Companion (Visual Programming!)

**For the visual learners:** GNU Radio has a drag-and-drop interface for signal processing!

1. Install `gnuradio` + `gr-rds`
2. Open GNU Radio Companion
3. Build a flowgraph: RTL-SDR Source → FM Demod → RDS Decoder → Output
4. See RDS data in real-time!

**My favorite discovery:** Watching the RDS data change live when songs switch. It's like seeing the Matrix code behind FM radio! 🟢

## The Legal Stuff (Super Important!) ⚖️

### What's Legal

**In the US (FCC Part 15 Rules):**
- ✅ Transmitters under 250 mV/m at 3 meters (~200 feet range)
- ✅ Frequencies: 88-108 MHz (FM band)
- ✅ No license required for low power
- ✅ Personal use (home, car, backyard)

**Translation:** You can have a tiny FM transmitter for your house/car without FCC approval!

### What's NOT Legal

- ❌ High power transmission (pirate radio station)
- ❌ Interfering with commercial stations
- ❌ Transmitting outside FM band
- ❌ Causing interference to neighbors
- ❌ Broadcasting copyrighted content publicly

**Real talk:** If your neighbor can hear your station clearly, you're probably too powerful! Keep it low-power and local. 📻

### International Laws

**UK:** Similar rules, 50 meters range limit
**EU:** Varies by country, usually ~50-100 meters
**Canada:** Similar to US, check Innovation, Science and Economic Development Canada
**Australia:** ACMA regulates, low power allowed

**Golden rule:** Keep it LOW POWER, don't interfere with others, and you're probably fine. But check your local regulations! I'm not a lawyer! 👨‍⚖️

## Common Mistakes I Made (Learn from My Pain!) 😅

### Mistake #1: Using Too Much Power

**What happened:** First test, I set transmission power too high. My neighbor knocked on my door asking why his car radio was stuck on "ANURAGH FM"! 😂

**Lesson:** Start LOW power. Test range. Increase slowly. Be a good neighbor!

### Mistake #2: Wrong Antenna Length

**The problem:** Used a random wire length (20cm). Signal was terrible, range was 5 feet.

**Solution:** Calculate proper quarter-wave antenna for your frequency. Made HUGE difference!

**Formula reminder:**
```
Quarter-wave length = 300 / (Frequency in MHz × 4)
For 107.9 MHz: 300 / (107.9 × 4) = 0.695m = 69.5cm
```

### Mistake #3: Forgetting RDS Update Rate

**What I learned:** RDS updates slowly! It sends 11.4 groups per second, and each message is split across multiple groups.

**Translation:** If you change the RDS text, it might take 2-5 seconds to update on your radio. Don't expect instant updates!

**My fix:** Added delay in my message-sending script. Patience is key! ⏱️

### Mistake #4: Not Checking for Interference

**Oops:** I picked 107.9 MHz because it was "empty" on my car radio.

**Reality:** A low-power station 5 miles away used 107.9. When I drove that direction, my transmission interfered!

**Solution:** Use an SDR to scan the ENTIRE FM band first. Pick a truly empty frequency. Be responsible! 📡

## Advanced RDS Hacking: Dynamic Content 🎯

Want to level up? Here's how I made RDS display real-time data:

### Project: Weather Station RDS

```python
import requests
import subprocess

def get_weather():
    # Fetch weather from API
    response = requests.get('https://api.weather.gov/...')
    data = response.json()
    temp = data['temperature']
    condition = data['condition']
    return f"Weather: {temp}°F, {condition}"

def update_rds():
    while True:
        weather_text = get_weather()
        subprocess.call([
            'sudo', './pi_fm_rds',
            '-freq', '107.9',
            '-ps', 'WEATHER',
            '-rt', weather_text
        ])
        time.sleep(300)  # Update every 5 minutes

update_rds()
```

**Result:** My car stereo displays live weather updates! No phone needed! 🌤️

### Project: Time Sync with RDS CT (Clock Time)

RDS can transmit exact time! Here's how:

```bash
# PiFmRds can send current time
sudo ./pi_fm_rds \
    -freq 107.9 \
    -audio music.wav \
    -ct "$(date +%Y-%m-%d %H:%M:%S)"
```

**What happens:** Compatible car radios auto-set their clock from the RDS signal! Time travel via radio waves! ⏰

## The Developer's Toolkit for FM/RDS 🛠️

### Essential Software

**For Receiving:**
- **RTL-SDR drivers:** Capture FM signals
- **GQRX:** Waterfall display, FM demodulation
- **multimon-ng:** RDS decoder
- **GNU Radio:** Visual signal processing
- **RDS Spy (Windows):** Best RDS decoder interface

**For Transmitting:**
- **PiFmRds:** Raspberry Pi FM transmitter (my favorite!)
- **CSDR:** Command-line SDR toolkit
- **GNU Radio:** Can also transmit with HackRF/LimeSDR
- **FM Transmitter libraries:** For Arduino/ESP32

### Hardware Options

**Receiving:**
- RTL-SDR ($25): Perfect for RDS decoding
- Airspy R2 ($169): Better sensitivity
- SDRPlay RSP1A ($99): Good middle ground

**Transmitting (LOW POWER LEGAL OPTIONS):**
- Raspberry Pi ($35): GPIO pin FM transmitter
- FM Transmitter modules ($10-20): Pre-made boards
- Si4713 breakout board ($20): Dedicated FM transmitter chip with RDS

**Transmitting (REQUIRES LICENSE - DON'T USE WITHOUT PERMIT!):**
- HackRF One ($300): Can transmit FM (but TOO powerful without license!)
- LimeSDR ($299): Same warning - get licensed first!

**My recommendation:** Stick with Raspberry Pi or low-power modules. Safe, legal, fun! 🎉

## Your Weekend FM RDS Project 📅

### Saturday Morning: Setup (2 hours)

1. **Get a Raspberry Pi** (any model with GPIO)
2. **Install PiFmRds:**
```bash
sudo apt-get update
sudo apt-get install git build-essential
git clone https://github.com/ChristopheJacquet/PiFmRds.git
cd PiFmRds/src
make
```
3. **Test with a simple transmission:**
```bash
sudo ./pi_fm_rds -freq 107.9 -ps "TEST" -rt "Hello World!"
```

### Saturday Afternoon: First Broadcast (3 hours)

1. **Create a music file:** `music.wav` (any audio)
2. **Attach antenna:** 70cm wire to GPIO pin 4
3. **Transmit!**
```bash
sudo ./pi_fm_rds -freq 107.9 -audio music.wav -ps "MY_FM" -rt "My first FM station!"
```
4. **Test in your car/radio:** Tune to 107.9 MHz
5. **Celebrate!** You're a radio broadcaster! 📻

### Sunday: Get Creative (All Day!)

**Project ideas:**
- Build web interface for message input
- Add Bluetooth audio receiver
- Create auto-updating weather/time display
- Make a "Now Playing" display for your home stereo
- Rick-roll your family's car radios (with permission!)

## Resources That Helped Me 📚

### Websites

- **RDS Standard Spec:** Search "RBDS Standard" (free PDF)
- **PiFmRds GitHub:** christophejacquet.github.io/PiFmRds/
- **RTL-SDR Blog:** rtl-sdr.com (RDS decoding tutorials)
- **sigidwiki.com:** Identify FM broadcast signals

### YouTube Channels

- **Tech Minds:** FM/RDS decoding tutorials
- **Andreas Spiess:** Raspberry Pi RF projects
- **Great Scott!:** Electronics and RF basics

### Communities

- **r/RTLSDR:** Reddit community (helpful for RDS questions!)
- **r/amateurradio:** Ham radio folks (love RF discussions)
- **GNU Radio mailing list:** Advanced signal processing help

### Books

- "The Radio Station" - Broadcasting guide
- "Software Defined Radio for Hackers" - Includes FM/RDS chapter
- "FM Broadcasting & RDS" - Technical deep dive

## The Bottom Line 💡

FM radio is WAY cooler than I thought. It's not just music - it's a data transmission system hiding in plain sight! RDS lets you send text, time, traffic alerts, and more alongside audio.

**For under $40, you can:**
- ✅ Decode RDS from any FM station
- ✅ Build your own FM transmitter (legally!)
- ✅ Display custom messages on your car stereo
- ✅ Learn about modulation, RF, and signal processing
- ✅ Impress your friends (or confuse them)
- ✅ Become a hobbyist radio broadcaster! 🎙️

**What fascinated me most:** As a developer exploring radio frequencies, I realized FM broadcasting is just another communication protocol! It's got headers (RDS groups), payloads (audio + data), error correction, and multiplexing. It's networking over electromagnetic waves! 📡

**After three months of FM/RDS experiments**, my takeaway: The world is full of invisible data streams. RDS is just one example. Once you start exploring RF, you see communication protocols EVERYWHERE!

## Your Action Plan Right Now 🚀

**Today:**
1. Download SDR# or GQRX
2. Plug in your RTL-SDR (or try WebSDR online)
3. Tune to a local FM station
4. Enable RDS decoder
5. WATCH the song names appear! 🎵

**This Week:**
1. Order a Raspberry Pi if you don't have one
2. Clone PiFmRds repository
3. Watch setup tutorials on YouTube
4. Plan your first transmission project

**This Month:**
1. Build your FM transmitter
2. Test it in your car (legally, low power!)
3. Create a custom RDS project (weather, time, messages)
4. Share it on Reddit and blow some minds! 🤯

---

**Ready to become your own radio station?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your FM/RDS projects!

**Want to see my RF experiments?** Check out my [GitHub](https://github.com/kpanuragh) - I've got RDS decoder scripts and transmitter configs!

*Now go forth and make your car stereo say whatever you want! Welcome to the world of FM hacking - it's perfectly legal and ridiculously fun!* 📻✨

---

**P.S.** The first time your car stereo displays "HACKED BY [YOUR NAME]" while playing your custom playlist will be one of the most satisfying tech moments of your life. The look on your passenger's face? PRICELESS! 😄

**P.P.S.** If you get obsessed with RDS and start decoding stations while driving to analyze their metadata quality, welcome to the club. Yes, I'm that person now. No regrets! 📡
