---
title: "Dependabot: I Let a Bot Update My Dependencies for a Year (Here's What Happened) 🤖"
date: "2026-03-04"
excerpt: "You have 47 outdated npm packages, 12 Composer dependencies from 2022, and at least one library with a known CVE you keep meaning to fix. Dependabot says: what if you just... didn't have to think about any of that?"
tags: ["\"open-source\"", "\"github\"", "\"security\"", "\"community\"", "\"developer-tools\""]
featured: "true"
---

# Dependabot: I Let a Bot Update My Dependencies for a Year (Here's What Happened) 🤖

**Real talk:** For the first five years of my career, my dependency update strategy was basically *"I'll deal with it when something breaks."*

Classic plan. Bulletproof. 10/10 strategy. Has never once blown up in anyone's face.

One day I ran `npm audit` on a Node.js service we'd been running in production for 18 months. The output made me feel physically ill. Seven high-severity CVEs. Two critical. One of them had been public for *11 months*.

**As a full-time developer who contributes to open source**, that moment was embarrassing. I work in security-adjacent spaces. I care about this stuff. And yet there I was, running code with known vulnerabilities because updating dependencies feels like playing Jenga on a Friday afternoon.

Then I discovered Dependabot. And I let it run for a year. Here's what I learned.

## What Is Dependabot, Actually? 🤔

Dependabot is GitHub's built-in dependency update bot. It lives in your repository, watches your dependency files (`package.json`, `composer.json`, `requirements.txt`, `Cargo.toml`, etc.), and automatically opens pull requests when newer versions are available.

That's it. It's a bot that does the boring "notice there's a new version and open a PR" work so you don't have to.

But here's the thing that took me a while to appreciate: there are **two distinct modes**, and understanding both changes how you use it.

**Dependabot Security Updates:** Automatically opens PRs *only* when a dependency has a known CVE. This is GitHub's way of saying "there's a security advisory filed against this exact version you're using — here's a PR to fix it."

**Dependabot Version Updates:** Regularly scheduled PRs to keep *all* your dependencies up-to-date, security vulnerability or not. The "let's not fall 2 years behind on patch versions" mode.

In the security community, people tend to think only about the first mode. But the second one is what prevents you from being *in* the first mode constantly.

## Setting It Up (Seriously, It's This Simple) 🛠️

Create a file at `.github/dependabot.yml` in your repository:

```yaml
version: 2
updates:
  # npm / Node.js dependencies
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "09:00"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"

  # PHP / Composer dependencies
  - package-ecosystem: "composer"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"

  # GitHub Actions themselves
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

Commit that file. Dependabot wakes up. Your dependency update problem is now a "review PRs" problem instead of a "discover and open PRs" problem. That's a meaningful improvement.

**Balancing work and open source taught me:** the work you don't have to remember to do is the work that actually gets done consistently. Dependabot doesn't forget. It doesn't get distracted. It doesn't decide Friday is a bad day to deal with dependencies.

## The First Month: A Little Chaotic 😅

I won't sugarcoat it — the first week after enabling Dependabot version updates on my main Laravel project was... a lot.

Fourteen PRs opened on Monday morning. I had configured `open-pull-requests-limit: 20` (rookie mistake — don't do this). My GitHub notifications looked like someone had set off an alarm in a printer factory.

Some PRs were trivial — `axios` going from `1.6.3` to `1.6.5`. Fine. Merge. Some required thought — a major version bump on a testing library that changed the assertion API. Those needed actual review.

**The lesson:** use `open-pull-requests-limit: 5` and let Dependabot pace itself. It queues updates and opens new PRs as you merge or close existing ones. You end up with a manageable, steady stream instead of a Monday morning avalanche.

Also: enable **auto-merge** for patch updates. If your CI passes, a patch bump (1.2.3 → 1.2.4) can merge itself. This is the dream state.

## Auto-Merge: The Part That Makes This Magical ✨

Here's the configuration that actually delivers the "never think about dependencies again" experience:

```yaml
# .github/workflows/auto-merge-dependabot.yml
name: Auto-merge Dependabot PRs

on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  auto-merge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - name: Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: "${{ secrets.GITHUB_TOKEN }}"

      - name: Auto-merge patch and minor updates
        if: |
          steps.metadata.outputs.update-type == 'version-update:semver-patch' ||
          steps.metadata.outputs.update-type == 'version-update:semver-minor'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

This workflow:
1. Checks if the PR is from Dependabot
2. Checks whether it's a patch or minor update
3. If yes, approves and merges automatically (assuming CI passes)
4. Major version bumps still require human review

**In the security community**, this raises eyebrows at first — "you're auto-merging code from a bot?" But consider the alternative: outdated dependencies with known CVEs because your manual review process is "eventually." Automated patch updates with CI validation is strictly better than manually-applied updates that get deferred for months.

## The Security Update Side: This One Genuinely Saved Me 🛡️

About four months into using Dependabot, I got a security update PR on one of my PHP packages.

The PR title: `Bump symfony/http-foundation from 6.2.11 to 6.2.14`

Normally I'd have scrolled past this as a routine update. But I clicked through because Dependabot had labeled it "security." The linked advisory described a session fixation vulnerability affecting the exact version I was running.

Severity: **Critical**.

The fix had been available for three weeks. I had no idea this vulnerability existed until Dependabot told me. If I'd been doing manual dependency reviews — which in practice meant "running `composer outdated` occasionally and updating the things I recognized" — this would have stayed in production indefinitely.

