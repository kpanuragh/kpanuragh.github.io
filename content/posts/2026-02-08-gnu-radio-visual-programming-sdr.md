---
title: "GNU Radio: Visual Programming for RF Hackers (It's Like Scratch for Radio Waves!) 📡💻"
date: "2026-02-08"
excerpt: "I thought programming radio signals required years of signal processing knowledge and complex C++ code. Then I discovered GNU Radio Companion - a visual drag-and-drop tool where you build signal processing pipelines like LEGO blocks. I decoded FM radio in 5 minutes without writing a single line of code!"
tags: ["rf", "sdr", "wireless", "hobby", "gnu-radio"]
featured: true
---

# GNU Radio: Visual Programming for RF Hackers (It's Like Scratch for Radio Waves!) 📡💻

**Real talk:** I was trying to decode a digital radio signal with my RTL-SDR. I spent THREE DAYS writing Python code to process the audio, filter noise, demodulate the signal, and extract data. The code was a mess of NumPy arrays, FFT functions, and signal processing math I barely understood.

Then my SDR friend looked at my screen and said, "Why don't you just use GNU Radio Companion? Would take you 10 minutes."

**Me:** "What's GNU Radio Companion?"

**Him:** *Opens laptop, drags a few blocks around, connects them with lines*

**Him:** "There. FM radio decoder. Done."

**Me:** "WHAT?! That's it?! No code?!"

**Him:** "Welcome to visual programming for radio signals. Mind = blown yet?" 🤯

**Spoiler:** My mind was DEFINITELY blown. I threw away my 300 lines of messy Python and rebuilt the ENTIRE signal processing pipeline in GNU Radio Companion in 15 minutes. It worked BETTER and I actually UNDERSTOOD what was happening!

## What Even Is GNU Radio? 🤔

**GNU Radio = Open-source signal processing framework**

**GNU Radio Companion (GRC) = Visual programming interface for GNU Radio**

**Translation:** It's like Scratch or Node-RED, but for RADIO SIGNALS! Instead of dragging "move sprite" blocks, you drag "FM demodulator" and "low pass filter" blocks! 📻

Think of it like this:
- **Writing code:** `signal = fft(filter(downsample(input_signal)))`
- **GNU Radio:** [Input] → [Downsample] → [Filter] → [FFT] → [Output] *(drag, drop, connect!)*

**What fascinated me as a developer:** It's visual programming that doesn't feel "dumbed down." You're building REAL signal processing pipelines using actual DSP (Digital Signal Processing) blocks. It's like circuit design meets software engineering! ⚡

## My First GNU Radio Experience (It Was Magic) ✨

### Day 1: The Installation

**Me, on Ubuntu:**
```bash
sudo apt-get install gnuradio
```

**5 minutes later:** Installed! *(Way easier than I expected!)*

**Opening GRC:**
```bash
gnuradio-companion
```

**What appeared:** A blank canvas with a toolbox of signal processing blocks! 🎨

