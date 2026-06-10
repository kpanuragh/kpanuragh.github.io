---
title: "🪝 Pre-Commit Hooks That Don't Annoy: Speed, Signal, No Drama"
date: "2026-06-10"
excerpt: "Pre-commit hooks should catch real problems before code hits CI — not become the thing developers desperately `--no-verify` around. Here's how to build a hook setup your team will actually keep."
tags:
  - cicd
  - devops
  - git
  - developer-experience
  - pre-commit
featured: true
---

# 🪝 Pre-Commit Hooks That Don't Annoy: Speed, Signal, No Drama

Pre-commit hooks are one of those things that sound great in a team retro — "let's catch bugs before they even get to CI!" — and then three weeks later someone posts in Slack: "does anyone know why I have to wait 40 seconds every time I commit a one-line change?" followed immediately by the forbidden flag.

```bash
git commit -m "fix typo" --no-verify
```

There it is. The white flag. Your hook setup has failed the vibe check.

The problem isn't hooks. Hooks are genuinely useful. The problem is that most teams treat pre-commit hooks as a second CI pipeline crammed into the commit flow — running the full test suite, linting every file, type-checking the entire monorepo, maybe even doing a build. That's not a hook; that's punishment.

Let me walk through what actually works.

## The Core Contract: Fast Feedback, Scoped Signal

A pre-commit hook has one job: catch obvious mistakes on the *files you're about to commit*, in under five seconds. Anything slower, anything broader, belongs in CI — where it can run async, in parallel, with real compute.

The key insight is **scope**. You don't lint the whole project; you lint the *staged files*. You don't type-check everything; you check the *changed modules*. This distinction drops most hook runtimes from 30+ seconds to 2-3 seconds.

The cleanest way to manage this in a modern project is the [`pre-commit`](https://pre-commit.com) framework — a Python tool that handles hook installation, version pinning, and staged-file filtering for you.

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-merge-conflict
      - id: detect-private-key

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint
        files: \.(js|ts|tsx)$
        additional_dependencies:
          - eslint@9.0.0
          - "@typescript-eslint/parser@7.0.0"
        args: [--fix]

  - repo: https://github.com/psf/black
    rev: 24.4.2
    hooks:
      - id: black
        language_version: python3.12
```

The `pre-commit` framework only passes staged files to each hook by default. Your linter sees `src/auth/login.ts`, not your entire `src/` tree. That's the difference between a 2-second hook and a 45-second one.

## What Belongs in a Hook (and What Doesn't)

**Good hook candidates:**

- Trailing whitespace, stray merge conflict markers
- Detecting accidentally committed secrets or private keys
- Auto-formatting (prettier, black, gofmt) — run with `--fix` so it just fixes, not fails
- YAML/JSON syntax validation
- Linting *staged* files only
- Commit message format (via `commit-msg` hook, not `pre-commit`)

**Things that don't belong:**

- Running your full test suite — that's what CI is for
- Full type-checking pass on the whole project — pin this to CI or a `pre-push` hook
- Docker builds
- Any network call
- Anything that takes more than ~10 seconds

At Cubet, we had a hooks setup that was running `tsc --noEmit` on the entire TypeScript project before every commit. A project with ~400 source files. On a developer's laptop, that was 25-35 seconds per commit. People either disabled hooks entirely or stopped committing in small increments — which is the exact opposite of what you want from a good git workflow.

We moved the full type-check to `pre-push` (runs less often, more acceptable to wait) and added a scoped incremental check with `tsc --incremental` plus a file filter for the pre-commit stage. Hook runtime dropped to under 3 seconds. Nobody disabled it anymore.

## The Secret Weapon: `lint-staged`

If you're on a JavaScript/TypeScript project, `lint-staged` pairs beautifully with husky to give you the same staged-file scoping with even less config:

```json
// package.json
{
  "lint-staged": {
    "*.{js,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{css,scss}": [
      "stylelint --fix",
      "prettier --write"
    ],
    "*.{json,yaml,yml,md}": [
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
npx lint-staged
```

`lint-staged` automatically re-stages files that were auto-fixed, so when you see ESLint silently fix a spacing issue, the corrected version is what ends up in the commit. No awkward "hook modified files, please re-add them" dance.

## Commit Message Hooks: The Underused Gem

While everyone argues about pre-commit hook performance, the `commit-msg` hook is sitting there doing 10ms of work that saves hours of changelog archaeology:

```bash
# .husky/commit-msg
#!/bin/sh
npx --no -- commitlint --edit "$1"
```

```js
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'test', 'chore', 'perf', 'ci', 'revert'
    ]],
    'subject-max-length': [1, 'always', 72],
  },
};
```

Enforcing Conventional Commits at the hook level means your automated changelogs, semantic versioning, and PR descriptions stay coherent without anyone having to remember the format. This one runs in under 100ms and the ROI is enormous.

## Escape Hatches Are Fine, Actually

Here's a take that'll ruffle some feathers: `--no-verify` should exist and you shouldn't make people feel guilty for using it.

Sometimes you're in the middle of debugging at 11pm, committing a WIP checkpoint that you'll squash before the PR. Forcing a full lint pass on intentionally broken code is theater. The real safety net is CI — your hooks are a fast-feedback courtesy, not a security perimeter.

What you *should* do is log when `--no-verify` is used. A simple CI check that counts bypass commits in a PR surfaces patterns without being punitive. If someone is bypassing hooks on every commit, that's a conversation about why the hooks are too slow or too noisy — not a reason to remove the escape hatch.

## Rollout Without Mutiny

The biggest mistake teams make is adding aggressive hooks to an existing codebase all at once. You end up with a hook that fails on 40% of the existing files because nobody ran the formatter before, and now every commit requires touching unrelated files.

Staged rollout:
1. Add auto-fix hooks first (prettier, black, gofmt) — these should never *fail*, just fix
2. Add informational hooks that warn but don't block
3. Gradually convert warnings to errors as the codebase gets clean
4. Add stricter rules only to new files using `--filter` or staged-file patterns

Your hooks should feel like a helpful colleague tapping your shoulder, not a TSA checkpoint.

## The Setup That Actually Sticks

After iterating through several team setups, the configuration that gets the least pushback looks like this: auto-fix formatters that never fail, a secret-detection hook that blocks hard, YAML/JSON validation that's near-instant, and the full linting and type-checking saved for `pre-push` or CI. Total commit-time overhead: 2-4 seconds. Nobody notices, nobody disables it, and it actually catches things.

That's the goal. Not hooks that developers work around — hooks that disappear into the background while quietly doing their job.

---

**Your turn:** What's in your pre-commit setup? Drop the thing that's been silently saving your team from embarrassing commits — or the thing you finally ripped out because it was causing more pain than it was preventing.
