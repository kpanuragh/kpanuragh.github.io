---
title: "🪵 Log Injection: When Your Logs Start Lying to You"
date: "2026-07-13"
excerpt: "You trust your logs. You grep them at 2am, you build dashboards on them, you base incident timelines on them. But what if an attacker can just... write whatever they want into them? Let's talk about log injection, the vulnerability that turns your source of truth into a source of fiction."
tags:
  - security
  - web-security
  - logging
  - owasp
  - cybersecurity
featured: true
---

Quick question: when was the last time you treated log output as *untrusted user input*?

If your honest answer is "never," you're not alone. Logs occupy this weird trusted zone in most people's mental model. Databases get parameterized queries. HTML output gets escaped. API responses get validated. But logs? Logs are just `console.log`-shaped afterthoughts, right up until the moment someone realizes they can forge entire fake log lines and nobody notices for six months.

That's log injection, and it's dumber and scarier than it sounds.

## The setup: logs are just string concatenation with extra steps

Here's a completely normal-looking login handler:

```javascript
app.post('/login', (req, res) => {
  const { username } = req.body;
  const user = findUser(username);

  if (!user) {
    logger.warn(`Failed login attempt for user: ${username}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // ... continue login flow
});
```

Reasonable. You want to know who's failing to log in — could be a typo-prone employee, could be a credential-stuffing bot. Standard security hygiene.

Except `username` is 100% attacker-controlled, and you just wrote it straight into your log stream with zero sanitization. So what happens if someone sends this as their username?

```
admin\n2026-07-13T02:14:00Z INFO Successful login for user: admin (from trusted IP 10.0.0.1)
```

Your log now reads:

```
2026-07-13T02:13:59Z WARN Failed login attempt for user: admin
2026-07-13T02:14:00Z INFO Successful login for user: admin (from trusted IP 10.0.0.1)
```

Nobody wrote that second line. The application never generated it. It's a forged entry that exists purely because your logger happily wrote a raw newline character and let the attacker author their own log record, complete with a fake timestamp and severity level. If your SOC is grepping for "Successful login" to build an audit trail, congratulations, you now have a phantom successful login for the admin account that never actually happened — or worse, one that hides the fact that a real failed attempt *did* happen, buried in noise the attacker crafted specifically to bury it.

This is CRLF injection's quieter cousin (log injection is technically the broader category — CRLF injection into logs is one flavor of it), and it's been sitting in the OWASP Top 10 lineage for over two decades because it keeps working.

## Why this actually matters (it's not just cosmetic)

I've seen people shrug this off with "so what, it's just text in a log file." Three reasons that's wrong:

**1. Logs drive automated decisions.** If a log line matching `ALERT: intrusion detected` triggers a PagerDuty page, an attacker who can inject that exact string can page your on-call at 3am for fun — or worse, flood your alerting pipeline with fake alerts until your team starts ignoring real ones. That's alert fatigue as an attack vector.

**2. Logs are forensic evidence.** During incident response, the log is the timeline. If an attacker can inject fabricated entries, they can literally rewrite history — insert fake "system restarted normally" entries to cover a crash they caused, or plant a fake entry blaming a different user account for their own actions.

**3. Log-to-HTML pipelines exist, and they turn this into XSS.** A lot of internal admin dashboards render logs into a browser somewhere — a Kibana view, a custom log viewer, a "recent activity" widget. If that rendering path doesn't HTML-escape the log content, and your original injection point let you slip in `<script>` tags instead of just newlines, you've pivoted from "log injection" straight into stored XSS against whoever's staring at that dashboard. I've genuinely seen an internal ops tool where the "search users" log viewer rendered raw log text into a `<pre>` tag with `dangerouslySetInnerHTML`. That's not a hypothetical, that's a Tuesday.

## The fix is boring, which is good

The fix here isn't clever — it's the same principle as every other injection class: **don't let untrusted data control the structure of your output.** For logs specifically:

**Sanitize control characters before logging.** At minimum, strip or escape newlines, carriage returns, and other control chars from anything user-supplied before it touches your logger:

```javascript
function sanitizeForLog(input) {
  return String(input)
    .replace(/[\r\n]/g, '')      // no forged multi-line entries
    .replace(/[\x00-\x1F\x7F]/g, ''); // strip other control chars
}

logger.warn(`Failed login attempt for user: ${sanitizeForLog(username)}`);
```

**Better: use structured logging instead of string concatenation.** Most modern loggers (pino, winston, structlog, zap) support structured/JSON logging where fields are passed as data, not interpolated into a template string:

```javascript
logger.warn({ event: 'login_failed', username }, 'Failed login attempt');
```

With structured logging, `username` becomes a JSON field value, not a raw byte stream inside your log's actual grammar. A newline in the value is just a newline *inside a string field* — it can't break out and forge a new record, because the record boundary is JSON syntax, not "whatever comes after `\n`."

**And if logs render anywhere as HTML, escape on output too.** Same rule as any other XSS surface — treat log content as untrusted when displaying it, full stop.

At Cubet, we caught a milder version of this during a review of an internal audit-log viewer — user-supplied "reason for access" fields were flowing straight into log lines with no sanitization, and someone had actually put a raw newline in a support ticket description (not maliciously, just a multi-line note) that visually split into two separate audit entries in the dashboard. Harmless in that case, but it made obvious how trivially the same gap could be weaponized. We moved that service to structured JSON logging and the whole class of bug just... went away.

## The takeaway

Anywhere untrusted input touches a log call, ask yourself the same question you'd ask before writing to a database or a browser: what happens if this string contains characters I didn't expect? If the answer involves your logger interpreting them as structure instead of data, you've got log injection sitting quietly in your codebase, waiting for someone to notice it before you do.

Go grep your codebase for `logger.` or `console.log` calls with raw template interpolation of request data. I'll wait. (You'll find at least one.)

---

Found a sketchy log line in your own codebase after reading this? Or want to argue that structured logging is overkill for your side project? Come yell at me:

- 🐦 [Twitter/X](https://twitter.com/anuragh_kp)
- 💼 [LinkedIn](https://linkedin.com/in/anuragh-k-p)
- 🐙 [GitHub](https://github.com/kpanuragh)
