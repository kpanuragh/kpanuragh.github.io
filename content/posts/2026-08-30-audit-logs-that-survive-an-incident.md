---
title: "Audit Logs That Survive an Incident (Because the Attacker Reads Logs Too) 🔥📜"
date: "2026-08-30"
excerpt: "The first thing a competent attacker does after popping a box is check what's watching them — and the second thing is delete it. If your audit trail lives only on the host it's auditing, you don't have an audit trail, you have a suggestion."
tags: ["security", "incident-response", "logging", "forensics", "defensive-engineering"]
featured: true
---

Here's a fun exercise: go find your most critical production server right now and ask "if this box got fully owned in the next five minutes, what evidence would survive?" If the honest answer is "whatever's in `/var/log` on that same box," you don't have an audit trail. You have a suggestion that an attacker can `rm -rf` on their way out.

This is the single most common gap I see in incident response post-mortems, and it's rarely because nobody thought about logging — everyone logs *something*. It's because logging was designed for debugging, not for surviving an adversary who has root and a motive to cover their tracks. Those are very different design goals, and optimizing for one quietly fails the other.

## Debugging logs and forensic logs are not the same product

A debugging log answers "what happened right before this crashed?" It can be mutable, local, rotated aggressively, and incomplete — nobody's going to prosecute a NullPointerException. A forensic audit log has to answer a much harder question under adversarial conditions: "prove, to someone who doesn't trust this machine anymore, exactly what happened and in what order — including the part where someone tried to hide it."

That second requirement changes everything about the design:

- **It can't live only where it was generated.** If the log and the thing being logged share a blast radius, one `auth.log` truncation ends your investigation.
- **It has to be append-only, ideally provably so.** Not "we set the file to `chattr +a`" (an attacker with root just unsets that), but something that's tamper-*evident* even if you can't make it tamper-*proof*.
- **It has to capture the boring stuff, not just the exciting stuff.** Failed sudo attempts, config file reads, IAM policy changes — the actions that look like nothing until they're the third data point in a timeline.

## Ship it before you need it, not after

The cheapest, highest-leverage fix is embarrassingly simple: get logs off the host in near real time, to a destination the host itself has no delete permission on. Not "we back up logs nightly" — nightly is a full business day of runway for someone to operate unobserved and then wipe the evidence before the backup job even runs.

```conf
# rsyslog forwarding critical auth/audit events to a
# write-only central collector — the app host has no
# credentials that can touch the collector's storage
auth,authpriv.*  @@log-collector.internal:6514
local1.*         @@log-collector.internal:6514

# and locally: don't let a full disk silently drop events
$ActionQueueType         LinkedList
$ActionQueueFileName     fwdAuthQueue
$ActionResumeRetryCount  -1
$ActionQueueSaveOnShutdown on
```

The security property that matters here isn't encryption in transit (nice to have) or even the collector being "secure" in the abstract — it's that the *source host has no write access to delete or rewrite what it already sent*. One-way data flow. If the box gets popped after the log left, the log doesn't care.

## Make tampering detectable even where you can't prevent it

You can't always get write-once storage everywhere — sometimes you're stuck with a log store an on-call engineer can technically edit. In that case, the fallback is a hash chain: each log entry embeds a hash of the previous entry, so altering or deleting anything downstream breaks the chain in a way that's trivially checkable later.

```python
import hashlib, json

def append_entry(prev_hash: str, event: dict) -> tuple[str, dict]:
    entry = {
        "event": event,
        "prev_hash": prev_hash,
    }
    digest = hashlib.sha256(
        json.dumps(entry, sort_keys=True).encode()
    ).hexdigest()
    entry["hash"] = digest
    return digest, entry

# verification just walks the chain and recomputes
def verify_chain(entries: list[dict]) -> bool:
    prev = "0" * 64
    for e in entries:
        expected = hashlib.sha256(
            json.dumps({"event": e["event"], "prev_hash": prev}, sort_keys=True).encode()
        ).hexdigest()
        if expected != e["hash"] or e["prev_hash"] != prev:
            return False
        prev = e["hash"]
    return True
```

This isn't blockchain cosplay — it's a decades-old technique (think Merkle-style chaining) applied to a boring log file. It doesn't stop someone from deleting the last N entries wholesale, but it does mean silent, surgical edits to the middle of your history become mathematically obvious instead of requiring a diff against a backup nobody trusts either.

If you're on cloud infra, you often get this for less code than the snippet above: S3 Object Lock in compliance mode, CloudTrail log file validation, or a WORM-configured bucket policy will do the "nobody, including root, can quietly edit this" job for you. Use the managed primitive before you hand-roll one.

## What actually gets asked in the room afterward

When we ran a tabletop at Cubet simulating a compromised CI runner, the question that stalled the room wasn't "how did they get in" — we had good guesses within an hour. It was "can we prove they didn't also touch the artifact signing step," and the honest answer, before we fixed our pipeline, was "not with confidence." That gap — not being able to *prove a negative* during an incident — is exactly what durable, tamper-evident audit logging is for. You're not just logging for the incident you expect; you're logging so that six months from now, when someone asks "are we sure it stopped there," you have a receipt instead of a shrug.

Test this the boring way: pick a critical service, pretend it's fully compromised right now, and ask what evidence physically cannot be deleted by whoever has root on it. If the answer is "all of it, actually," you're in better shape than most teams I've walked through this exercise with.

What's your team's answer to that question? Tell me on [Twitter/X](https://twitter.com/kpanuragh) or check out more posts on [GitHub](https://github.com/kpanuragh) — always curious how other teams have wired up their log pipelines to survive the day they're actually needed.
