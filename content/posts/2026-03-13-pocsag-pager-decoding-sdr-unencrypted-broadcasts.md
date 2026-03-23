---
title: "Pagers Are Still Beeping in 2026 — And Broadcasting in Plaintext 📟"
date: "2026-03-13"
excerpt: "I pointed my RTL-SDR at 152 MHz and discovered hospitals, factories, and businesses are still broadcasting unencrypted pager messages over radio. Here's how I decoded them and what it means for wireless security."
tags: ["\\\"rf\\\"", "\\\"sdr\\\"", "\\\"wireless\\\"", "\\\"hobby\\\"", "\\\"security\\\"", "\\\"pocsag\\\""]
featured: "true"
---

# Pagers Are Still Beeping in 2026 — And Broadcasting in Plaintext 📟

**Hot take:** The technology you dismissed as extinct in 2002 is still transmitting right now, over your head, in plaintext, at full radio power — and half the messages would make a hospital HIPAA compliance officer cry into their clipboard.

I'm talking about pagers. Actual beeping, vibrating pagers. Hospitals love them. Factories use them. Emergency services depend on them. And most of them are broadcasting their messages with zero encryption, readable by anyone with a $25 USB dongle and free software.

The first time I decoded a pager message with my RTL-SDR, I sat back in my chair and said out loud to my empty apartment: "...okay but why is nobody talking about this?"

So let me talk about it.

## Wait, Pagers Still Exist? 🤔

I had the same reaction. But yes, pagers are very much alive in 2026:

- **Hospitals** use them because they work in RF-shielded areas where cell signals die. The OR, ICU, and radiology suites that block your phone? Pagers still work there.
- **Factories and warehouses** use them because pager networks have near-100% uptime, no internet dependency, and batteries last weeks.
- **Emergency services** use them for one-way dispatch alerts — fire departments, search-and-rescue teams, on-call engineers.
- **Some utilities** still page field technicians because the infrastructure is paid off and "if it ain't broke..."

**Global pager market in 2023:** ~5 million active units. Not dead. Just invisible — because why would you look up?

## The Protocol: POCSAG 📡

The dominant pager protocol you'll encounter is **POCSAG** (Post Office Code Standardisation Advisory Group — yes, really, named after a British postal committee from 1978).

POCSAG comes in three speeds:
- **512 bps** — the original, slowest, longest range
- **1200 bps** — most common today
- **2400 bps** — faster but shorter range

There's also **FLEX** (Motorola's protocol, used for high-capacity networks) and the newer **POCSAG+ / TNPP** variants, but vanilla POCSAG is what you'll decode most.

**How it works at the protocol level:**

```
[Preamble: 576 bits of alternating 1/0]
[Sync codeword]
[Batch: 8 frames × 2 codewords each]
  [Frame: address codeword + message codeword(s)]
[Repeat...]
```

Each pager has a **capcode** — a unique address (like a phone number for the pager). The transmitter broadcasts a continuous stream; your pager wakes up, checks if its capcode appears, and if so, displays the message. Everyone else's pager ignores it.

**The catch:** Every pager in range receives every transmission. The "address" filtering happens at the *pager*, not at the transmitter. The radio signal is broadcast openly to all.

**As a developer this immediately clicked for me.** It's like HTTP without TLS — everyone on the network can see all traffic; the device just filters for its own "username." No encryption, no authentication, fully promiscuous by design.

## In My RF Experiments: Finding the Frequencies 🔍

Pager transmitters are typically found in the **VHF and UHF bands:**

- **138–175 MHz** (VHF high band) — most hospital/business pagers
- **450–470 MHz** (UHF) — common in North America
- **157–158 MHz** — widely used internationally

**How I found them in my area:**

```bash
# Scan a frequency range and look for FM carriers
rtl_power -f 138M:175M:12.5k -g 40 -i 10 -e 60 output.csv

# Then visualize with heatmap.py (part of rtl-sdr tools)
python heatmap.py output.csv output.png
```

I got a spectrum heatmap showing strong carriers at specific frequencies. Several of them had that distinctive buzzing quality when I tuned in with GQRX — narrow FM, constant preamble tone when active, then a burst of data.

**Alternatively:** Check **radioreference.com** for your area — pager frequencies are often listed under "paging" in the frequency database.

## Setting Up a POCSAG Decoder 🛠️

You need three things:

1. **RTL-SDR dongle** (~$25) — any version works
2. **GQRX or SDR#** — to tune and demodulate
3. **multimon-ng** — open-source digital decoder that handles POCSAG, FLEX, and a dozen other protocols

### Install multimon-ng

```bash
# Ubuntu/Debian
sudo apt-get install multimon-ng

# macOS
brew install multimon-ng

# From source
git clone https://github.com/EliasOenal/multimon-ng.git
cd multimon-ng && mkdir build && cd build
cmake ..
make && sudo make install
```

### The One-Liner That Changed My Evening Plans

