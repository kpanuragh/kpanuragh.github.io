---
title: "🍯 Honeypots for the Practical Dev: Catching Attackers With a Fake Admin Panel"
date: "2026-08-09"
excerpt: "You don't need a threat-intel team or a research lab to run a honeypot. A fake login form, a canary API key, and a webhook are enough to turn 'we got breached and found out three weeks later' into 'we got pinged in Slack while the attacker was still poking around.'"
tags:
  - security
  - incident-response
  - honeypots
  - detection-engineering
featured: true
---

Every security team I've worked near has the same nightmare: the breach that gets discovered by a *customer*, three weeks after it happened, via a Have I Been Pwned alert. Not by a WAF rule, not by a SIEM alert, not by anything you built. By someone else noticing your data on a paste site.

The uncomfortable truth is that most breach detection is retroactive. You find the log line after the damage is done, if you find it at all. Honeypots flip that. Instead of trying to detect malicious behavior in a haystack of legitimate traffic, you plant something that has *no legitimate reason to ever be touched* — and the instant it is, you know, with near-zero false positive rate, that something is wrong.

This isn't research-lab stuff. You don't need Cowrie, a fleet of decoy VMs, or a threat-intel subscription. A junior dev with an afternoon can build something genuinely useful. Let's talk about what that looks like in a normal web app, not a security product.

## The Core Idea: Ambient Alarms, Not Active Defense

A honeypot doesn't stop an attacker. It doesn't need to. Its entire value is a tripwire: something exists that only an attacker would interact with, because a legitimate user has no path to it. Legitimate traffic volume is irrelevant — you're not filtering noise, you're watching a wire that should never carry current.

Three flavors cover 90% of what a normal engineering team actually needs:

1. **Canary credentials** — fake API keys, fake DB creds, fake AWS access keys planted where a real one might be found (a `.env.backup`, a Slack export, a public repo commit that "accidentally" leaked). Any *use* of that credential is a 100% confidence signal, because it was never issued to anyone real.
2. **Decoy endpoints** — routes like `/admin`, `/.git/config`, `/wp-login.php` on a stack that has none of those things. Nobody's browser autocompletes its way there. Scanners and manual recon do.
3. **Canary tokens in data** — a fake row in a "customers" table, a fake row in an S3 bucket listing, with an embedded beacon. If it ever gets exfiltrated and opened, you find out.

At Cubet, we ended up leaning on the first two for an internal admin tool that had previously been the target of some very half-hearted credential-stuffing attempts — nothing sophisticated, just bots trying default admin logins because the tool's login page was reachable from the internet. We didn't need to stop that; login rate limiting already did. What we actually wanted was a heads-up the moment anyone got *past* casual scanning into deliberate probing.

## Canary Credentials You Can Build in an Hour

The cheapest, highest-signal honeypot is a fake secret that does one thing when used: pages you.

```javascript
// canary-key.js — a fake AWS key, deliberately "leaked" in a
// stale .env.example that only exists to bait scanners
const CANARY_ACCESS_KEY_ID = "AKIA_CANARY_DO_NOT_USE_44f2";

async function onCanaryKeyUsed(req) {
  await fetch(process.env.ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `🚨 Canary AWS key used from IP ${req.ip} — this key was never issued to anyone`,
      sourceIp: req.ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    }),
  });
}
```

AWS actually makes this close to free: you can create an IAM user with zero permissions attached, generate its access key, and drop it somewhere plausible — an old commit, a misconfigured `.env` in a public gist, a "leaked" internal wiki export. CloudTrail logs every authentication attempt against that key, whether it succeeds or not, and you route that to a Lambda that fires a Slack webhook. AWS even runs its own canary-key-scraping bots that will occasionally trip your own trap and quarantine the key for you — which is a fun way to learn the system works.

The pattern generalizes past AWS. A fake Stripe secret key format, a fake database connection string pointing at a honeypot Postgres instance that logs every query and drops the connection — same idea, same payoff: a credential that has exactly one valid use, which is "sound the alarm."

## Decoy Endpoints: Cheap, Loud, and Framework-Agnostic

If your stack doesn't run WordPress, `/wp-login.php` getting hit is not a false positive waiting to happen — it's a scanner, every single time. Same for `.env`, `/phpmyadmin`, `.git/HEAD`. Wire up a catch-all for the paths automated scanners probe by reflex and log them somewhere you'll actually look.

```javascript
// honeypot-routes.ts — Express example, same idea in any framework
const DECOY_PATHS = [
  "/wp-login.php", "/.env", "/.git/config",
  "/phpmyadmin", "/admin/config.php", "/xmlrpc.php",
];

DECOY_PATHS.forEach((path) => {
  app.all(path, (req, res) => {
    logSecurityEvent({
      type: "honeypot_hit",
      path: req.path,
      ip: req.ip,
      ua: req.get("user-agent"),
    });
    // Waste their time a little; don't reveal it's a trap
    res.status(404).send("Not Found");
  });
});
```

Note the response: a plain 404, not a custom "gotcha, you're on a honeypot" page. The moment an attacker suspects they've been detected, they change behavior — slow down, switch IPs, go quieter. You want the opposite: a boring, indistinguishable dead end that keeps them acting naturally while you're already watching.

The signal quality here is what makes it worth doing. A WAF rule flags things that are *probably* bad and needs tuning against false positives forever. A hit on `/wp-login.php` on a Next.js app is never a false positive. It's a scanner or a human, full stop, and it costs you a handful of route handlers to know that instantly instead of finding it in a log review three weeks from now.

## Where This Fits, and Where It Doesn't

Honeypots are a detection layer, not a prevention layer — pair them with the boring stuff (rate limiting, WAFs, patched dependencies) rather than instead of it. They're also not a substitute for real audit logging on your actual systems; if you haven't got that in place yet, that's the higher-leverage first step. What honeypots buy you is the thing audit logs can't: a signal that fires *before* the real damage, on activity that had zero legitimate reason to exist in the first place.

The bar to start is genuinely low. One fake credential wired to a webhook, one set of decoy routes logged somewhere you'll notice — that's an afternoon, and it's the difference between finding out from a customer and finding out from your own Slack channel while the attacker is still on the clock.

---

Got a favorite low-effort detection trick, or a war story about a honeypot that actually caught someone? I'd love to hear it — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp/).
