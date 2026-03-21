---
title: "Prototype Pollution: The JavaScript Vulnerability Hiding in Plain Sight 🧬☠️"
date: "2026-03-21"
excerpt: "Your lodash merge call is silently letting attackers rewrite JavaScript's DNA. Prototype pollution is the vulnerability that breaks apps without touching a single line of YOUR code — and it's everywhere."
tags: ["security", "javascript", "nodejs", "backend"]
featured: true
---

# Prototype Pollution: The JavaScript Vulnerability Hiding in Plain Sight 🧬☠️

**Picture this:** You're reviewing a security audit report. The finding says "prototype pollution via `_.merge()`." You think, "Eh, sounds academic. We don't even accept untrusted JSON in that code path... right?"

Three months later, an attacker bypasses your admin check by sending `{"__proto__": {"isAdmin": true}}` in a POST body.

Your entire access control? Overridden. Not with a SQL injection. Not with an XSS payload. With a sneaky little JSON key that JavaScript was *designed* to understand.

Welcome to **prototype pollution** — the vulnerability that turns JavaScript's most powerful feature into its biggest liability. 💀

## What Even Is Prototype Pollution? 🧬

JavaScript uses **prototype-based inheritance**. Every object inherits from `Object.prototype`, meaning properties you set there magically appear on *every object in your application*:

```javascript
// Normal JavaScript behavior
const user = { name: "Alice" };
console.log(user.toString); // [Function: toString] (from Object.prototype)

// THE ATTACK: What if an attacker could set properties on Object.prototype?
Object.prototype.isAdmin = true;

const attacker = {};
const regularUser = { name: "Bob" };

console.log(attacker.isAdmin);     // true  😱
console.log(regularUser.isAdmin);  // true  😱
console.log({}.isAdmin);           // true  😱
// EVERY object in your app now has isAdmin = true
```

That's the core idea. Now here's how attackers actually trigger it.

## How the Attack Works in Practice 🎯

The real danger comes from deep merge / deep clone utilities — functions that recursively copy properties from one object to another. For years, nearly every major JavaScript utility library had this bug.

Here's a **vulnerable** deep merge implementation:

```javascript
// ⚠️  VULNERABLE - DO NOT USE
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === "object" && source[key] !== null) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]); // Recursive merge
    } else {
      target[key] = source[key]; // Copies the value
    }
  }
  return target;
}

// Attacker sends this JSON in an API request:
const attackerPayload = JSON.parse('{"__proto__": {"isAdmin": true}}');

// Your code innocently merges user-provided data:
const config = {};
deepMerge(config, attackerPayload);

// Now check ANY object:
console.log({}.isAdmin);      // true 💀
console.log([].isAdmin);      // true 💀
console.log(new Date().isAdmin); // true 💀
```

When the loop hits the key `"__proto__"`, it walks *up* the prototype chain instead of assigning a property. The attacker has just written to `Object.prototype` — JavaScript's global god-object.

## A Real Attack Scenario: Bypassing Auth 🔐💥

Here's how this plays out in an Express API:

```javascript
// Your innocent-looking route handler
app.post("/user/preferences", async (req, res) => {
  const user = await User.findById(req.user.id);

  // Merging user input into their preferences object
  // Looks harmless, right?
  deepMerge(user.preferences, req.body);

  await user.save();
  res.json({ success: true });
});

// Somewhere else in your app:
app.get("/admin/dashboard", (req, res) => {
  const user = req.user;

  // Classic "is this user an admin?" check
  if (!user.isAdmin) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // ... serve admin data
});
```

The attacker sends ONE request to `/user/preferences`:

```json
{
  "__proto__": {
    "isAdmin": true
  }
}
```

Now `{}.isAdmin` returns `true` for every object in your process. Every subsequent request to `/admin/dashboard` — from any user — gets in. No stolen credentials. No brute force. Just a JSON key.

**And the worst part?** The first route looks perfectly safe to most developers. The vulnerability isn't even *in* your authentication code.