I merged the PR. CI passed. Fix shipped in 8 minutes from discovery to production.

That's the Dependabot security update story. Not glamorous. Just: vulnerability exists, bot tells you immediately, you merge the fix. No hand-wringing. No late-night "should I update this?" debates. Just fast remediation.

## What I Learned About My Own Dependency Health 📊

After a year of Dependabot PRs, I started noticing patterns:

**Some dependencies updated constantly.** A few packages in my Node.js projects were releasing minor versions every two weeks. At first I worried something was wrong — why so many updates? After a while, I realized this is just good open source maintenance. Frequent releases mean an active project. I started *trusting* those packages more, not less.

**Some dependencies almost never updated.** I had a PHP date manipulation library that hadn't released a new version in 18 months. Dependabot never opened a PR for it. That silence told me something: either the library is stable and mature, or it's abandoned. Worth investigating manually.

**Major version PRs cluster around framework releases.** Every time Laravel releases a major version, a cascade of related packages does the same. Dependabot catches all of them. Instead of scrambling to find every breaking change, I had a neat list of PRs waiting with changelogs linked.

**Balancing work and open source taught me:** dependency management isn't a one-time task or even a quarterly review. It's a continuous process. The projects that handle it well are the ones that make it automatic.

## The "This Update Broke Everything" Moment (And How Dependabot Helps) 💥

Let's talk about the scary scenario: what if auto-merging a dependency update breaks production?

Here's the thing — Dependabot + CI is actually *safer* than manual updates, because the update is always tested before it merges. If your tests are good, a bad update gets caught before it reaches main. If your tests aren't good... that's the problem, not Dependabot.

When a major version PR broke my test suite (a Node.js testing library changed its API), the PR just sat there with a failing CI badge. I reviewed the changelog, updated my test syntax, pushed to the Dependabot branch, and merged when green. The whole thing was visible and systematic instead of "wait, when did this break? was it the deploy? was it the dependency update we pushed Thursday?"

Clear causal chain. That's worth a lot.

## Dependabot on Your Open Source Projects 🌍

If you maintain any open source packages — even small ones — Dependabot configuration is one of the most valuable things you can add for long-term maintainability.

The `.github/dependabot.yml` file is literally 10 lines. It tells contributors: *"This project is actively maintained and not running on ancient dependencies."*

**In the security community**, unmaintained dependencies in open source libraries are a supply chain risk multiplier. When your library has a vulnerable transitive dependency, every project that depends on you inherits that vulnerability. Dependabot in your open source repos protects not just your code, but your downstream users.

I added Dependabot to three of my open source PHP packages last year. Combined, those packages have about 200 installs a week — not a huge audience, but 200 projects that now automatically benefit when I merge security updates instead of letting them stagnate.

The commit cost: one `.github/dependabot.yml` per repo. The benefit: ongoing security hygiene that protects your users. That math is easy.

## Tools That Work Well with Dependabot 🔧

**Renovate Bot:** GitHub-independent alternative (runs anywhere, not just GitHub). More configuration options, supports more package managers. Worth evaluating if you have complex needs or work across GitLab/Bitbucket too.

**Mend (formerly WhiteSource):** Enterprise-focused dependency security scanner. More detailed CVE analysis than Dependabot provides. Good for organizations that need compliance reporting.

**Socket Security:** Newer tool focused specifically on supply chain attacks (malicious packages, not just known CVEs). Complements Dependabot nicely — Dependabot handles "known bad," Socket handles "suspicious new."

**GitHub Security Advisories + Dependabot Alerts:** Even if you don't enable automated PRs, the free **Dependabot Alerts** tab in any GitHub repo tells you which of your dependencies have known CVEs. No configuration required. Turn this on everywhere, right now.

## Getting Started Right Now 🎯

**In the next 5 minutes:**

1. Open any GitHub repo you maintain
2. Go to Security tab → Dependabot alerts
3. See what CVEs are already lurking in your dependencies

**This week:**

Create `.github/dependabot.yml` in your main project with weekly updates for your package ecosystem (npm, composer, pip — whatever you use). Start with `open-pull-requests-limit: 5` to keep it manageable.

**This month:**

Add the auto-merge workflow for patch updates. Watch your dependency maintenance essentially disappear from your mental todo list.

## TL;DR 🏁

- **Dependabot security updates** — automatic PRs when your deps have known CVEs. Enable this everywhere, always
- **Dependabot version updates** — scheduled PRs to keep all deps current. Configure with `.github/dependabot.yml`
- **Set `open-pull-requests-limit: 5`** — prevents a Monday morning avalanche of PRs
- **Auto-merge patch + minor updates** via GitHub Actions workflow — if CI passes, it merges itself
- **Major version bumps still need human review** — Dependabot opens the PR, you decide when it's safe
- **Your open source packages need this too** — stale dependencies in libraries affect everyone downstream
- One year in: fewer production CVEs, less cognitive overhead, better dependency hygiene

**Your dependencies are getting older every day you wait.** Dependabot doesn't care about your backlog or your Friday afternoons. It just quietly opens PRs until your dependencies are current.

Let the bot win. You've got more interesting problems to solve.

---

**Running Dependabot on your open source projects?** I'd love to compare configs — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp).

*Now go check your Dependabot alerts. There's definitely something in there.* 😬

---

**P.S.** That Node.js service with the 7 high-severity CVEs? I set up Dependabot the same week I found them. Twelve months later, zero critical vulnerabilities in production. Automation works. 💚
