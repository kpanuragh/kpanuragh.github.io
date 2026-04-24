---
title: "🕵️ SSRF: When Your Server Becomes the Attacker"
date: "2026-04-24"
excerpt: "Server-Side Request Forgery sounds complicated, but the concept is delightfully evil: trick a server into making HTTP requests *it* shouldn't be making, then read what comes back. It took down Capital One. It lives in your URL-fetching code. Let's fix that."
tags: ["security", "ssrf", "cloud-security", "owasp", "aws", "cybersecurity", "web-security"]
featured: true
---

# 🕵️ SSRF: When Your Server Becomes the Attacker

Here's a thought experiment.

You've got a feature where users paste a URL and your server fetches a preview — a thumbnail, some metadata, an OpenGraph title. Totally normal. Every major platform has one.

Now imagine an attacker pastes this URL:

```
http://169.254.169.254/latest/meta-data/iam/security-credentials/my-ec2-role
```

Your server, helpfully, fetches it. And hands back the AWS IAM credentials for the role your EC2 instance is running as. Including `AccessKeyId`, `SecretAccessKey`, and `Token`.

That's Server-Side Request Forgery. And that exact attack pattern — exploiting the AWS metadata endpoint — was the technique behind the **2019 Capital One breach**, which exposed over 100 million customer records.

Your link-preview feature just handed someone the keys to your cloud.

---

## What's Actually Happening

SSRF is an attack where an adversary tricks your server into making HTTP requests on their behalf — to destinations *your server* can reach, but the attacker normally can't.

The attacker doesn't need to talk to `169.254.169.254` directly. They can't — that IP is link-local, only reachable from within the EC2 instance itself. But *your server* can reach it, and you just gave the attacker a remote control for your server's HTTP client.

Beyond the metadata endpoint, the same pattern hits:
- **Internal APIs** — `http://internal-api.corp/admin/users`
- **Cloud provider services** — GCP and Azure have their own metadata endpoints
- **Docker sockets** — `http://localhost:2375/containers/json`
- **Redis, Memcached, Elasticsearch** — services bound to `127.0.0.1` that have no auth because "nothing external can reach them"

The common thread: your server has access to a network that the attacker doesn't. SSRF turns your server into a proxy into that network.

---

## The Vulnerable Code Looks Innocent

Here's what SSRF looks like in a real-world Node.js link-preview endpoint:

```javascript
// 🚨 Vulnerable — user controls the URL entirely
app.post('/api/preview', async (req, res) => {
  const { url } = req.body;
  
  // "Just fetch the URL the user gave us" — famous last words
  const response = await fetch(url);
  const html = await response.text();
  
  // Parse and return title/description...
  res.json({ title: parseTitle(html) });
});
```

This is exactly the kind of code that ships because it *works* — it does what the feature description says. The problem is it works equally well for `https://example.com` and for `http://192.168.1.1/admin`.

The fix isn't to remove the feature. It's to validate where the request is actually going.

---

## The Fix: Validate Before You Fetch

There are two layers of defense here, and you want both.

**Layer 1: Allowlist or block dangerous destinations before fetching.**

```javascript
const { URL } = require('url');
const dns = require('dns').promises;
const net = require('net');

const BLOCKED_RANGES = [
  /^127\./,           // Loopback
  /^10\./,            // RFC 1918 private
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC 1918 private
  /^192\.168\./,      // RFC 1918 private
  /^169\.254\./,      // Link-local (AWS metadata!)
  /^::1$/,            // IPv6 loopback
  /^fc00:/,           // IPv6 unique local
];

async function isSafeUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false; // Not a valid URL
  }

  // Only allow HTTPS
  if (parsed.protocol !== 'https:') return false;

  // Resolve the hostname to an IP and check it
  const addresses = await dns.resolve4(parsed.hostname).catch(() => []);
  for (const ip of addresses) {
    if (BLOCKED_RANGES.some(re => re.test(ip))) return false;
  }

  return addresses.length > 0;
}

app.post('/api/preview', async (req, res) => {
  const { url } = req.body;

  if (!(await isSafeUrl(url))) {
    return res.status(400).json({ error: 'Invalid or disallowed URL' });
  }

  const response = await fetch(url);
  // ...
});
```

**Important caveat**: DNS rebinding attacks can still beat this pattern. An attacker registers a domain that resolves to a public IP during your validation check, then switches the DNS record to `169.254.169.254` before the actual `fetch()` fires. The window is tiny but real.

**Layer 2: Disable redirect following and enforce a timeout.**

```javascript
const response = await fetch(url, {
  redirect: 'error',     // Don't follow redirects — they can point to internal IPs
  signal: AbortSignal.timeout(3000),  // Don't hang waiting for slow internal services
});
```

Redirects are a classic SSRF bypass: your validation approves `https://legit.example.com`, which then 301s to `http://169.254.169.254/...`. Blocking redirects eliminates that vector.

---

## Cloud-Specific: Just Turn Off IMDSv1

If you're on AWS, the simplest mitigation for the metadata endpoint attack is to require **IMDSv2**, which demands a session token obtained via a PUT request — something a simple SSRF fetch can't do. You can enforce this at the instance level or in your launch template:

```bash
# Enforce IMDSv2 on an existing instance
aws ec2 modify-instance-metadata-options \
  --instance-id i-xxxxxxxxxxxxxxxxx \
  --http-tokens required \
  --http-endpoint enabled
```

With IMDSv2 required, a GET to `169.254.169.254` returns a 401 instead of your credentials. The Capital One breach happened partly because IMDSv2 didn't exist yet — you have no such excuse.

---

## Why SSRF Is in the OWASP Top 10 Now

SSRF was added as its own category in OWASP Top 10 2021 — it used to be buried under "Security Misconfiguration." The reason it got promoted: the explosion of cloud infrastructure.

In a cloud environment, your servers have implicit trust relationships with:
- Instance metadata services (AWS, GCP, Azure, DigitalOcean all have them)
- VPC-internal services with no external exposure
- IAM roles that grant broad permissions because "it's just internal"

A simple SSRF bug that would've been low-impact on bare metal can be a full cloud account takeover in a modern environment. The blast radius went from "maybe they read some internal docs" to "they can spin up mining rigs on your AWS bill."

---

## Your Action Items

1. **Search your codebase** for anywhere you `fetch`, `curl`, `requests.get`, `HttpClient.get`, or similar with user-controlled input going to the URL parameter.
2. **Add the IP blocklist validation** before any server-side URL fetch, especially in link preview, webhook, import-from-URL, and PDF-generation features.
3. **Block redirects** on server-side HTTP clients used with external URLs.
4. **Enforce IMDSv2** on all EC2 instances — this is a one-liner and there's no downside.
5. **Restrict outbound traffic** at the network level with security groups or egress firewall rules. Your app server probably shouldn't be able to reach your Redis directly over the internet anyway.

SSRF is one of those vulnerabilities where the attacker's effort is minimal and the reward is potentially catastrophic. The good news: the defenses aren't complicated. Validate the destination, block private ranges, require IMDSv2, and restrict redirects. That's most of the battle.

Don't let your server do the attacker's dirty work for them.

---

Found an SSRF bypass in the wild, or want to share how your company handles link-preview securely? Hit me up on [GitHub](https://github.com/kpanuragh). And if this saved your IAM credentials from ending up in someone's Telegram channel, please share it — your team will thank you. 🛡️
