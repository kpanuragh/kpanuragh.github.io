---
title: "🧟 Prototype Pollution: The JS Bug That Turns __proto__ Into a Backdoor"
date: "2026-07-27"
excerpt: "You sanitized the input. You validated the schema. You still got owned, because nobody was watching __proto__. Here's how a JSON merge nobody thought twice about can quietly rewrite the behavior of every object in your Node app."
tags:
  - security
  - web-security
  - nodejs
  - javascript
  - appsec
featured: true
---

# 🧟 Prototype Pollution: The JS Bug That Turns __proto__ Into a Backdoor

Here's a sentence that should not be legal, and yet: in JavaScript, you can set a property on an object that doesn't exist yet, on an object you've never even seen, and have it show up on *every other object in the process* — including ones the framework created for itself. No exploit chain. No memory corruption. Just an object literal with an unlucky key name.

That's prototype pollution, and it's the vulnerability class that makes backend engineers who came from Java or Go stare at JavaScript like it just admitted to a crime. It's been quietly sitting in the OWASP conversation for years, powered real CVEs in `lodash`, `jQuery`, `minimist`, and Kibana, and it keeps coming back because the root cause isn't a bug in any one library — it's a language feature working exactly as designed.

## The Feature That's Also the Vulnerability

Every plain object in JS inherits from `Object.prototype`. That's how `.toString()` and `.hasOwnProperty()` magically exist on objects you never defined them on. The inheritance chain is walked via an internal link, exposed to userland as `__proto__`.

Which means this is valid, working JavaScript:

```js
const obj = {};
obj.__proto__.isAdmin = true;

const anotherObj = {};
console.log(anotherObj.isAdmin); // true 😱
```

You didn't touch `anotherObj`. You touched the *prototype that every object literal shares*, and now every object in your process — past, present, future — answers `true` to `isAdmin` unless it explicitly overrides it. This isn't a leaked reference or a shared mutable singleton some junior dev introduced. It's the default behavior of `{}`.

## Where It Actually Bites: Recursive Merge

Nobody writes `obj.__proto__.isAdmin = true` on purpose. The real-world version is a recursive merge or "deep assign" utility — the kind every app has one of, hand-rolled or from a library, for merging user-supplied JSON into a config object or a Mongoose-style update payload:

```js
function merge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = {};
      merge(target[key], source[key]); // recurse into nested keys
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// attacker-controlled JSON body:
const payload = JSON.parse('{"__proto__": {"isAdmin": true}}');
merge({}, payload);
```

`merge` doesn't check whether `key` is `__proto__`, `constructor`, or `prototype` — it just walks whatever keys `JSON.parse` handed back, and `JSON.parse` is perfectly happy to produce a key literally named `__proto__`. The `for...in` loop assigns straight into `target[key]`, which for that one key doesn't create an own property — it reaches through to the shared prototype. From that point on, every plain object in the process has `isAdmin: true` as an inherited default, and any code doing `if (user.isAdmin)` without an explicit `false` somewhere upstream just got bypassed.

This is exactly the shape of CVE-2018-3721 and CVE-2019-10744 in `lodash`'s `_.merge` and `_.defaultsDeep` — both fixed, both still show up in dependency trees that pinned an old version years ago and never looked back.

## Why This Isn't Just a Theoretical Party Trick

The scary part isn't the toy example — it's what pollution reaches once it's landed. If your app configures anything by reading defaults off a plain object (template engines, ORMs, `child_process` option objects, even some auth middleware defaults), and that config lookup falls through to the prototype when a property is missing, an attacker who pollutes the right key can flip a boolean nobody remembered was a boolean. There are documented paths from prototype pollution straight to remote code execution — a polluted `shell` or `env` option landing in a `child_process.exec` call is the classic escalation, no separate injection bug required.

The fix is boring, which is good, because boring fixes actually get adopted:

```js
function safeMerge(target, source) {
  for (const key in source) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue; // never assign into the prototype chain
    }
    if (typeof source[key] === 'object' && source[key] !== null) {
      if (!target[key]) target[key] = Object.create(null);
      safeMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```

Or, more realistically: don't hand-roll the merge at all. Use `Object.freeze(Object.prototype)` in defense-in-depth setups, prefer `Map` over plain objects for anything keyed by untrusted input, and keep dependencies like `lodash` current — the patched versions block these key names for you.

At Cubet, this came up during a review of a config-import feature that accepted a JSON body and merged it into an in-memory settings object — completely unremarkable code, the kind you write in ten minutes and forget about. It took one `curl` with a `__proto__` key in the payload to prove the point in staging. Nobody was careless; it's just that "merge this JSON into that object" doesn't *look* like an attack surface until you've been burned once.

## The Takeaway

Prototype pollution isn't rare because it's hard to exploit — it's rare in *headlines* because it's invisible in code review. A merge function looks correct. A recursive assign looks correct. The bug isn't in the logic, it's in a key name your validation never thought to block. If your app parses JSON and merges it into anything, anywhere, go check whether `__proto__` is on your denylist today — not after the next CVE makes you.

Found a merge function of your own that needs a second look? I write about this kind of thing regularly — come argue with me about it on [Twitter/X](https://twitter.com/anuragh_kp), star the source on [GitHub](https://github.com/kpanuragh), or connect on [LinkedIn](https://linkedin.com/in/anuraghkp).