```bash
# Tune to a pager frequency, demodulate NFM, pipe to multimon-ng
rtl_fm -f 152.240M -M fm -s 22050 -r 22050 -E dc - | \
    multimon-ng -t raw -a POCSAG512 -a POCSAG1200 -a POCSAG2400 -f alpha -
```

Breaking this down:
- `rtl_fm -f 152.240M` — tune to 152.240 MHz (common hospital paging frequency)
- `-M fm -s 22050 -r 22050` — narrow FM demodulation at 22050 Hz sample rate
- `-E dc` — DC offset correction
- `multimon-ng -a POCSAG512 -a POCSAG1200 -a POCSAG2400` — try all three speeds
- `-f alpha` — decode as alphanumeric text (not just numbers)

**What I saw within about 90 seconds:**

```
POCSAG1200: Address: 1234567  Function: 3
Alpha:   JOHN SMITH ROOM 412 DR PATEL CALL BACK STAT
POCSAG1200: Address: 7654321  Function: 3
Alpha:   MAINTENANCE: ELEVATOR 3 ALARM RESET NEEDED FL 5
POCSAG1200: Address: 1928374  Function: 3
Alpha:   CODE BLUE RESPONSE TEAM TO ICU BED 7 IMMEDIATELY
```

I'm not going to pretend I wasn't stunned. Patient names. Room numbers. Doctor names. Maintenance alerts. All in plaintext. From a hospital I could literally see from my window.

## What Does the Data Actually Look Like? 💻

Let me demystify the output format:

```
POCSAG1200: Address: 1234567  Function: 3
Alpha:   [MESSAGE TEXT HERE]
```

- **Address (capcode):** The pager's unique ID. Seven digits identifies a specific pager or group.
- **Function bits (0–3):** Determines message type
  - `0` = Tone only (just "beep once")
  - `1` = Numeric only (phone number to call back)
  - `2` = Tone + numeric
  - `3` = Alphanumeric text (the interesting one)

**Numeric-only messages** often look like phone number callback requests:

```
POCSAG512: Address: 5551234  Function: 1
Numeric:   5557890
```

That's someone saying "call extension 7890." Old-school but functional.

**Alphanumeric messages** are where it gets real:

```
POCSAG1200: Address: 8847263  Function: 3
Alpha:   ON-CALL PHARMACIST - STAT CONSULT ED BAY 3 - MED LIST ATTACHED
```

In my RF experiments I've decoded elevator outages, security guard assignments, HVAC system alerts, lab result notifications, and on-call schedule changes. It's a weirdly intimate view of how large institutions actually operate day-to-day.

## The Security Angle (Because We Have to Talk About It) ⚠️

What fascinated me about SDR — and honestly unsettled me a bit — is how this becomes a real-world security and privacy issue.

**The problem:**
- POCSAG has no encryption standard
- It has no authentication
- It was designed in an era when "security through obscurity" meant "who would bother buying radio equipment?"

**The consequences:**
- **HIPAA implications:** Patient names, room numbers, diagnoses, and medication references in pager messages are technically PHI (Protected Health Information). Broadcasting this over unencrypted radio probably isn't what HIPAA authors had in mind.
- **Social engineering risk:** An attacker who knows "Dr. Patel is in OR-3 doing a procedure until 4pm" has useful information for badge tailgating, phone scams, or targeted attacks.
- **Operational security:** Corporate pager networks leak meeting locations, IT incident alerts, and on-call schedules.

**The frustrating truth:** The healthcare industry knows about this. Academic researchers have documented it for years. There are encrypted paging solutions (FLEX has encryption extensions; there are IP-based encrypted replacements). But replacing pager infrastructure is expensive, disruptive, and "the current one works fine."

Until it doesn't. From a security awareness perspective, this is exactly the kind of overlooked attack surface that bug bounty hunters and penetration testers should know about.

## Practical Project Ideas 🚀

### Project 1: Pager Traffic Analyzer

Build a receiver that logs all decoded messages with timestamps:

```python
import subprocess
import sqlite3
import re
from datetime import datetime

conn = sqlite3.connect('pager_log.db')
conn.execute('''CREATE TABLE IF NOT EXISTS messages
               (timestamp TEXT, capcode TEXT, function INTEGER, message TEXT)''')

proc = subprocess.Popen(
    ['multimon-ng', '-t', 'raw', '-a', 'POCSAG1200', '-f', 'alpha', '-'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    text=True
)

capcode = None
for line in proc.stdout:
    line = line.strip()

    # Extract capcode from address line
    addr_match = re.match(r'POCSAG\d+: Address:\s+(\d+)\s+Function:\s+(\d+)', line)
    if addr_match:
        capcode = addr_match.group(1)
        func = int(addr_match.group(2))

    # Extract message text
    alpha_match = re.match(r'Alpha:\s+(.*)', line)
    if alpha_match and capcode:
        message = alpha_match.group(1).strip()
        timestamp = datetime.now().isoformat()
        conn.execute('INSERT INTO messages VALUES (?,?,?,?)',
                     (timestamp, capcode, func, message))
        conn.commit()
        print(f"[{timestamp[:19]}] {capcode}: {message[:80]}")
        capcode = None
```

