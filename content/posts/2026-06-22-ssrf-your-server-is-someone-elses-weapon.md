---
title: "🎯 SSRF: Your Server Is Someone Else's Weapon"
date: "2026-06-22"
excerpt: "Server-Side Request Forgery turns your own backend into an attacker's proxy. Here's how it works, why it's devastating in cloud environments, and how to stop it before someone uses your EC2 instance to call your own metadata API."
tags:
  - security
  - web-vulnerabilities
  - ssrf
  - nodejs
  - cloud-security
featured: true
---

There's a category of bug that security researchers love and developers routinely dismiss — until it shows up in a breach post-mortem. Server-Side Request Forgery (SSRF) sits comfortably in that category. It sounds abstract, the CVE descriptions are dry, and the initial PoC is usually just curling `http://localhost`. But hand it to a motivated attacker in a cloud environment, and you've handed them the keys to your kingdom.

Let me explain why — and how to take those keys back.

## What SSRF Actually Is

SSRF happens when your server fetches a URL on behalf of a user-supplied input, without validating *where* that URL points. The attacker doesn't need to talk to your internal services directly. They get *your server* to do it for them.

Classic scenario: your app has a "preview this link" feature, a webhook tester, an image importer that accepts a URL, or a PDF generator that renders pages by URL. The developer thinks: "users give us a URL, we fetch it." The attacker thinks: "I'll give them `http://169.254.169.254/latest/meta-data/iam/security-credentials/` and see what comes back."

That IP — `169.254.169.254` — is the AWS EC2 Instance Metadata Service (IMDS). It's reachable from *inside* any EC2 instance but not from the public internet. If your server is on EC2 and you fetch that URL for an attacker, you've just leaked your instance's IAM credentials. Game over.

## A Minimal Vulnerable Example

```javascript
// Express endpoint — "fetch a URL and return its content"
app.get('/preview', async (req, res) => {
  const { url } = req.query;
  
  // No validation. Just trust the user. What could go wrong?
  const response = await fetch(url);
  const body = await response.text();
  
  res.send(body);
});
```

Now hit it with:

```
GET /preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/my-role
```

Your server dutifully fetches the metadata endpoint and returns the temporary AWS credentials — `AccessKeyId`, `SecretAccessKey`, `Token` — to the attacker. They can now call AWS APIs as your application role until the credentials rotate (typically an hour, which is *plenty*).

This isn't theoretical. The Capital One breach in 2019 involved exactly this pattern via a misconfigured WAF that made outbound requests. The blast radius: 100 million credit card applications exposed.

## Why Cloud Makes It Catastrophic

On-premise, SSRF might let you port-scan internal networks or hit Redis without auth. Bad enough. But in cloud environments, the metadata endpoint is a skeleton key:

- **AWS IMDS** at `169.254.169.254` or `fd00:ec2::254` (IPv6) — returns IAM credentials, user data (often contains secrets), and instance identity documents.
- **GCP metadata** at `metadata.google.internal` or `169.254.169.254` — similar story.
- **Azure IMDS** at `169.254.169.254` (again!) — managed identity tokens.

AWS introduced IMDSv2, which requires a PUT-then-GET flow with a session token. It's significantly harder to exploit via SSRF. But it's *opt-in*, and plenty of EC2 instances still run IMDSv1.

At Cubet, we now enforce IMDSv2 via a Terraform `metadata_options` block on every EC2 module. It's a one-liner that eliminates an entire class of SSRF damage. The real question is: why isn't it the default everywhere?

## The Fix: Allowlists Over Blocklists

The naive fix is to blocklist known dangerous IPs:

```javascript
// Don't do this — it's a cat-and-mouse game
const BLOCKED = ['169.254.169.254', 'localhost', '127.0.0.1'];
const hostname = new URL(url).hostname;
if (BLOCKED.includes(hostname)) return res.status(400).send('Nope');
```

This fails for dozens of reasons: IPv6 equivalents, decimal IP notation (`2130706433` is `127.0.0.1`), DNS rebinding, redirects that resolve to internal IPs after the check. Blocklists are security theater here.

The correct fix is an **allowlist**:

```javascript
import { URL } from 'url';
import dns from 'dns/promises';
import ipRangeCheck from 'ip-range-check';

const PRIVATE_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '169.254.0.0/16',  // link-local (metadata endpoints)
  '::1/128',
  'fc00::/7',
];

async function isSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Only allow https (or http if you must)
  if (!['https:', 'http:'].includes(parsed.protocol)) return false;

  // Resolve the hostname to IPs and check every one
  const addresses = await dns.resolve(parsed.hostname).catch(() => []);
  if (addresses.length === 0) return false;

  for (const addr of addresses) {
    if (ipRangeCheck(addr, PRIVATE_RANGES)) return false;
  }

  return true;
}

app.get('/preview', async (req, res) => {
  const { url } = req.query;
  if (!(await isSafeUrl(url))) {
    return res.status(400).json({ error: 'URL not allowed' });
  }
  
  // Fetch with a short timeout and no redirect following
  const response = await fetch(url, {
    redirect: 'error',   // don't follow redirects — rebinding risk
    signal: AbortSignal.timeout(5000),
  });
  res.send(await response.text());
});
```

Critical: **disable redirect following**. An attacker can point you at their own server, which redirects to the metadata endpoint *after* your DNS check passes. Never follow redirects blindly in user-initiated fetches.

## Other Places SSRF Hides

You're not just looking for explicit "fetch this URL" endpoints. SSRF shows up in:

- **PDF/screenshot generators** (Puppeteer, wkhtmltopdf) rendering user-supplied HTML with `<img src>` or `<iframe src>`.
- **XML parsers** loading external entity URLs (XXE is a flavour of SSRF).
- **Webhook receivers** that verify the destination by pinging it.
- **Image proxy services** — practically designed for SSRF.
- **OAuth callback URL validation** that isn't strict enough.
- **Any feature that imports/migrates content from a URL**.

Run a search in your codebase for `fetch(`, `axios.get(`, `http.get(`, `curl`, `file_get_contents` (PHP), `urllib.request` (Python) — anywhere a URL flows from user input to an outbound request, ask whether that URL is validated.

## Quick Wins Right Now

1. **Enforce IMDSv2** on all EC2 instances via `http_tokens = "required"` in Terraform.
2. **Audit user-controlled URL inputs** — every one is a potential SSRF vector.
3. **Use a DNS-rebinding-resistant HTTP client** or wrap your fetch with the IP validation above.
4. **Disable unnecessary URL-fetching features** entirely if they're not core to the product.
5. **Set egress firewall rules** — your app servers shouldn't be able to call arbitrary internal endpoints.

SSRF is one of those vulnerabilities where defense-in-depth actually matters: even if your validation slips, network controls can limit the blast radius. Neither layer alone is sufficient.

The bug isn't flashy. There's no shellcode, no memory corruption. It's just your server fetching a URL it shouldn't. That simplicity is exactly why it gets past code review — and exactly why attackers love it.

---

Spotted an SSRF in the wild? Or have a horror story about a metadata credential leak? Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — I'd love to hear how it played out (and whether IMDSv2 would have saved the day).
