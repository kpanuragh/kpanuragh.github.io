---
title: "🔐 Password Storage in 2026: Stop Using bcrypt, Start Using Argon2id"
date: "2026-06-30"
excerpt: "bcrypt was a revolutionary algorithm in 1999. It's 2026. Your password hashing deserves an upgrade — here's why Argon2id is the algorithm you should be using, and how to migrate without waking up at 3am."
tags:
  - security
  - authentication
  - passwords
  - argon2
  - bcrypt
  - devops
featured: true
---

Let me tell you about the last time I audited a mature Node.js service at Cubet. Everything looked clean — JWT handling solid, rate limiting in place, no obvious injection vectors. Then I scrolled to the auth module and saw it:

```js
bcrypt.hash(password, 10)
```

Cost factor 10. From a tutorial probably written around 2015. The kind of thing that ships and never gets revisited because "it's working." I've seen this pattern more times than I can count, and I get it — bcrypt *is* working. But "working" and "adequate for 2026" are increasingly different things.

Here's the problem: attackers have GPUs. Lots of them. And bcrypt, for all its historic brilliance, has a fundamental architectural weakness that modern hardware absolutely exploits.

## Why bcrypt Is Showing Its Age

bcrypt was designed in 1999 by Niels Provos and David Mazières. The year Windows 98 SE came out. The year *The Matrix* was released. It was genuinely ahead of its time — it introduced a work factor (cost) that you could increase as hardware improved, making it adaptive.

The issue isn't that bcrypt is *broken*. It's that it's *CPU-bound*. Modern GPU clusters are extremely good at parallelizing CPU-bound computations. An attacker with a $5,000 GPU rig can test significantly more bcrypt hashes per second than a server with the same budget. That gap has only widened as GPUs got better.

bcrypt also caps password length at 72 bytes. Silently. You can pass in a 500-character passphrase and bcrypt will cheerfully hash only the first 72 characters. That's a footgun that has bitten more than a few implementations that added a "long password" feature without checking the docs.

And bcrypt uses only 4KB of memory. In 1999, that was intentional — it fit in CPU cache. In 2026, 4KB is a rounding error. It does nothing to slow down attacker hardware that has gigabytes of VRAM to throw at the problem.

## Enter Argon2id

Argon2 won the Password Hashing Competition in 2015. The `id` variant combines the best properties of its siblings: Argon2i (side-channel resistance) and Argon2d (GPU resistance). It's been recommended by OWASP, NIST, and pretty much every standards body that's weighed in on the topic since 2017.

The key differentiator: **memory hardness**. Argon2id requires a configurable amount of RAM to compute. You can demand that each hash operation consumes 64MB or 128MB. A GPU has VRAM, yes, but parallelizing operations that each consume 64MB is a very different constraint than parallelizing operations that consume 4KB. The math stops working in the attacker's favor.

Three tuning parameters:

- **`memoryCost`** — RAM required in KiB (OWASP recommends minimum 64MB = 65536)
- **`timeCost`** — number of iterations (minimum 3 recommended)
- **`parallelism`** — degree of parallelism (set to the number of CPU cores available)

```ts
import argon2 from 'argon2';

const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_CONFIG);
}

export async function verifyPassword(
  hash: string,
  plaintext: string
): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
```

That's it. The library handles salt generation and embeds it in the output hash string. You don't need to store salt separately; the hash is self-contained and portable.

## Migrating Without Breaking Everything

The migration strategy that doesn't require you to email all your users to reset their passwords is called **lazy rehashing** (or on-the-fly migration). It's elegant:

1. On login, verify the existing bcrypt hash as normal.
2. If verification succeeds, *immediately* rehash the plaintext with Argon2id and update the stored hash.
3. Check your hash format to know which algorithm to use for verification — bcrypt hashes start with `$2b$`, Argon2id hashes start with `$argon2id$`.

```ts
import bcrypt from 'bcrypt';
import argon2 from 'argon2';

const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export async function verifyAndMigrate(
  storedHash: string,
  plaintext: string,
  updateHashFn: (newHash: string) => Promise<void>
): Promise<boolean> {
  if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
    const valid = await bcrypt.compare(plaintext, storedHash);
    if (valid) {
      const newHash = await argon2.hash(plaintext, ARGON2_CONFIG);
      await updateHashFn(newHash);
    }
    return valid;
  }

  return argon2.verify(storedHash, plaintext);
}
```

The migration is fully transparent to users. They log in, they get migrated. Within a few weeks (or months, depending on how active your user base is), the old bcrypt hashes naturally age out. You can even run a background job to force-expire remaining bcrypt hashes after a deadline, prompting those users to reset.

## The Numbers You Should Benchmark

Don't just copy the OWASP minimum values and call it done. Run benchmarks on your *actual target hardware* (the machines that will serve login requests) and tune to a target latency. OWASP recommends somewhere in the 500ms–1s range for a single hash operation on your server — enough to make brute-forcing painful without making your login page feel like it's running on a Raspberry Pi Zero.

```bash
node -e "
const argon2 = require('argon2');
const start = Date.now();
argon2.hash('benchmark', {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
}).then(() => console.log('Time:', Date.now() - start, 'ms'));
"
```

Run that a few times. Adjust `memoryCost` up until you're in the 300–700ms range. That's your sweet spot.

## A Note on Pepper

While you're upgrading, consider adding a **pepper** — a server-side secret mixed into the hash input, stored in an environment variable or secrets manager rather than the database. If an attacker exfiltrates your database but not your application secrets, they can't crack the hashes offline because they don't have the pepper.

```ts
const pepper = process.env.PASSWORD_PEPPER!;

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext + pepper, ARGON2_CONFIG);
}
```

Simple, cheap, and adds a meaningful layer. If you rotate the pepper (rare, but possible), same lazy-migration pattern applies.

## TL;DR

- **bcrypt** is not broken, but it's CPU-bound, memory-cheap, and silently truncates at 72 bytes.
- **Argon2id** is memory-hard, GPU-resistant, has no secret length limit, and is the current OWASP/NIST recommendation.
- **Migration** can happen lazily on login — no forced password resets required.
- **Benchmark on your hardware** and tune to 300–700ms per hash operation.
- **Add a pepper** while you're in there. It's three lines.

The threat landscape in 2026 is not the threat landscape of 2015. Your password hashing algorithm should reflect that. This is one of those upgrades that's genuinely easy to ship and genuinely meaningful for your users' security.

---

Spotted bcrypt in your codebase? Tag me on [Twitter/X (@iamanuragh)](https://x.com/iamanuragh) or find me on [LinkedIn](https://linkedin.com/in/iamanuragh) — I want to know if the lazy-migration approach saved your weekend.
