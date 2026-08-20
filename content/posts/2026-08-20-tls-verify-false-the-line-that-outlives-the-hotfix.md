---
title: "🔓 TLS verify=False: The Line That Outlives the Hotfix"
date: "2026-08-20"
excerpt: "Someone disabled certificate verification at 2am to unblock a deploy. Eighteen months later it's still there, quietly waving every man-in-the-middle attack through your service mesh with a smile."
tags:
  - security
  - tls
  - cryptography
  - secrets-management
  - infrastructure
  - devops
featured: true
---

# 🔓 TLS verify=False: The Line That Outlives the Hotfix

Every TLS misconfiguration horror story starts the same way: not with malice, not with ignorance, but with a deadline. Something is broken at an inconvenient hour, someone finds a one-line fix, and that line ships to production wearing a `// TODO: revert this` comment that nobody will ever read again.

The line is almost always some flavor of this:

```python
import requests

# TODO: revert this before Friday
response = requests.get("https://internal-billing-api.corp", verify=False)
```

or its cousin in every other language:

```js
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false }); // temp fix, revisit
```

```go
tr := &http.Transport{
    TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // FIXME
}
```

That single flag turns TLS from "cryptographically verified channel" into "encrypted channel to whoever answers on port 443, no questions asked." The traffic is still encrypted — that part still works, and it's exactly why this bug is so good at hiding. Nothing looks wrong in a packet capture. The padlock icon (if there even is one, since this is usually service-to-service) shows green. But the client will now happily hand its bearer token, its session cookie, or its database credentials to anyone who can get between it and the real server — a compromised load balancer, a poisoned DNS entry, a rogue Wi-Fi AP if this is a mobile app, or an attacker who just spun up a lookalike hostname.

## Why It Always Starts as a "Temporary" Fix

Nobody sits down and decides to skip certificate validation. It happens because certificate validation is the thing that breaks first and loudest when anything else is wrong:

- A self-signed cert on an internal service that never got a proper CA chain.
- An expired intermediate cert that nobody was watching (see: half the internet's outage postmortems).
- A hostname mismatch because the SAN list wasn't updated after a rename.
- A corporate TLS-inspecting proxy injecting its own root cert that the client doesn't trust.

Every one of these produces the exact same panic-inducing exception (`SSLCertVerificationError`, `CERT_HAS_EXPIRED`, `x509: certificate signed by unknown authority`), and the exact same Stack Overflow answer sits at the top of the search results: pass `verify=False`. It fixes the symptom in thirty seconds. It does not fix the cause. And because it fixes the symptom, the incentive to go back and fix the cause quietly evaporates — the alert stops firing, the on-call closes the ticket, and the flag becomes load-bearing infrastructure nobody remembers is there.

At Cubet, we caught one of these during a routine dependency audit rather than an incident — a background worker that synced data from a partner API had `rejectUnauthorized: false` sitting in a config object that had been copy-pasted into three other services since. None of the three had the same excuse for needing it; the flag had just been inherited along with the boilerplate. That's the real danger of this bug: it doesn't stay in one place. It gets copied.

## Finding These Before an Auditor Does

You cannot rely on someone remembering where they left the flag. Grep for it as a matter of routine, not just during incident response:

```bash
grep -rniE 'verify\s*=\s*False|rejectUnauthorized\s*:\s*false|InsecureSkipVerify\s*:\s*true|ssl_verify\s*=\s*0' \
  --include='*.py' --include='*.js' --include='*.ts' --include='*.go' --include='*.rb' .
```

Better than grepping after the fact: fail the build on it. A pre-commit hook or a CI lint rule that greps the diff for these patterns costs you almost nothing and catches the "quick fix" before it becomes permanent tenancy. Pair that with actual certificate monitoring — something as simple as a cron job hitting your internal services and alerting when expiry drops below 14 days — so the *reason* someone reaches for `verify=False` never comes up in the first place.

```bash
# crude but effective expiry check, good enough for a cron job
echo | openssl s_client -servername internal-billing-api.corp \
  -connect internal-billing-api.corp:443 2>/dev/null \
  | openssl x509 -noout -enddate
```

## The Fix Is Rarely the Flag

If you inherit one of these, resist the urge to just delete the flag and call it done — that usually just moves the outage from "silent security hole" to "loud production incident" because the underlying cert problem was never actually solved. Trace it back:

1. Is the internal CA's root cert actually installed in the trust store the client is using? (Containers rebuilt `FROM scratch` or slim base images are a classic culprit — the OS cert bundle just isn't there.)
2. Does the certificate's SAN list actually include the hostname being connected to, not just the one it had two renames ago?
3. If it's a corporate MITM proxy for outbound traffic, is the proxy's root CA in the bundle you're actually loading, or in some other bundle that isn't wired up?

Fix the trust chain, then remove the flag, then watch the build fail loudly if anyone tries to bring it back.

## The Takeaway

TLS verification isn't a formality bolted onto encryption — it's the half of TLS that actually stops impersonation. An encrypted-but-unverified connection is a very expensive way to talk to an attacker. If your codebase has a `verify=False` anywhere, it's not a TODO. It's a standing invitation, and it's been open since whatever Friday it was written.

Found one of these lurking in your own stack? I'd genuinely like to hear about it — swap war stories with me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp/). And if this saved you a grep session, share it with the teammate who wrote the flag in the first place.
