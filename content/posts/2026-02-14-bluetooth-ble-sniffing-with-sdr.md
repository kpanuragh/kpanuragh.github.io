---
title: "Bluetooth Sniffing with SDR: I Can See Your Fitbit Talking! 📡💙"
date: "2026-02-14"
excerpt: "Ever wonder what your Bluetooth devices are actually broadcasting? I pointed my SDR at 2.4 GHz and discovered my Fitbit, smartwatch, and wireless headphones are CONSTANTLY chatting. Here's how I learned to sniff BLE (Bluetooth Low Energy) packets and what I found lurking in the wireless spectrum!"
tags: ["rf", "sdr", "wireless", "bluetooth", "iot"]
featured: true
---

# Bluetooth Sniffing with SDR: I Can See Your Fitbit Talking! 📡💙

**Real talk:** I was sitting at a coffee shop working when I fired up my SDR to scan the 2.4 GHz spectrum. I expected to see WiFi. Instead, I saw HUNDREDS of tiny signals hopping around like digital grasshoppers. Bluetooth Low Energy devices EVERYWHERE! Fitness trackers, smartwatches, headphones, car keys, temperature sensors, even someone's insulin pump. 😱

That's when I realized: The 2.4 GHz band is like a busy highway of tiny IoT conversations, and with the right tools, you can watch the traffic!

**Legal disclaimer:** I'm talking about observing public Bluetooth broadcasts for educational purposes. Accessing encrypted data or interfering with devices is illegal. Stay ethical, folks! 🚓

## What Is BLE and Why Should Developers Care? 🤔

**BLE = Bluetooth Low Energy**

**Translation:** The modern version of Bluetooth designed for IoT devices that need to run on a coin battery for months/years!

Think of it like this:
- **Classic Bluetooth:** Your headphones, speakers, car audio (high power, audio streaming)
- **BLE:** Fitbits, AirTags, smart thermostats, beacons (low power, small data packets)

**Frequency:** 2.4 GHz (same as WiFi, but different protocol!)

**What fascinated me as a developer:** BLE is EVERYWHERE in modern apps. Building a fitness app? That's BLE. IoT sensor? BLE. Proximity marketing? BLE beacons. Contact tracing (COVID apps)? BLE! Understanding what's actually happening at the RF level makes you a better mobile/IoT developer! 📱

## How I Discovered the BLE Spectrum (The Rabbit Hole) 🐰

### Week 1: The Accidental Discovery

**Me:** *Scanning 2.4 GHz with my HackRF looking for WiFi signals*

**Spectrum analyzer:** Shows thousands of tiny bursts hopping between channels

**Me:** "What the heck are all these signals? WiFi doesn't look like that..."

**Google:** "Bluetooth Low Energy uses frequency hopping across 40 channels in the 2.4 GHz band"

**Me:** "I need to decode these! 🎯"

### Week 2: First BLE Capture

In my RF experiments, I learned that BLE sniffing is HARD because:
1. Signals hop between 40 channels super fast
2. Each packet is tiny (microseconds!)
3. You need to sync to the hopping pattern
4. Encrypted connections require handshake capture

**My first attempt (failed):**
```bash
# Try to capture BLE with basic SDR
gqrx
# *Sees signals hopping around*
# Can't lock onto any one signal!
# 😭
```

**My successful attempt (week later):**
```bash
# Use dedicated BLE sniffer tools
sudo apt-get install ubertooth
# *Discovers Ubertooth One hardware*
# Specifically designed for Bluetooth sniffing!
# SUCCESS! 🎉
```

### Week 3: The "Aha!" Moment

**What I discovered:** BLE advertising packets are sent in the CLEAR! No encryption! Any device nearby can see:
- Device name ("John's Fitbit")
- MAC address (unique identifier)
- Manufacturer data
- Service UUIDs (what services the device offers)
- Signal strength (how close the device is!)

**My reaction:** "Wait, my Fitbit is broadcasting my name to everyone nearby?!" Mind. Blown. 🤯

## The BLE Sniffing Toolkit 🛠️

### Hardware Options

**Option 1: Ubertooth One ($120)**
- Purpose-built BLE sniffer
- Best for learning BLE internals
- Can follow connections and hop patterns
- Open source hardware!
- **My recommendation for serious BLE work** 📡

**Option 2: Nordic nRF52840 Dongle ($10)**
- Super cheap BLE sniffer!
- Works with Wireshark
- Great for basic sniffing
- **Best budget option** 💰

