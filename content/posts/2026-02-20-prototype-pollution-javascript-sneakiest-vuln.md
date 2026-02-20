---
title: "Prototype Pollution: The JavaScript Vulnerability Hiding in Your node_modules 🧪"
date: "2026-02-20"
excerpt: "A single line like `obj[key] = value` can corrupt every object in your Node.js app. Prototype pollution is responsible for dozens of critical CVEs in libraries you're probably using right now — and most developers have never heard of it."
tags: ["cybersecurity", "web-security", "security", "javascript", "nodejs"]
featured: false
---

# Prototype Pollution: The JavaScript Vulnerability Hiding in Your node_modules 🧪

I want to tell you about the day I opened a GitHub Security Advisory for `lodash` — a library sitting in roughly *every* JavaScript project ever written — and saw the words: **"Prototype Pollution leading to Remote Code Execution."**

That's lodash. The `_.merge()` function. The one you've called about 4,000 times without thinking about it.

I went and audited three production Node.js services that afternoon. Two of them were running a vulnerable version. I updated them immediately, then sat quietly for a moment, reconsidering my life choices.

Welcome to Prototype Pollution — JavaScript's sneakiest security hole, the one hiding in plain sight inside that 12MB `node_modules` folder you never look at. 💀

## JavaScript's Weird Inheritance System 🏗️

To understand this attack, you need to understand something quirky about JavaScript: **every object inherits from `Object.prototype`.**

When you do `const user = {}`, that empty object secretly has a parent: `Object.prototype`. That prototype object has things like `toString`, `hasOwnProperty`, `valueOf` — methods that every object in JavaScript can use.

The prototype chain looks like this:

```javascript
const user = {};
// user → Object.prototype → null

console.log(user.toString); // [Function: toString] ← from Object.prototype
```

This works because when JavaScript can't find a property on an object, it walks up the prototype chain looking for it. If it finds it on `Object.prototype`, every single object in your entire application gets it.

That last part is where attackers rub their hands together.

## The Attack: Poisoning the Shared Blueprint 🎯

Prototype pollution happens when an attacker controls a property key used in an assignment like `obj[key] = value`, and they set `key` to `__proto__`.

Because `obj.__proto__` is a special reference to `Object.prototype`, writing to it is like writing to the shared blueprint that every object inherits from.

The vulnerable pattern looks innocent:

```javascript
// Merging user-supplied data into an object — looks fine, right?
function merge(target, source) {
    for (let key in source) {
        target[key] = source[key]; // 💣 This is the bomb
    }
    return target;
}

// Attacker sends this JSON payload in a POST request:
// { "__proto__": { "isAdmin": true } }

const userPrefs = {};
merge(userPrefs, JSON.parse(req.body));
```

After this runs, something terrifying happens:

```javascript
const randomObj = {};
console.log(randomObj.isAdmin); // true 😱
```

You didn't set `isAdmin` on `randomObj`. You never touched it. But `Object.prototype` is now polluted — every new object inherits `isAdmin: true`.

The analogy I keep using in security community discussions: imagine every blueprint for every house in a city is stored in one shared book. Prototype pollution lets an attacker walk in, erase one page in that book, and every house built after that moment — anywhere in the city — comes with a secret backdoor. They didn't build the houses. They just edited the blueprint.

## From "isAdmin: true" to Remote Code Execution 🔥

Here's where it gets genuinely scary. In my experience building production systems, the most common place you check for `isAdmin` isn't the only thing that cares about prototype properties.

JavaScript templating engines, argument parsers, and framework internals read object properties dynamically. If an attacker can pollute `Object.prototype.outputFunctionName` or similar internally-used properties, they can inject code that template engines evaluate as... well, code.

The lodash CVEs followed exactly this path. `_.merge()`, `_.defaultsDeep()`, and `_.zipObjectDeep()` all had prototype pollution bugs that, in the right conditions, led to arbitrary code execution. These weren't obscure edge cases — they were the standard merge functions, called with attacker-controlled data from API requests.

**Real Talk 🎙️:** In security communities, prototype pollution sits in this uncomfortable space where developers look at it and say "that seems theoretical." Then you show them CVE-2019-10744 (lodash, CVSS 9.8 — Critical) and CVE-2020-28477 (immer, used in Redux Toolkit). Suddenly it's not theoretical anymore.

## Spotting the Vulnerable Patterns 🔍

The dangerous code patterns all share one thing: **user-controlled data flowing into a recursive property assignment.**

```javascript
// 🚨 All of these can be vulnerable if source contains "__proto__"

// Pattern 1: Manual merge/extend
function extend(target, source) {
    Object.keys(source).forEach(key => {
        target[key] = source[key]; // Dangerous
    });
}

// Pattern 2: Recursive deep merge (very common)
function deepMerge(target, source) {
    for (let key in source) {
        if (typeof source[key] === 'object') {
            target[key] = deepMerge(target[key] || {}, source[key]); // 💣
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

// Pattern 3: Setting nested properties by path string
function setByPath(obj, path, value) {
    // If path is "__proto__.admin", you just polluted the prototype
    const keys = path.split('.');
    keys.reduce((acc, key, i) => {
        if (i === keys.length - 1) acc[key] = value; // 💣
        return acc[key];
    }, obj);
}
```

