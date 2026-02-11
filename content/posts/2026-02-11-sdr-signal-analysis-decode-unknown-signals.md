---
title: "Signal Hunting with SDR: I Decoded a Mystery 433 MHz Signal (And You Can Too!) 🔍📡"
date: "2026-02-11"
excerpt: "Found a weird signal on 433 MHz and thought 'what the heck is that?' Turned out to be my neighbor's wireless thermometer! Here's how I use GNU Radio, Python, and signal analysis to identify unknown RF transmissions. Software meets radio waves!"
tags: ["rf", "sdr", "wireless", "python", "signal-processing"]
featured: true
---

# Signal Hunting with SDR: I Decoded a Mystery 433 MHz Signal (And You Can Too!) 🔍📡

**Real talk:** I was scanning the 433 MHz band with my RTL-SDR when I saw a weird signal popping up every 30 seconds. Short bursts. Digital-looking pattern. No idea what it was. My developer brain went: "That's a MYSTERY. I must SOLVE IT!"

Three hours later, I had decoded it completely. It was my neighbor's wireless weather station broadcasting temperature data. I could see their outdoor temperature in real-time. I felt like I'd hacked the Matrix! (But ethically - just receiving, not interfering!) 🎯

**What fascinated me as a software developer:** Signal analysis is like debugging, but for electromagnetic waves! You use spectrum analyzers, decoders, and Python scripts instead of console.log. It's AMAZING! 🌊

## The Moment I Became a Signal Hunter 🕵️

### Week 1: The Discovery

**Me:** *Scanning with SDR#, sees weird bursts on 433.92 MHz*

"What IS that signal? It's not WiFi... not Bluetooth... not anything I recognize..."

**My options:**
1. Ignore it (boring!)
2. Google "433 MHz signals" (too easy!)
3. DECODE IT MYSELF (YES!) 🎉

### Week 2: Down the Rabbit Hole

In my RF experiments, I learned: There are THOUSANDS of unknown signals in the spectrum. Remote controls, sensors, car keys, weather stations, doorbells, tire pressure monitors, garage doors - the air is FULL of mystery transmissions!

**The challenge:** Most aren't documented. You have to use signal analysis techniques to figure out:
- What's the modulation type? (AM, FM, ASK, FSK, PSK?)
- What's the data rate?
- Is it digital or analog?
- What's the protocol?
- Can I decode the data?

**My "aha!" moment:** This is reverse engineering for RADIO WAVES! I'm a developer - I know how to reverse engineer! Let's apply software skills to RF! 💻

## The Signal Analysis Toolkit (Free & Open Source!) 🛠️

### Hardware You Need

**RTL-SDR Dongle ($25):**
- Basic RTL-SDR Blog V3 is perfect
- Frequency range: 24 MHz - 1.7 GHz
- More than enough for signal hunting!

**Better (but optional):**
- HackRF One ($300) - Can transmit too (requires license!)
- Airspy R2 ($169) - Better dynamic range
- LimeSDR ($299) - Full duplex

**My setup:** RTL-SDR + discone antenna. Cost: $60 total. Works GREAT! 📡

### Software Tools (All FREE!)

**For Visualization:**
```bash
# Install GQRX (spectrum analyzer)
sudo apt-get install gqrx-sdr

# Or on Mac
brew install --cask gqrx

# Run it
gqrx
```

**For Analysis:**
```bash
# GNU Radio (signal processing toolkit)
sudo apt-get install gnuradio

# Python for decoding
pip3 install numpy scipy matplotlib

# URH (Universal Radio Hacker - AMAZING tool!)
pip3 install urh
```

**For Recording:**
```bash
# rtl_sdr command-line tools
sudo apt-get install rtl-sdr

# Record IQ samples to file
rtl_sdr -f 433920000 -s 2048000 -n 4096000 capture.dat
```

**What I love about this:** It's all OPEN SOURCE! The RF community shares tools like the open-source software community! 🤝

## Your First Signal Hunt: Step-by-Step 🎯

### Step 1: Find a Mystery Signal

