---
title: "Prototype Pollution: The JavaScript Vulnerability That Hides in Plain Sight 🧬☠️"
date: "2026-03-24"
excerpt: "You've heard of SQL injection and XSS, but prototype pollution? This sneaky JavaScript attack lets hackers silently corrupt your entire app by mutating Object.prototype itself — and you probably have vulnerable code in production right now. Let's fix that."
tags: ["security", "javascript", "nodejs", "vulnerability"]
featured: true
---

# Prototype Pollution: The JavaScript Vulnerability That Hides in Plain Sight 🧬☠️

Let me paint you a picture. You're building a slick Node.js API. Your code looks clean. Your tests pass. ESLint is happy. Your security scanner gives you a thumbs up. And yet — with one carefully crafted JSON payload — an attacker can silently flip a switch that makes your entire app behave differently for **every single user**. No database access needed. No file system required. Just pure, cursed JavaScript.

Welcome to **prototype pollution**, the vulnerability that makes senior JS devs stare at the ceiling at 3am. 🌙

## What Even IS Prototype Pollution? 🤔

Here's the thing about JavaScript that you learned in week 1 and then immediately suppressed: **everything inherits from `Object.prototype`**.

```javascript
const user = { name: "Alice" };

// These are the same thing:
user.toString();
Object.prototype.toString.call(user);

// Every object in your app shares this prototype chain
console.log(user.__proto__ === Object.prototype); // true
```

Now here's where it gets evil. What if an attacker could **add properties to `Object.prototype` itself**? Suddenly those properties would appear on EVERY object in your application. Every `{}`. Every `[]`. Every class instance. All of it. Poisoned.

That's prototype pollution. And it's more common than you think. 🐛

## The Attack in Action 💣

Here's the classic pattern. You have a function that deep-merges objects (maybe you wrote it yourself, maybe you imported `lodash.merge` before the patch):

```javascript
// A naive "deep merge" that's actually a trap
function merge(target, source) {
  for (let key in source) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      merge(target[key], source[key]);
    } else {
      target[key] = source[key]; // ← HERE BE DRAGONS 🐉
    }
  }
  return target;
}

// Attacker sends this JSON body:
const evilPayload = JSON.parse('{"__proto__": {"isAdmin": true}}');

merge({}, evilPayload); // 💥

// Now check this out...
const innocentUser = {};
console.log(innocentUser.isAdmin); // true — wait WHAT?!
```

The attacker didn't touch your database. Didn't bypass your auth middleware. They just sent a JSON payload and now **every object in your Node.js process** has `isAdmin: true`.

And if your authorization check looks like this?

```javascript
// Somewhere in your codebase...
if (req.user.isAdmin) {
  // Serve admin dashboard
}

// req.user might be: {}
// {}.isAdmin → inherited from Object.prototype → true
// 🎉 Free admin access!
```

Game over. 🎮❌

## Real-World Impact: This Isn't Just Theoretical 📰

This isn't a made-up CTF scenario. Prototype pollution bugs have been found in:

- **`lodash`** (CVE-2019-10744) — used by literally millions of projects
- **`jquery`** (CVE-2019-11358) — you know the one
- **`minimist`** — the tiny args parser used everywhere
- **`hoek`** — Hapi.js's utility library
- **`set-value`**, **`merge`**, **`deep-merge`** — and dozens more

If you ran `npm install` in the last 5 years, you've had a vulnerable package. The attack surface is enormous because **deep object merging is incredibly common** in JS codebases.

## How to Find Vulnerable Code 🔍

Look for these patterns in your own code:

