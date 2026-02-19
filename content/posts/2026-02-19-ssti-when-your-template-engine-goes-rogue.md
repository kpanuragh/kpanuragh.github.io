---
title: "Server-Side Template Injection: When Your Template Engine Goes Rogue 🔥"
date: "2026-02-19"
excerpt: "You gave users a way to customize their welcome email. They used it to execute commands on your server. SSTI is the vulnerability where innocent-looking template syntax becomes a one-way ticket to full server compromise."
tags: ["cybersecurity", "web-security", "security", "ssti", "template-injection"]
featured: false
---

# Server-Side Template Injection: When Your Template Engine Goes Rogue 🔥

Let me tell you about the vulnerability that made my jaw drop the first time I encountered it in a responsible disclosure write-up.

A developer built a "personalized welcome email" feature. Users could type their own greeting template. Something like `Hello {{name}}, welcome to our platform!` — sweet, right? Customizable, personal. Marketing loved it.

Then someone typed `{{7*7}}` into the template field.

The email they received said: *"Hello 49, welcome to our platform!"*

That's Server-Side Template Injection. And that researcher went from `{{7*7}}` to reading `/etc/passwd` in about 20 minutes. 💀

## What Is SSTI, Actually? 🤔

Template engines are everywhere. Laravel uses Blade. Node.js apps often use Pug, Handlebars, or EJS. Python Flask apps use Jinja2. These engines take a template string with special syntax (`{{ }}`, `{% %}`, etc.) and render it with data.

SSTI happens when user input is **embedded directly into a template that gets evaluated server-side**, rather than being treated as plain data. The template engine doesn't know it's dealing with user input — it just processes whatever syntax it finds.

The analogy I always use: imagine you hire a chef and tell them to follow whatever recipe card is on the counter. Most of the time, that's fine. But if a stranger walks in and swaps the recipe card with one that says "burn the restaurant down," the chef will just... follow it.

Your template engine is that chef. User input is the stranger's recipe card.

## The Bug That Feels Helpful 😬

In my experience building production systems, SSTI usually shows up in features that seem genuinely useful:

- Custom email templates (marketing teams LOVE this)
- PDF report generation with user-defined headers
- Notification templates in multi-tenant SaaS platforms
- "Preview your message" features

The dangerous pattern looks something like this:

```python
# Python/Flask — DON'T DO THIS
from flask import render_template_string, request

@app.route('/preview')
def preview():
    user_template = request.form.get('template')
    # Rendering user input AS a template — catastrophic
    return render_template_string(user_template)
```

Or in a Node.js context with Pug:

```javascript
// Node.js — also very bad
app.post('/preview', (req, res) => {
    const userTemplate = req.body.template;
    // Compiling user input as Pug template
    const rendered = pug.render(userTemplate, { name: req.user.name });
    res.send(rendered);
});
```

Both of these will happily execute whatever template logic an attacker injects.

## How Bad Can It Get? 🎯

Let's walk through an escalation on a Jinja2 app (Python/Flask) because it's the most documented. An attacker starts probing:

```
Input: {{7*7}}
Output: 49  ← Confirmed SSTI!

Input: {{''.__class__.__mro__[1].__subclasses__()}}
Output: [list of Python classes]  ← They can see the Python internals

Input: {{config.items()}}
Output: SECRET_KEY, DATABASE_URI, and all your secrets  ← Uh oh
```

And yes, on many default configurations, this escalates all the way to arbitrary OS command execution. Full Remote Code Execution. From a text input field in a "personalize your emails" feature.

As someone passionate about security, the moment I first saw this chain of exploits explained in a security community Slack, I immediately audited every templating decision I'd ever made in production. (Results: mostly fine, one close call I'd rather not describe.)

**Real Talk 🎙️:** In security communities, we often discuss how SSTI is one of the highest-severity injection vulnerabilities precisely because it's so context-dependent. A developer looking at the feature sees "email customization." A security researcher sees "server-side code execution with user-controlled input."

## The Safe Way: Treat Templates as Data, Not Code 🛡️

