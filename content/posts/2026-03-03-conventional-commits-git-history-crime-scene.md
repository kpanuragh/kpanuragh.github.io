---
title: "Conventional Commits: Your Git History Shouldn't Read Like a Crime Scene 🔍"
date: "2026-03-03"
excerpt: "You opened a repo's git log and saw 'fix', 'wip', 'asdfgh', 'FINAL', 'FINAL FINAL', 'ok now it works'. That's not a commit history. That's a cry for help. Here's how Conventional Commits turns your git log from a war crime into a changelog maintainers actually love."
tags: ["\"open-source\"", "\"github\"", "\"git\"", "\"community\"", "\"developer-tools\""]
featured: "true"
---

# Conventional Commits: Your Git History Shouldn't Read Like a Crime Scene 🔍

**Confession time:** In my early days, my git commit messages were... not great.

```
git log --oneline

a3f8c21 fix
9d12e44 wip
7b44f19 more stuff
4c11a98 DONE
3e98f01 actually done
2b77e32 ok it works now
1a52d04 please work
```

I'm not proud of it. That commit history is basically a therapy session told backwards.

**As a full-time developer who contributes to open source**, I learned the hard way that commit messages aren't just for you — they're for the next developer reading your code at 2am trying to understand why you made a change three months ago. And in open source? That developer might be a maintainer deciding whether to merge your PR.

Conventional Commits changed everything for me. And once you understand what it unlocks — automated changelogs, semantic versioning, instant release notes — you'll never go back.

## What Even Is a "Conventional Commit"? 🤔

Conventional Commits is a spec. A simple, structured format for commit messages that looks like this:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

In practice:

```bash
feat: add OAuth2 login with GitHub provider
fix: resolve null pointer when user has no avatar
docs: update API authentication examples
refactor: extract token validation into service class
test: add integration tests for payment webhook
chore: upgrade Laravel to 11.x
```

That's it. Three parts: a **type**, an optional **scope**, and a **description**.

The types are standardized:
- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting, no code logic changes
- `refactor` — code change that neither fixes nor adds
- `test` — adding or correcting tests
- `chore` — maintenance (dependency updates, build changes)
- `perf` — performance improvements
- `ci` — CI/CD changes

**Balancing work and open source taught me:** every minute a maintainer spends decoding what your commit *actually* does is a minute they could spend reviewing whether your code is correct. Make their job easier and your PRs move faster.

## The Moment I Became a Believer 💡

About two years ago, I was contributing to a PHP security library. I submitted a PR with my usual mixed bag of commits: `fix auth issue`, `cleanup`, `tests added maybe`, `oops revert that`.

The maintainer was gracious about it. He merged the code but left a comment: *"Your commits make it really hard to generate an accurate changelog. Would you be open to squashing and rewriting these using conventional commits?"*

I squashed everything into:
```
fix(auth): prevent timing attack in token comparison

HMAC comparison was using PHP's == which is not constant-time.
Switched to hash_equals() to prevent timing side-channel attacks.

Closes #89
```

The maintainer's response: *"Perfect. This will go into the next security patch release automatically."*

**Automatically.** That word got me.

I asked how. He pointed me at `semantic-release`. My mind exploded. 🤯

## The Magic: What Conventional Commits Unlocks 🔮

Here's why this format matters beyond "nice-looking git logs":

### 1. Automated Changelogs 📋

Tools like `conventional-changelog` and `git-cliff` parse your commit history and generate `CHANGELOG.md` automatically.

No more manually writing release notes. Your commits ARE your release notes — if you write them right.

Before conventional commits, changelogs in projects I contributed to looked like:
```
## v2.3.0
- Various bug fixes
- Performance improvements
- Other changes
```

After:
```
## v2.3.0 (2026-02-15)

### Features
- **auth**: add OAuth2 login with GitHub provider (#234)
- **api**: add rate limit headers to all responses (#241)

### Bug Fixes
- **token**: prevent timing attack in HMAC comparison (#89)
- **upload**: fix null pointer when user has no avatar (#251)

### Performance
- **query**: reduce N+1 queries in user dashboard by 87% (#238)
```

That second changelog? Useful. Tells users exactly what changed and why they should update.

### 2. Semantic Version Bumping (Automatically!) 📦

In the security community, we care a lot about version numbers — they communicate risk. `3.0.0` means breaking changes. `2.1.0` means new features, safe to update. `2.0.1` means security patch, update immediately.

Conventional commits let tools figure this out automatically:

| Commit type | Version bump |
|-------------|-------------|
| `fix:` | Patch: 1.0.0 → 1.0.1 |
| `feat:` | Minor: 1.0.0 → 1.1.0 |
| `feat!:` or `BREAKING CHANGE:` | Major: 1.0.0 → 2.0.0 |

The `!` after a type, or a `BREAKING CHANGE:` footer, signals a major version bump. No ambiguity. Machines can read it.

```bash
# This triggers a PATCH release (1.0.1)
fix(auth): correct token expiry calculation

# This triggers a MINOR release (1.1.0)
feat(api): add bulk user export endpoint

# This triggers a MAJOR release (2.0.0)
feat(api)!: change response format to JSON:API spec

BREAKING CHANGE: API responses now follow JSON:API spec.
All clients must update their response parsing.
```

**In the security community**, clear version semantics matter even more. When we publish a CVE fix, the patch number tells users "this is a security release, drop everything and update." Conventional commits make that communication automatic and unambiguous.

### 3. Automated Releases with `semantic-release` 🚀

This is the one that made me a true believer.

