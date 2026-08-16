---
title: "Detection Engineering 101: Writing Alerts That Don't Lie to You 🕵️"
date: "2026-08-16"
excerpt: "Buying a SIEM doesn't make you secure — it makes you a person with a very expensive box that emails you 400 times a day. Detection engineering is the discipline of turning that noise into signal, one testable rule at a time."
tags:
  - security
  - incident-response
  - detection-engineering
  - siem
featured: true
---

Somewhere in every SOC there's a folder of alert rules nobody remembers writing, half of them permanently muted because they cried wolf once in 2023 and were never trusted again. That's not a detection strategy — that's alert fatigue with a budget line item. Detection engineering is the fix: treating detections like software. Version-controlled, tested, peer-reviewed, and — this is the part everyone skips — measured for whether they actually catch anything.

If "detection engineering" sounds like a fancy rebrand of "writing SIEM rules," that's because for a lot of teams it still is. The difference is discipline. A detection engineer doesn't write a rule because a vendor blog said to. They write it because a specific technique, mapped to a specific threat, produces a specific observable, and they can prove it fires when it should and shuts up when it shouldn't.

## Alerts are hypotheses, not facts

The mental model that changed how I write detections: every alert is a hypothesis about attacker behavior, not a statement of fact. "A user logged in from a new country" is not evidence of compromise — it's evidence that produces a *hypothesis* worth investigating. Write the rule, and separately write down what would make that hypothesis true or false, before you ever see it fire in production.

This matters because most bad detections are bad not because the logic is wrong, but because nobody defined what "true positive" means before shipping them. A rule that fires on `powershell.exe -enc` is technically correct — attackers do that constantly. So does every third IT admin script in a Windows fleet. Without context (parent process, network destination, time of day, account type), you've built a very loud coin flip.

## Start from the technique, not the log source

The trap most people fall into is starting from "what logs do we have" and reverse-engineering rules from there. It produces detections that are technically accurate and practically useless, because they detect the log field, not the behavior.

Start instead from a framework like MITRE ATT&CK, pick a technique, and ask: what does this actually look like on the wire or on disk? Take T1059.001 (PowerShell) — instead of alerting on every invocation, alert on the specific shape of *abuse*: encoded commands launched by Office processes, which is a pattern almost no legitimate workflow produces.

Here's a Sigma rule — the closest thing detection engineering has to a portable, version-controllable format, since it compiles down to whatever backend you run (Splunk, Elastic, Sentinel):

```yaml
title: Encoded PowerShell Spawned From Office Application
id: 7c1e2f3a-9b4d-4e21-8a6f-11a2b3c4d5e6
status: experimental
description: Detects encoded PowerShell launched as a child of Word/Excel/Outlook - a common macro-dropper pattern.
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\powershell.exe'
    ParentImage|endswith:
      - '\winword.exe'
      - '\excel.exe'
      - '\outlook.exe'
    CommandLine|contains:
      - '-enc'
      - '-EncodedCommand'
  condition: selection
falsepositives:
  - Legitimate add-ins that shell out to PowerShell (rare, should be allow-listed by hash)
level: high
```

That rule survives a tool migration because the logic lives in the technique, not in a vendor's proprietary query syntax. When you rip out your SIEM in two years — and you will — this rule ports with you.

## Test detections the way you test code

The part everyone skips: does the rule actually fire? Detection engineering borrows straight from CI/CD — you write the detection, then you write (or run) an attack simulation that should trigger it, and you assert on the result. Atomic Red Team is the de facto tool for this; it ships small, single-technique test cases mapped directly to ATT&CK IDs.

A minimal loop looks like this — run the atomic test, wait for ingestion lag, then query your SIEM/data lake for the expected event:

```python
import subprocess, time, requests

def run_atomic_test(technique_id: str):
    subprocess.run([
        "Invoke-AtomicTest", technique_id, "-TestNumbers", "1"
    ], shell=True, check=True)

def assert_alert_fired(query: str, timeout=120):
    deadline = time.time() + timeout
    while time.time() < deadline:
        hits = requests.post(SIEM_SEARCH_URL, json={"query": query}).json()
        if hits.get("count", 0) > 0:
            return True
        time.sleep(10)
    return False

run_atomic_test("T1059.001")
assert assert_alert_fired('index=edr rule_name="Encoded PowerShell From Office"'), \
    "Detection did not fire for T1059.001 - fix before merging"
```

Wire that into a pipeline that runs against a disposable range on every rule PR, and you've converted "I think this detection works" into "CI proved this detection works," which is a very different conversation with your future 3am self.

## Measure the boring metrics

The two numbers that actually predict whether a detection program survives contact with reality are mean-time-to-detect and the true-positive rate per rule. If a rule has fired 400 times and been closed as a false positive 399 of those, it's not a detection — it's a background job that pages someone. Kill it, tune it, or replace it with something that has context baked in (asset criticality, user baseline, time-of-day) rather than a bare string match.

At Cubet, the rule that finally got buy-in from the on-call rotation wasn't the cleverest one — it was the boring one that only fired three times in six months, and was right all three times. Precision earns trust; trust earns you a SOC that doesn't mute your channel.

Detection engineering isn't about writing more rules. It's about writing fewer rules that you can actually defend in a postmortem — logic you understand, tests that prove it works, and metrics that tell you when it's time to retire it.

What's the worst false-positive-turned-permanently-muted alert you've inherited? Tell me on [Twitter/X](https://twitter.com/anuragh_kp) or check out more of my writing on [GitHub](https://github.com/kpanuragh) and [LinkedIn](https://linkedin.com/in/anuraghkp).
