---
title: "🌐 DNS Rebinding: Your Localhost Is Not as Private as You Think"
date: "2026-04-12"
excerpt: "You spin up a dev server on localhost:3000 and think you're safe from the internet. You're not. DNS rebinding lets attackers reach your 'private' services through a browser tab. Here's how it works and how to stop it."
tags: ["security", "networking", "nodejs", "backend"]
featured: true
---

# 🌐 DNS Rebinding: Your Localhost Is Not as Private as You Think

**Pop quiz:** You're running a local service on `http://localhost:8080`. It has zero authentication because — well — it's *localhost*. Nobody from the internet can reach it, right?

**Wrong.** 😬

DNS rebinding is one of those attacks that sounds like black magic the first time you hear it. An attacker on the *public internet* can reach services bound to your `127.0.0.1`. No VPN. No port forwarding. Just a malicious webpage and a patient attacker.

This isn't theoretical. In 2018, researchers used DNS rebinding to compromise **700,000+ home routers** in a matter of hours. Kubernetes dashboard? Exposed. Internal CI/CD APIs? Reachable. Cloud metadata endpoints? Absolutely pwned.

Let me show you exactly how it works — and more importantly, how to make your apps immune to it.

## How DNS Rebinding Actually Works 🧠

The browser's Same-Origin Policy (SOP) is supposed to protect you. A page from `evil.com` can't make requests to `your-bank.com` — different origins, request blocked.

DNS rebinding exploits a gap: **SOP checks the hostname, not the IP address.** And the attacker controls what IP their hostname resolves to.

Here's the attack in slow motion:

```
1. Victim visits evil.com in their browser
2. evil.com resolves to attacker's server (203.0.113.1)
   → Browser caches DNS record with TTL = 1 second
3. Attacker serves a page with JavaScript
4. After 1 second, TTL expires, browser re-resolves evil.com
5. Attacker's DNS server now returns 127.0.0.1 (victim's localhost!)
6. Browser re-resolves and updates its cache
7. The malicious JS makes a request to evil.com (same origin)
   → But now evil.com resolves to localhost!
8. Browser happily forwards the request to localhost:3000
9. Response goes back to the attacker's JS
10. Attacker reads your "private" local service. Gg. 🎉
```

The key insight: **the browser validates same-origin at the hostname level, not the IP level.** Once the attacker rebinds their domain to `127.0.0.1`, every request to that domain goes straight to your localhost — and the browser considers it completely legitimate.

## A Real Attack Target: Cloud Metadata APIs 🔥

This isn't just a local dev problem. Cloud providers expose instance metadata at a "well-known" internal IP:

```bash
# AWS metadata endpoint (only reachable from within the instance)
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/

# Response: Your AWS credentials! 🔑
# {
#   "AccessKeyId": "ASIA...",
#   "SecretAccessKey": "wJalrXUtnFEMI...",
#   "Token": "AQoXnyc..."
# }
```

AWS eventually added IMDSv2 (token-based) to block this. But in 2019, **Capital One's breach** was partly attributed to SSRF hitting this exact endpoint. DNS rebinding is SSRF from the browser — same target, different delivery mechanism.

## Vulnerable Code: The "It's Only Localhost" Trap 🪤

Here's the mistake I used to make all the time when building local dev tools:

```javascript
// server.js — "Safe" local development server
const express = require('express');
const app = express();

// No auth needed — it's localhost, duh!
app.get('/api/config', (req, res) => {
  res.json({
    dbPassword: process.env.DB_PASSWORD,
    apiKey: process.env.SECRET_API_KEY,
    adminToken: process.env.ADMIN_TOKEN,
  });
});

app.get('/api/admin/reset', (req, res) => {
  // Reset all users — admin-only action
  db.query('DELETE FROM sessions');
  res.json({ ok: true });
});

// Listening on all interfaces
app.listen(3000, '0.0.0.0', () => {
  console.log('Dev server running on :3000');
});
```

**Three red flags:**
1. No authentication (trusting network location instead)
2. `0.0.0.0` — listening on ALL interfaces including external ones
3. Sensitive data served without validation

An attacker just needs you to open their webpage for 2 seconds while this is running.

## The Fix: Host Header Validation 🛡️

The most reliable defense against DNS rebinding is checking the `Host` header on every request. Your server bound to `localhost` should *only* accept requests with a `Host` of `localhost` or `127.0.0.1` — not `evil.com`.

