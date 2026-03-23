---
title: "Prototype Pollution: When JavaScript's Inheritance Becomes Your Worst Enemy 🧬"
date: "2026-03-05"
excerpt: "You've heard of SQL injection, XSS, and CSRF. But have you met prototype pollution — the JavaScript attack that silently poisons every object in your app? Let's fix that."
tags: ["\\\"cybersecurity\\\"", "\\\"web-security\\\"", "\\\"security\\\"", "\\\"nodejs\\\"", "\\\"javascript\\\""]
featured: "false"
---

# Prototype Pollution: When JavaScript's Inheritance Becomes Your Worst Enemy 🧬

Picture this: you're deep in a Node.js codebase, everything looks fine, no SQL queries, no `eval()`, no `innerHTML` disasters. Then someone sends a carefully crafted JSON payload and suddenly **every object in your application has a property it shouldn't**. Welcome to prototype pollution — the sneaky villain of the JavaScript world.

I first encountered this properly when a CVE dropped for `lodash` (yes, _that_ lodash — the one inside literally every Node.js project ever). In my experience building production systems, we had lodash in about 40 transitive dependencies. That CVE spread through our teams like wildfire. And the root cause? Something as fundamental as how JavaScript handles object inheritance.

## JavaScript's Inheritance: A Quick Refresher 🧠

In JavaScript, every object inherits from `Object.prototype`. This is the backbone of how the language works.

```js
const myObj = {};
console.log(myObj.toString); // [Function: toString] — inherited!
```

That `toString` method didn't come from `myObj`. It came from `Object.prototype`. Every plain object in JavaScript silently inherits from it.

Now here's where it gets dangerous.

## What Even IS Prototype Pollution? 💀

Prototype pollution happens when an attacker can set a property on `Object.prototype` — meaning **every object in your entire application suddenly has that property**.

```js
// Attacker sends this payload
const payload = JSON.parse('{"__proto__": {"isAdmin": true}}');

// This innocent-looking merge function is the trap
function merge(target, source) {
  for (let key in source) {
    target[key] = source[key]; // <-- danger zone
  }
}

merge({}, payload);

// Now EVERY object inherits isAdmin: true
const user = {};
console.log(user.isAdmin); // true 😱
```

That `{}` at the end, a completely empty object, now returns `true` for `isAdmin`. No authentication. No database query. Just a poisoned prototype.

This is the attack in a nutshell: **trick the app into writing to `__proto__`, infect the entire object hierarchy**.

## Real Talk: This Has Bit Real Libraries 🔥

In security communities, we often discuss how prototype pollution went from "theoretical curiosity" to "critical CVE" when researchers started finding it everywhere:

- **lodash** (CVE-2019-10744) — `_.merge()`, `_.set()`, `_.zipObjectDeep()` all vulnerable at some point
- **jQuery** (CVE-2019-11358) — `$.extend()` was vulnerable before a fix
- **Hoek** — a popular Hapi.js utility library
- **minimist** — the CLI argument parser used in thousands of tools

These aren't obscure packages. These are _core_ dependencies. As someone passionate about security, I remember auditing our entire dependency tree after the lodash CVE dropped. It was not a fun afternoon.

## How Attackers Deliver the Payload 🎯

The attack usually comes through user-controlled JSON that gets merged or cloned:

**Scenario 1: API body parsing**

```js
// Attacker sends POST body:
// {"__proto__": {"polluted": "yes"}}
app.post('/profile', (req, res) => {
  const settings = {};
  Object.assign(settings, req.body); // 💥 if body has __proto__
});
```

**Scenario 2: Deep clone / merge utilities**

```js
// ❌ Vulnerable custom merge
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object') {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
// If key is "__proto__", you've just written to Object.prototype
```

**Scenario 3: Query string / URL parameter parsing**

```
GET /search?__proto__[isAdmin]=true
```

Some query string parsers will happily parse nested objects from bracket notation.

## From Pollution to RCE? Yes, Really. 🚨

In Node.js, prototype pollution can escalate to Remote Code Execution. In security communities, we often discuss this escalation path in CTF writeups.

