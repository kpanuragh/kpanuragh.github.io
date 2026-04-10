---
title: "Prototype Pollution: The JavaScript Vulnerability That Hides in Plain Sight 🧬"
date: "2026-04-10"
excerpt: "You're merging objects. Parsing JSON. Building APIs. Sounds harmless, right? Prototype pollution can turn innocent-looking JavaScript into a backdoor. Here's how it works and how to stop it."
tags: ["cybersecurity", "javascript", "nodejs", "web-security", "owasp"]
featured: true
---

# Prototype Pollution: The JavaScript Vulnerability That Hides in Plain Sight 🧬

You're writing a utility function. Something like `merge(defaults, userConfig)`. Totally normal.

Then someone sends in a config that looks like this:

```json
{ "__proto__": { "isAdmin": true } }
```

And suddenly **every single object** in your application thinks `isAdmin` is `true`. Not just one user. All of them. 💀

Welcome to **Prototype Pollution** — the JavaScript vulnerability that looks like a feature, acts like a bug, and absolutely wrecks your security posture if you're not watching for it.

## What Is Prototype Pollution? 🤔

JavaScript's prototype chain is the mechanism that lets all objects share behaviour. When you do `[].push(1)`, the `push` method isn't defined on your specific array — it lives on `Array.prototype`, and every array inherits it.

Here's the dangerous bit: `Object.prototype` sits at the top of **every** object's chain.

```javascript
const a = {};
const b = {};

// These both come from Object.prototype
console.log(a.toString === b.toString); // true — they share it

// Now watch what happens if we pollute it:
Object.prototype.isAdmin = true;

console.log(a.isAdmin); // true  ← we never set this!
console.log(b.isAdmin); // true  ← nor this!
console.log({}.isAdmin); // true  ← nor this!
```

**Translation:** If an attacker can write to `Object.prototype`, they can inject properties into every object your app creates. New objects, existing objects, all of them. 🎭

## How the Attack Actually Works

The magic words are `__proto__`, `constructor`, and `prototype`. These are special keys that JavaScript uses to walk the prototype chain — and if your code blindly copies them from user input, you've got a problem.

### The Classic Vector: A Broken `merge()` Function

```javascript
// This innocent-looking utility is a loaded gun
function merge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      merge(target[key], source[key]); // recursive merge
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Normal usage — totally fine:
merge({ theme: 'dark' }, { fontSize: 16 });

// Attacker sends this payload via an API:
const evilPayload = JSON.parse('{"__proto__": {"isAdmin": true}}');
merge({}, evilPayload);

// Now check any NEW object:
const freshUser = {};
console.log(freshUser.isAdmin); // true 😱
```

The `merge()` function walks into `source["__proto__"]` and starts assigning onto it. Since `__proto__` on a plain object is `Object.prototype`, you've just written to the global prototype.

### Real-World Consequences

This isn't academic. Here's what polluting `Object.prototype` actually enables:

```javascript
// Scenario: Your auth middleware
function checkAdmin(user) {
  // 'user.isAdmin' should come from the database
  if (user.isAdmin) {
    return true; // ← now ALWAYS true after pollution
  }
  return false;
}

// Scenario: Your template engine
function renderTemplate(templateName, data) {
  const template = templates[templateName];
  // If 'template' is undefined, JavaScript walks the prototype chain...
  // An attacker could pre-inject a 'toString' that executes arbitrary code
}

// Scenario: Gadget chains leading to RCE
// In Node.js server contexts, prototype pollution can chain into
// child_process.exec calls via polluted configuration objects 💣
```

Real CVEs that used this exact technique:
- **lodash** (CVE-2019-10744): The world's most downloaded npm package. The `_.merge()`, `_.mergeWith()`, and `_.defaultsDeep()` functions were all vulnerable.
- **jQuery** (CVE-2019-11358): `$.extend()` with deep merge enabled.
- **express-fileupload**, **hoek**, **minimist** — the list goes on.

These libraries had *billions* of downloads. If your production app used them without patching, you were exposed.

## Spotting Vulnerable Code Patterns

Look for any function that recursively copies properties from an untrusted object:

```javascript
// 🚨 DANGER PATTERNS

// 1. Recursive deep merge / extend
function deepMerge(obj, src) {
  Object.keys(src).forEach(key => { // ← iterates __proto__ too!
    if (typeof src[key] === 'object') deepMerge(obj[key], src[key]);
    else obj[key] = src[key];
  });
}

// 2. Building objects from URL query strings
const config = {};
Object.assign(config, req.query); // ← if query has __proto__[x]=y...

// 3. JSON.parse from untrusted sources fed into merges
const userPrefs = JSON.parse(req.body.prefs);
Object.assign(appDefaults, userPrefs); // 💀
```