```javascript
// ⚠️ Classic vulnerable patterns:

// 1. Recursive merge without key sanitization
function deepMerge(obj1, obj2) {
  for (const key in obj2) {       // `for...in` traverses prototype chain
    if (typeof obj2[key] === 'object') {
      deepMerge(obj1[key], obj2[key]); // Recurses into __proto__!
    } else {
      obj1[key] = obj2[key];
    }
  }
}

// 2. Setting nested properties from user input
function setNestedValue(obj, path, value) {
  const keys = path.split('.');    // "__ proto__.isAdmin" → poisoned!
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value; // 💀
}

// 3. JSON.parse + spread/assign with nested objects
const userConfig = JSON.parse(req.body);
Object.assign(defaultConfig, userConfig);  // Shallow = safer, but still risky
```

## The Fixes: How to Actually Defend Yourself 🛡️

### Fix #1: Sanitize Keys Before Merging

```javascript
// ✅ Block dangerous keys
function safeMerge(target, source) {
  const BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];

  for (const key of Object.keys(source)) { // Object.keys() ≠ for...in (no proto traversal)
    if (BLOCKED_KEYS.includes(key)) {
      continue; // Skip poisoned keys!
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

### Fix #2: Use `Object.create(null)` for Data Dictionaries

```javascript
// ❌ Inherits from Object.prototype (dangerous for user-controlled data)
const userSettings = {};

// ✅ Prototype-free object — no inheritance chain!
const userSettings = Object.create(null);

// userSettings.__proto__ === undefined
// No prototype chain to pollute!
```

This is especially useful for config stores, caches, and anything that holds user-controlled keys.

### Fix #3: Validate with JSON Schema

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string', enum: ['user', 'editor'] }
  },
  additionalProperties: false, // ← reject __proto__ and anything unexpected!
  required: ['name']
};

const validate = ajv.compile(schema);

app.post('/update-profile', (req, res) => {
  if (!validate(req.body)) {
    return res.status(400).json({ error: 'Invalid input' });
  }
  // Safe to use req.body now ✅
});
```

`additionalProperties: false` is your best friend here. If `__proto__` isn't in your schema, it gets rejected at the door. 🚪

### Fix #4: Freeze Object.prototype (Nuclear Option)

```javascript
// At the very top of your entry point (app.js / index.js):
Object.freeze(Object.prototype);

// Now any attempt to mutate Object.prototype throws a TypeError
// merge({}, JSON.parse('{"__proto__": {"isAdmin": true}}'));
// → TypeError: Cannot add property isAdmin, object is not extensible ✅
```

Fair warning: this can break poorly-written third-party code that relies on prototype mutation. Test thoroughly before deploying. But for many Node.js services it's safe and adds a solid layer of defense.

## Quick Audit Checklist ✅

Before you close this tab, run through these:

```markdown
□ Are you using lodash.merge, _.merge, or any deep-merge utility?
  → Check its version, update to patched release

□ Do you accept JSON payloads and merge them into objects?
  → Add key sanitization or JSON Schema validation

□ Do you use for...in to iterate objects built from user input?
  → Switch to Object.keys() or Object.entries()

□ Do you set object properties using user-controlled key paths?
  → Sanitize key segments, block __proto__ / constructor / prototype

□ Do you run npm audit regularly?
  → Do it right now: npm audit fix
```

## The Bottom Line 💡

Prototype pollution is sneaky because it doesn't look like an attack. It looks like normal JSON. It looks like a config merge. It looks like a feature. But one malicious `__proto__` key and your entire JavaScript runtime is compromised.

The good news? The fixes are simple once you know what to look for:

- **Block `__proto__`, `constructor`, and `prototype` keys** in any merge/set operation
- **Use `Object.create(null)`** for data dictionaries built from user input
- **Validate incoming JSON** with strict schemas
- **Keep dependencies updated** — most popular libraries have already patched this
- **Run `npm audit`** like your app's life depends on it (because it does)

You've already hardened your SQL queries and sanitized your HTML output. Spend 20 minutes today auditing your object merges — your future self will thank you. 🙏

---

**Found a prototype pollution bug in the wild?** I'd love to hear about it — connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my security write-ups on [GitHub](https://github.com/kpanuragh).

*Now go run `npm audit` — I'll wait.* 🔍✨
