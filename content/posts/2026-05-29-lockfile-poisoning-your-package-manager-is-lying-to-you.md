---
title: "🔒 Lockfile Poisoning: Your Package Manager Is Lying to You"
date: "2026-05-29"
excerpt: "You committed a lockfile to ensure reproducible installs. But what if someone quietly swapped the package it resolves to? Lockfile poisoning is the supply chain attack hiding in plain Git history."
tags:
  - security
  - supply-chain
  - npm
  - devops
  - cybersecurity
featured: true
---

You did everything right.

You committed your `package-lock.json`. You pinned exact versions. You told every junior dev on the team: "**always commit the lockfile**." You even wrote it in the onboarding doc.

And then a malicious package got installed on your CI server anyway.

Welcome to lockfile poisoning — the supply chain attack that exploits the one thing you thought was protecting you.

---

## What Even Is a Lockfile?

When you run `npm install express`, npm resolves `express` to a specific version (say `4.18.2`), downloads it, and writes a `package-lock.json` that records the exact URL, version, and **integrity hash** for every package in the dependency tree.

Next time someone runs `npm ci`, npm reads the lockfile and installs those exact packages — no resolution, no surprises.

That's the theory.

---

## The Attack: Poisoning the Lockfile Directly

Here's the quiet nightmare scenario:

A contributor (or a compromised CI token) opens a seemingly innocent PR. The diff shows a lockfile update — maybe a transitive dep bumped a patch version. Nobody reviews lockfile diffs in detail. They're noisy, they're massive, and reviewing them feels like reading the matrix.

Buried inside that lockfile update is this:

```json
"node_modules/some-utility": {
  "version": "1.2.4",
  "resolved": "https://registry.npmjs.org/some-utility/-/some-utility-1.2.4.tgz",
  "integrity": "sha512-ATTACKER_CONTROLLED_HASH=="
}
```

The version number is legitimate. The package name is legitimate. But the **integrity hash** now matches a different tarball — one the attacker uploaded to a mirror or side-loaded via a registry proxy they control.

When your CI runs `npm ci`, it downloads the package, checks the integrity… and it matches. Because the lockfile was the source of truth, and the lockfile was lying.

---

## The Variant That Doesn't Need a PR

There's a subtler version that doesn't require repo access at all: **registry confusion**.

npm resolves packages from `registry.npmjs.org` by default. But if your company runs an internal registry (Nexus, Artifactory, Verdaccio), npm might be configured to check the private registry first, then fall through to the public one.

An attacker publishes a package to the *public* npm registry with the same name as your internal private package — but with a *higher version number*. If your lockfile doesn't pin the `resolved` URL to your internal registry, npm might happily grab the public version.

This is called **dependency confusion**, and it's what Alex Birsan used in 2021 to get code execution inside Apple, Microsoft, and ~35 other companies.

At Cubet, we ran into a near-miss on a client project where a scoped package (`@client/utils`) existed in their Artifactory but wasn't scoped to the private registry in `.npmrc`. The lockfile was committed — but it pointed to wherever npm *happened* to resolve from. A simple audit surfaced it before anything bad happened.

---

## How to Actually Defend Against This

### 1. Treat lockfile diffs like code diffs

Seriously. Make them reviewable. A changed `integrity` hash in `package-lock.json` should raise a flag — especially if the version number didn't change.

Add this to your PR template or CI lint step:

```bash
# Fail if any lockfile integrity hash changed without a version bump
git diff origin/main -- package-lock.json \
  | grep '^+' \
  | grep '"integrity"' \
  | while read line; do
      echo "CHANGED INTEGRITY: $line"
      exit 1
    done
```

This is a blunt instrument, but it forces reviewers to consciously approve integrity changes.

### 2. Pin your registry — and scope it

Your `.npmrc` should be committed to the repo and lock down where packages resolve from:

```ini
# .npmrc
registry=https://registry.npmjs.org/
@mycompany:registry=https://artifactory.mycompany.com/artifactory/api/npm/npm-local/
always-auth=true
```

Scoping your internal packages to `@mycompany` and pointing that scope to your private registry prevents dependency confusion attacks entirely. Public npm has no `@mycompany/` packages — and if someone publishes one, npm will ignore it because the scope resolves privately.

### 3. Use `npm ci` in CI, never `npm install`

`npm ci` enforces that `package-lock.json` is the authority. It will **fail** if the lockfile is missing or if `package.json` has changed since the lockfile was generated. `npm install` will silently update the lockfile to match — which is useful locally and dangerous in CI.

### 4. Enable provenance and audit regularly

Since npm 9, packages can ship **provenance attestations** — a signed statement linking the package to the GitHub Actions run that built it. You can verify this:

```bash
npm audit signatures
```

This checks that every installed package's signature is valid against the registry's public key. It won't catch all attacks, but it catches packages that were swapped after being published.

Also: `npm audit` is not supply-chain security. It checks for *known vulnerabilities in published versions*. It won't catch a poisoned integrity hash or a dependency confusion attack. They're different threat models.

---

## The Uncomfortable Truth

Lockfiles were designed to solve the "works on my machine" problem — reproducibility across environments. They were not designed as a security boundary. The assumption was that the registry is trustworthy and the lockfile is read-only.

Neither assumption holds in every threat model.

Supply chain attacks are increasingly the preferred vector for targeting organizations that are otherwise well-defended. You can have the best WAF in the world and still get owned because a developer ran `npm install` in a repo with a poisoned lockfile.

The fix isn't complicated. It's just invisible until you've been hit.

Audit your `.npmrc`. Lock your registries. Treat lockfile diffs with suspicion. And the next time someone on your team says "it's just a lockfile update," maybe take a second look.

---

## TL;DR

- Lockfile poisoning tampers with integrity hashes or resolved URLs in your lockfile to install malicious code
- Dependency confusion exploits fallback resolution to sneak public packages past your private registry
- Defenses: scope your registries in `.npmrc`, use `npm ci` in CI, review integrity changes in PRs, and run `npm audit signatures`
- Lockfiles are reproducibility tools, not security boundaries — treat them accordingly

---

Have you audited your `.npmrc` recently? Drop me a note on [Twitter/X](https://x.com/kpanuragh) or connect on [LinkedIn](https://linkedin.com/in/kpanuragh) — I'm always up for talking supply chain security over a virtual coffee.