Within a few hours you'll have a database of every pager message in your area — useful for understanding local radio infrastructure (ethically).

### Project 2: Traffic Volume Dashboard

Hook the logger to a Grafana dashboard. Map capcode activity over time. You'll see:
- Peaks during shift changes
- Spikes when something goes wrong
- Quiet periods vs. active hours

It's operational intelligence from freely broadcast radio signals. No hacking, no interception — just listening to what's already in the air.

### Project 3: Multi-Protocol Scanner

`multimon-ng` handles more than POCSAG. Try adding:

```bash
rtl_fm -f 154M -M fm -s 22050 -r 22050 - | \
    multimon-ng -t raw \
        -a POCSAG512 -a POCSAG1200 -a POCSAG2400 \
        -a FLEX \
        -a EAS \
        -a ATIS \
        -f alpha -
```

**EAS** (Emergency Alert System) is the broadcast encoding for public emergency alerts — the same protocol that triggers those "THIS IS A TEST OF THE EMERGENCY BROADCAST SYSTEM" alerts. You'll decode these as structured data.

## Legal and Ethical Considerations ⚖️

### Receiving: Legal in most countries

Passively receiving radio transmissions — including pager signals — is legal in most jurisdictions. In the US, the Electronic Communications Privacy Act has an exception for signals "readily accessible to the general public," which generally includes unencrypted radio broadcasts.

**That said:** laws vary by country. Research your local regulations. The UK's Wireless Telegraphy Act is stricter about disclosing intercepted content, for example.

### What's NOT okay:

- **Disclosing received content publicly** — sharing patient info you decoded is a serious problem legally and ethically
- **Acting on intercepted information** — using pager intel for social engineering, unauthorized access, or any harmful purpose
- **Jamming or interfering** — never, ever transmit on or near paging frequencies

### The responsible disclosure angle:

If you discover a local hospital or business using plaintext paging for sensitive data, the right move is a quiet, professional notification to their IT security team — not a Twitter thread with decoded message screenshots. This is basic responsible disclosure applied to the physical/RF layer.

## What This Taught Me as a Developer 🤯

As a developer exploring radio frequencies, the pager rabbit hole drove home something important about security assumptions:

**The assumption:** "No one is listening because the equipment to listen is specialized and expensive."

**The reality:** That assumption expired in 2012 when RTL-SDR made spectrum analysis accessible to anyone for $25.

Every protocol designed with "security through RF obscurity" — pagers, many SCADA radio links, old wireless alarm systems, some building access systems — is now trivially auditable by anyone with a USB dongle and Google.

The software-defined radio revolution didn't just create new hobbies. It quietly invalidated decades of implicit security assumptions about who could and couldn't receive radio signals.

This is why I keep doing this. Every scan teaches me something about the invisible infrastructure humming around us, and most of it was never designed to be invisible at all.

## Getting Started This Weekend 📅

**Hardware:**
- RTL-SDR Blog v3 dongle (~$25)
- Included telescoping antenna (fine for pager frequencies)

**Software:**
- `rtl_fm` (included with RTL-SDR driver package)
- `multimon-ng` (open source, available everywhere)

**Steps:**
1. Install RTL-SDR drivers and multimon-ng
2. Look up pager frequencies for your area (radioreference.com)
3. Run the one-liner above
4. Watch messages decode in your terminal
5. Be mildly astonished at what's been broadcasting around you this whole time

## Resources 📚

- **multimon-ng GitHub** — The decoder, supports 20+ digital protocols
- **radioreference.com** — Frequency database to find local pager channels
- **RTL-SDR Blog** — Setup guides for all platforms
- **"POCSAG Decoding with RTL-SDR"** — Many tutorials on YouTube
- **Academic research:** Search "pager security healthcare" for documented studies on this exact issue

## TL;DR 💡

Pagers are alive in 2026, heavily used by hospitals and emergency services, and broadcast on open radio frequencies with zero encryption. Using a $25 RTL-SDR and the free `multimon-ng` decoder, you can receive and decode these messages as plaintext in minutes.

This isn't hacking — it's listening to broadcasts in the open air. But it reveals a genuinely significant operational security blind spot that affects institutions handling sensitive information.

The air around you is full of plaintext. Some of it is surprisingly sensitive. And it's been there for decades, just waiting for someone to point an SDR at it.

**Receive responsibly. Use what you learn ethically. And maybe shoot your local hospital IT team a quiet heads-up.** 📡

---

**Experimenting with SDR or wireless security?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to compare notes on what's floating around the spectrum.

**Code for my pager logger and dashboard** lives on [GitHub](https://github.com/kpanuragh) — includes the SQLite logger and a basic Flask dashboard.

*The air around us has always been full of signals. SDR just gave us the ears to hear them.* ⚡