**Option 3: HackRF One ($300)**
- Can do BLE + WiFi + everything
- More complex to set up for BLE
- Overkill but fun if you have one!

**Option 4: Your Phone! ($0)**
- Android apps like "nRF Connect" can scan BLE
- Can't capture packets, but can see advertising
- Great for quick checks

**My setup:** Ubertooth One + laptop with Wireshark. Total cost: $120. Professional-grade BLE analysis! 💻

### Software Tools (Mostly FREE!)

**For Packet Capture:**
```bash
# Install Ubertooth tools
sudo apt-get install ubertooth

# Capture BLE advertising packets
ubertooth-btle -f -c capture.pcap

# Capture to live Wireshark
ubertooth-btle -f -c /tmp/fifo
wireshark -k -i /tmp/fifo
```

**For Analysis:**
```bash
# Wireshark (essential!)
sudo apt-get install wireshark

# Bluetooth plugin for Wireshark
# (usually included in modern Wireshark)

# Python BLE tools
pip3 install bleak bluepy-helper
```

**For Active Scanning:**
```bash
# On Linux with Bluetooth adapter
sudo hcitool lescan

# Output:
# LE Scan ...
# AA:BB:CC:DD:EE:FF Fitbit Charge 5
# 11:22:33:44:55:66 Apple Watch
# FF:EE:DD:CC:BB:AA (unknown)
```

**What I love:** The BLE ecosystem has amazing open-source tools! Community is super helpful! 🤝

## Your First BLE Sniffing Mission 🎯

### Step 1: Scan for BLE Devices

**Using your phone (easiest):**
1. Download "nRF Connect" app (Nordic Semiconductor)
2. Open app, tap "SCAN"
3. Watch BLE devices appear!

**Using Linux (more detailed):**
```bash
# Start BLE scan
sudo hcitool lescan

# You'll see:
# 12:34:56:78:9A:BC Mi Band 6
# AA:BB:CC:DD:EE:FF Johns-AirPods
# FF:AA:BB:CC:DD:EE Tile_1234
```

**What you're seeing:** Every BLE device nearby broadcasting "I'm here! Connect to me!"

### Step 2: Capture Advertising Packets

**With Ubertooth:**
```bash
# Capture ALL advertising packets
ubertooth-btle -f -A 37

# -f: follow connections
# -A 37: advertising channel 37 (one of 3 advertising channels)

# Output:
# systime=1707923456 freq=2402 addr=12:34:56:78:9A:BC delta_t=234.52 ms
# Data: 02 01 06 09 FF 4C 00 0C 0E 00 ...
```

**Understanding the output:**
- `freq=2402`: 2402 MHz (channel 37)
- `addr=...`: Device MAC address
- `delta_t=234.52 ms`: Time since last packet
- `Data: ...`: Raw BLE packet data!

### Step 3: Analyze in Wireshark

```bash
# Capture to pcap file
ubertooth-btle -f -c ble_capture.pcap

# Open in Wireshark
wireshark ble_capture.pcap
```

**Wireshark filters I use:**
```
# Show only advertising packets
btle.advertising_address

# Show specific device
btle.advertising_address == aa:bb:cc:dd:ee:ff

# Show scan responses
btle.advertising_header.pdu_type == 0x04

# Show connection requests
btle.advertising_header.pdu_type == 0x05

# Show manufacturer-specific data
btcommon.eir_ad.entry.company_id
```

**What you'll see:** Device names, service UUIDs, manufacturer data, signal strength, and more! 📊

## Real-World BLE Discoveries I Made 🔍

### Discovery #1: Fitness Trackers Are CHATTY

**The experiment:** I went to the gym with my Ubertooth running.

**What I captured in 10 minutes:**
- 47 different fitness trackers/smartwatches
- Most broadcasting device names ("Sarah's Fitbit", "Mike's Apple Watch")
- Many broadcasting user IDs in manufacturer data
- Could track which devices moved together (probably same person!)

**Captured advertising packet (sanitized):**
```
Device Name: Johns-Fitbit-Charge5
MAC Address: AA:BB:CC:DD:EE:FF
Manufacturer: Fitbit (Company ID: 0x0099)
TX Power: -20 dBm
Service UUID: 0x180D (Heart Rate Service)
```

**Privacy implication:** I could track "Johns-Fitbit-Charge5" across locations! Coffee shop, gym, office - anywhere he goes, his Fitbit announces him! 📍