```js
// If an attacker pollutes: Object.prototype.env = { NODE_OPTIONS: "--inspect=..." }
// And your app does something like:
child_process.spawn('node', ['script.js'], { env: process.env });
// The polluted env property gets picked up...
```

I won't go into full exploitation details here, but the CVE-2022-37601 on `loader-utils` (webpack ecosystem) showed that prototype pollution in build tools can have very real consequences. The path from "weird JSON property" to "attacker runs code on your CI server" is shorter than you'd think.

## The Fix: How to Actually Prevent It 🛡️

### 1. Never merge user input directly

```js
// ❌ Bad — user input goes directly into object merge
const config = merge({}, req.body);

// ✅ Good — whitelist the keys you actually need
const config = {
  theme: req.body.theme,
  language: req.body.language,
};
```

### 2. Use `Object.create(null)` for lookup tables

```js
// ❌ Regular object inherits from Object.prototype
const lookup = {};

// ✅ Null-prototype object — no inheritance, no pollution target
const lookup = Object.create(null);
lookup['__proto__'] = 'harmless string'; // just a regular key now
```

### 3. Check keys before merging

```js
function safeMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // skip dangerous keys
    }
    target[key] = source[key];
  }
  return target;
}
```

### 4. Validate and sanitize deep objects at the boundary

```js
// Use a schema validator like Joi or Zod — they won't let __proto__ sneak in
const schema = z.object({
  name: z.string(),
  age: z.number(),
});
const safe = schema.parse(req.body); // __proto__ just gets stripped
```

### 5. Freeze `Object.prototype` in tests

```js
// In your test setup — catch pollution early
Object.freeze(Object.prototype);
```

This will cause an error if any code tries to write to `Object.prototype`, surfacing the bug during development instead of in production.

## Pro Tip: Audit Your Merge Functions 🔍

In my experience building production systems, custom `deepMerge`, `extend`, or `clone` utilities are the most common source of this bug. Grep your codebase:

```bash
# Hunt for dangerous merge patterns
grep -r "target\[key\]" src/
grep -r "\[key\] = source" src/
```

And for dependencies, check if you're on patched versions of lodash (≥4.17.21), jQuery (≥3.4.0), and minimist (≥0.2.1 or ≥1.2.6).

## Real Talk: The Sneaky Part 👻

What makes prototype pollution especially nasty isn't just the attack surface — it's the **silent failure mode**. Your app doesn't crash. There's no obvious error. Objects just start having extra properties they shouldn't have.

I've seen code that does `if (user.isAdmin)` without explicitly setting `isAdmin` on the user object, assuming it defaults to `undefined` (falsy). After a prototype pollution attack? It's `true`. And the developer never knew.

The fix for that specific pattern is easy — always use `hasOwnProperty`:

```js
// ❌ Checks inherited AND own properties
if (user.isAdmin) { ... }

// ✅ Only checks properties directly on the object
if (Object.prototype.hasOwnProperty.call(user, 'isAdmin') && user.isAdmin) { ... }
```

Or in modern JS:

```js
if (Object.hasOwn(user, 'isAdmin') && user.isAdmin) { ... }
```

## TL;DR ✅

- Prototype pollution lets attackers inject properties into **every object** in your app via `__proto__`
- It comes through JSON merges, deep clones, and query string parsers with user-controlled input
- In Node.js it can escalate to Remote Code Execution
- **Fix it:** never merge user input directly, use `Object.create(null)` for lookup maps, validate at boundaries with Zod/Joi, and block `__proto__`/`constructor`/`prototype` keys explicitly
- Audit your custom merge/clone utilities — they're the most common vector

JavaScript's prototype chain is one of the language's most powerful features. It's also, as attackers know, one of its most abusable. Keep your objects clean. 🧼

---

Spotted a prototype pollution sink in the wild? I'd love to hear the story — hit me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out more of my security experiments on [GitHub](https://github.com/kpanuragh). As someone who spends weekends decoding RF signals and prodding APIs for fun, weird JavaScript inheritance bugs feel right at home. 🔐
