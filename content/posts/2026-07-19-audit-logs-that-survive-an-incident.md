---
title: "Audit Logs That Survive An Incident (Instead Of Getting Deleted With Everything Else) 🔥📜"
date: "2026-07-19"
excerpt: "Every incident response plan assumes the logs will be there when you need them. Here's why attackers delete logs first, and how to build an audit trail that's still readable after someone tries to burn it down."
tags:
  - security
  - incident-response
  - logging
  - devops
featured: true
---

Here's a fun exercise: next time you're in an incident retro, ask "if the attacker had root on this box for ten minutes before we noticed, would our logs still tell us what happened?" Watch the room go quiet.

Most teams build audit logging like they're preparing for a compliance checkbox, not an actual breach. Logs sit on the same host as the application. Rotation deletes anything older than a week. Write access to `/var/log` belongs to the same user the app runs as. Which means the exact person with the motive and means to cover their tracks — an attacker with a foothold — is also the person with permission to `rm -rf` the evidence. That's not an audit trail. That's a suicide note the app writes about itself, that the intruder gets to shred before anyone reads it.

I've sat in enough post-incident reviews to know the sentence that kills momentum every time: "we think it happened around here, but the logs from that window are gone." Not corrupted, not misleading — gone. And once that gap exists, every conclusion after it is a guess dressed up as a finding.

## Why attackers go for the logs first

If you've read any real-world intrusion writeup, the pattern repeats: get a foothold, escalate, then touch logging *before* touching anything valuable. `auth.log` gets truncated. CloudTrail gets a delete-trail API call. Shell history gets `unset HISTFILE`'d. This isn't paranoia on the attacker's part — it's just efficient. Deleting the paper trail is cheaper than being clever enough to leave no trace, and most environments make it trivially easy because logs are mutable, local, and owned by the same identity that got popped.

The fix isn't "log more." It's "make logs a write-once artifact that lives somewhere the compromised system can't reach." Three properties matter more than volume:

1. **Off-host, immediately.** If the log only exists on the box, the box's compromise is also the log's compromise.
2. **Append-only at the destination**, not just at the source.
3. **Integrity-checkable** — so even if someone *can* write to the store, you can prove whether they did.

## Ship logs before the app can lie about them

The boring, high-leverage move is to stop treating log shipping as a nice-to-have sidecar and treat it as part of the security boundary. On one project at Cubet, we moved from "app writes to disk, Filebeat tails it eventually" to forwarding auth and API-gateway events synchronously to a separate account with its own IAM boundary — no delete permission granted to any role the application itself can assume:

```json
{
  "Effect": "Deny",
  "Action": [
    "logs:DeleteLogGroup",
    "logs:DeleteLogStream",
    "logs:PutRetentionPolicy",
    "s3:DeleteObject",
    "s3:PutBucketLifecycleConfiguration"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:PrincipalArn": "arn:aws:iam::LOGGING_ACCOUNT:role/log-admin"
    }
  }
}
```

The app's own credentials can `PutLogEvents` all day. They cannot delete, cannot shorten retention, cannot touch lifecycle rules. That single deny policy, attached in a separate account, means a fully-owned app server still can't erase what it already shipped.

## Make tampering provable, not just prevented

Even with write-once storage, you want to be able to answer "was anything altered before it left the source host?" — because sometimes the attacker gets there before your shipper does. A cheap trick: hash-chain your log entries so each line commits to the one before it, the same idea behind a blockchain minus the marketing:

```python
import hashlib, json

def append_entry(prev_hash: str, event: dict) -> tuple[str, dict]:
    payload = json.dumps(event, sort_keys=True)
    digest = hashlib.sha256((prev_hash + payload).encode()).hexdigest()
    entry = {**event, "prev_hash": prev_hash, "hash": digest}
    return digest, entry
```

Now splicing out a single line — the classic move to hide one bad login or one privileged command — breaks the chain from that point forward. You don't need this for every log stream, but for auth events, privilege escalations, and admin actions, it turns "did someone edit this" from a forensic guess into a one-line verification.

## The test that actually matters

Don't just ship logs and assume you're covered — run the drill. Pick a service, simulate a compromised host (revoke local write access, or literally `rm` the local log file), and confirm: can you still reconstruct the last hour of activity from the remote store alone? If the answer involves anyone saying "let me check if that made it over before the box died," you've found your gap before an attacker did, which is exactly the point of a fire drill.

Audit logs are insurance. Nobody wants to pay the premium until the day they desperately need the payout — and that's precisely the day you find out whether the policy was ever real.

---

Got a war story about logs that vanished right when you needed them, or a setup you're proud of? I'd love to hear it — find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