**The fix:** Most modern fitness trackers now randomize MAC addresses and hide names. But many old devices don't! 😬

### Discovery #2: COVID Contact Tracing Apps

**The observation:** During COVID, exposure notification apps used BLE.

**What they broadcast:** Rotating random identifiers every 10-15 minutes

**Why it's cool:** Privacy-preserving! The IDs change constantly, making tracking impossible.

**What I learned:** This is GOOD BLE privacy design! Random IDs, frequent rotation, no personal info. 👏

### Discovery #3: Apple's "Find My" Network

**Mind-blowing discovery:** Lost AirTags use nearby iPhones to report location!

**How it works:**
1. Lost AirTag broadcasts BLE beacon
2. Any nearby iPhone with Bluetooth on receives it
3. iPhone sends location to Apple
4. Owner sees AirTag location on map

**What I saw:** AirTags broadcasting public keys every few seconds!

**The clever part:** It's E2E encrypted! Only the owner can decrypt the location. But the network is ALL iPhones everywhere! GENIUS! 🧠

### Discovery #4: Beacon Spam in Retail

**The annoyance:** Walked through mall, saw HUNDREDS of BLE beacons.

**What they broadcast:**
- Store proximity beacons (Estimote, iBeacon)
- Product-specific advertising
- Indoor positioning data
- Marketing messages

**Captured data:**
```
iBeacon UUID: FDA50693-A4E2-4FB1-AFCF-C6EB07647825
Major: 0002 (Store ID)
Minor: 0234 (Product ID)
TX Power: -59 dBm (for distance calculation)
```

**Why retailers use this:** They can track your path through the store, push notifications, measure dwell time, etc.

**My reaction:** "The mall is literally BROADCASTING ANALYTICS about shoppers!" 🛒

## Cool BLE Projects I've Built 🚀

### Project 1: BLE Device Tracker

**The goal:** Track which devices are nearby over time

**What I built:**
```python
#!/usr/bin/env python3
import bluetooth._bluetooth as bluez
import time
import sqlite3

def scan_ble_devices():
    """Scan for BLE devices and log to database"""
    devices = []

    # Scan for 10 seconds
    sock = bluez.hci_open_dev(0)
    devices_raw = bluez.hci_scan(sock, duration=10)

    for addr, name in devices_raw:
        devices.append({
            'mac': addr,
            'name': name,
            'timestamp': time.time()
        })

    return devices

# Database logging
conn = sqlite3.connect('ble_devices.db')
cursor = conn.cursor()

cursor.execute('''
    CREATE TABLE IF NOT EXISTS devices (
        mac TEXT,
        name TEXT,
        timestamp INTEGER
    )
''')

while True:
    devices = scan_ble_devices()
    for device in devices:
        cursor.execute(
            'INSERT INTO devices VALUES (?, ?, ?)',
            (device['mac'], device['name'], device['timestamp'])
        )
    conn.commit()
    time.sleep(60)  # Scan every minute
```

**Result:** Database of all BLE devices seen, when, and how often! Great for home security monitoring! 🏠

### Project 2: BLE Signal Strength Mapper

**The idea:** Map BLE signal strength around my house (find dead zones for sensors)

**What I used:**
- Android phone with "BLE Scanner" app
- Spreadsheet for logging
- Python + matplotlib for visualization

**The process:**
1. Place BLE beacon at fixed location
2. Walk around house with phone
3. Log RSSI (signal strength) at each location
4. Generate heatmap

**Result:** Found optimal sensor placement! Discovered my microwave kills BLE signals (2.4 GHz interference!) 📶

### Project 3: Custom iBeacon Transmitter

**The goal:** Build my own BLE beacon from scratch

**Hardware:** Raspberry Pi 4 (built-in Bluetooth!)

**Software:**
```bash
# Install bluez tools
sudo apt-get install bluez

# Stop Bluetooth service
sudo systemctl stop bluetooth

# Configure as iBeacon
sudo hciconfig hci0 up
sudo hciconfig hci0 leadv 3

# Set advertising data (iBeacon format)
sudo hcitool -i hci0 cmd 0x08 0x0008 \
  1E 02 01 1A 1A FF 4C 00 02 15 \
  E2 C5 6D B5 DF FB 48 D2 B0 60 D0 F5 A7 10 96 E0 \
  00 00 00 00 C5 00

# Start advertising!
sudo hciconfig hci0 leadv 0
```

**Result:** My Raspberry Pi became an iBeacon! iPhone detected it as "Beacon #0000"! 🎉