**Scan common ISM bands:**
- **315 MHz:** Car keys, garage door openers (North America)
- **433 MHz:** Sensors, weather stations, remotes (Europe/Asia)
- **868 MHz:** EU sensors
- **915 MHz:** US sensors

**What to look for:**
- Repeating bursts (sensors transmit periodically)
- Short transmissions (battery-powered devices are brief)
- Digital-looking patterns (square waves in waterfall)

**My first hunt:**
```bash
# Open GQRX
gqrx

# Set frequency: 433.92 MHz
# Set mode: Raw I/Q
# Watch waterfall display
# Wait for signals to appear...
```

**After 5 minutes:** BOOM! Short bursts every 30 seconds! 🎉

### Step 2: Record the Signal

**Once you've found something interesting:**

```bash
# Record 10 seconds at 433.92 MHz with 2.048 MHz sample rate
rtl_sdr -f 433920000 -s 2048000 -n 20480000 mystery_signal.dat

# Or use GQRX's built-in recording (File → I/Q Recorder)
```

**Pro tip:** Record LONGER than one transmission cycle. For a 30-second repeating signal, record at least 60 seconds! ⏱️

### Step 3: Analyze in URH (Universal Radio Hacker)

**URH is MAGIC for signal analysis!**

```bash
# Launch URH
urh

# File → Open → Select your .dat file
# URH auto-detects modulation (usually!)
# View signal in different ways:
#   - Time domain (amplitude over time)
#   - Spectrogram (frequency over time)
#   - Protocol view (decoded bits!)
```

**What I saw:**
```
Signal view:
█ ▁ █ █ ▁ ▁ █ ▁ █ █ █ ▁ ▁ █ ▁ ...

Decoded bits:
10110010111001010011101010110...

URH interpretation:
Modulation: ASK (Amplitude Shift Keying)
Bit rate: ~4000 bps
Preamble detected: 10101010... (sync pattern!)
```

**My reaction:** "I'M SEEING THE ACTUAL DATA BITS!" 🤯

### Step 4: Decode the Protocol

**This is where it gets FUN!**

**Look for patterns:**
- Preamble (sync bits at start)
- Address/ID (which sensor is this?)
- Data payload (the actual message)
- Checksum (error detection)

**My mystery signal:**
```
Preamble:  10101010 10101010 (8 bits - sync pattern)
ID:        01101101 (8 bits - sensor ID 0x6D)
Temp:      00010110 (8 bits - value 22)
Humidity:  01011001 (8 bits - value 89)
Checksum:  11010011 (8 bits - XOR of previous bytes)
```

**Translation:** Sensor ID 109, Temperature 22°C, Humidity 89%

**HOLY CRAP I DECODED A WIRELESS SENSOR!** 📊

### Step 5: Automate with Python

**Once you understand the protocol, AUTOMATE IT!**

```python
#!/usr/bin/env python3
import numpy as np
from rtlsdr import RtlSdr
import time

# Setup RTL-SDR
sdr = RtlSdr()
sdr.sample_rate = 2.048e6
sdr.center_freq = 433.92e6
sdr.gain = 'auto'

def decode_ask_signal(samples):
    """
    Simple ASK decoder
    High amplitude = 1, Low amplitude = 0
    """
    # Calculate envelope (absolute value)
    envelope = np.abs(samples)

    # Threshold detection
    threshold = np.mean(envelope) * 1.5
    bits = envelope > threshold

    # Edge detection (find bit transitions)
    edges = np.diff(bits.astype(int))

    return bits, edges

def parse_sensor_data(bits):
    """
    Parse weather station protocol
    Format: [8-bit preamble][8-bit ID][8-bit temp][8-bit humidity][8-bit checksum]
    """
    if len(bits) < 40:
        return None

    # Extract fields
    preamble = bits[0:8]
    sensor_id = int(''.join(map(str, bits[8:16])), 2)
    temp = int(''.join(map(str, bits[16:24])), 2)
    humidity = int(''.join(map(str, bits[24:32])), 2)
    checksum = int(''.join(map(str, bits[32:40])), 2)

    # Verify checksum (simple XOR)
    calculated = sensor_id ^ temp ^ humidity
    if calculated != checksum:
        return None

    return {
        'sensor_id': sensor_id,
        'temperature': temp,
        'humidity': humidity
    }

# Main loop
print("🔍 Listening for sensor signals on 433.92 MHz...")
while True:
    samples = sdr.read_samples(256*1024)
    bits, edges = decode_ask_signal(samples)

    data = parse_sensor_data(bits)
    if data:
        print(f"📡 Sensor {data['sensor_id']}: "
              f"Temp={data['temperature']}°C, "
              f"Humidity={data['humidity']}%")

    time.sleep(1)
```

