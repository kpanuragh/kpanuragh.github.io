---
title: "🔐 Hashing vs Encryption: Stop Confusing Them (Please, For the Love of Bcrypt)"
date: "2026-09-03"
excerpt: "One of these you can undo. One of these you absolutely cannot, and shouldn't try. Mixing them up is how passwords end up 'encrypted' in a database that a single leaked key can decrypt, and how 'hashed' API keys become impossible to display back to a user who lost their copy. Let's sort it out for good."
tags: ["security", "cryptography", "secrets-management", "appsec"]
featured: true
---

Every few months I see it in a PR review, a job interview answer, or — worst of all — a production schema: a column named `password_encrypted` sitting next to a function that clearly hashes with bcrypt. Or the opposite: someone "hashing" an API key with a reversible cipher because they need to show it to the user again later. These aren't synonyms. They're not even cousins. They're two completely different tools that happen to both produce scary-looking strings of characters, and mixing them up has sent real companies into real incident reports.

So let's settle this, once and for all, with the only mental model you actually need.

## The One-Sentence Version

**Encryption is reversible. Hashing is (supposed to be) a one-way trip.**

Encrypt something, and with the right key you get the original back, byte for byte. Hash something, and there is no key, no backdoor, no "trust me bro" — the only way to check a guess is to hash the guess again and compare. That's it. That's the whole distinction. Everything else — which algorithm, which library, which mistake will get you paged at 2am — falls out of that one sentence.

## Encryption: You Need the Original Back

Encryption exists for data you need to *retrieve*. Credit card numbers you'll show the last four digits of later. A database backup sitting in S3. A message between two services that only the intended recipient should be able to read. The whole point is symmetry: `decrypt(encrypt(data, key), key) == data`.

```python
from cryptography.fernet import Fernet

key = Fernet.generate_key()          # store this in a KMS, not in git
cipher = Fernet(key)

token = cipher.encrypt(b"4111-1111-1111-1111")
original = cipher.decrypt(token)      # you WILL need this back
```

The entire security model here rests on the key. Lose the key, lose the data. Leak the key, leak everything encrypted with it, retroactively, forever. This is why "encrypted at rest" is a much weaker claim than people treat it as — it's only as strong as your key management. I've seen a genuinely well-encrypted database rendered pointless because the decryption key lived in the same environment variables file as the database credentials. Congratulations, you've built a very elaborate lockbox and taped the key to the lid.

## Hashing: You Never Need the Original Back

Hashing is for verification, not storage. You never need to know what the original password *was* — you only ever need to know whether the thing someone just typed produces the same hash as what you stored last time. That's the entire job of a password field, and it's why "decrypting" a password should be a sentence that makes you nervous.

```python
import bcrypt

stored_hash = bcrypt.hashpw(b"correct horse battery staple", bcrypt.gensalt())

# later, at login:
bcrypt.checkpw(b"correct horse battery staple", stored_hash)  # True
```

Notice there's no `key` anywhere in that snippet. There's nothing to leak that would let you reverse it — the "one-way" property is the entire security guarantee. If your incident response plan for a breached password database is "rotate the encryption key," you didn't hash your passwords, and you have a much worse day ahead of you than you think.

One nuance that trips people up: not all hashing is created equal. `sha256("password123")` is a hash, technically, but it's *fast*, which is exactly the wrong property for passwords — fast means an attacker with a GPU rig can try billions of guesses a second against your leaked table. Password hashing needs to be deliberately slow and memory-hard: **bcrypt**, **scrypt**, or **Argon2** (the current recommendation). SHA-256 is great for checksums and file integrity, where speed is a feature, not a liability. Same category, wrong tool.

## Where I've Seen This Go Wrong

Early in my career at Acodez, I inherited a legacy PHP app where "password recovery" emailed users their actual password. Not a reset link — the literal password, in plaintext, in an email. That only works if the password is encrypted somewhere, reversibly, sitting there waiting to be decrypted and mailed out. It was a five-alarm fire dressed up as a "convenience feature," and migrating it to bcrypt with forced resets took the better part of a sprint.

More recently, at Cubet, we had the opposite confusion: a team wanted to let users copy their API key from the dashboard *after* generation, so someone had "hashed" it for storage — except hashing meant there was no way to ever show it again, which broke the exact feature they were building. The fix wasn't a crypto problem, it was a design problem: show the raw key exactly once at creation time, store only the hash for verification on each request, and make peace with the fact that a lost key means generating a new one. That's not a limitation of hashing — that's the point of it.

## The Decision Table

- **Need the original data back at some point?** → Encryption (AES-GCM, or a managed KMS so you're not rolling your own key rotation).
- **Only need to verify a match, never retrieve the original?** → Hashing, and specifically a slow one — Argon2id if you have the choice, bcrypt if you don't.
- **Just need to detect if a file changed?** → A fast hash like SHA-256 is fine, that's what it's for.
- **Storing a secret you'll need to send to an external API later?** → That's encryption wearing a trench coat. Encrypt it.

If you remember nothing else: the moment someone asks "can we get the original value back if we need to?" — if the honest answer is yes, you need encryption and a key management story. If the honest answer is "why would we ever need that," you need a hash. Getting this backwards is rarely caught in code review and almost always caught in an incident postmortem.

---

Got a war story about a `password_encrypted` column in the wild? I want to hear it. Find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp).