```javascript
// server.js — DNS rebinding resistant
const express = require('express');
const app = express();

// Allowed hostnames for this local service
const ALLOWED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',         // IPv6 loopback
]);

// Middleware: reject requests with unexpected Host headers
function rejectDnsRebinding(req, res, next) {
  const host = req.headers['host'] || '';
  
  // Strip port number for comparison
  const hostname = host.split(':')[0].toLowerCase();

  if (!ALLOWED_HOSTS.has(hostname)) {
    console.warn(`Rejected request with Host: ${host} from ${req.ip}`);
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid Host header — possible DNS rebinding attack',
    });
  }

  next();
}

app.use(rejectDnsRebinding);

// Now safe — attacker's domain won't match 'localhost'
app.get('/api/config', (req, res) => {
  res.json({ message: 'Only reachable from localhost!' });
});

// Bind to loopback only — not 0.0.0.0!
app.listen(3000, '127.0.0.1', () => {
  console.log('Server on 127.0.0.1:3000 only');
});
```

When the DNS-rebinding attack fires, the browser sends `Host: evil.com` — and your middleware catches it. The attacker gets a 403. Game over. 🎯

## Bind to Loopback, Not All Interfaces

Half the battle is just binding correctly:

```bash
# BAD: Reachable from your entire network (and via DNS rebinding)
node server.js  # defaults to 0.0.0.0

# GOOD: Reachable from this machine only
node server.js --host 127.0.0.1
```

In framework config terms:

```javascript
// Express
app.listen(3000, '127.0.0.1');   // ✅ Loopback only
app.listen(3000, '0.0.0.0');     // ❌ All interfaces

// Vite dev server (vite.config.js)
export default {
  server: {
    host: '127.0.0.1',  // ✅
    // host: '0.0.0.0', // ❌ Exposed to network
  }
};
```

This doesn't fully protect against DNS rebinding (the browser can still send requests that look like they're for `evil.com` but land on `127.0.0.1`), but it removes the extra exposure from your network interface.

## Real-World Targets Developers Should Know About 🎯

DNS rebinding isn't just for CTFs. Here's what attackers actually target:

**Local dev servers:** Webpack, Vite, `rails s`, `php artisan serve` — all commonly expose config, source maps, or admin panels on localhost.

**Router admin panels:** Home routers respond on `192.168.1.1`. If your laptop's on the same network, a DNS rebinding attack from a public webpage can reach your router's management interface.

**Docker desktop API:** The Docker daemon has a management API. If it's exposed locally without TLS, DNS rebinding can send `docker rm` commands through your browser.

**Kubernetes proxy:** Running `kubectl proxy` spins up an unauthenticated API proxy at `localhost:8001`. Every resource in your cluster is one DNS rebind away.

```bash
# This is fine for short-lived use, but don't leave it running!
kubectl proxy --port=8001

# An attacker can now reach:
# http://localhost:8001/api/v1/namespaces/default/secrets
# via DNS rebinding if you have a browser tab open to their site
```

## Defence Checklist ✅

```
Security hardening for local and internal services:

[ ] Bind services to 127.0.0.1, not 0.0.0.0
[ ] Validate the Host header on every request
[ ] Use authentication even for "internal" services
[ ] Set short-lived credentials with minimal scope
[ ] Use IMDSv2 on AWS (token-based metadata API)
[ ] Add HTTPS + TLS certificates even locally (mkcert is great)
[ ] Don't leave dev servers running unattended
[ ] Use a browser extension like "DNS Rebind Protector"
[ ] Enable your router's DNS rebinding protection if available
```

## The 30-Second Mental Model 🧩

If you remember nothing else, remember this:

> **Network location is not authentication.** "Only localhost can reach it" is not a security boundary — it's a courtesy that attackers know how to bypass. Add a real auth layer and validate the Host header.

That unauthenticated debug endpoint you left open "just for local testing"? It's one phishing link away from being a public API. 

DNS rebinding is the attack that teaches you: **private doesn't mean secure**. Treat every service like it's internet-facing, add auth everywhere, and validate Host headers on services that should never be called from arbitrary domains.

---

**Questions about local dev security or network-level attacks?** Hit me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to nerd out.

**Want to see secure server configs and hardened Express setups?** Check my [GitHub](https://github.com/kpanuragh) for production-ready examples.

*P.S. — Go check what port your Kubernetes proxy is running on. Right now. I'll wait.* 🕵️