**What this does:** Real-time decoding of wireless sensor data! I can monitor my neighbor's outdoor temperature! (Creepy? Maybe. Cool? ABSOLUTELY!) 😎

## Real Signals I've Decoded 🎉

### Signal #1: Wireless Weather Station (433 MHz)

**What I found:**
- Transmission every 30 seconds
- ASK modulation
- 40-bit packets
- Temperature + Humidity data

**Decoding time:** 2 hours
**Satisfaction:** 10/10

**Practical use:** Built a dashboard showing neighborhood weather data from multiple sensors! 🌡️

### Signal #2: Tire Pressure Monitor (315 MHz)

**What I found:**
- Car broadcasts tire pressure when driving!
- FSK modulation (Frequency Shift Keying)
- Encrypted (couldn't decode data, but saw structure)
- Different pattern per tire

**Coolest discovery:** I could tell when my car was nearby by the TPMS signals! 🚗

### Signal #3: Garage Door Opener (390 MHz)

**What I found:**
- OOK modulation (On-Off Keying - simplest form!)
- 12-bit code
- Fixed code (not rolling code)
- Transmits when button pressed

**Security note:** Fixed codes are INSECURE! Anyone can record and replay! (Don't do this without permission - it's illegal!) ⚠️

### Signal #4: Mystery 433.075 MHz Signal

**What I found:**
- Weird chirping pattern every 5 minutes
- No standard modulation
- Random-looking data
- Strong signal

**Turned out to be:** Neighbor's smart irrigation controller! Sends soil moisture data to base station! 💧

**My reaction:** "There are SO MANY smart devices broadcasting RF data!" 🏠

## GNU Radio: The Power Tool 🔧

### What Is GNU Radio?

**GNU Radio** = Visual programming environment for signal processing

**Think of it like:**
- Building blocks (filter, demodulator, decoder)
- Wire them together visually
- Process RF signals in real-time
- NO CODE REQUIRED (but you can add Python!)

### My First GNU Radio Flow Graph

**Goal:** Decode FM radio and save to audio file

```
[RTL-SDR Source] → [Low Pass Filter] → [WBFM Receive] → [Rational Resampler] → [Audio Sink]
       ↓
  Center: 100.5 MHz
  Sample Rate: 2.4M
```

**What each block does:**
1. **RTL-SDR Source:** Grab RF samples from dongle
2. **Low Pass Filter:** Remove unwanted frequencies
3. **WBFM Receive:** Demodulate FM signal
4. **Rational Resampler:** Convert to audio sample rate (48 kHz)
5. **Audio Sink:** Play through speakers!

**Result:** Crystal-clear FM radio! Built a software radio in 5 minutes! 📻

### Advanced GNU Radio: Signal Analysis

**For unknown signal analysis:**

```
[RTL-SDR Source] → [Quadrature Demod] → [Binary Slicer] → [File Sink]
       ↓
   [FFT Sink] (spectrum analyzer)
       ↓
   [Waterfall Sink] (time/frequency view)
       ↓
   [Time Sink] (waveform view)
```

**What this lets you see:**
- Frequency spectrum (FFT)
- Signal over time (waterfall)
- Waveform shape (time domain)
- Decoded bits (after slicer)

**My "aha!" moment:** GNU Radio is like a visual debugger for RF signals! 🐛

## Common Modulation Types (Explained Simply) 📊

### ASK (Amplitude Shift Keying)

**How it works:**
- 1 = High amplitude
- 0 = Low amplitude

**Like:** Turning a flashlight on/off for Morse code

**Common in:** Simple remote controls, sensors

**Easy to decode:** YES! (Just threshold the amplitude)

### FSK (Frequency Shift Keying)

**How it works:**
- 1 = One frequency (e.g., 434.0 MHz)
- 0 = Different frequency (e.g., 433.9 MHz)

**Like:** Playing two different musical notes

**Common in:** Modems, pagers, some sensors

**Decoding:** Frequency discriminator

### PSK (Phase Shift Keying)

**How it works:**
- 1 = Phase shift 180°
- 0 = No phase shift

**Like:** Flipping a sine wave upside down

**Common in:** WiFi, satellite, digital radio

**Decoding:** More complex (phase detection)

### OOK (On-Off Keying)

**How it works:**
- 1 = Carrier ON
- 0 = Carrier OFF

**Like:** ASK but simpler (just on/off!)

**Common in:** Cheap remotes, garage doors

**Easiest to decode:** Literally just detect presence/absence!

**What fascinates me:** Each modulation type is a different way to encode data onto waves! It's like different compression algorithms, but for PHYSICS! 🌊

## Signal Analysis Techniques I Use 🔬

### Technique #1: Waterfall Pattern Recognition

**Look for patterns in the waterfall display:**

```
Continuous horizontal line = Carrier signal (unmodulated)
Vertical stripes = Bursts (digital transmission)
Diagonal lines = Chirps (frequency sweep)
Wide bands = Wideband signal (WiFi, etc.)
Dots = Frequency hopping
```

**What I learned:** The waterfall is like reading sheet music - you learn to recognize patterns! 🎵

### Technique #2: FFT Analysis

**Frequency domain shows what's REALLY happening:**

```python
import numpy as np
from scipy import signal
import matplotlib.pyplot as plt

# Load IQ samples
samples = np.fromfile('capture.dat', dtype=np.complex64)

# Compute FFT
fft_result = np.fft.fft(samples)
fft_freq = np.fft.fftfreq(len(samples))

# Plot
plt.plot(fft_freq, np.abs(fft_result))
plt.title("Frequency Spectrum")
plt.xlabel("Frequency")
plt.ylabel("Magnitude")
plt.show()
```

**What this reveals:** Hidden frequency components, bandwidth, modulation type hints! 📈

### Technique #3: Autocorrelation

**Find repeating patterns:**

```python
# Autocorrelation to find symbol rate
autocorr = np.correlate(samples, samples, mode='full')

# Plot
plt.plot(autocorr)
plt.title("Autocorrelation")
plt.show()

# Peaks in autocorr = symbol boundaries!
```

**What it finds:** Symbol rate, repeating structures, hidden timing! ⏱️

### Technique #4: Bit Transition Analysis

**Look at edges in decoded bits:**

```python
# Detect edges
bits = decode_signal(samples)
edges = np.diff(bits)

# Count transitions
transitions = np.sum(np.abs(edges))

# High transitions = random data or encrypted
# Low transitions = structured data
```

**What this tells you:** Whether data is encrypted, compressed, or raw! 🔐

## Cool Tools for Signal Hunting 🎯

### inspectrum (Visual Signal Inspector)

```bash
# Install
sudo apt-get install inspectrum

# Use
inspectrum capture.dat
```

**What it does:**
- Visual signal inspector
- Zoom into specific bursts
- Measure symbol rate by eye
- Extract specific transmissions

**My use case:** Isolating individual transmissions from a noisy recording! 🔍

### SigIDWiki (Signal Identification Database)

**Website:** sigidwiki.com

**What it is:** MASSIVE database of known signals!

**How to use:**
1. See unknown signal
2. Note frequency, bandwidth, pattern
3. Search SigIDWiki
4. Find matches!

**Success rate:** 70% of my mystery signals identified here! 📚

### RFAnalyzer (Android App)

**What it does:** Turns your phone into a spectrum analyzer!

**Requirements:** RTL-SDR dongle + USB OTG cable

**Use case:** Portable signal hunting while walking around! 📱

### dump1090, rtl_433, multimon-ng

**Pre-built decoders for common protocols:**

```bash
# Aircraft ADS-B
dump1090 --interactive --net

# 433 MHz sensors
rtl_433 -f 433920000

# Various digital modes
rtl_fm -f 145800000 -M fm | multimon-ng -t raw -a AFSK1200 /dev/stdin
```

**What I love:** Standing on the shoulders of giants! Don't reinvent the wheel! 🎡

## Legal & Ethical Considerations ⚖️

### What's Legal

**In most countries (US, UK, EU):**
- ✅ RECEIVING any signal (passive listening)
- ✅ Analyzing signals you receive
- ✅ Decoding unencrypted transmissions
- ✅ Learning about protocols
- ✅ Educational research

**Important:** You can LISTEN but not ACT on certain information!

### What's NOT Legal

**Do NOT do these:**
- ❌ Decrypt encrypted signals (cell phones, police with encryption)
- ❌ Intercept private communications for malicious purposes
- ❌ Transmit on frequencies without license
- ❌ Jam or interfere with signals
- ❌ Use intercepted info for crime (insider trading, stalking, etc.)

**Golden rule:** RECEIVE only, NEVER transmit without proper license! 📻

### Privacy & Ethics

**My ethical guidelines:**
- ✅ Study signals to LEARN, not to SPY
- ✅ Share knowledge with community
- ✅ Report security flaws responsibly
- ❌ Don't publish specific sensor IDs or private data
- ❌ Don't track individuals
- ❌ Don't be creepy!

**Example:** I decoded neighbor's weather sensor, but I DON'T track when they're home based on car key fob signals! That's creepy! 😇

## Common Beginner Mistakes 🙈

### Mistake #1: Wrong Sample Rate

**The problem:** Nyquist theorem says sample rate must be 2x signal bandwidth!

**What happened to me:** Tried to decode 2 MHz bandwidth signal with 1 MHz sample rate. Got aliasing and garbage data! 📊

**The fix:** Sample rate ≥ 2x bandwidth (use 2.4 MHz sample rate for safety)

### Mistake #2: Not Recording Long Enough

**What I did:** Recorded 5 seconds of a signal that transmits every 30 seconds. Got incomplete packets!

**Lesson:** Record at least 2-3 full cycles of repeating signals! ⏱️

### Mistake #3: Ignoring Frequency Offset

**The issue:** RTL-SDR dongles have PPM (parts per million) error

**Result:** My 433.920 MHz signal was actually at 433.885 MHz on my dongle!

**The fix:** Calibrate your dongle or use automatic frequency correction! 🎯

### Mistake #4: Overloading the Receiver

**What happened:** Put RTL-SDR next to FM radio transmitter. Everything was noise!

**Cause:** Strong nearby signals saturate the receiver

**Solution:** Lower gain, add bandpass filter, or move away from strong transmitters! 📡

## Your Weekend Signal Hunt Plan 🗺️

### Saturday Morning: Setup (2 hours)

**Shopping list:**
- RTL-SDR dongle ($25) - if you don't have one
- Computer (Linux recommended, but Windows/Mac work!)

**Software installation:**
```bash
# Install all the tools
sudo apt-get install rtl-sdr gqrx-sdr gnuradio urh inspectrum

# Test RTL-SDR
rtl_test -t
```

### Saturday Afternoon: First Hunt (3 hours)

**Step 1:** Scan 433 MHz band
```bash
gqrx
# Set to 433.92 MHz
# Watch waterfall for bursts
```

**Step 2:** Record a mystery signal
```bash
rtl_sdr -f 433920000 -s 2048000 -n 20480000 mystery.dat
```

**Step 3:** Analyze in URH
```bash
urh mystery.dat
# Let it auto-detect modulation
# Look at decoded bits
```

### Sunday: Deep Dive (4 hours)

**Project:** Decode a complete protocol

1. Find repeating pattern in bits
2. Identify preamble, data, checksum
3. Write Python decoder
4. Test on multiple captures
5. Document your findings!

**Bonus:** Share on r/RTLSDR or r/amateurradio! 🎉

## Resources That Helped Me Learn 📚

### Books

**"Software Defined Radio for Hackers"**
- Practical SDR projects
- Real-world examples
- Code samples

**"Digital Signal Processing" by Lyons**
- DSP fundamentals
- Math explained clearly
- Essential for understanding

### Websites

**sigidwiki.com** - Signal ID database
**rtl-sdr.com** - SDR blog with tutorials
**gnuradio.org** - GNU Radio docs
**wiki.radioreference.com** - Frequency listings

### Communities

**r/RTLSDR** - Reddit community (super helpful!)
**r/amateurradio** - Ham radio folks
**r/signalidentification** - Signal ID help
**GNU Radio mailing list** - Technical discussions

### YouTube Channels

**"Tech Minds"** - SDR tutorials
**"RTL-SDR Blog"** - Official channel
**"Great Scott!"** - RF projects
**"w2aew"** - Signal analysis deep dives

## The Bottom Line 💡

Signal analysis is like debugging, but for radio waves! As a software developer exploring radio frequencies, I found it's the perfect blend of:

- ✅ Reverse engineering (figure out unknown protocols)
- ✅ Pattern recognition (find structure in noise)
- ✅ Programming (write decoders in Python)
- ✅ Math (FFT, autocorrelation, signal processing)
- ✅ Physics (electromagnetic waves, modulation)

**What I love most:** The spectrum is full of MYSTERY. Every scan reveals new signals. Every decoded protocol is a puzzle solved! 🧩

**After months of RF experiments with signal analysis**, my takeaway is: The invisible electromagnetic spectrum is a treasure trove of interesting signals waiting to be decoded. All you need is curiosity and a $25 RTL-SDR dongle!

## Your Action Plan Right Now 🚀

**Today:**
1. Open GQRX or SDR#
2. Scan 433 MHz band for 10 minutes
3. Find ONE mystery signal
4. Record it to a file

**This Week:**
1. Install URH (Universal Radio Hacker)
2. Load your recording
3. Let URH analyze it
4. Try to decode the bits!

**This Month:**
1. Learn GNU Radio basics
2. Build a simple decoder in Python
3. Decode a complete protocol
4. Share your findings online! 📢

## Final Thoughts 💭

When I first scanned the RF spectrum, I thought "eh, mostly noise and FM radio."

**I was SO WRONG.**

The spectrum is ALIVE with signals! Weather sensors, car keys, doorbells, smart home devices, industrial controls, satellites, aircraft - EVERYTHING is broadcasting!

**The best part:** With basic SDR equipment and open-source tools, you can decode most of them! You're like an archaeologist excavating electromagnetic transmissions! 🏺

**The moment I was hooked:** I decoded my first complete protocol - a wireless thermometer. I saw the raw bits, figured out the structure, and wrote a Python script to parse it. When the script printed "Temperature: 22°C" I literally YELLED with excitement! 🎉

My neighbors definitely think I'm insane. They're probably right. NO REGRETS! 😄

---

**Ready to hunt signals?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your signal decoding victories!

**Want to see my SDR projects?** Check out my [GitHub](https://github.com/kpanuragh) - I've got signal decoders, analysis scripts, and GNU Radio flowgraphs!

*Now go forth and decode the electromagnetic spectrum! Welcome to signal analysis - where software meets radio waves!* 🔍📡✨

---

**P.S.** The first time you decode an unknown signal and figure out what device is transmitting, you'll feel like a digital wizard. You're literally extracting meaning from invisible electromagnetic waves using CODE! It never gets old! 🧙‍♂️

**P.P.S.** If you become obsessed with finding and decoding mystery signals, welcome to the club. I now scan the spectrum everywhere I go. Coffee shop? Scan for signals. Airport? Scan for signals. Friend's house? You guessed it - SCAN FOR SIGNALS! Once you start, you can't stop! 🔍

**P.P.P.S.** The rabbit hole is DEEP. First it's simple ASK decoding. Then FSK. Then PSK. Then you're learning about error correction codes and writing custom demodulators and building GNU Radio blocks in C++. Ask me how I know! The signal analysis game is addictive! 📻