**My reaction:** "This looks like LabVIEW for radio! I LOVE LabVIEW!" (I'm a nerd, sue me!)

### Day 1, Hour 1: First Flowgraph (FM Radio)

**The challenge:** Decode FM radio without writing code

**What I did:**
1. Drag "RTL-SDR Source" block to canvas
2. Drag "Low Pass Filter" block
3. Drag "WBFM Receive" block (wideband FM demodulator)
4. Drag "Audio Sink" block
5. Connect them with lines (click output → click input)
6. Set frequency to 95.5 MHz (local FM station)
7. Click "Execute" ▶️

**Result:** CRYSTAL CLEAR FM RADIO COMING FROM MY SPEAKERS! 🎵

**Time elapsed:** 8 minutes

**Lines of code written:** ZERO

**My brain:** "I JUST BUILT A RADIO WITHOUT CODING! THIS IS SORCERY!" 🧙‍♂️

### The "Aha!" Moment

**What I realized:** Each block is a pre-built signal processing function!

- **RTL-SDR Source:** Captures raw I/Q samples from radio
- **Low Pass Filter:** Removes unwanted frequencies
- **WBFM Receive:** Demodulates FM signal
- **Audio Sink:** Plays audio through speakers

**Translation:** I'm literally building a signal processing pipeline by connecting functional blocks! It's like Unix pipes, but VISUAL and for RADIO WAVES! 📡

In my RF experiments, I learned: GNU Radio abstracts the complex math while still teaching you the concepts! You SEE the signal flow! You UNDERSTAND the processing chain! It's educational AND practical! 🎓

## GNU Radio vs. Writing Code: The Showdown 💻⚡

### The Old Way (Pure Python)

**My attempt to decode FM radio in Python:**

```python
import numpy as np
from rtlsdr import RtlSdr
import scipy.signal as signal

# Configure SDR
sdr = RtlSdr()
sdr.sample_rate = 2.4e6
sdr.center_freq = 95.5e6
sdr.gain = 'auto'

# Read samples
samples = sdr.read_samples(256*1024)

# Downsample
decimation = 10
samples_decimated = signal.decimate(samples, decimation)

# Low pass filter
nyquist = sdr.sample_rate / 2
cutoff = 75e3
b, a = signal.butter(5, cutoff / nyquist)
filtered = signal.lfilter(b, a, samples_decimated)

# FM demodulation (oh god the math)
angle = np.unwrap(np.angle(filtered))
demod = np.diff(angle)

# More filtering, resampling, audio output...
# (Another 50 lines of code I barely understand)
```

**Result:**
- 150+ lines of code
- 3 days of debugging
- Tons of trial and error
- Works... kind of? Audio sounds muffled
- I don't really understand WHY it works 😅

### The GNU Radio Way (Visual Programming)

**My GNU Radio flowgraph:**

```
[RTL-SDR Source]
    ↓ (2.4 MHz sample rate)
[Low Pass Filter] (cutoff: 100 kHz)
    ↓
[Rational Resampler] (decimation: 5)
    ↓
[WBFM Receive] (quadrature rate: 480 kHz)
    ↓
[Rational Resampler] (decimation: 10)
    ↓ (48 kHz audio rate)
[Audio Sink]
```

**Result:**
- 0 lines of code
- 15 minutes to build
- Crystal clear audio
- I UNDERSTAND the signal processing chain
- Looks professional! 🎯

**The difference is STAGGERING!** GNU Radio handles all the math, I just design the signal flow! 💡

## How GNU Radio Actually Works 🔬

### The Flowgraph Concept

**In GNU Radio, everything is a FLOWGRAPH:**

1. **Source blocks:** Generate or capture signals (RTL-SDR, file, noise generator)
2. **Processing blocks:** Transform signals (filters, demodulators, math operations)
3. **Sink blocks:** Output signals (audio, file, display, network)

**You connect them to build a SIGNAL PROCESSING PIPELINE!**

**It's like:**
- **Data flow programming** (like Node-RED)
- **Visual scripting** (like Unreal Engine Blueprints)
- **Dataflow graphs** (like TensorFlow computational graphs)

**But for RADIO SIGNALS!** 📻

### Block Types I Use Constantly

**Sources (Inputs):**
- `RTL-SDR Source` - Capture from RTL-SDR dongle
- `HackRF Source` - Capture from HackRF One
- `File Source` - Read saved I/Q recordings
- `Signal Source` - Generate test signals

**Filters:**
- `Low Pass Filter` - Keep low frequencies, reject high
- `High Pass Filter` - Keep high frequencies, reject low
- `Band Pass Filter` - Keep middle frequencies, reject edges
- `Decimating FIR Filter` - Filter + downsample in one!

**Demodulators:**
- `WBFM Receive` - Wideband FM (broadcast radio)
- `NBFM Receive` - Narrowband FM (2-way radio)
- `AM Demod` - Amplitude modulation
- `Quadrature Demod` - Generic FM demodulation

**Sinks (Outputs):**
- `Audio Sink` - Play through speakers
- `File Sink` - Save to file
- `QT GUI Time Sink` - Oscilloscope view
- `QT GUI Frequency Sink` - Spectrum analyzer
- `QT GUI Waterfall Sink` - Waterfall display

**Math Operations:**
- `Multiply` - Mix signals
- `Add` - Combine signals
- `Complex to Mag` - Calculate magnitude
- `FFT` - Frequency domain transform

**What blew my mind:** There are HUNDREDS of blocks! Filters, modulators, decoders, encoders, visualizations, network protocols - GNU Radio is MASSIVE! 🏗️

## Cool Projects I Built With GNU Radio 🚀

### Project 1: NOAA Weather Satellite Decoder

**The goal:** Decode images from NOAA weather satellites

**My flowgraph:**

```
[File Source] (recorded satellite pass)
    ↓
[Low Pass Filter] (15 kHz cutoff)
    ↓
[Rational Resampler] (to 11.025 kHz)
    ↓
[Quadrature Demod] (gain: 1.0)
    ↓
[File Sink] (save as .wav file)
```

**Then:** Run .wav through WXtoImg decoder

**Result:** BEAUTIFUL satellite images! I decoded space pictures with VISUAL PROGRAMMING! 🛰️

**What fascinated me:** I could SEE the signal processing steps! Each block shows what it's doing. If something's wrong, I can add a "QT GUI Sink" anywhere to visualize the signal at that point! Debugging is VISUAL! 🔍

### Project 2: Dual-Watch FM Scanner

**The idea:** Listen to TWO FM frequencies simultaneously

**My flowgraph:**

```
[RTL-SDR Source] (wideband capture)
    ↓ ┌────────────────┐
    ├→ [Xlating FIR Filter] (tune to 146.52 MHz)
    │      ↓
    │  [NBFM Receive]
    │      ↓
    │  [Multiply Const] (volume 0.5)
    │      ↓ ╲
    │         ╲
    └→ [Xlating FIR Filter] (tune to 146.94 MHz)  ╲
           ↓                                       ╲
       [NBFM Receive]                              ╲
           ↓                                        ╲
       [Multiply Const] (volume 0.5)                ╲
           ↓                                         ╲
           └──────────────────────────────────────→ [Add] → [Audio Sink]
```

**Result:** I hear BOTH frequencies mixed in my headphones! When either frequency has traffic, I hear it! 📻

**What I learned:** You can FORK the signal chain! One input, multiple processing paths, combined output! It's like async parallel processing but for SIGNALS! 🌊

### Project 3: Real-Time Spectrum Analyzer

**The simplest powerful tool:**

```
[RTL-SDR Source]
    ↓
[QT GUI Frequency Sink] (FFT size: 2048)
```

**That's it!** Two blocks!

**Result:** Professional spectrum analyzer showing ALL frequencies in real-time with waterfall display! 📊

**My reaction:** "I built a $10,000 spectrum analyzer with a $25 SDR and TWO BLOCKS?!" 💰

### Project 4: APRS Packet Decoder

**What:** Decode digital packets from amateur radio

**My flowgraph:**

```
[RTL-SDR Source] (144.39 MHz - APRS frequency)
    ↓
[Low Pass Filter]
    ↓
[Quadrature Demod]
    ↓
[Clock Recovery MM] (synchronize to symbol timing)
    ↓
[Binary Slicer] (convert to 1s and 0s)
    ↓
[HDLC Deframer] (extract packets)
    ↓
[APRS Parser] (custom Python block)
    ↓
[File Sink] (save decoded messages)
```

**Result:** Decoded GPS position reports, weather data, and messages from local hams! All VISUAL programming! 🗺️

**The coolest part:** I wrote ONE custom Python block (APRS Parser) and integrated it with visual blocks! Best of both worlds! 💻

## The Learning Curve (Not As Scary As It Looks!) 📖

### Week 1: Confusion

**My brain:** "What are I/Q samples? What's a quadrature demodulator? Why do I need TWO resamplers?! HELP!" 😵

**Reality:** GNU Radio has a LOT of jargon. Signal processing is complex.

**What helped:** Tutorials! YouTube! The GNU Radio wiki! The community is INCREDIBLY helpful! 🤝

### Week 2: First Successes

**Achievements unlocked:**
- ✅ Decoded FM radio
- ✅ Built spectrum analyzer
- ✅ Recorded I/Q to file
- ✅ Understood basic signal flow

**My confidence:** Rising! I'm getting this! 📈

### Week 3: Going Deep

**What I learned:**
- Sample rates and decimation
- Filter design (cutoff frequencies, transition bands)
- I/Q data format (complex signals)
- Modulation schemes (AM, FM, PSK, FSK)

**My projects:** Getting more complex! Demodulating digital modes! Decoding satellites! 🛰️

### Month 2: RF Nerd Status

**Current state:** I dream in flowgraphs. I see signal processing pipelines everywhere. I've built 20+ decoders. I'm contributing to GNU Radio blocks on GitHub.

**My wife's reaction:** "You're explaining FFT algorithms at dinner. This has gone too far." 😅

**My reaction:** "But honey, the Fourier transform is BEAUTIFUL! Let me show you this waterfall display!" 💕

**What fascinated me as a software developer:** Learning signal processing through VISUAL feedback is SO much easier than reading textbooks! I SEE what filters do. I WATCH signals transform. It's like having a debugger for RADIO WAVES! 🔍

## Advanced GNU Radio Tricks I Discovered 🎓

### Trick #1: Hierarchical Blocks (DRY for Radio!)

**The problem:** I kept rebuilding the same FM demodulator chain

**The solution:** Create a reusable hierarchical block!

**How:**
1. Select blocks to group
2. Right-click → "Create Hier Block"
3. Name it "My FM Receiver"
4. Save as .grc file

**Result:** One block that contains an entire signal chain! Reusable across projects! Don't Repeat Yourself applies to RADIO! 🔄

### Trick #2: Variable Blocks (Interactive Controls!)

**The discovery:** You can add SLIDERS to control parameters!

**What I built:**
```
[Variable] name: freq, value: 95.5e6
[QT GUI Range] (slider for 'freq' variable: 88 MHz - 108 MHz)
    ↓
[RTL-SDR Source] frequency: freq
```

**Result:** A SLIDER that tunes my radio in real-time! I built a GUI without coding! 🎚️

### Trick #3: Embedded Python Blocks

**For custom logic:**

```python
# Custom Python block for signal detection
import numpy as np
from gnuradio import gr

class signal_detector(gr.sync_block):
    def work(self, input_items, output_items):
        in0 = input_items[0]
        out = output_items[0]

        # Custom signal processing logic
        threshold = 0.5
        out[:] = np.where(abs(in0) > threshold, 1, 0)

        return len(out)
```

**Integration:** Drag "Python Block" → paste code → connect to flowgraph!

**Result:** Custom logic integrated seamlessly with visual blocks! 🐍

### Trick #4: Remote Control via XML-RPC

**Mind-blowing feature:** Control running flowgraphs remotely!

**What I built:**
```python
# Control script
import xmlrpc.client

proxy = xmlrpc.client.ServerProxy("http://localhost:8080")
proxy.set_freq(146.52e6)  # Change frequency remotely!
```

**Use case:** Automated frequency scanning! Remote control from web interface! My flowgraph becomes an API! 🌐

## Common Beginner Mistakes (I Made ALL of These) 🙈

### Mistake #1: Sample Rate Mismatch

**What I did:**
```
[RTL-SDR Source] (2.4 MHz sample rate)
    ↓
[Audio Sink] (expects 48 kHz) ❌ CRASH!
```

**The error:** "gr::buffer::allocate_buffer: tried to allocate..." *flowgraph crashes*

**The fix:** Add resampler blocks to match rates!

```
[RTL-SDR Source] (2.4 MHz)
    ↓
[Rational Resampler] (decimation: 50)
    ↓ (now 48 kHz)
[Audio Sink] ✅ WORKS!
```

**Lesson:** ALWAYS match sample rates! GNU Radio is STRICT about this! ⚠️

### Mistake #2: Forgetting to Set Gain

**My first RTL-SDR flowgraph:**
```
[RTL-SDR Source] RF Gain: 0 (default)
```

**Result:** No signal! Just noise! "My SDR is broken!" 😭

**The fix:** Set RF Gain to 30-40 dB

**Lesson:** Default settings are often WRONG! Tweak the parameters! 🎛️

### Mistake #3: Complex vs. Float Data Types

**The confusion:** Some blocks output complex data, some output float!

**What broke:**
```
[RTL-SDR Source] (complex I/Q)
    ↓
[Audio Sink] (expects float) ❌ ERROR!
```

**The fix:** Add converter blocks!

```
[RTL-SDR Source] (complex)
    ↓
[Complex to Mag] (convert to float)
    ↓
[Audio Sink] ✅ WORKS!
```

**Lesson:** Pay attention to data types! Orange connections = complex, blue = float, red = byte! 🌈

### Mistake #4: Not Using Throttle Blocks

**When reading from files:**
```
[File Source] (no throttle)
    ↓
[QT GUI Sink]
```

**Result:** Reads file at MAXIMUM speed! CPU at 100%! Flowgraph unusable! 🔥

**The fix:** Add Throttle block!

```
[File Source]
    ↓
[Throttle] (sample rate: 2.4e6)
    ↓
[QT GUI Sink] ✅ Smooth playback!
```

**Lesson:** File sources need throttling to simulate real-time! ⏱️

## Your Weekend GNU Radio Project 📅

### Saturday Morning: Install & Setup (1 hour)

**On Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install gnuradio gr-osmosdr
```

**On macOS:**
```bash
brew install gnuradio
```

**On Windows:**
Download from gnuradio.org (or use WSL!)

**Launch it:**
```bash
gnuradio-companion
```

### Saturday Afternoon: First Flowgraph (2 hours)

**Project:** FM Radio Receiver

**Steps:**
1. Open GRC
2. Drag these blocks:
   - `RTL-SDR Source`
   - `Low Pass Filter`
   - `WBFM Receive`
   - `Rational Resampler`
   - `Audio Sink`
3. Connect them in order
4. Set parameters:
   - RTL-SDR frequency: 95.5e6 (local FM station)
   - Low Pass cutoff: 100e3
   - Resampler decimation: 10
5. Click "Generate" (⚙️ icon)
6. Click "Execute" (▶️ icon)
7. HEAR FM RADIO! 🎵

### Sunday: Get Creative (4 hours)

**Project ideas:**
- Add spectrum analyzer display
- Build dual-frequency scanner
- Record I/Q to file for later analysis
- Try different demodulators (AM, SSB)
- Decode weather satellite (NOAA APT)

**Challenge:** Build WITHOUT looking at tutorials! Experiment! Break things! Learn! 🔧

## Resources That Helped Me Learn 📚

### Official Documentation

**GNU Radio Wiki:**
- gnuradio.org/doc/doxygen/
- Comprehensive block reference
- Example flowgraphs
- Tutorials for beginners

**GNU Radio Tutorials:**
- wiki.gnuradio.org/index.php/Tutorials
- Step-by-step guided learning
- From beginner to advanced

### Video Tutorials

**YouTube Channels:**
- **"GNU Radio Conference"** - Annual talks (AMAZING!)
- **"m0agx"** - Beginner-friendly tutorials
- **"Tech Minds"** - SDR projects with GRC
- **"w2aew"** - Signal processing concepts

**Playlists to watch:**
- "GNU Radio Tutorial Series" by Balint Seeber
- "Software Defined Radio with GNU Radio" lectures

### Books

**"Software Defined Radio Using GNU Radio"**
- By Schiller
- Best comprehensive guide
- Theory + practice

**"Digital Signal Processing in Modern Communication Systems"**
- By Schwarzinger
- Deep DSP knowledge
- Math-heavy but excellent

### Communities

**Forums:**
- discuss.gnuradio.org - SUPER helpful!
- r/RTLSDR - SDR + GNU Radio combo
- r/amateurradio - Hams love GRC!

**IRC/Chat:**
- #gnuradio on Libera.Chat
- Active community
- Get help in real-time

**Mailing List:**
- discuss-gnuradio@gnu.org
- Great for technical questions

## Important Tips for Success 💡

### Tip #1: Start Simple

**DON'T:** Build a complex multi-path adaptive equalizer as your first project

**DO:** Build FM radio receiver. Get ONE thing working. Then expand!

**My approach:** Master one block at a time. Understand it. Then move on! 🎯

### Tip #2: Use Built-in Examples

**GNU Radio includes TONS of example flowgraphs!**

```bash
# Find examples:
cd /usr/share/gnuradio/examples/
ls
```

**What I did:** Opened examples. Ran them. Modified them. Learned from working code! 📖

### Tip #3: Visualize EVERYTHING

**Add QT GUI sinks everywhere while debugging!**

```
[Signal Source]
    ↓
[QT GUI Time Sink] ← "Let me see the signal HERE!"
    ↓
[Filter]
    ↓
[QT GUI Freq Sink] ← "And HERE after filtering!"
    ↓
[Output]
```

**Debugging is SO much easier when you SEE the signals!** 👀

### Tip #4: Learn DSP Basics

**GNU Radio is easier with signal processing knowledge!**

**Key concepts to learn:**
- Sampling theory (Nyquist rate)
- FFT and frequency domain
- Filter design basics
- Modulation types (AM, FM, PSK, QAM)

**Resources:**
- "The Scientist and Engineer's Guide to DSP" (FREE online!)
- 3Blue1Brown YouTube (Fourier Transform explanation)

**What helped me:** Understanding the THEORY made the TOOLS make sense! 🧠

## The Bottom Line 💡

GNU Radio changed how I think about signal processing. I went from "radio is too complex for me" to "I can build ANY signal processor I can imagine!"

**For FREE (open source!), you get:**
- ✅ Visual programming environment
- ✅ Hundreds of signal processing blocks
- ✅ Professional-grade DSP capabilities
- ✅ Cross-platform support
- ✅ Active community
- ✅ Integration with all major SDRs
- ✅ Custom block development in Python/C++
- ✅ Real-time visualization tools

**As a software developer bringing programming skills to RF experimentation**, GNU Radio is like:
- **Visual Studio Code** - but for radio signals
- **Node-RED** - but for DSP pipelines
- **Simulink** - but free and open source
- **LEGO** - but you're building RADIO RECEIVERS!

**What fascinated me most:** You learn by DOING! Drag blocks. Connect them. See results IMMEDIATELY. It's the fastest way to learn signal processing I've found! 🚀

**After weeks of GNU Radio experiments**, my perspective: You don't need a PhD in electrical engineering to build complex radio systems. You need curiosity, GNU Radio, and a willingness to experiment! 📡

## Your Action Plan Right Now 🎯

**Today:**
1. Install GNU Radio (`sudo apt install gnuradio`)
2. Launch `gnuradio-companion`
3. Open an example flowgraph (File → Open Examples)
4. Run it and see what happens!

**This Week:**
1. Build FM radio receiver (follow tutorial above)
2. Add spectrum analyzer visualization
3. Experiment with different frequencies
4. Join discuss.gnuradio.org and introduce yourself

**This Month:**
1. Build 5 different flowgraphs
2. Decode a digital signal (APRS, weather satellite)
3. Create your first custom Python block
4. Share your projects on Reddit! 🎉

## Resources Worth Your Time 📖

**Software:**
- [GNU Radio](https://www.gnuradio.org/) - Official site
- [GQRX](https://gqrx.dk/) - Great SDR app built with GNU Radio
- [gr-satellites](https://github.com/daniestevez/gr-satellites) - Satellite decoder blocks

**Learning:**
- [GNU Radio Tutorials](https://wiki.gnuradio.org/index.php/Tutorials)
- [DSP Guide](http://www.dspguide.com/) - FREE signal processing book
- [Great Scott Gadgets](https://greatscottgadgets.com/sdr/) - Excellent SDR tutorials

**Hardware Compatibility:**
- RTL-SDR (best for beginners, $25)
- HackRF One (transmit capable, $300)
- LimeSDR (advanced, $300+)
- USRP (professional, $1000+)

**Communities:**
- [discuss.gnuradio.org](https://discuss.gnuradio.org/)
- r/RTLSDR
- r/GNURadio
- #gnuradio on Libera.Chat

---

**Ready to build radio systems visually?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your GNU Radio flowgraphs!

**Want to see my GRC projects?** Check out my [GitHub](https://github.com/kpanuragh) - I'm open-sourcing all my signal processing flowgraphs!

*Now go forth and program radio signals with blocks and lines! Welcome to GNU Radio - where signal processing becomes visual art!* 📡✨

---

**P.S.** The first time you build a working signal decoder with ZERO lines of code, you'll feel like a wizard. You're controlling radio waves with PICTURES. Physics meets visual programming. It's beautiful! 🧙

**P.P.S.** If you become obsessed with GNU Radio and start seeing signal processing flowgraphs in your dreams, welcome to the club. I now mentally design flowgraphs for EVERYTHING. "How would I decode this as a GNU Radio pipeline?" Ask me how I know! 😅

**P.P.P.S.** The rabbit hole goes DEEP. First it's FM radio. Then digital modes. Then you're writing custom DSP blocks in C++. Then you're contributing to GNU Radio core. Then you're at the annual GNU Radio Conference presenting your work. The community is AMAZING and they WILL pull you in! 🎤
