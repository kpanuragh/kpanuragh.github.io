---
title: "⌨️ Typosquatting: The Supply Chain Attack That's Just a Typo Away"
date: "2026-08-14"
excerpt: "One misplaced keystroke and npm install turns into npm invite-the-attacker. A tour of how typosquatting works, why it keeps winning, and how to stop shipping it into production."
tags: ["cybersecurity", "supply-chain-security", "npm", "devsecops"]
featured: true
---

Somewhere right now, a developer is trying to install `crossenv` when they meant `cross-env`, or `reqeusts` when they meant `requests`, and somewhere else an attacker is grinning because that's the whole attack. No exploit. No zero-day. No clever bypass of anything. Just really good typing predictions applied to evil.

Welcome to typosquatting — the supply chain attack that doesn't even need you to be careless, just *human*.

## The Attack, In Its Full Anticlimactic Glory

Here's the entire playbook:

1. Find a popular package. `lodash`, `express`, `colors`, `discord.js` — anything with millions of weekly downloads.
2. Publish a package with a name that's one edit-distance away: a swapped letter, a missing hyphen, a doubled character, a common misspelling.
3. Make the package *do something*, usually in a postinstall hook or on import — steal environment variables, exfiltrate `.npmrc` tokens, drop a reverse shell, or just quietly sit there as a dependency-confusion beachhead for later.
4. Wait. Someone, somewhere, will fat-finger the real name.

That's it. No social engineering, no phishing email, no CVE. The vulnerability is the space bar being two keys away from `n`.

Real examples that made it to production registries before takedown: `crossenv` (vs `cross-env`), `d3.js` (vs `d3`), `babelcli` (vs `babel-cli`), and a whole cottage industry of `python3-dateutil`, `python-mysql`, and `pytorch-nightly` lookalikes on PyPI. Some of these sat live for weeks, quietly downloaded by CI pipelines that never had a human eyeball on the install line.

## Why It Works Better on a Terminal Than It Should

If someone handed you a typosquatted URL in a phishing email, you'd probably squint at it. But `npm install` doesn't render in a browser with a padlock icon — it's a command you type from muscle memory, often copy-pasted from a Stack Overflow answer or a half-remembered README, and it succeeds silently whether the package is legitimate or a landmine. There's no visual diff between:

```bash
npm install lodash
npm install lodahs
```

Both just print progress bars and a slightly judgmental number of vulnerabilities found. Nothing in the default experience tells you "hey, this package has 40 downloads and was published nine days ago by an account with no other history." You have to go looking for that, and nobody goes looking when the install just worked.

## The Part That Actually Bites: Automation

The genuinely scary version isn't a developer typo — it's a **build script** typo that nobody catches because it never gets read out loud. I've seen a Dockerfile with `RUN pip install djago` sit in a repo for months because the base image already had Django cached from a different layer, so the build "worked," just not the way anyone assumed. It's a coin flip whether that typo resolves to nothing, a build failure, or a package that's very happy to exist specifically to catch that mistake.

At Cubet, one of our internal audits started flagging exactly this pattern — dependency names in Dockerfiles and CI YAML that hadn't been touched in a long time, cross-checked against actual registry publish dates. It's a cheap check with an unreasonably good hit rate for catching stale or suspicious references before they matter.

## A Minimal Defense That Doesn't Require Buying Anything

You don't need a vendor SKU to blunt most of this. Pin exact versions and hashes instead of trusting a name to resolve correctly every time:

```json
{
  "dependencies": {
    "express": "4.19.2"
  }
}
```

...and commit the lockfile, always, no exceptions — `package-lock.json`, `yarn.lock`, `poetry.lock`, whatever your ecosystem calls it. A lockfile means the *first* correct install is the one that gets replayed forever, instead of every `npm install` re-resolving names fresh and giving a typosquat a chance to win the race if it was ever introduced.

For the install-time blast radius specifically, disable scripts you don't need running:

```bash
npm install --ignore-scripts
```

This alone kills the entire "malicious postinstall hook" category of typosquat, because the payload usually *is* the postinstall script. You lose some legitimate packages that rely on postinstall for native builds, but for CI and prod installs where you're not compiling anything exotic, it's a solid default.

And if you want to get a little paranoid about it, a quick Levenshtein-distance check against your actual dependency list versus the top N packages in your ecosystem catches the embarrassing ones before code review does:

```python
from difflib import SequenceMatcher

def suspiciously_close(name, popular_names, threshold=0.85):
    return [p for p in popular_names
            if name != p and SequenceMatcher(None, name, p).ratio() > threshold]
```

Run that against your `package.json` in CI and you'll catch `lodahs` before it catches you.

## The Real Takeaway

Typosquatting isn't clever. That's what makes it durable — it doesn't rely on a bug getting patched or a technique getting patched around, it relies on the fact that humans type fast and registries let anyone publish anything under any name that isn't already taken. As long as `npm publish` and `pip upload` remain nearly free and nearly unmoderated, this attack has no expiration date.

The fix isn't vigilance — vigilance doesn't scale across a thousand `npm install` calls a day across your CI fleet. The fix is making the boring stuff (lockfiles, `--ignore-scripts`, pinned versions, automated name-distance checks) the default so a typo has to get through several layers of "that's weird" before it gets anywhere near a shell.

Go check your Dockerfiles. I'll wait.

---

*Found a typosquat in the wild, or want to talk supply chain security? Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh) — always happy to compare notes.*