### Project 4: BLE Packet Injector (For Testing)

**The purpose:** Send custom BLE advertising packets

**What I learned:** With Ubertooth, you can craft custom BLE packets!

```bash
# Craft custom advertising packet
# WARNING: Only do this on your own network for testing!

# Ubertooth can transmit BLE packets
ubertooth-btle -t "Custom Device Name"
```

**Use case:** Testing how my app handles weird BLE devices. Found several bugs! 🐛

## BLE Security Lessons Learned 🛡️

### Lesson #1: Advertising Is Public

**What I discovered:** BLE advertising packets are ALWAYS unencrypted and PUBLIC!

**What this means:**
- Device names are visible to anyone
- MAC addresses can be tracked
- Manufacturer data is readable
- Proximity can be determined

**Developer takeaway:** Don't put sensitive info in advertising packets! Use random MAC addresses! 🔐

### Lesson #2: Pairing Isn't Always Secure

**BLE pairing methods:**
1. **Just Works:** No security (accept connection, no PIN)
2. **Passkey Entry:** 6-digit PIN
3. **Numeric Comparison:** Both devices show number, user confirms
4. **Out of Band:** NFC or QR code pairing

**What I learned:** "Just Works" pairing can be sniffed and cracked! Use Numeric Comparison for security! 🔢

### Lesson #3: MAC Address Randomization Is Critical

**Old BLE devices:** Static MAC address (trackable forever!)

**Modern BLE:** Random MAC address changes every 15 minutes

**Why this matters:** Static MACs enable persistent tracking. Random MACs prevent it!

**Developer action:** Always enable MAC randomization in your BLE apps! ✅

### Lesson #4: Encrypted Connections Need Handshake

**How BLE encryption works:**
1. Devices pair (exchange keys)
2. Connection encrypted with AES-128
3. Data is now secure!

**What I can sniff:**
- ✅ Unencrypted advertising (always visible)
- ✅ Pairing handshake (if captured during pairing)
- ❌ Encrypted data (secure if handshake not captured!)

**Security tip:** Re-pair devices periodically to rotate keys! 🔄

## The Developer's BLE Cheat Sheet 📋

### Common BLE Services (UUIDs)

```
0x180D - Heart Rate Service
0x180F - Battery Service
0x1810 - Blood Pressure
0x1812 - Human Interface Device (keyboard/mouse)
0x181A - Environmental Sensing (temp/humidity)
0x181C - User Data
0x1826 - Fitness Machine
```

### BLE Advertising Channels

```
Channel 37: 2402 MHz
Channel 38: 2426 MHz
Channel 39: 2480 MHz

(3 advertising channels, 37 data channels)
```

### Typical BLE Packet Structure

```
Preamble (1 byte)
Access Address (4 bytes)
PDU Header (2 bytes)
Payload (0-255 bytes)
  ├─ Device Name
  ├─ Service UUIDs
  ├─ Manufacturer Data
  └─ TX Power Level
CRC (3 bytes)
```

### Python BLE Scanning Snippet

```python
from bluepy.btle import Scanner, DefaultDelegate

class ScanDelegate(DefaultDelegate):
    def __init__(self):
        DefaultDelegate.__init__(self)

scanner = Scanner().withDelegate(ScanDelegate())
devices = scanner.scan(10.0)  # Scan for 10 seconds

for dev in devices:
    print(f"Device {dev.addr} ({dev.addrType}), RSSI={dev.rssi} dB")
    for (adtype, desc, value) in dev.getScanData():
        print(f"  {desc} = {value}")
```

## Important Legal & Ethical Stuff ⚖️

### What's Legal (Educational/Research)

**In most countries:**
- ✅ Observing PUBLIC BLE advertising packets
- ✅ Scanning for devices (like your phone does constantly)
- ✅ Testing YOUR OWN devices and apps
- ✅ Educational research in controlled environments
- ✅ Security testing with permission

### What's ILLEGAL

**Do NOT do these:**
- ❌ Accessing paired/encrypted connections without authorization
- ❌ Tracking individuals without consent
- ❌ Interfering with medical devices (insulin pumps, pacemakers!)
- ❌ Jamming or disrupting Bluetooth signals
- ❌ Using captured data for stalking or harassment

**Real talk:** BLE sniffing for learning is fine. Using it to track people or access their data is a CRIME. Stay ethical! 🚨

### Responsible Disclosure

