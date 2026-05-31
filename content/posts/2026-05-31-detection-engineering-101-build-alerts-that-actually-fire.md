---
title: "Detection Engineering 101: Build Alerts That Actually Fire (For the Right Reasons) 🔍"
date: "2026-05-31"
excerpt: "Most teams write SIEM rules once, forget them, and wonder why they only find out about breaches from journalists. Detection engineering treats security alerts like production code — tested, versioned, and continuously improved. Here's how to start."
tags:
  - security
  - detection-engineering
  - incident-response
  - siem
  - defensive-security
featured: true
---

Your SIEM has 847 enabled rules. You haven't reviewed them since the vendor shipped them. Half fire constantly, so everyone ignores them. The other half have never fired once — including the ones for the attacks that actually happened last quarter.

This is the state of alert management at most organisations, and it's not because people don't care. It's because nobody taught them that **detection is an engineering discipline**, not a configuration checkbox.

Welcome to detection engineering 101.

## What Detection Engineering Actually Is

Detection engineering is the practice of treating your security alerts like production software: they have requirements, they get tested, they go through code review, they live in version control, and they get deprecated when they stop being useful.

The alternative — pile on vendor rules, set and forget, drown in noise — is how you end up with a security team that's desensitised to alerts and attackers who live in your network for 200 days before anyone notices.

At Cubet, when we instrumented a new internal platform last year, the default AWS GuardDuty rules immediately started generating noise about perfectly normal cross-region calls we make as part of our deployment pipeline. Without a detection engineering mindset, those would have been suppressed globally — and we'd have been blind to actual anomalies on those same channels. Instead, we wrote a proper exception with scope, documented why, and set a review date. Small thing, massive difference in signal quality.

## The Detection Development Lifecycle

Think of it like a mini software development cycle:

**1. Threat modelling → requirements**  
What are you actually trying to detect? "Attackers" is not a requirement. "Privilege escalation via sudo abuse on Linux hosts" is. Work from frameworks like MITRE ATT&CK to turn abstract threats into concrete, observable behaviours.

**2. Hypothesis → rule**  
Write the detection rule against your log data. This is where most teams start and end. It's actually the middle.

**3. Test it**  
Does the rule fire when the attack happens? Does it *not* fire on normal traffic? Both halves matter. We'll come back to this.

**4. Document it**  
What does this alert mean? What's the triage runbook? What's the expected false-positive rate? Who owns it?

**5. Ship and monitor**  
Track false positive rate, true positive rate, and mean time to triage over time. Rules that never fire need investigation. Rules that fire constantly and get suppressed need rethinking.

**6. Retire or refine**  
Rules have a shelf life. When your tech stack changes, old detections become noise or blind spots.

## Writing a Rule That Doesn't Suck

Most weak detection rules share a flaw: they key off a single, easily-spoofed indicator (a specific IP, a specific process name) rather than a behaviour pattern.

Here's a naive rule detecting a potential reverse shell via curl piped to bash — a classic attacker technique:

```yaml
# Bad: too specific, trivially evaded
- name: curl-pipe-bash
  condition: process.name == "curl" AND parent.name == "bash"
  severity: high
```

An attacker who renames `curl` to `c` or uses `wget` walks right through this. Better to look at the behaviour:

```yaml
# Better: behaviour-based, harder to evade
- name: shell-spawned-from-network-client
  condition:
    process.name in ("bash", "sh", "zsh")
    AND parent.name in ("curl", "wget", "python", "python3", "ruby", "perl")
    AND process.interactive == false
  severity: high
  tags:
    - technique: T1059.004  # Unix shell
    - tactic: execution
```

Now you're detecting the *pattern* — a shell spawned non-interactively from a process with network capability — which survives renaming tricks and covers multiple toolchains.

## Testing Your Detections

Here's the uncomfortable truth: most security rules have never been tested against actual attack data. Developers would never ship untested code; security teams ship untested detections constantly.

A simple but effective approach is **atomic testing**. The [Atomic Red Team](https://github.com/redcanaryco/atomic-red-team) project provides small, safe scripts that simulate specific attacker techniques mapped to MITRE ATT&CK. You run the simulation in a test environment, then verify your SIEM fired.

```bash
# Example: test T1053.003 (Cron-based persistence)
# Simulate the attack
echo "* * * * * /tmp/malicious.sh" | crontab -

# Check your SIEM fired within the expected window
# If it didn't: your detection has a gap
# Clean up
crontab -r
```

This is the detection equivalent of a unit test. Run your full atomic test suite before every rule deployment. If a new rule doesn't fire on its target simulation, it's not ready to ship.

## The Noise Problem

High false-positive rates are a security emergency disguised as an inconvenience. Every false alert an analyst reviews and closes takes time that could have been spent on real incidents. Worse, it trains the team to distrust alerts, so *when the real thing fires*, it gets closed without investigation.

A useful heuristic: if an alert fires more than 10 times per analyst-day without producing a true positive, it's costing you more than it's saving. Tune it, scope it, or kill it.

Suppression should be surgical. Instead of "suppress all GuardDuty IAM alerts", write "suppress IAM alerts from role `deploy-pipeline-role` during deployments tagged `env:staging`". The scope stops the noise while preserving visibility into the same behaviour from unexpected sources.

## Version Control Your Rules

Your detection logic should live in git. Every rule change should be a pull request with:
- What changed and why
- Test evidence the rule fires correctly
- Expected false-positive impact
- Rollback plan

This sounds obvious, and yet most teams have their SIEM rules as undocumented XML exported twice a year when someone remembers.

A simple folder structure in your repo:

```
detections/
  linux/
    shell-from-network-client.yml
    sudo-privilege-escalation.yml
  cloud/
    iam-privilege-escalation.yml
    metadata-api-access-from-workload.yml
  tests/
    shell-from-network-client_test.sh
```

CI runs the tests. Merge requires a review from the on-call security engineer. Same discipline as application code. Your future self — at 2 AM during an incident — will be grateful.

## Where to Start Monday Morning

If this feels like a massive lift, start with three things:

1. **Audit your current alerts.** Find the five noisiest rules and tune them this week. Find the five that have never fired and investigate whether the log data they need even exists.

2. **Pick one threat to model properly.** Choose something relevant to your stack — credential stuffing, container escape, whatever keeps your threat model team up at night — and build a single well-tested, well-documented detection for it.

3. **Set up atomic tests for your top-10 MITRE techniques.** Run them now. See what fires and what doesn't. That gap list is your detection roadmap.

Detection engineering doesn't mean rewriting everything overnight. It means applying the same rigour to security rules that you already apply to the code those rules are protecting.

The attacker who compromised a company for six months before being discovered? They didn't break through your detections. They walked through the gaps you never knew were there.

Close the gaps.

---

What does your detection pipeline look like? Are you versioning your rules, or still living in the vendor-default-rules nightmare? I'd love to hear how your team handles this — find me on [Twitter/X (@kpanuragh)](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh). If you found this useful, share it with whoever owns your SIEM. They need it.
