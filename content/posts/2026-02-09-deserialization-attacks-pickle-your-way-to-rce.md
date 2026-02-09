---
title: "Deserialization Attacks: How Pickled Data Can Pickle Your App 🥒"
date: "2026-02-09"
excerpt: "Think accepting serialized data is safe? Think again! Learn how deserialization attacks turn innocent-looking data into remote code execution nightmares."
tags: ["cybersecurity", "web-security", "security", "owasp", "rce"]
featured: true
---

# Deserialization Attacks: How Pickled Data Can Pickle Your App 🥒

You know what's worse than a SQL injection? A vulnerability that lets attackers literally run ANY code they want on your server. Welcome to the wild world of **insecure deserialization**! 🎭

As someone who's spent years building production systems and lurking in security communities, I can tell you: this vulnerability is sneaky, powerful, and way more common than you'd think.

## What The Heck Is Deserialization? 🤔

Think of serialization like freeze-drying food. You take a complex object (a steak) and turn it into something you can easily store or transport (freeze-dried steak bits).

**Deserialization** is the reverse - you take those bits and turn them back into a steak.

In programming:
- **Serialization:** Convert an object → string/bytes (to save or send)
- **Deserialization:** Convert string/bytes → object (to use again)

Sounds harmless, right? **WRONG.** 🚨

## The Problem: Objects Can Execute Code

Here's the scary part: When you deserialize data, you're not just creating a passive object. In many languages, objects can have **magic methods** that run automatically during deserialization.

It's like ordering a pizza and it comes with a free burglar hiding in the box. 📦🥷

## Real-World Example: The Cookie Monster Attack 🍪

Let me share a story from my early days. I was reviewing a Laravel app where someone thought it was clever to store user preferences in a serialized cookie.

**The "clever" code:**
```php
// Storing user preferences
$preferences = serialize($userPrefs);
setcookie('prefs', $preferences);

// Loading them back
$preferences = unserialize($_COOKIE['prefs']);
```

**What could go wrong?** EVERYTHING.

An attacker can craft a malicious serialized object, stick it in the cookie, and boom - remote code execution when you call `unserialize()`.

## How Bad Can It Get? 💣

In my experience building systems with Laravel and Node.js, I've seen deserialization attacks lead to:

1. **Remote Code Execution (RCE)** - Run ANY command on the server
2. **Data exfiltration** - Steal your entire database
3. **Denial of Service** - Crash the app with malicious objects
4. **Privilege escalation** - Turn a regular user into admin

**Real Talk:** This is an OWASP Top 10 vulnerability. Companies like Equifax got hacked partly due to deserialization flaws. Not theoretical - VERY real!

## Language-Specific Danger Zones 🎯

### PHP: The Unserialize Nightmare

**BAD (never do this):**
```php
// User input goes STRAIGHT into unserialize. Yikes!
$data = unserialize($_POST['data']);
```

**GOOD:**
```php
// Use JSON instead - it's just data, no code execution
$data = json_decode($_POST['data'], true);

// Or if you MUST use serialize, validate the hell out of it
$allowed_classes = ['User', 'Preference'];
$data = unserialize($input, ['allowed_classes' => $allowed_classes]);
```

### Python: Pickle Is Not Your Friend

I learned this the hard way while working on a data pipeline project.

**BAD:**
```python
# pickle.loads() can execute arbitrary code!
import pickle
data = pickle.loads(user_input)  # 🔥 DANGER 🔥
```

**GOOD:**
```python
# Use JSON for untrusted data
import json
data = json.loads(user_input)  # Safe! Just data.

# Or if you need complex objects, use safer alternatives
import jsonpickle
data = jsonpickle.decode(user_input)  # More restrictions
```

### Node.js: node-serialize Gotcha

**BAD:**
```javascript
const serialize = require('node-serialize');
// User controls this input? RCE incoming!
const obj = serialize.unserialize(req.body.data);
```

**GOOD:**
```javascript
// Just use JSON.parse - it's built-in and safe
const obj = JSON.parse(req.body.data);

// For complex needs, validate schemas
const Ajv = require('ajv');
const ajv = new Ajv();
const validate = ajv.compile(schema);
if (validate(JSON.parse(data))) {
    // Safe to use
}
```

### Java: The Serialization OG

Java's been dealing with this since the '90s!

**BAD:**
```java
// Classic vulnerability
ObjectInputStream ois = new ObjectInputStream(inputStream);
Object obj = ois.readObject();  // Dangerous!
```

**GOOD:**
```java
// Use a whitelist of allowed classes
class SafeObjectInputStream extends ObjectInputStream {
    @Override
    protected Class<?> resolveClass(ObjectStreamClass desc)
        throws IOException, ClassNotFoundException {
        if (!allowedClasses.contains(desc.getName())) {
            throw new InvalidClassException("Unauthorized class");
        }
        return super.resolveClass(desc);
    }
}
```

## The Laravel Way: How I Handle It 🛡️

In my Laravel projects, I follow these rules religiously:

