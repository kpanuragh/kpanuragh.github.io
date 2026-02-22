---
title: "Server-Side Template Injection: When Your Template Engine Becomes a Weapon 💥🧨"
date: "2026-02-22"
excerpt: "You built a slick email system that lets users customize their messages. Cute. Now a hacker is using your Jinja2 template to read your /etc/passwd file and spawn a shell. Learn how SSTI turns friendly curly braces into a remote code execution nightmare — and how to stop it."
tags: ["security", "web", "python", "nodejs", "ssti"]
featured: true
---

# Server-Side Template Injection: When Your Template Engine Becomes a Weapon 💥🧨

Let me paint you a picture.

You're building a SaaS app. You add a "customize your welcome email" feature. Users can type something like `Hello {{ name }}!` and your backend renders it using Jinja2. Elegant. Flexible. Appreciated by users.

Then one user types: `{{ 7 * 7 }}`.

Your app replies: `49`.

You just told an attacker everything they need to know. Your template engine is **evaluating user input**, and they're about to make it do a lot worse than multiplication.

Welcome to **Server-Side Template Injection (SSTI)** — one of the most underrated, underestimated vulnerabilities that can hand attackers full remote code execution on your server. 🏴‍☠️

## What Even IS Template Injection? 🤔

Template engines are everywhere. Jinja2 in Python/Flask, Twig in PHP, Pebble in Java, Handlebars/EJS in Node.js, Blade in Laravel. They're supposed to let your code render dynamic content safely.

The key word is *supposed to*.

SSTI happens when **user-supplied input is concatenated directly into a template string** before rendering, instead of being passed as a data variable. The difference sounds subtle. The consequences are not.

```python
# SAFE: User input as a data variable
template = "Hello {{ name }}!"
render(template, name=user_input)       # name is just data, can't escape

# VULNERABLE: User input IS the template
template = f"Hello {user_input}!"       # user_input can inject template syntax
render(template)                        # 💀 RCE incoming
```

That one line of difference is the gap between "secure web app" and "attacker owns your server."

## The Detection Trick Hackers Use First 🕵️

Before attacking, an attacker probes to see if a field is vulnerable. They send template-specific payloads and watch what the app returns:

```
Input: {{ 7 * 7 }}   → Response contains "49"?  → Jinja2/Twig confirmed!
Input: <%= 7 * 7 %>  → Response contains "49"?  → ERB (Ruby) confirmed!
Input: ${7 * 7}      → Response contains "49"?  → FreeMarker/Pebble confirmed!
Input: {{7*'7'}}     → Response is "49" or "7777777"?
                        49      → Twig (PHP)
                        7777777 → Jinja2 (Python)
```

This is how they *fingerprint* which engine you're running — before they escalate to the big guns.

## From Math to /etc/passwd in Three Steps 🔓

Here's how a real Jinja2 SSTI exploit escalates. Buckle up.

**Step 1 — Confirm injection:** `{{ 7 * 7 }}` → app returns `49`. Bingo.

**Step 2 — Dump config and environment variables:**

```
{{ config.items() }}
```

This leaks your entire Flask/Django config object. Secret keys, database URLs, API tokens — all of it dumped right to the browser. Beautiful for the attacker. Catastrophic for you.

**Step 3 — Remote Code Execution:**

Jinja2's template language can traverse Python's object hierarchy. Attackers abuse this to reach OS-level functions:

```
{{ ''.__class__.__mro__[1].__subclasses__() }}
```

This dumps every Python subclass loaded in memory. From there, they find one with `os` or `subprocess` access and call it directly:

```
{{ ''.__class__.__mro__[1].__subclasses__()[396]('id', shell=True, stdout=-1).communicate() }}
```

Output: `uid=33(www-data) gid=33(www-data) groups=33(www-data)`

They're running commands as your web server user. One more hop and they're reading your database credentials, exfiltrating data, or installing a reverse shell. All from a text field you thought was harmless. 😱

## Real Frameworks, Real Risk 🌐

SSTI isn't just a Python problem. Here's how it looks across the ecosystem:

```php
// Twig (PHP) — vulnerable pattern
$template = $twig->createTemplate("Hello " . $_GET['name'] . "!");
echo $template->render([]);

// Safe pattern
$template = $twig->createTemplate("Hello {{ name }}!");
echo $template->render(['name' => $_GET['name']]);
```

```javascript
// EJS (Node.js) — vulnerable pattern
app.get('/greet', (req, res) => {
  const output = ejs.render(`Hello ${req.query.name}!`);  // 💀
  res.send(output);
});

// Safe pattern
app.get('/greet', (req, res) => {
  const output = ejs.render('Hello <%= name %>!', { name: req.query.name });
  res.send(output);
});
```

