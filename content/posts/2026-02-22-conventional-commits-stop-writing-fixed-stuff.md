---
title: "Conventional Commits: I Stopped Writing 'fixed stuff' and My Changelogs Started Writing Themselves 🤖📝"
date: "2026-02-22"
excerpt: "My git log used to read like a crime scene: 'fix', 'update', 'stuff', 'asdfgh'. Then I discovered conventional commits and suddenly my CI was generating perfect changelogs and bumping versions without me touching a thing."
tags: ["open-source", "github", "git", "developer-tools", "community"]
featured: true
---

# Conventional Commits: I Stopped Writing 'fixed stuff' and My Changelogs Started Writing Themselves 🤖📝

**Raise your hand if your git log has ever looked like this:**

```
a3f2c1d fix
9b8e7f4 update
2d1c5a8 stuff
ff3e7b9 asdfgh
e1a9b2c wip
c5d8f1a ok now it works
```

That was me. Seven years of professional development and my commit history read like a ransom note assembled by someone in a hurry.

Then I joined an open source project that had a line in the CONTRIBUTING.md: *"All commits must follow the Conventional Commits specification."*

I Googled it. I was mildly offended by the rules. Six months later, I was the person adding that same line to every project I touched.

## What Even Are Conventional Commits? 🤔

Conventional Commits is a specification for writing commit messages in a structured format. Instead of the classic `"fix stuff"` school of thought, you write this:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

In practice, it looks like:

```bash
feat(auth): add OAuth2 login with GitHub
fix(api): resolve null pointer when user has no email
docs(readme): update installation steps for Laravel 11
chore(deps): bump guzzlehttp from 7.4 to 7.8
refactor(models): extract user validation to separate service
```

That's it. A type, an optional scope in parentheses, a colon, and a description.

Simple. Obvious. And — once your CI gets hold of it — borderline magic.

## The Day I Got Humbled by a Bot 🤖

As a full-time developer who contributes to open source, I thought I wrote pretty good commit messages. "fix: resolve auth bug" is fine, right? Better than "fix" alone?

Wrong. Not good enough.

My first PR to a Node.js security library got rejected — not for the code, but for this comment from a maintainer bot:

```
❌ feat: added new validator
   ^^^^
   Description should be in imperative mood: "add" not "added"
```

And then:

```
❌ Fix: resolve null pointer in session handler
   ^^^
   Type should be lowercase
```

I fixed five commits before the linter was happy. I was simultaneously embarrassed and impressed. The project had a `commitlint` bot enforcing standards, and it had zero mercy for my casual approach.

**Balancing work and open source taught me:** the moment you enforce standards with automation, humans stop arguing about them. Nobody debates whether to write "Fix" or "fix" when a bot just tells them.

## The Types You Need to Know 📋

The spec defines a handful of commit types. Here are the ones I actually use:

| Type | What it means | Example |
|------|--------------|---------|
| `feat` | New feature | `feat: add rate limiting to API` |
| `fix` | Bug fix | `fix: handle empty response body` |
| `docs` | Documentation only | `docs: add examples to README` |
| `style` | Formatting, no logic change | `style: fix indentation in auth controller` |
| `refactor` | Code restructure, no feature/fix | `refactor: extract auth logic to service class` |
| `test` | Adding or fixing tests | `test: add unit tests for validator` |
| `chore` | Build process, dependencies | `chore: upgrade Laravel to 11.x` |
| `perf` | Performance improvement | `perf: cache user lookup results` |
| `ci` | CI/CD pipeline changes | `ci: add security scanning to GitHub Actions` |

There are more, but these cover 95% of real-world commits.

**The one that's most powerful:**

```bash
feat!: redesign authentication API

BREAKING CHANGE: The `login()` method now requires an options object.
Before: login(username, password)
After: login({ username, password, mfa_token })
```

See that `!` after `feat`? That signals a **breaking change**. It goes in your CHANGELOG as a major version bump. Automatically. Without you having to remember to do anything.

## Why This Matters for Open Source 🌍

In the security community, clear commit messages aren't just nice to have — they're critical. When someone opens a PR to a security library, maintainers need to understand *exactly* what changed and why. A commit like:

```bash
fix(sanitizer): prevent XSS via malformed Unicode input

Attackers could bypass the sanitizer using Unicode normalization
forms (NFD/NFC) to construct payloads that slipped through
regex-based filtering.

Closes #391
Resolves CVE-2026-xxxxx
```

...tells a complete story. The code reviewer knows what to look for. The changelog reader knows why they need to upgrade. The security researcher knows what the attack vector was.

Compare that to `"fix xss"` and tell me which one you'd rather see in a security library you depend on.

**As a full-time developer who contributes to open source,** I started taking commit messages more seriously after contributing to a PHP security package. The maintainer reviewed not just my code but my commit history — and the clear, conventional messages made his review faster. He told me the PR took half the time it usually does because he could follow the logical progression from my commits.

That was the lightbulb moment.

## The Toolchain That Makes It Automatic 🛠️

This is where conventional commits go from "nice idea" to "I can't believe I lived without this."

### `commitlint` — The Grammar Police 👮

```bash
npm install --save-dev @commitlint/{config-conventional,cli}

# commitlint.config.js
module.exports = { extends: ['@commitlint/config-conventional'] }
```

Add it to a Git hook and it validates every commit message before it lands:

