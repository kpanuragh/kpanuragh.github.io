---
title: "SSTI: When Your Template Engine Executes Your Users' Code 😱"
date: "2026-03-07"
excerpt: "Server-Side Template Injection is what happens when you let users write inside your templates. Spoiler: they won't write 'Hello World'."
tags: ["\"cybersecurity\"", "\"web-security\"", "\"security\"", "\"ssti\"", "\"template-injection\""]
featured: "false"
---

# SSTI: When Your Template Engine Executes Your Users' Code 😱

Here's a fun scenario: imagine handing a stranger a notepad and saying "write your name here so we can personalise your greeting." They write `{{7*7}}`. Your app responds: **"Hello, 49!"**

Congratulations — you just discovered you have a Server-Side Template Injection vulnerability. And that stranger is now very interested in your server.

As someone who's spent years building production Laravel apps and lurking in security communities, SSTI is one of those vulnerabilities I call the "polite path to RCE." It knocks before it kicks your door down.

## What Even Is a Template Engine? 🧩

Before we talk about how it breaks, let's talk about what it does.

Template engines let you write dynamic HTML by mixing static text with variables:

```twig
{# Twig (PHP) #}
<h1>Hello, {{ username }}!</h1>
```

The engine takes `username`, slots it in, and renders your page. Clean, readable, elegant.

The vulnerability happens when user-supplied input doesn't just *fill* a template slot — it *becomes* the template itself.

```php
// 🚨 DANGEROUS: user input passed directly to the template engine
$template = "Hello, " . $request->input('name') . "!";
echo $twig->createTemplate($template)->render([]);
```

See the problem? The user controls the template string. And template engines are powerful. Dangerously powerful.

## The "7*7" Test 🎯

The classic SSTI detection payload is deceptively simple. Different template engines have different syntax, so attackers probe with a few:

