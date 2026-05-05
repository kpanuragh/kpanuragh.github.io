---
title: "🎭 SSRF: When Your Server Becomes the Hacker's Puppet"
date: 2026-05-05
excerpt: "Server-Side Request Forgery is the attack behind the Capital One breach, countless cloud credential leaks, and a whole lot of red-faced engineers. If your app fetches URLs, you need to read this."
tags: ["security", "ssrf", "api", "cloud", "cybersecurity", "owasp"]
featured: true
---

Picture this: you build a nice little feature — a URL preview tool, a webhook fetcher, a PDF generator that renders remote images. Users paste in a URL, your server fetches it, magic happens.

Seems harmless, right?

Until someone pastes in `http://169.254.169.254/latest/meta-data/iam/security-credentials/` and your server dutifully fetches the AWS instance metadata, handing over cloud credentials on a silver platter.

Welcome to **Server-Side Request Forgery (SSRF)** — OWASP Top 10 since 2021, responsible for some of the most spectacular cloud breaches of the last decade, and criminally underappreciated in security education compared to its flashier cousins XSS and SQL injection.

## What Is SSRF, Exactly?

SSRF happens when an attacker can make *your server* send HTTP requests to arbitrary destinations — destinations that the attacker couldn't reach directly, but your server can.

The classic setup looks like this:

1. Your app accepts a URL from the user: `https://yourapp.com/fetch?url=<HERE>`
2. Your server-side code makes an HTTP request to that URL
3. The attacker supplies an *internal* URL instead of an external one
4. Your server — sitting comfortably inside the network perimeter — happily fetches it

Suddenly the attacker has your server acting as a proxy into your internal network. They can hit internal services, cloud metadata endpoints, databases with HTTP APIs, admin dashboards that "don't need auth because they're not exposed to the internet" — all the things that were only safe because they were private.

## The Capital One Heist

In 2019, Capital One suffered a breach exposing 100 million customer records. The root cause? SSRF combined with an overly permissive IAM role.

The attacker found an SSRF vulnerability in a misconfigured WAF (Web Application Firewall) running on an EC2 instance. They used it to query the AWS Instance Metadata Service (IMDS):

```
GET http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

That endpoint — only reachable from within the instance — returned the name of the attached IAM role. One more request grabbed the temporary credentials for that role. The role had `s3:GetObject` on basically everything. The rest is infosec history and a $80 million FTC settlement.

The `169.254.169.254` address is a magical internal endpoint every major cloud provider exposes on every VM. It exists so applications can bootstrap their identity and config. It is also the most-targeted SSRF destination in existence.

## What Vulnerable Code Looks Like

Here's the kind of code that gets you into trouble:

```javascript
// Express route — looks innocent, is a disaster
app.get('/preview', async (req, res) => {
  const { url } = req.query;

  // "Users will only put real URLs here" — famous last words
  const response = await fetch(url);
  const html = await response.text();

  res.json({ preview: extractTitle(html) });
});
```

No validation. No allowlist. No nothing. An attacker hits:

```
GET /preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role
```

And your server returns your cloud credentials in the response. Or they hit `http://localhost:6379` and probe your Redis instance. Or `http://internal-admin.company.local` and start mapping your internal network.

## Fixing It: Defense in Depth

There's no single silver bullet — SSRF defense is layers. Here's the stack:

**Layer 1: Validate the URL before you fetch it**

```javascript
import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,   // link-local / cloud metadata
  /^::1$/,         // IPv6 loopback
  /^fc00:/i,       // IPv6 private
];

async function isSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Only allow HTTP/HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;

  // Resolve the hostname to an IP
  const addresses = await dns.resolve4(parsed.hostname).catch(() => []);
  if (addresses.length === 0) return false;

  // Reject private/internal IP ranges
  for (const addr of addresses) {
    if (PRIVATE_RANGES.some(re => re.test(addr))) return false;
  }

  return true;
}

app.get('/preview', async (req, res) => {
  const { url } = req.query;

  if (!(await isSafeUrl(url))) {
    return res.status(400).json({ error: 'Invalid or disallowed URL' });
  }

  const response = await fetch(url);
  // ...
});
```

**Important caveat:** DNS can lie. An attacker can register a domain that resolves to a public IP during your validation check, then switches to `127.0.0.1` before the actual fetch (DNS rebinding). The check above reduces your attack surface massively but isn't airtight on its own.

**Layer 2: Block at the network level**

IP-level validation in code is good. Not allowing your app server to reach internal endpoints at all is better. Use security groups, firewall rules, or VPC policies to prevent your app instances from making requests to internal services they have no business talking to.

On AWS specifically: migrate to IMDSv2, which requires a PUT request with a session token before any metadata is accessible — it's immune to simple SSRF.

**Layer 3: Least-privilege IAM**

Even if someone pulls off the SSRF and hits the metadata endpoint, if the attached IAM role only has `s3:GetObject` on one specific bucket, the blast radius is contained. The Capital One incident was SSRF *plus* excessive permissions. Fix both halves.

## The SSRF Red Flags Checklist

Before you ship any feature that makes outbound HTTP requests on behalf of users, ask:

- [ ] Can a user control any part of the URL being fetched?
- [ ] Is the destination validated before fetching (protocol, hostname, resolved IP)?
- [ ] Could an internal IP, `localhost`, or cloud metadata endpoint be supplied?
- [ ] Does your server have network access it doesn't need (firewall rules checked)?
- [ ] Are cloud metadata services protected (IMDSv2 enabled on AWS)?
- [ ] If an attacker stole your instance credentials, what could they do? (IAM least-privilege)

Features that commonly introduce SSRF risk: webhook receivers, URL preview / Open Graph fetchers, PDF generators with remote images, proxy endpoints, import-from-URL tools, and health check systems that ping user-supplied endpoints.

## The Uncomfortable Truth

SSRF is insidious because it hides inside *useful features*. Webhook support is legitimately useful. URL previews delight users. PDF generation is a business requirement. The vulnerability isn't in wanting those features — it's in implementing them without thinking through the threat model.

Every time your server touches a URL it didn't generate itself, ask: "What happens if this URL points somewhere I didn't expect?" Then build accordingly.

The good news: proper SSRF defense is not complicated. It's mostly just validating URLs (really validating them, not just checking that they start with `https://`) and applying network-level restrictions. A few hours of work prevents the kind of breach that generates congressional testimony.

---

Built something with outbound HTTP requests and now questioning your life choices? I've been there. Share your war stories or questions on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — the best security lessons come from the embarrassing ones.

Stay safe out there. Your metadata endpoint is counting on it.