```bash
# .husky/commit-msg
npx --no -- commitlint --edit ${1}
```

Try to commit `"fixed stuff"` and watch it scream:

```
⧗   input: fixed stuff
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]

✖   found 2 problems, 0 warnings
```

**Your whole team now writes conventional commits.** Not because you asked nicely. Because the robot said no.

### `commitizen` — The Guided Interface 🧭

For teams that find the format overwhelming at first, `commitizen` provides an interactive prompt:

```bash
npm install -g commitizen
git cz
```

```
? Select the type of change that you're committing: (Use arrow keys)
❯ feat:     A new feature
  fix:      A bug fix
  docs:     Documentation only changes
  style:    Changes that do not affect the meaning of the code
  refactor: A code change that neither fixes a bug nor adds a feature
  perf:     A code change that improves performance
  test:     Adding missing tests or correcting existing tests
```

It walks you through it. Junior developers love it. Senior developers use it when they can't remember the exact type names at 11pm. (I use it at 11pm.)

### `semantic-release` — The Changelog Robot 🤖

This is where it gets genuinely impressive. Point `semantic-release` at your conventional commits and it will:

1. **Determine the next version** (patch for `fix:`, minor for `feat:`, major for `BREAKING CHANGE:`)
2. **Generate a CHANGELOG** from your commit history
3. **Create a GitHub Release** with the right version tag
4. **Publish to npm** (or your package registry of choice)

All of it. Automatically. On every merge to main.

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The first time I set this up on an open source project, I merged a PR with a `feat:` commit, and watched GitHub automatically create a release with a perfect changelog. No manual version bumping. No "oh I forgot to update the CHANGELOG." No release-day chaos.

I stared at it for a solid minute.

## The Scope Thing Is Underrated 🎯

The `scope` in `feat(scope): description` is optional, but for larger projects it's a game changer:

```bash
# Without scope — what even changed?
fix: handle null values properly

# With scope — immediately obvious
fix(user-model): handle null email in profile validation
fix(payment-api): handle null card data in webhook handler
fix(cache): handle null TTL value in Redis driver
```

In a monorepo or a project with multiple modules, scopes let you generate per-module changelogs:

```bash
## @myapp/auth [2.1.0] - 2026-02-22
### Features
- feat(auth): add MFA support via TOTP
### Bug Fixes
- fix(auth): handle expired session tokens gracefully

## @myapp/api [1.8.2] - 2026-02-22
### Bug Fixes
- fix(api): return 429 instead of 500 on rate limit
```

When your open source library has 200 contributors across 15 modules, this is the difference between a readable changelog and archaeological dig.

## How I Retrofitted a Messy Project 🏚️

Last year I was contributing to a Laravel package that had... a colorful git history. Mixed formats, no conventions, changelogs updated by hand (sometimes not at all). I proposed migrating to conventional commits.

**The objection I heard:** "That's so much extra work per commit."

**My counter:** Write `feat:` before your message. That's it. Three characters and a colon. The first week is slightly awkward. After that it's completely automatic.

We made the switch. Here's what happened:

- **Month 1:** A few missed `commitlint` errors, people adjusting
- **Month 2:** Everyone was on autopilot
- **Month 3:** First automated release cut. Maintainer almost cried.
- **Month 4:** Someone opened an issue asking "why is the changelog so good now?"

The maintainer's answer: "We stopped writing it ourselves."

## The Real Benefit Nobody Talks About 💡

Most write-ups about conventional commits focus on automation. Fair. But there's a softer benefit:

**It forces you to think about what you're doing before you do it.**

When you sit down to write `feat: ` or `fix: ` or `refactor: `, you have to classify the change. Is this a feature? A fix? A refactor? Sounds obvious — but mid-sprint, when you're in the zone hacking away, this small pause makes you write cleaner, more focused commits.

Instead of one massive commit that does six things, you end up with:

```bash
refactor(auth): extract token validation to dedicated service
feat(auth): add refresh token support
test(auth): add coverage for token expiry edge cases
docs(auth): document new token refresh API in README
```

Four logical commits. Four easy code reviews. Four clear changelog entries.

**Balancing work and open source taught me:** The habits you build in open source bleed back into your day job. I now write conventional commits on private client projects. My teammates didn't ask me to. They just started copying the format after seeing my commit messages and realizing how much easier it made the PR reviews.

## TL;DR — Your Git History Is Documentation 📋

1. **Conventional Commits** = structured format: `type(scope): description`
2. **Core types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`
3. **Breaking changes:** add `!` after type (`feat!:`) or `BREAKING CHANGE:` in footer
4. **Tools to know:** `commitlint` (enforce), `commitizen` (guided input), `semantic-release` (automate releases)
5. **The real win:** your CHANGELOG writes itself, your versions bump automatically, your reviewers love you
6. **The culture win:** it makes you think before you commit. Literally.

Your git log is the story of your project. "fixed stuff" is not a story. "fix(auth): prevent session fixation on password reset" is a story. Future contributors — including future you at 2am debugging a regression — will thank you.

Stop writing `"update"`. Start writing history.

---

**Adopted conventional commits on your project?** I'd love to see your setup. Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh) — especially if you've got a creative `semantic-release` config or a wild commitlint rule that saved your project from chaos. 😅

*Already using conventional commits? What type do you use most often? I'm 80% `fix:` and `feat:`, and I'm not ashamed.*
