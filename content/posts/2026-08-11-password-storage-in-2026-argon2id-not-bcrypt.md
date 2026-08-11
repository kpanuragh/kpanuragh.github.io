---
title: "🔐 Password Storage in 2026: Why Your bcrypt Calls Are an Antique"
date: "2026-08-11"
excerpt: "bcrypt got us through two decades of password breaches admirably, but it has a blind spot GPUs and ASICs have been happily exploiting for years. Here's why argon2id is the actual right default now, and how to migrate without forcing a mass password reset."
tags:
  - security
  - authentication
  - cryptography
  - backend
featured: true
---

Every few years I go looking through some codebase's auth module expecting to find `bcrypt.hash(password, 10)` staring back at me, and every few years I find it. Not because anyone made a bad call — bcrypt was a genuinely great call in 2010. It's because "the auth code works, don't touch it" is one of the strongest gravitational forces in software engineering. Password hashing is the one place where that instinct quietly costs you.

So let's talk about why 2026 is a good year to finally swap bcrypt for argon2id, and why "it hasn't been broken yet" isn't the same as "it's still the best tool for the job."

## The Thing bcrypt Was Never Designed For

bcrypt is CPU-hard. That was the entire point in 1999 — make hashing slow enough that brute-forcing passwords on a CPU becomes impractical. It worked great, right up until attackers stopped using CPUs.

Modern password cracking runs on GPUs and purpose-built ASICs, and bcrypt has a structural weakness against them: it uses a tiny, fixed amount of memory (4KB for its internal state, regardless of cost factor). GPUs have thousands of cores and gigabytes of memory to spare, so they can run enormous numbers of bcrypt attempts in parallel with almost no per-core memory pressure. You can crank the cost factor up, but you're only buying linear slowdown against an attacker who's parallelizing across thousands of cores.

argon2id closes that gap by being **memory-hard**, not just CPU-hard. You configure it with a memory cost (say, 64MB per hash), and an attacker trying to brute-force it in parallel needs 64MB *per guess, per core*. A GPU with 24GB of VRAM that could juggle 100,000 concurrent bcrypt attempts can maybe juggle 300 argon2id attempts at that memory cost. That's the whole game — you're not making the legitimate login slower, you're making the attacker's economics collapse.

argon2id also won the 2015 Password Hashing Competition for good reason: it's a hybrid of argon2i (resistant to side-channel/timing attacks) and argon2d (resistant to GPU cracking), which is why it's the variant OWASP recommends over plain argon2i or argon2d.

## What It Actually Looks Like in Code

Here's the Node.js version, using the `argon2` package (bindings over the reference C implementation — don't reach for a pure-JS one, it'll be too slow to be useful anyway):

```javascript
const argon2 = require('argon2');

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,         // iterations
    parallelism: 1,
  });
}

async function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}
```

Notice you don't manage salts yourself — they're generated and embedded in the output hash string, same as bcrypt. The parameters (`m=65536,t=3,p=1`) are also encoded right in the hash, so you can tune them over time without breaking verification of older hashes. That last part matters a lot for the migration story.

## Migrating Without a Mass Password Reset

Nobody wants to force every user to reset their password because the ops team read a blog post. The standard trick — and the one I've used moving legacy Laravel and Node auth systems at Cubet — is opportunistic rehashing: verify with the old algorithm on login, and if it succeeds, silently rehash with the new one before you ever look at cost-factor upgrades again.

```javascript
async function login(user, submittedPassword) {
  let hash = user.passwordHash;
  let ok;

  if (hash.startsWith('$2')) {
    // legacy bcrypt hash
    ok = await bcrypt.compare(submittedPassword, hash);
    if (ok) {
      user.passwordHash = await hashPassword(submittedPassword); // upgrade to argon2id
      await user.save();
    }
  } else {
    ok = await argon2.verify(hash, submittedPassword);
  }

  return ok;
}
```

Users who log in regularly get migrated transparently within days or weeks. Users who never log in again stay on bcrypt forever, which is fine — they were never going to trigger the migration path either way, and their risk profile doesn't change by you *not* touching their row.

## Tuning Costs Is a Real Decision, Not a Default

The parameters aren't free lunches — `memoryCost: 2**16` means every concurrent login holds 64MB, and under a login storm (or a credential-stuffing attempt hammering your endpoint) that adds up fast. OWASP's current guidance is roughly 19MB/t=2/p=1 as a floor and scales up from there depending on what your server can absorb. Load-test your login endpoint with production-realistic concurrency before you ship a memory cost you copied from a blog post — including this one.

The honest takeaway: bcrypt isn't broken, and you don't need to panic-migrate this afternoon. But if you're writing new auth code in 2026 and reaching for bcrypt out of habit, you're choosing a tool that was designed for a threat model GPUs left behind a decade ago. argon2id costs you nothing extra to adopt and buys you a real margin against the hardware attackers actually have.

---

Got a horror story about a legacy hashing scheme you had to migrate off of, or a strong opinion on cost-factor tuning? I'd love to hear it — find me on [GitHub](https://github.com/kpanuragh) or [Twitter/X](https://twitter.com/anuragh_kp).
