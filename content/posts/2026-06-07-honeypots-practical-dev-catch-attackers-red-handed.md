---
title: "🍯 Honeypots for the Practical Dev: Catch Attackers Red-Handed"
date: 2026-06-07
excerpt: Honeypots aren't just for enterprise SOC teams anymore. A few lines of code can turn your app into an attacker early-warning system — and the data you collect will surprise you.
tags:
  - security
  - honeypots
  - defensive-engineering
  - incident-response
  - nodejs
featured: true
---

There's a certain joy in watching an attacker confidently walk into a trap you built.

They've scanned your endpoints, found what looks like an unprotected admin route, and they're about to do something terrible. Except the route is fake. It exists purely to catch exactly this kind of person. Your alerting lights up, you have their IP, their user-agent, their payload — and they have nothing.

That's a honeypot. And you can build one in an afternoon.

## What Even Is a Honeypot?

A honeypot is a decoy resource that **no legitimate user would ever touch**. Admin panels that don't exist, API keys that were never real, database backup files that were never backed up. If something hits it, it's almost certainly malicious — or at minimum, deeply suspicious.

The enterprise version of this is a fake server on your network that logs everything and fires incident tickets. The *practical dev* version is a few endpoints and fields sprinkled through your app that silently scream when someone touches them.

No false positives. No tuning required. If it fires, you pay attention.

## The Simplest Honeypot: Fake Admin Routes

Every scanner on the internet probes for `/admin`, `/.env`, `/wp-admin`, `/phpmyadmin`, and a hundred other well-known paths. Your app probably doesn't have these. But what if it pretended to?

Here's a dead-simple Express middleware that turns those requests into high-fidelity alerts:

```javascript
// honeypot-routes.js
const HONEYPOT_PATHS = [
  '/.env', '/admin', '/wp-admin', '/phpmyadmin',
  '/config.json', '/.git/config', '/backup.sql',
  '/api/v1/internal', '/.aws/credentials',
];

function honeypotMiddleware(alertFn) {
  return (req, res, next) => {
    const isHoneypot = HONEYPOT_PATHS.some(p =>
      req.path === p || req.path.startsWith(p + '/')
    );

    if (isHoneypot) {
      alertFn({
        type: 'HONEYPOT_HIT',
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        headers: req.headers,
        body: req.body,
        timestamp: new Date().toISOString(),
      });

      // Return something plausible — keep them confused
      res.status(200).json({ status: 'ok' });
    } else {
      next();
    }
  };
}
```

Register it before your real routes:

```javascript
app.use(honeypotMiddleware(async (event) => {
  // Log to your observability stack, fire a Slack webhook, page on-call — your call
  await logger.warn('HONEYPOT_TRIGGERED', event);
  await slackAlert(`🍯 Honeypot hit: ${event.path} from ${event.ip}`);
}));
```

Notice we return `200 { status: 'ok' }`. This is intentional. If you 404 immediately, the scanner moves on. If you look like a real endpoint, they might stick around, probe further, and give you more signal about their intent. Slow them down a little. Let them feel confident. It's not deception — it's *theatre*.

## Honeypot Fields: The Database Canary

This one is subtle and brilliant. Add a field to your user record that **your own app never reads or writes**. Then watch your logs for anything that tries to use it.

```sql
ALTER TABLE users ADD COLUMN honeypot_token VARCHAR(64) DEFAULT NULL;
```

Pre-populate it with something that looks valuable — a UUID that resembles a session token. Your app code should never SELECT or UPDATE this column. If you ever see it appear in a query log, an audit trail, or an outbound request, something has gone very wrong: either you have a SQL injection, a compromised dependency dumping your schema, or an insider poking around.

At Cubet, we added a variation of this to a multi-tenant SaaS app: a `_trap_field` on the accounts table with a fake API key format. We wired a DB trigger to emit an event on any read. It fired twice in six months — one was a misconfigured internal BI tool (caught a config bug we didn't know about), and one was a legitimate incident involving a compromised service account. Both times, the honeypot gave us the first signal.

## The Canary Token: Honeypots You Don't Even Host

If you don't want to build anything, [canarytokens.org](https://canarytokens.org) generates URLs, DNS names, AWS credentials, Word documents, and more — all of which call home when used. Drop a fake `credentials.json` with a canary AWS key in an S3 bucket that *should* be private. If the key is ever used, you get an email with the request details.

This is a legitimately powerful technique for monitoring things like:
- S3 buckets that might be misconfigured as public
- Internal wikis that shouldn't be externally reachable  
- Backup files sitting on servers longer than they should

The threat model is simple: legitimate users don't need these resources. Attackers who find them will absolutely try to use them.

## What to Do With the Alerts

Honeypot data is only valuable if you act on it. Here's a basic response triage:

**Single hit from a random IP?** Log it, note the IP. Probably an automated scanner. Low priority, but worth keeping the record.

**Same IP hitting multiple honeypots within seconds?** You're being actively scanned. Block the IP at your WAF or load balancer, check your real logs for that IP in the last 24 hours, and see what else they touched.

**A hit that includes valid-looking auth headers or tokens?** Red alert. Someone with partial knowledge is probing your system. That's either a stolen credential being tested or an insider. Pull the full request context and escalate.

**A honeypot field appearing in an outbound request or log line?** Assume breach. Start your incident response process immediately — this suggests something in your stack is reading and potentially exfiltrating data it shouldn't know about.

## Keep It Invisible

The whole point breaks down if your honeypots are obvious. A few rules:

1. **Don't put them in your HTML source.** Automated scanners read your DOM. If you have a hidden form field named `honeypot`, sophisticated bots will skip it.
2. **Name them like real things.** `/internal-api` is a better trap name than `/honeypot-trap-do-not-use`.
3. **Don't block on the first hit.** Block after you've collected the event. Log first, act second.
4. **Rotate your canary tokens occasionally.** Stale tokens that were never triggered might just mean your monitoring broke, not that you're safe.

## The Cost Is Near Zero, the Signal Is Priceless

The thing about honeypots is that they're almost entirely passive. You set them up once, they sit there doing nothing for months, and then one day they fire — and that alert is almost certainly worth investigating.

The alternative is wading through gigabytes of legitimate traffic logs trying to find the one request that didn't belong. Honeypots invert the problem: everything that hits them is suspicious by definition. No tuning, no thresholds, no ML pipeline required.

You're a developer, not a full-time security analyst. Honeypots let you build a meaningful layer of detection without making security your entire job.

Drop a few fake routes in. Add a canary field to your most sensitive tables. Stash a canary token in that S3 bucket you're pretty sure is locked down. Then get back to shipping features — and let your traps do the watching.

---

*Got a honeypot story? I'd love to hear what you've caught in the wild. Find me on [Twitter/X](https://twitter.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh).*