Quick test: does your code ever walk the keys of user-supplied JSON and copy them onto an existing object? You may be vulnerable.

## How to Defend Against It 🛡️

### Fix 1: Block the Dangerous Keys

```javascript
// Check before merging any key from external data
function safeMerge(target, source) {
  for (const key in source) {
    // Block the three attack vectors
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // Skip it. Full stop.
    }

    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      safeMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```

### Fix 2: Use `Object.create(null)` for Config/Dict Objects

```javascript
// Normal object — has prototype chain, vulnerable:
const config = {};
config.__proto__.evil = true; // affects everything!

// Null-prototype object — NO prototype chain, immune:
const safeConfig = Object.create(null);
safeConfig.__proto__; // undefined — nothing to pollute!

// Great for maps/dictionaries where you don't need inherited methods:
const userSettings = Object.create(null);
Object.assign(userSettings, parsedUserInput); // much safer
```

### Fix 3: Freeze `Object.prototype` (Nuclear Option)

```javascript
// At the very top of your application entry point:
Object.freeze(Object.prototype);

// Now any attempt to write to Object.prototype silently fails
// (or throws in strict mode)
Object.prototype.isAdmin = true; // fails silently
console.log({}.isAdmin); // undefined ✅
```

**Caveat:** This can break third-party libraries that intentionally extend `Object.prototype` (yes, some do). Test thoroughly before deploying!

### Fix 4: Validate with JSON Schema

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();

const schema = {
  type: 'object',
  additionalProperties: false, // 🔑 this is the key
  properties: {
    theme: { type: 'string', enum: ['dark', 'light'] },
    fontSize: { type: 'number', minimum: 8, maximum: 32 }
  }
};

const validate = ajv.compile(schema);

app.post('/settings', (req, res) => {
  if (!validate(req.body)) {
    return res.status(400).json({ error: 'Invalid settings' });
  }
  // Now safe to merge — unknown keys like __proto__ are rejected
  updateSettings(req.user, req.body);
});
```

`additionalProperties: false` rejects any key not in your schema whitelist. `__proto__` never makes it past validation. Clean.

## The Security Checklist 📋

- [ ] Audit all `merge`, `extend`, `deepCopy`, `assign` utility functions for key filtering
- [ ] Update lodash to ≥ 4.17.21, jQuery to ≥ 3.4.0
- [ ] Run `npm audit` — prototype pollution CVEs show up there
- [ ] Use `Object.create(null)` for lookup tables and config objects
- [ ] Validate all incoming JSON with a strict schema before merging
- [ ] Consider `Object.freeze(Object.prototype)` in high-security contexts
- [ ] Add `"__proto__"` to your WAF rule blocklist

## Testing Your Own Code 🔍

```bash
# Quick manual test: send this payload to any endpoint that merges user data
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"__proto__": {"polluted": true}}'

# Then in your app, check:
node -e "console.log({}.polluted)" # Should be undefined. If it's true, you're vulnerable.

# Automated scanning
npm install -g nodejsscan
nodejsscan --directory ./src # scans for prototype pollution patterns
```

## Real Talk 💬

**"Can't I just sanitize `__proto__` out of request bodies?"**

You can, but it's whack-a-mole. `constructor.prototype` is equivalent and often missed. Schema validation + null-prototype objects is the safer approach.

**"Is this only a Node.js problem?"**

Frontend JavaScript is also affected. Browser-side prototype pollution can enable XSS gadget chains. It's a JS ecosystem issue, not just server-side.

**"My framework handles this, right?"**

Maybe. Express doesn't sanitize this for you. Check your specific ORM, config library, and merge utilities individually.

## The Bottom Line

Prototype pollution is sneaky because the attack surface is *utility code* — the boring merge/extend functions you write once and forget. The attacker doesn't need to find your login form or your SQL queries. They just need one API endpoint that feeds untrusted JSON into a recursive copy.

**Three things to do right now:**

1. **Run `npm audit`** and patch lodash/jQuery if they're outdated.
2. **Grep your codebase** for recursive merge functions and audit their key handling.
3. **Add `additionalProperties: false`** to your JSON schema validators.

Prototype pollution is one of those vulnerabilities where the fix is genuinely simple once you know it exists. The hard part was knowing it exists. Now you do. 🧬

---

**Found a polluted merge in your codebase?** Shared discoveries make the whole ecosystem safer — drop a note on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or tag me!

**Want to dig deeper into JavaScript security?** Check out my [GitHub](https://github.com/kpanuragh) for more write-ups and secure code patterns.

*P.S. — Go grep your utils folder for `for (const key in` right now. I'll wait.* 🧬✨