The fundamental fix is: **never render user input as a template**. Instead, render a fixed template and pass user input as data.

**Bad (SSTI vulnerability):**
```python
# User controls the template — dangerous
return render_template_string(user_input)
```

**Good (user input is just data):**
```python
# Fixed template, user controls only the data values
return render_template('email_preview.html', greeting=user_input)
```

In `email_preview.html`:
```html
<!-- Jinja2 auto-escapes this — it's data, not template code -->
<p>{{ greeting }}</p>
```

The difference is everything. In the safe version, even if someone types `{{7*7}}`, it gets rendered as literal text: `{{7*7}}`. The template engine never evaluates it.

For Laravel/Blade apps, the same principle applies:

```php
// BAD: Evaluating user-controlled string as Blade template
$rendered = Blade::render($request->input('template'));

// GOOD: User input goes into a variable, not the template itself
return view('email.preview', ['greeting' => $request->input('greeting')]);
```

Blade's `{{ }}` auto-escapes. `{!! !!}` does not. Never use `{!! !!}` with user input. Ever. Not even if they beg nicely.

## Pro Tip: Sandbox Your Templates If You Must 💡

Sometimes you genuinely need user-defined templates. Marketing teams want drag-and-drop email builders. Multi-tenant SaaS platforms need per-tenant customization. Fair enough.

If you truly must let users control template logic:

1. **Use a sandboxed template engine** — Jinja2 has a `SandboxedEnvironment`. Handlebars is "logic-less" by design and much safer than Jinja2/Twig for this use case.
2. **Strictly allowlist available variables** — only expose what users should see.
3. **Disable dangerous built-ins** — no access to `__class__`, `config`, file system functions.
4. **Run template rendering in a separate isolated process** — if it explodes, contain the blast radius.

Handlebars is genuinely worth considering for user-facing templates because its "logic-less" philosophy means there's much less surface area for injection attacks. `{{name}}` renders a value. That's mostly it. No class traversal. No executing arbitrary expressions.

## Spotting SSTI in Your Own Code 🔍

Here's a quick audit checklist for your codebase:

- [ ] Search for `render_template_string(` — if user input feeds into it, you have a problem
- [ ] Search for `pug.render(`, `ejs.render(`, `handlebars.compile(` called with user data as the template string
- [ ] Search for `Blade::render(` or equivalent dynamic template evaluation
- [ ] Any feature labeled "custom template," "email preview," or "personalized message" — audit these first
- [ ] PDF generation with user-controlled templates (wkhtmltopdf, Puppeteer with dynamic HTML)

The pattern to look for: `templateEngine.render(USER_INPUT)` vs `templateEngine.render(FIXED_TEMPLATE, { data: USER_INPUT })`. The first is dangerous. The second is (usually) fine.

## The Severity Reality Check ⚠️

SSTI isn't theoretical. It's a Critical/High finding on every major bug bounty platform. HackerOne has paid out significant bounties for SSTI bugs in production apps — and the root cause is almost always the same: a developer who wanted to give users "flexibility" without thinking through the security implications.

The GitHub Security Advisory Database has multiple SSTI entries for popular template engines. The OWASP testing guide covers it. And yet, every year, new bug bounty reports roll in for exactly this class of vulnerability.

## TL;DR 🎯

Server-Side Template Injection happens when user input is evaluated as template code instead of being passed as template data.

- **Never** call `render(userInput)` — always `render(fixedTemplate, {data: userInput})`
- **User input is data** — templates are code, keep them separate
- **Audit "customization" features** — email builders, PDF templates, preview functions
- **Use logic-less engines** (Handlebars) if users genuinely need to write templates
- **Sandbox everything** if you must allow template expressions

Your template engine is powerful. That's the whole point. Don't hand that power to strangers on the internet.

---

**Got questions or spotted an SSTI in a bug bounty hunt?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I'm always up for a good responsible disclosure story.

**More code on** [GitHub](https://github.com/kpanuragh) — where templates and user input are kept at a safe distance from each other. 🔐

*Now go grep your codebase for `render_template_string`. I'll be here.*