`semantic-release` watches your commit messages, and on every push to main:
1. Determines the next version based on commit types
2. Generates the changelog
3. Creates a GitHub release with the changelog
4. Publishes to npm/packagist/wherever

Your CI/CD pipeline, once configured:

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

Every merge to main triggers a release. The version number is determined by the commits. The changelog is written by the commits. The GitHub release is created automatically.

You focus on code. The release process takes care of itself.

I added this to one of my Laravel packages last year. It went from "I'll release this whenever I remember" to "every merged PR that matters gets released within minutes." Contributors love it because they can actually *see* their fix ship.

## Making It Stick: Tools to Enforce Conventional Commits 🛠️

The spec is only useful if your team (or you) actually follows it. Here's how to make it automatic:

### commitlint: Reject Bad Commits at the Gate 🚦

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
```

```js
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional']
};
```

Hook it into git with husky:

```bash
npm install --save-dev husky
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'
```

Now if someone tries to commit `fix stuff`:

```
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]

✖   found 2 problems, 0 warnings
```

The commit is rejected. Beautiful. Cold. Efficient. 🧊

### Commitizen: A Friendly Prompt Instead of Rejection 🤝

If you'd rather guide than punish:

```bash
npm install --save-dev commitizen cz-conventional-changelog
```

Configure in `package.json`:
```json
{
  "config": {
    "commitizen": {
      "path": "cz-conventional-changelog"
    }
  }
}
```

Now instead of `git commit`, team members run:

```bash
git cz
```

And get an interactive prompt:

```
? Select the type of change:
  feat:     A new feature
  fix:      A bug fix
  docs:     Documentation only changes
> refactor: A code change that neither fixes a bug nor adds a feature
  test:     Adding missing tests or correcting existing tests
  chore:    Changes to the build process or auxiliary tools

? What is the scope of this change? (press enter to skip)
  auth

? Write a short, imperative tense description of the change:
  extract token validation into service class
```

Your commit message: `refactor(auth): extract token validation into service class`

No thinking required. Just answer the prompts. This is especially great for open source projects with first-time contributors.

## The BREAKING CHANGE Footer (Don't Get This Wrong!) ⚠️

This one trips people up. When you have a breaking change, you need to signal it in the footer:

```
feat(api): redesign authentication endpoints

Implements the new authentication flow with refresh tokens
and device sessions as discussed in RFC #23.

BREAKING CHANGE: The /auth/login endpoint now returns a
{ token, refreshToken, expiresIn } object instead of a
plain string token. All API clients must update their
login handling.

Closes #156
```

The `BREAKING CHANGE:` footer is what tells semantic-release to bump the major version. Forget it and you'll accidentally release a major breaking change as a minor version. In the security community, that's the kind of mistake that makes users trust you less. Don't be that package.

## Real Projects Using This (And Doing It Right) 🌟

**Angular** — arguably invented the modern conventional commits format. Their git log is a masterclass in how this looks at scale. Every commit is typed, scoped, and useful.

**semantic-release itself** — meta, but satisfying. They eat their own dog food and every release is automated from commits.

**Commitlint** — same deal. Check their GitHub releases to see what auto-generated changelogs look like at their best.

**Several PHP security packages** I've contributed to on packagist — once maintainers adopt this, the release cadence gets noticeably better. Security fixes that used to take days to publish (waiting for someone to manually tag a release) now ship automatically.

## What I Wish Someone Had Told Me Earlier 📝

**You don't need to be perfect on day one.** I started by just using `feat:` and `fix:` correctly and built from there. Even partial adoption improves your git history dramatically.

**The scope is optional but powerful.** Once your project gets bigger, scoping your commits helps maintainers understand at a glance what area changed: `fix(auth):` vs `fix(upload):` vs `fix(api):`.

**Squash your WIP commits before PR.** I do all my rough committing on feature branches. Before opening a PR, I squash everything into clean conventional commits. The PR history looks professional. My development history stays messy and human. Best of both worlds.

**In the security community**, a clean commit history is also a security audit trail. When you need to understand what changed between two versions during an incident, `git log --oneline v1.2.0..v1.3.0` filtered by conventional commit types tells you exactly which changes were security-related. That's worth a lot at 3am during an incident.

## Getting Started Right Now 🎯

**Immediate (5 minutes):**

Start writing your next commit in conventional format. That's it. No tools needed yet. Just:
```bash
git commit -m "fix: correct null check in user profile handler"
```

**This week:**

Add `commitlint` + `husky` to one project. Make the guard rails official.

**This month:**

Set up `semantic-release` or `release-please` in a project you maintain. Watch your first automated release land and feel extremely smug about it.

## TL;DR 🏁

- **Conventional Commits** = structured format for commit messages: `type(scope): description`
- **Types that matter:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`
- **`BREAKING CHANGE:` footer** triggers a major version bump — don't forget it
- **Automated changelogs** via `conventional-changelog` or `git-cliff` — write once, never again
- **Automated releases** via `semantic-release` — every commit type tells the machine what version to cut
- **Enforce it** with `commitlint` + `husky`, or guide contributors with `commitizen`
- **Squash WIP commits** before PRs — your feature branch can be messy, your PR history cannot
- Clean commit history = better changelogs, better releases, and maintainers who smile when they see your name in the contributor list

**Your git history tells a story.** Make sure it's one someone can actually read — and maybe even automate from. 🚀

---

**Converted your project to conventional commits?** I'd love to see the automated changelog in action — find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp).

*Now go fix that `asdfgh` commit. You know the one.* 😅

---

**P.S.** If you're a maintainer: adding a `commitlint` config to your repo takes about 10 minutes and immediately improves the quality of contributor commits. Your future self at release time will thank you. 💚