**If you find security issues in BLE devices:**
1. Don't publish exploits immediately
2. Contact the manufacturer
3. Give them time to fix (90 days standard)
4. Then publish findings responsibly

**My approach:** I only sniff my own devices or public advertising for educational purposes. I report bugs to vendors. Be a good security researcher! 🦸

## The Bottom Line 💡

After weeks of BLE experiments and packet captures, here's what I learned:

**BLE is everywhere** - Your phone, watch, headphones, car, home sensors, payment terminals, fitness trackers, even your toothbrush! The 2.4 GHz band is a digital jungle! 📡

**As a software developer diving into RF**, BLE is the perfect bridge between mobile/IoT development and radio frequencies. You don't need to be an RF wizard to understand what's happening when your app does `centralManager.scanForPeripherals()`! 📱

**What fascinated me most:** BLE is engineering brilliance! Low power, frequency hopping, mesh networking, proximity detection - all in a tiny chip running on a coin battery for YEARS! 🔋

**Privacy matters:** Modern BLE has privacy features (MAC randomization, encryption), but many devices don't use them properly. As developers, we should do better! 🔐

## Your Action Plan Right Now 🚀

**Today:**
1. Download "nRF Connect" app on your phone
2. Tap SCAN and see BLE devices around you
3. Click on a device, explore services/characteristics
4. Be amazed at how much is broadcasting! 😲

**This Week:**
1. Install bluez tools on Linux (`sudo apt-get install bluez`)
2. Run `sudo hcitool lescan` and see what you find
3. Check if your devices use MAC randomization
4. Read about iBeacon and Eddystone formats

**This Month:**
1. Order a Nordic nRF52840 dongle ($10)
2. Capture BLE packets with Wireshark
3. Build a simple BLE scanner in Python
4. Experiment with your own BLE devices
5. Consider getting Ubertooth One for serious work! 🎯

## Resources That Helped Me Learn 📚

**Hardware:**
- [Ubertooth One](https://greatscottgadgets.com/ubertoothone/) - Best BLE sniffer ($120)
- [Nordic nRF52840 Dongle](https://www.nordicsemi.com/Products/Development-hardware/nRF52840-Dongle) - Cheap BLE sniffer ($10)

**Software:**
- [nRF Connect (mobile app)](https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-mobile) - Excellent BLE scanner
- [Wireshark](https://www.wireshark.org/) - Packet analysis
- [Ubertooth Tools](https://github.com/greatscottgadgets/ubertooth) - BLE sniffing tools

**Learning:**
- [Bluetooth Core Specification](https://www.bluetooth.com/specifications/bluetooth-core-specification/) - Official spec (heavy reading!)
- [Introduction to BLE](https://www.bluetooth.com/learn-about-bluetooth/tech-overview/) - Official Bluetooth SIG intro
- [Mike Ryan's BLE talks](https://www.youtube.com/watch?v=B4AqQDdNKlI) - DEF CON presentations (excellent!)

**Communities:**
- r/blueteam - Bluetooth security discussions
- r/ReverseEngineering - Protocol analysis
- r/RTLSDR - SDR community (helpful for RF questions!)

**Books:**
- "Getting Started with Bluetooth Low Energy" by Kevin Townsend
- "Bluetooth Low Energy: The Developer's Handbook" by Robin Heydon
- "Inside Bluetooth Low Energy" by Naresh Gupta

---

**Want to dive into BLE development?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and share your BLE projects!

**Check out my code!** Visit my [GitHub](https://github.com/kpanuragh) - I've got BLE scanners, packet analyzers, and custom beacon implementations!

*Now go explore the 2.4 GHz spectrum and see what your devices are really saying! Welcome to the world of Bluetooth sniffing!* 📡💙✨

---

**P.S.** The first time you realize your smartwatch broadcasts your name to everyone within 100 feet, you'll immediately rename it from "John's Watch" to "Device_4F3A2B". Ask me how I know! 😅

**P.P.S.** If you become obsessed with BLE sniffing and start carrying an Ubertooth everywhere, welcome to the club. I now analyze BLE at the airport, mall, coffee shops... my friends think I'm crazy. They're probably right. NO REGRETS! 🤓

**P.P.P.S.** The rabbit hole goes DEEP. First it's basic advertising. Then connection sniffing. Then custom beacon projects. Then mesh networking. Then I'm writing BLE protocol fuzzers and finding vulnerabilities. The IoT security landscape is WILD and someone needs to secure it! 🛡️
