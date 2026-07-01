---
title: "🪝 Pre-Commit Hooks That Don't Make Your Team Hate You"
date: "2026-07-01"
excerpt: "Pre-commit hooks are either a quiet superpower or the reason your team runs `git commit --no-verify` on autopilot. Here's how to build the kind people actually keep enabled."
tags:
  - ci-cd
  - devops
  - git
  - developer-experience
  - platform-engineering
featured: true
---

Every team's pre-commit hook journey follows the same three acts. Act one: someone adds a hook to "catch mistakes before CI does." Act two: the hook grows — a linter here, a formatter there, "let's also run the full test suite, why not" — until a single commit takes 45 seconds. Act three: `git commit --no-verify` becomes muscle memory, and the hook is now decorative.

I've watched this play out on more than one team, and the fix isn't "add more discipline." It's designing hooks that respect the fact that a commit happens dozens of times a day and has to feel closer to instant than to a coffee break.

## The Core Rule: Hooks Are a Latency Budget, Not a Checklist

Treat your pre-commit hook like you'd treat a hot path in production code — it has a latency budget, and every check you add spends from it. My rule of thumb: **anything over ~2 seconds needs to justify its existence**, and anything over 5 seconds needs to move to CI instead.

That means the classic offender — running your entire test suite on every commit — almost never belongs in a pre-commit hook. Tests belong in CI (or a pre-push hook at most). What belongs in pre-commit is fast, local, deterministic feedback: formatting, linting the files you actually touched, and cheap static checks.

## Lesson One: Only Touch What Changed

The single biggest annoyance I've seen is a hook that reformats or lints the *entire repository* on every commit — including files you didn't even open. On a large codebase that's the difference between a 200ms check and a 20-second one, and it also produces unrelated diff noise that makes code review harder.

[`pre-commit`](https://pre-commit.com/) (the Python-based framework, now used well beyond Python projects) gets this right by default — it only runs against staged files:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/mirrors-prettier
    rev: v4.0.0
    hooks:
      - id: prettier
        files: \.(js|ts|tsx|jsx|json|md)$

  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.5.0
    hooks:
      - id: eslint
        files: \.(js|ts|tsx|jsx)$
        args: [--fix]
```

If you're rolling your own with a shell script instead, the equivalent is `git diff --cached --name-only --diff-filter=ACM` — diff against the *index*, not the working tree, and filter to added/copied/modified files so deletions don't trip up your linter.

## Lesson Two: Auto-Fix, Don't Just Reject

A hook that says "line 42 has trailing whitespace, fix it yourself and try again" is a hook people will disable. A hook that fixes it and re-stages the file is a hook people forget is even running — which is exactly the point.

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit
set -euo pipefail

staged_files=$(git diff --cached --name-only --diff-filter=ACM -- '*.ts' '*.tsx')

if [ -n "$staged_files" ]; then
  echo "$staged_files" | xargs npx prettier --write
  echo "$staged_files" | xargs git add
fi
```

The rule: formatting and import-sorting should *never* fail a commit — they should just silently make it correct. Reserve hard failures for things a machine genuinely can't safely auto-resolve: type errors, a committed `.env` file, a leaked API key, a merge-conflict marker that slipped through.

## Lesson Three: Secret Scanning Is Non-Negotiable and Cheap

This is the one hook I'll die on a hill for. Catching a leaked AWS key locally costs you 200ms. Catching it after it's pushed costs you a key rotation, an incident channel, and an awkward Slack message to security. Tools like [`gitleaks`](https://github.com/gitleaks/gitleaks) or `detect-secrets` run fast enough that there's no excuse:

```yaml
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.4
    hooks:
      - id: gitleaks
```

At Cubet, we added exactly this hook after a near-miss where a `.env.local` file almost got committed with a staging database password in it — caught by a teammate in code review, not by tooling, which was the uncomfortable part. Gitleaks went in as a pre-commit hook the same week, and it's paid for itself since in "oh, good catch" moments that never made it to a PR.

## Lesson Four: Make Skipping Loud, Not Silent

You cannot stop someone from running `--no-verify` — nor should you try; sometimes it's the right call for a WIP commit on a branch nobody else touches. What you *can* do is make sure skipping never happens invisibly at the point that matters: CI.

Run the exact same checks in CI that you run in pre-commit — same linter config, same formatter version — and fail the build if they don't pass. The pre-commit hook is a courtesy that saves round-trips; CI is the actual gate. If someone bypasses the hook, they just get the feedback five minutes later instead of five seconds later, which is annoying but never *wrong*.

## Lesson Five: Pin Versions, or Watch Trust Erode Overnight

Nothing kills faith in a hook faster than it failing differently on two machines because one person's global ESLint is a minor version ahead. Pin exact tool versions in your hook config (as in the `rev:` fields above) and, ideally, run the hook through a wrapper (`npx`, `pre-commit`'s own virtualenv-per-hook model, or a Docker-based runner) so "works on my machine" doesn't apply to your linter.

## The Test: Would You Tolerate This Hook Yourself?

Before shipping a new pre-commit check to your team, time it on a typical commit — not the empty-repo demo case, the actual "I touched 6 files" case. If it's under two seconds and it fixes more than it complains about, ship it. If it's slower than that or it just yells without helping, it belongs in CI, or it doesn't belong at all.

The best compliment a pre-commit hook can get isn't "it caught a bug" — it's that nobody on the team remembers it's there, because it's never once been the thing standing between them and `git commit`.

What's the slowest or most-hated hook you've inherited on a team? I'd genuinely like to hear the horror stories — reply or open an issue on the [blog's repo](https://github.com/kpanuragh/kpanuragh.github.io).
