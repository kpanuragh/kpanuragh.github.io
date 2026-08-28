---
title: "📌 Pin It to Win It: The Caret That Can Ruin Your Week"
date: "2026-08-28"
excerpt: "A single ^ in your package.json is a bet that every future patch release, forever, will be well-behaved. Here's why that bet keeps losing, and what pinning actually costs you in return."
tags: ["security", "supply-chain-security", "dependency-management", "devsecops", "npm"]
featured: true
---

Quick quiz. You add a dependency with `npm install lodash`. Your `package.json` gets:

```json
"lodash": "^4.17.21"
```

What version does your build actually install six months from now? If your answer was "4.17.21," I have some bad news about what that little caret means.

`^4.17.21` doesn't mean "4.17.21." It means "anything from 4.17.21 up to, but not including, 5.0.0" — every minor and patch release the maintainer ships in between, installed automatically, no questions asked, no review from anyone on your team. You didn't approve those changes. You just agreed, in advance, to trust all of them.

That's the whole pinning-vs-floating debate in one symbol. And most teams pick "floating" without ever consciously deciding to.

## Floating versions are a bet, not a default

Semver ranges (`^`, `~`, `*`, `>=`) exist because "always get the latest compatible version" sounds like a reasonable thing to want. Bug fixes flow in automatically. Security patches show up without you lifting a finger. In theory, floating is the responsible choice.

In practice, semver is a promise a maintainer makes about their *intent*, not a guarantee enforced by anything. Nothing stops a "patch" release from:

- Introducing a genuine behavior change that happens to break your code in a way nobody tested
- Getting compromised — a maintainer's npm token leaks, and a malicious "patch" ships to millions of installs before anyone notices
- Silently pulling in a new transitive dependency that has its own opinions about what your `node_modules` folder should contain

`event-stream` in 2018 is the textbook case: a popular package got a new "maintainer" who added a crypto-stealing payload in a minor bump, and every project floating on `^` pulled it in automatically. Nobody typed `npm install event-stream@malicious`. Their lockfile just... updated, the way it was configured to.

## Pinning is a bet too — just a different one

Pin every dependency to an exact version (`4.17.21`, no caret, no tilde) and you eliminate that surprise. Your build is reproducible. What you tested is what ships. An attacker can't ride in on an automatic minor bump because there is no automatic anything.

The cost is that you've now signed up to be the human semver resolver. Security patches don't reach you until someone — you — notices a CVE, bumps the pin, and re-tests. Pin everything and never revisit it, and you've traded "supply chain attack via auto-update" for "known vulnerability sitting unpatched for eight months because nobody looked." Both get you on the incident report. One's just slower.

## The actual answer: pin, but automate the review

The trick isn't picking a side, it's decoupling "reproducible builds" from "I personally have to remember to check for updates."

```json
{
  "dependencies": {
    "lodash": "4.17.21",
    "express": "4.19.2"
  }
}
```

Pin the manifest. Then let a bot do the part humans are bad at — noticing that a new version exists:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    open-pull-requests-limit: 10
```

Now every bump arrives as a PR — a diff you can read, a CI run that has to pass, a reviewer who has to click approve. You get the security-patch velocity that floating promised, without ever letting a stranger's push directly become your production dependency tree. Renovate does the same job with finer-grained grouping if Dependabot's defaults feel too blunt.

The one piece that has to hold regardless of pin-vs-float: commit your lockfile. `package-lock.json`, `yarn.lock`, `composer.lock` — whichever your ecosystem uses. A floating range in `package.json` combined with a *committed* lockfile actually behaves like pinning day-to-day (`npm ci` installs exactly what's locked), until someone runs `npm update` and regenerates it. The lockfile is the thing actually deciding what ships; the range in the manifest is just the policy for when someone's allowed to regenerate it.

At Cubet, the rule that stuck wasn't "pin everything" or "float everything" — it was "nothing regenerates the lockfile except a bot PR that CI has approved." Simple, boring, and it means the scary event-stream scenario requires someone to actively merge a malicious diff instead of it happening for free on the next `npm install`.

## Where to actually spend the effort

Not every dependency deserves the same paranoia. A rough priority order:

1. **Anything with install/build scripts** (`postinstall` hooks) — these run arbitrary code on your machine or CI runner the moment `npm install` finishes. Pin these hard and review every bump.
2. **Anything in your build/deploy pipeline** — a compromised linter or bundler plugin has the same blast radius as compromised prod code, because it *runs* during your build.
3. **Everything else** — floating with a reviewed-PR update flow is a fine trade-off; the goal is visibility, not paralysis.

The version string in your manifest isn't a formality — it's a standing authorization for what gets to run on your infrastructure, decided once, months before you find out whether it was a good idea. Make that decision on purpose.

---

If your `package.json` currently has more carets than a Bugs Bunny convention, that's worth an afternoon of cleanup, not a rewrite. Start with your build pipeline's dependencies first.

Got a favorite (or least favorite) dependency-update horror story? Find me on [Twitter/X](https://twitter.com/anuragh_kp), [GitHub](https://github.com/kpanuragh), or [LinkedIn](https://linkedin.com/in/anuraghkp) — I collect these.