| Engine | Payload | Expected Output |
|--------|---------|-----------------|
| Twig / Jinja2 | `{{7*7}}` | `49` |
| Freemarker | `${7*7}` | `49` |
| Smarty | `{7*7}` | `49` |
| Moustache | `{{7*7}}` | `{{7*7}}` (not vulnerable — it's logic-less) |

If the app echoes back `49` instead of `{{7*7}}`, the template engine just evaluated your math. Which means it'll evaluate a *lot* more than math.

In my experience reviewing production systems, I've found this exact pattern hidden in:
- Email subject line personalization
- PDF generation code
- Error message rendering
- "Custom welcome message" admin features

The common thread: a developer thought "I'll just build the template string dynamically" and didn't realise they'd handed the keys to the engine room.

## From Math to Madness: How Bad Does It Get? 💀

Let's use Twig as an example because it's common in the PHP world and I've seen it in the wild.

**Twig SSTI — reading files:**
```twig
{{'/etc/passwd'|file_get_contents}}
```

**Twig SSTI — Remote Code Execution (RCE):**
```twig
{{_self.env.registerUndefinedFilterCallback("exec")}}
{{_self.env.getFilter("id")}}
```

That `id` command runs on your server. The attacker now knows your server's user identity. From here, it's a short walk to reading your `.env` file, your database credentials, and your AWS keys.

**Real Talk:** In security communities, we often discuss how SSTI is arguably scarier than SQL injection in some contexts. SQLi gives you the database. SSTI can give you the *server*. There's a difference between robbing the safe and owning the building.

## Laravel/Blade: Are You Safe? 🛡️

Good news if you're on Laravel with Blade: Blade's `{{ }}` syntax is not a full template engine expression evaluator. It's essentially PHP echo with escaping. You can't do arbitrary computation with it.

```blade
{{-- This just prints the string, doesn't evaluate it --}}
{{ $username }}

{{-- This runs PHP, but it's YOUR code, not the user's --}}
@php $greeting = "Hello " . $username; @endphp
```

The danger zone in Laravel is if you bring in **Twig** (via `twig/twig`) or **Blade::compileString()** with user input:

```php
// 🚨 DO NOT DO THIS
$template = Blade::compileString($request->input('template'));
eval('?>' . $template);
```

I've seen this in "custom email template" features where admins could write their own templates. Fine for admins. Catastrophic if that input field is ever reachable by untrusted users (or if an admin account gets compromised).

## The Good vs. Bad Pattern 🟢🔴

**The Wrong Way — user input becomes the template:**
```php
// User sends: name = "{{_self.env.registerUndefinedFilterCallback('exec')}}"
$template = "Dear {{ " . $request->input('name') . " }},";
$twig->createTemplate($template)->render($data);
```

**The Right Way — user input stays as data, never as template:**
```php
// User sends anything they want — it stays safely quoted as a variable
$template = "Dear {{ username }},";
$twig->createTemplate($template)->render([
    'username' => $request->input('name')  // Just data, never executed
]);
```

The mental model: **user input should always flow *into* template variables, never *into* template structure.** The template is your code. User input is just... user input.

## Pro Tip: Sandboxing When You Must Allow Templates 🏖️

Sometimes you genuinely need users to write templates — think Shopify-style storefronts, email builders, report generators. In that case, don't ban templates. Sandbox them.

Twig has a built-in Sandbox extension:

```php
$sandbox = new \Twig\Extension\SandboxExtension($policy, true);
$twig->addExtension($sandbox);

// Define what's allowed
$policy = new \Twig\Sandbox\SecurityPolicy(
    $allowedTags,    // e.g. ['if', 'for']
    $allowedFilters, // e.g. ['upper', 'date']
    $allowedMethods, // {}
    $allowedProperties, // {}
    $allowedFunctions   // e.g. ['range']
);
```

With this, users can write `{{ name|upper }}` but `{{_self.env.registerUndefinedFilterCallback("exec")}}` gets blocked at parse time.

It's not perfect — sandbox escapes do exist — but it's infinitely better than raw template execution.

## How to Find SSTI in Your Own Apps 🔍

As someone passionate about security, I always test this on my own stuff before anyone else does. Here's my quick checklist:

1. **Find every place user input is reflected in output.** Names, messages, search queries, custom fields.
2. **Try `{{7*7}}` in each field.** If you see `49`, you've got a problem.
3. **Check your template engine docs** for dangerous functions: `exec`, `system`, `file_get_contents`, `eval`.
4. **Search your codebase** for `createTemplate`, `eval`, `Blade::compileString` — then trace what goes into them.
5. **Grep for dynamic template construction:**

```bash
grep -rn "createTemplate\|compileString\|eval(" --include="*.php" .
```

If any of those calls touch `$request->input()`, `$_GET`, `$_POST`, or any other user-controlled variable — that's your Friday afternoon disappearing into a security fix.

## Real Talk: The "Custom Email Template" Trap 📧

In my years building e-commerce backends, the most common place I've found SSTI risk is in **admin email template builders.** Product teams love them — "let marketing customise the welcome email!" — and they're genuinely useful.

The trap: teams build it using `Blade::compileString()` or a raw Twig `createTemplate()`, test it with friendly inputs, ship it, and then... the admin panel gets breached via a phishing attack. Now the attacker has a template editor that talks to a live PHP engine.

The fix isn't "don't build email template editors." It's: use a **logic-less template engine** like Mustache for user-controlled templates, or rigorously sandbox a logic-full one. Mustache literally cannot execute code — it's intentionally designed that way.

## TL;DR — Don't Let Users Write Your Templates 📋

- SSTI happens when user input flows into template structure, not just template variables
- It can escalate from math (`{{7*7}}`) to full RCE — reading files, running commands, exfiltrating credentials
- Laravel's Blade is relatively safe by default, but `createTemplate()` and dynamic compilation are danger zones
- **Fix:** keep user input as data variables, never as template code
- **If you must allow user templates:** use Mustache (logic-less) or sandbox Twig/Jinja properly
- Test your own apps with `{{7*7}}` — if you see `49` where you expected the literal string, have a coffee and start patching

In security communities, we have a saying: "trust the framework, not the user." Your template engine is a powerful tool — don't hand it to strangers.

---

**Found an SSTI in the wild? Or want to talk templates and security?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my projects on [GitHub](https://github.com/kpanuragh). Always happy to geek out about this stuff. 🔐