```php
// ❌ NEVER deserialize user input
$bad = unserialize($request->input('data'));

// ✅ Use JSON for data transfer
$good = $request->json('data');

// ✅ Laravel's signed cookies (can't be tampered with)
Cookie::make('prefs', json_encode($data))->withSigning();

// ✅ Encrypted cookies for sensitive stuff
Cookie::make('session', json_encode($data))->withEncryption();
```

**Pro Tip:** Laravel encrypts session data by default. Use that! Don't roll your own serialization for sessions.

## Red Flags: When To Worry 🚩

Working with various teams, I've learned to spot these danger patterns:

1. **Seeing `unserialize()`, `pickle.loads()`, `readObject()` in code**
   - Especially if the input comes from users!

2. **Serialized data in cookies or URLs**
   - Why would you do this?! Use JSON!

3. **"Trust me, only admins can access this endpoint"**
   - Authorization bugs happen. Defense in depth!

4. **Custom serialization formats**
   - Unless you're a crypto expert, stick to JSON

## How To Protect Yourself ✅

From my years in production environments, here's what works:

### 1. Just Use JSON

Seriously. 99% of the time, JSON is enough.

```php
// Instead of serialize/unserialize
json_encode($data);
json_decode($data, true);
```

**Why it's safe:** JSON is pure data. No code execution, no magic methods.

### 2. If You MUST Deserialize...

Use strict allowlists:

```php
// PHP 7+
$data = unserialize($input, [
    'allowed_classes' => ['App\Models\User']
]);
```

```python
# Python: Use safer alternatives
import jsonpickle
jsonpickle.set_encoder_options('json', sort_keys=True)
```

### 3. Sign/Encrypt Serialized Data

```php
// Laravel makes this easy
$encrypted = Crypt::encryptString(serialize($data));
$data = unserialize(Crypt::decryptString($encrypted));
```

If attackers can't modify the serialized data, they can't inject malicious objects.

### 4. Input Validation & Type Checking

```php
// Validate structure before deserializing
$validator = Validator::make($request->all(), [
    'data' => 'required|json|max:1000',
]);

$data = json_decode($request->input('data'), true);

// Check it's what you expect
if (!isset($data['name']) || !isset($data['email'])) {
    abort(422, 'Invalid data structure');
}
```

## The Security Community Perspective 🔐

In security communities like the ones I'm active in, deserialization attacks are considered "high severity" because:

- **Easy to exploit** once you find the vuln
- **Hard to detect** in code reviews (looks innocent)
- **Critical impact** - often leads to RCE
- **Common in legacy code** - PHP especially

**Fun fact:** There's even a tool called "ysoserial" that generates malicious Java serialization payloads. Hackers LOVE this vulnerability.

## Testing Your App 🧪

Here's what I do in production:

```bash
# 1. Search your codebase for danger functions
grep -r "unserialize\|pickle.loads\|readObject" .

# 2. Check dependencies
composer show --direct  # PHP
pip list               # Python
npm ls --depth=0       # Node.js

# Look for packages with known deserialization issues

# 3. Use security scanners
# For PHP:
./vendor/bin/phpstan analyse
./vendor/bin/psalm

# For Python:
bandit -r .

# For Node:
npm audit
```

## Real-World War Story 🎖️

Last year, I was doing code review for a team migrating from an old PHP app. They had this "clever" caching mechanism:

```php
// Store rendered HTML in cache (serialized for "efficiency")
$cache->put($key, serialize($renderedView));

// Later...
echo unserialize($cache->get($key));
```

I nearly fell off my chair. The cache was Redis - accessible to multiple services. An attacker compromising ANY service with Redis access could inject malicious serialized objects.

**The fix:** Changed it to just store the plain HTML string. No serialization needed!

```php
// Much better
$cache->put($key, $renderedView);
echo $cache->get($key);
```

Sometimes the best security fix is removing "clever" code. 😅

## Your Action Plan 📋

**Do these NOW:**

1. ✅ Search codebase for deserialization functions
2. ✅ Replace with JSON where possible
3. ✅ Add allowlists if you must deserialize
4. ✅ Encrypt/sign serialized data in storage
5. ✅ Never deserialize user-controlled data
6. ✅ Update dependencies (old libs = known exploits)
7. ✅ Add input validation before deserialization

## The Bottom Line 🎯

**Deserialization attacks are scary because:**
- They turn data processing into code execution
- They're hard to spot in code reviews
- They often lead to complete server compromise
- They're in the OWASP Top 10 for a reason!

**Protection is simple:**
- Default to JSON (it's just data)
- Never trust serialized input from users
- Use framework protections (Laravel's encrypted cookies, etc.)
- Validate EVERYTHING before deserializing

Think of it this way: Accepting serialized data from users is like accepting a "gift" package from a stranger at the airport. Just don't do it! 🎁💣

---

**Got security questions?** Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or check out my projects on [GitHub](https://github.com/kpanuragh). As someone passionate about security and active in security communities, I love discussing this stuff!

**Want more security deep-dives?** Follow this blog! Next up: I'm thinking about diving into prototype pollution attacks in JavaScript. 🎭

*Stay secure out there! Remember: JSON is your friend, pickles are for sandwiches!* 🥒✨