```python
# Jinja2 (Python/Flask) — vulnerable pattern
@app.route('/greet')
def greet():
    name = request.args.get('name')
    template = f"<h1>Hello {name}!</h1>"     # User input IS the template
    return render_template_string(template)   # 💀

# Safe pattern
@app.route('/greet')
def greet():
    name = request.args.get('name')
    return render_template_string("<h1>Hello {{ name }}!</h1>", name=name)
```

The pattern is always the same: **concatenating user input into the template string itself** instead of passing it as a variable. One refactor away from safe. One lazy shortcut away from RCE.

## How to Actually Fix It ✅

### Rule 1: Never Render User Input as a Template

If you only remember one thing, make it this:

```python
# The cardinal rule: User data goes IN variables, never IN templates

# ❌ NEVER do this:
render_template_string(f"Dear {user.name}, {user.message}")

# ✅ ALWAYS do this:
render_template_string(
    "Dear {{ name }}, {{ message }}",
    name=user.name,
    message=user.message
)
```

The template string must be **developer-controlled static text**. User input is always just a value passed to it.

### Rule 2: Use Template Files, Not Dynamic Strings

```python
# ❌ Dynamic template strings are asking for trouble
html = user_template_input
return render_template_string(html)

# ✅ Templates live in files you control
# templates/welcome_email.html:
# Dear {{ name }},
# {{ body }}

return render_template('welcome_email.html', name=name, body=body)
```

Template files are version-controlled, auditable, and can't be replaced by user input.

### Rule 3: Sandbox Your Template Engine

If your feature *genuinely requires* user-defined templates (like a drag-and-drop email builder), sandbox the engine:

```python
from jinja2.sandbox import SandboxedEnvironment

env = SandboxedEnvironment()
# Now hazardous operations (subclass traversal, OS calls) are blocked
template = env.from_string(user_supplied_template)
output = template.render(name=user_name)
```

`SandboxedEnvironment` blocks access to Python internals. It's not bulletproof — bypass techniques exist — but it dramatically raises the bar.

### Rule 4: Treat Template Syntax as User Input (Sanitize or Reject It)

If users don't *need* template syntax, strip or escape it:

```python
import re

def sanitize_template_input(text: str) -> str:
    # Remove Jinja2/Twig-style delimiters
    text = re.sub(r'\{\{.*?\}\}', '', text)
    text = re.sub(r'\{%.*?%\}', '', text)
    return text
```

Heavy-handed? Yes. Effective? Also yes. If your "custom greeting" field doesn't need `{{ }}` syntax, don't allow it.

## The SSTI Hit List: Where to Audit Your Code 🔍

Go search your codebase right now for these patterns:

```bash
# Python
grep -rn "render_template_string" . | grep -v "\.html\""
grep -rn "Environment().from_string" .

# Node.js
grep -rn "ejs.render\|handlebars.compile\|nunjucks.renderString" .

# PHP
grep -rn "createTemplate\|renderBlock" . | grep "\$_"

# Ruby
grep -rn "ERB.new.*params\|Liquid::Template.parse.*params" .
```

Any hit where user input touches the template *string itself* (not just the variables) is worth investigating.

## Real-World SSTI Hall of Shame 🏆

SSTI has hit production systems at serious companies:

- **Uber (2016):** A researcher found SSTI in a Flask-based microservice, achieving RCE. Paid out as a bug bounty. Could have been a breach.
- **Shopify (2019):** Liquid template injection in a merchant-facing feature. Escalated to reading internal config.
- **HackerOne itself (2019):** A researcher found SSTI in an internal tool. Ironic? Yes. Patched quickly? Also yes.

The pattern across all of them: a developer added a "dynamic" feature, threaded user input into a template string, and shipped it without realizing the engine would *execute* that input.

## Quick Reference: Am I Vulnerable? 📋

```
□ Do I render user input with render_template_string() or equivalent?
□ Do I concatenate/format user data INTO a template string before rendering?
□ Do I let users define "templates" for emails, notifications, or reports?
□ Am I using a template engine for PDF/document generation with user content?
□ Do I pass raw request parameters into any template rendering function?

If YES to any of the above → Audit immediately. 🚨
```

## The Bottom Line 💡

SSTI is a "you had one job" vulnerability. Template engines exist to **separate code from content**. The moment you blur that line by letting user content become part of the template structure, you've handed the engine a loaded gun pointed at your server.

The fix is almost always a one-line refactor: move user input from the template string to a template variable. That's it. Same feature, zero RCE risk.

**Your code might be generating beautiful dynamic emails right now. Make sure it's not also generating shells for someone who typed `{{ 7 * 7 }}` in your name field.** 👀

---

Found an SSTI in the wild? Reach out on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my [GitHub](https://github.com/kpanuragh) for more security deep-dives.

*Now go grep your codebase for `render_template_string`. I'll wait.* 🔍