## How to Defend Against It 🛡️

### Fix #1: Sanitize Incoming Keys

The simplest mitigation — reject `__proto__`, `constructor`, and `prototype` as keys:

```javascript
// ✅ SAFE deep merge
function safeDeepMerge(target, source) {
  const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  for (const key of Object.keys(source)) {
    if (BLOCKED_KEYS.has(key)) continue; // Skip dangerous keys!

    if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = {};
      }
      safeDeepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```

### Fix #2: Use `Object.create(null)` for Untrusted Data

Objects created with `Object.create(null)` have **no prototype** — they can't be polluted:

```javascript
// ✅ No prototype = no pollution
const safeContainer = Object.create(null);
safeContainer.__proto__ = "lol try harder"; // Just sets a regular key!

console.log(({}).isAdmin); // Still undefined ✅
```

### Fix #3: Freeze Object.prototype (Nuclear Option)

```javascript
// ✅ Prevent anyone from modifying Object.prototype
Object.freeze(Object.prototype);

// Now this silently fails (or throws in strict mode):
const payload = JSON.parse('{"__proto__": {"isAdmin": true}}');
// No effect — prototype is frozen!
```

Add this at the very top of your app entry point. It's a great safety net and has negligible performance impact.

### Fix #4: Use Battle-Tested Libraries (Updated Versions!)

The most famous real-world case: **lodash `_.merge()`** was vulnerable until version 4.17.12 (CVE-2019-10744). If you're using lodash for deep merging:

```bash
# Check your lodash version
npm list lodash

# Update if below 4.17.21
npm install lodash@latest
```

And for schema validation, use libraries like `zod` or `joi` to ensure incoming JSON only contains the keys you expect — making the attack payload dead on arrival.

## Spotting It in the Wild 🔍

Run this quick check against your own Node.js app:

```javascript
// Paste this in your app's test suite or a quick script
function checkPrototypePollutionVulnerability(mergeFn) {
  const payload = JSON.parse('{"__proto__": {"polluted": true}}');
  const target = {};

  try {
    mergeFn(target, payload);
  } catch (e) {
    return "SAFE (throws on dangerous keys)";
  }

  if (({}).polluted === true) {
    // Clean up
    delete Object.prototype.polluted;
    return "VULNERABLE ⚠️";
  }

  return "SAFE ✅";
}

// Test your own merge function:
console.log(checkPrototypePollutionVulnerability(yourDeepMergeFn));
```

Also, run `npm audit` — CVE-2019-10744 (lodash), CVE-2020-8203 (lodash again), and CVE-2021-25928 (set-value) are among the most widely deployed prototype pollution vulnerabilities. If your audit is clean, you're in good shape.

## The Bigger Picture 🌍

Prototype pollution isn't just a "merge function" bug. It's been found in:

- **jQuery** (`.extend()` with deep copy)
- **Lodash** (`_.merge()`, `_.defaultsDeep()`)
- **Hoek** (used by Hapi.js)
- **set-value**, **mixin-deep**, **deep-extend** — the list goes on

The pattern is always the same: a utility that recursively walks object properties without checking for `__proto__`. Before the community woke up, this was *standard* code. It was in tutorials. It was in Stack Overflow answers marked "accepted." Chances are it's in your codebase right now.

The fix is straightforward once you know what to look for. The danger is that most developers have never heard of it.

---

**Found a prototype pollution vector in your own code?** I'd love to hear about it — connect on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and let's talk JavaScript security war stories.

**Want to see more secure patterns?** Browse my [GitHub](https://github.com/kpanuragh) — where `__proto__` is never a valid config key.

*P.S. — Run `npm audit` right now. If you see lodash below 4.17.21, update it before you read another word. I'll still be here.* 🔒

*P.P.S. — Yes, `Object.freeze(Object.prototype)` really is that easy. Add it to your app.js entry point. You're welcome.* 🧊
