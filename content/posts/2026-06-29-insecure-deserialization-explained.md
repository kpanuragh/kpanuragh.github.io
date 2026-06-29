---
title: "💀 Insecure Deserialization: When Trusting Data Becomes a Death Wish"
date: "2026-06-29"
excerpt: "Your app is cheerfully unpacking objects from user-supplied bytes like it's Christmas morning. Spoiler: some of those gifts have malware inside. A deep dive into insecure deserialization — how it works, why it's terrifying, and how to stop doing it."
tags:
  - security
  - web-vulnerabilities
  - deserialization
  - java
  - php
  - appsec
featured: true
---

There's a certain category of vulnerability that makes security engineers go pale the moment they spot it in a codebase. SQL injection makes them wince. XSS makes them sigh. But insecure deserialization? That one makes them close the laptop, stare at the wall, and quietly question their life choices.

Let me explain why.

## What Even Is Deserialization?

Serialization is the process of converting an in-memory object into a format you can store or transmit — a byte stream, JSON, XML, whatever. Deserialization is the reverse: taking that format and reconstructing the original object.

Sounds harmless, right? You serialize a `User` object, send it over the wire, and deserialize it on the other end. What could go wrong?

Everything. Everything can go wrong.

The problem is that many serialization formats — especially language-native ones like Java's `ObjectInputStream`, PHP's `serialize()`, Python's `pickle`, or Ruby's `Marshal` — don't just store data. They store *instructions for reconstructing objects*, including which constructors and methods to call. When you hand that power to user-supplied input, you've essentially let a stranger write a grocery list that your app executes.

## The Classic PHP Gadget Chain

PHP's `unserialize()` is the poster child for this class of bug. Consider this innocent-looking code:

```php
<?php
class Logger {
    public $logFile;
    public $data;

    public function __destruct() {
        file_put_contents($this->logFile, $this->data);
    }
}

$obj = unserialize($_COOKIE['session_data']);
```

See that `__destruct` magic method? PHP calls it automatically when the object is garbage-collected. An attacker can craft a serialized payload like this:

```
O:6:"Logger":2:{s:7:"logFile";s:17:"/var/www/shell.php";s:4:"data";s:28:"<?php system($_GET['cmd']); ?>";}
```

When this hits `unserialize()`, PHP dutifully reconstructs a `Logger` object. When it goes out of scope, `__destruct` fires. The attacker just wrote a web shell to disk. Your server is now theirs.

No SQL injection. No XSS. Just a cookie value and a class that was already in your codebase.

This is what makes deserialization attacks so vicious: the attacker doesn't need to inject new code. They just need to chain together classes that *already exist* in your application — what researchers call "gadget chains." Tools like `phpggc` have pre-built gadget chains for Laravel, Symfony, Yii, and a dozen other frameworks. One-liner exploitation of an `unserialize()` call on user input.

## Java Is Even More Fun (For Attackers)

If PHP gadget chains are a horror movie, Java's native serialization is the entire franchise box set. The Apache Commons Collections vulnerability (CVE-2015-4852) was essentially a pre-built gadget chain that could execute arbitrary commands on any Java application using `ObjectInputStream.readObject()` on untrusted data — which turned out to be, uh, a lot of Java enterprise applications.

The pattern in vulnerable code:

```java
// Please, for the love of everything, don't do this
ObjectInputStream ois = new ObjectInputStream(request.getInputStream());
Object obj = ois.readObject(); // 💀 arbitrary code execution potential
```

The fix sounds simple: validate the input before deserializing. In practice, you can't — by the time you've called `readObject()`, the damage is already done. The gadget chain executes during deserialization itself, before you ever get a reference to the object.

## Not Just PHP and Java

Python's `pickle` module carries a literal warning in its documentation: "The pickle module is not secure. Only unpickle data you trust." Most developers see this, nod, and then unpickle data from Redis or a signed cookie without a second thought.

```python
import pickle

# What could go wrong?
data = pickle.loads(user_supplied_bytes)  # arbitrary code execution
```

A malicious pickle payload can call `os.system()`, spawn subprocesses, write files — anything your process has permission to do. The `__reduce__` method in a pickled object is essentially a code execution hook. The attacker just needs to craft bytes that define a spicy `__reduce__`.

## What I've Actually Seen in Production

At Cubet, we do periodic security reviews as part of client onboarding for larger projects. Earlier this year, I was reviewing an internal admin tool that used PHP sessions with custom serialization — storing role and permission objects directly in session data that, through a misconfiguration, was briefly readable by a user who'd logged out. The actual blast radius was limited because of how sessions were scoped, but the underlying pattern — serialize a complex permission object, store it, unserialize it on every request — was a ticking clock.

The fix was straightforward: serialize only primitive data (user ID, role string, timestamp), and reconstruct the full permission object fresh from the database on each request. Boring, slightly slower, infinitely safer.

## The Actual Fix

The practical guidance is annoyingly simple:

**1. Don't deserialize user-controlled data.** If you can avoid it, do. Store only primitives in cookies and sessions. Reconstruct state from your database.

**2. If you must deserialize, use safe formats.** JSON with a strict schema validator. HMAC-signed payloads where you verify the signature *before* deserializing. Formats that don't support arbitrary object instantiation.

**3. Language-native serialization formats are almost never the right choice for untrusted data.** `pickle`, `Marshal`, Java `ObjectInputStream`, PHP `unserialize()` — these are for trusted internal communication, not user input.

**4. For Java specifically**, use the `jdeserialize` tool to inspect what you're receiving, or look at serialization filters (`ObjectInputFilter`) introduced in Java 9 to allowlist acceptable types.

**5. Defense in depth**: run your deserializing process with minimal OS permissions, in a container with a restricted syscall set (seccomp). Even if gadget chain exploitation occurs, limiting what the process *can* do limits the blast radius.

## The Mental Model Shift

Here's the thing that finally clicked for me: insecure deserialization is a trust problem wearing data's clothing. You see bytes arriving from a client and your brain categorizes it as "data to process." But those bytes aren't just data — they're *instructions* for reconstructing program state. Treating them as trusted is like running code someone emailed you.

Every byte from an untrusted source should be treated with the same suspicion as a raw SQL string or an unescaped HTML value. The format doesn't matter. The *origin* does.

Your serialized objects are not just data. They're code. Treat them accordingly.

---

Got a gadget chain story that still gives you nightmares, or questions about securing your serialization layer? Hit me on [X/Twitter](https://x.com/imanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh). Always happy to talk through the fun ways bytes can ruin your week.