**Pro Tip 💡:** Search your codebase for these patterns, then trace where `source` comes from. If it ever comes from `req.body`, `JSON.parse(userInput)`, or query parameters — you have a problem.

## The Safe Way: Block or Sanitize the Poison ✅

There are several layers of defense, and in my production Node.js services I layer all of them:

**1. Freeze Object.prototype (nuclear option, use carefully):**
```javascript
// At app startup, before anything else loads
Object.freeze(Object.prototype);

// Now prototype pollution attempts fail silently (or throw in strict mode)
// "__proto__" assignments become no-ops
```

**2. Use `Object.create(null)` for untrusted data containers:**
```javascript
// Objects created with null prototype have NO prototype chain to pollute
const safeContainer = Object.create(null);
// safeContainer.__proto__ is undefined — nothing to poison
```

**3. Sanitize keys before using them as property names:**
```javascript
function safeMerge(target, source) {
    for (let key in source) {
        // Block the two dangerous keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue; // Skip these, always
        }
        if (typeof source[key] === 'object' && source[key] !== null) {
            target[key] = safeMerge(target[key] || {}, source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}
```

**4. Use `hasOwnProperty` check when iterating:**
```javascript
// Instead of: for (let key in source)
// Use: Object.keys() which only returns own properties, not inherited ones
for (let key of Object.keys(source)) {
    // __proto__ won't appear here
}
```

**5. Update your libraries. Seriously, right now:**
```bash
# Check for known vulnerabilities
npm audit

# Fix automatically where possible
npm audit fix

# Check for outdated packages
npx npm-check-updates
```

## The Libraries That Got You Covered 🛡️

The good news: modern versions of the libraries that had these bugs are now fixed. The bad news: you have to actually update them.

- **lodash >= 4.17.21** — patched CVE-2020-8203 and related bugs
- **immer >= 8.0.1** — patched CVE-2020-28477
- **jquery >= 3.5.0** — patched prototype pollution in `$.extend()`
- **minimist >= 1.2.6** — patched the classic prototype pollution in argument parsing

If you're running Node.js apps and haven't run `npm audit` recently... I'll wait. Go do it. I'll be here when you get back.

## Real-World Impact: It's Not Just "isAdmin" 🌍

When I discuss prototype pollution in security communities, newer folks often think "okay, so someone can make themselves an admin — big deal, just check roles properly." But the real danger is subtler.

Polluted prototype properties affect:
- **Template engines** that read object properties to render HTML (→ XSS or RCE)
- **Argument parsers** that check flags from object properties (→ bypass security checks)
- **Serializers** that iterate all object properties (→ data exposure, injected fields in output)
- **Express.js middleware** that reads properties from request objects (→ security bypass)

In security research, we've seen prototype pollution used as a stepping stone — first pollute the prototype, then trigger a code path in a template engine that uses the polluted property, escalate to RCE. The CVEs are real. The bounties were real. The patches are real.

## Your Prototype Pollution Checklist ✅

Before you ship that Node.js API:

- [ ] Run `npm audit` — fix any prototype pollution CVEs
- [ ] Search codebase for `for...in` loops that assign to `target[key]`
- [ ] Validate and sanitize `__proto__`, `constructor`, `prototype` keys from user input
- [ ] Use `Object.keys()` instead of `for...in` when iterating user data
- [ ] Consider `Object.freeze(Object.prototype)` in security-sensitive apps
- [ ] Pin library versions and set up Dependabot alerts for new CVEs

## TL;DR 🎯

Prototype pollution is what happens when user-controlled property keys reach an object assignment, and those keys happen to be `__proto__` or `constructor`. It silently modifies the shared prototype that every JavaScript object inherits from — and in serious cases, it escalates to Remote Code Execution.

- **`__proto__` and `constructor` are dangerous as property keys** — sanitize them
- **`for...in` can iterate prototype properties** — prefer `Object.keys()`
- **Your favorite npm libraries have had this bug** — keep them updated
- **`npm audit` is your first line of defense** — run it regularly
- **`Object.create(null)` creates prototype-free objects** — use for untrusted data

JavaScript's prototype chain is an elegant feature. It's also a shared attack surface. Protect it accordingly.

---

**Spotted a prototype pollution bug in a bug bounty hunt, or just want to chat JavaScript security?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I love a good disclosure story.

**More code on** [GitHub](https://github.com/kpanuragh) — where `for...in` loops are heavily scrutinized before they touch production. 🔐

*Now go run `npm audit`. Seriously.*
