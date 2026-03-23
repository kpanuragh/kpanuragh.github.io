---
title: "git bisect: The Binary Search That Finds Which Commit Broke Everything 🔍"
date: "2026-03-05"
excerpt: "Something broke in production. The last 400 commits are suspects. You could review them one by one like a detective with infinite patience and no life — or you could let git do a binary search and find the culprit in 9 commits flat."
tags: ["\\\"open-source\\\"", "\\\"github\\\"", "\\\"developer-tools\\\"", "\\\"git\\\"", "\\\"debugging\\\""]
featured: "true"
---

# git bisect: The Binary Search That Finds Which Commit Broke Everything 🔍

**Relatable nightmare:** You're maintaining an open source library. A user opens an issue: *"This was working fine in v2.1.0. It's broken in v2.4.0."*

Three versions. About 200 commits. And zero idea which one of those commits introduced the regression.

What do you do?

If you're like me before I discovered `git bisect`, you do something like this: squint at the commit history, pick a commit that "looks suspicious," check it out, test it, nope, try another one, get distracted, close the laptop, and tell the user you'll "look into it."

If you're like me *after* discovering `git bisect`, you type six commands and find the exact offending commit in under 3 minutes.

**As a full-time developer who contributes to open source**, I genuinely cannot believe this command isn't in every developer's daily vocabulary. Seven years of Laravel, AWS, and Node.js work, and I only stumbled onto `git bisect` because a maintainer on a PHP security library casually dropped it in a code review comment like it was obvious. It was not obvious. It was life-changing.

## What is git bisect, Actually? 🤔

`git bisect` performs a **binary search through your git history** to find exactly which commit introduced a bug.

You tell it: "This commit is good. This other commit is bad. Go find the first bad commit."

Git then checks out the commit exactly in the middle. You test it. You tell git: good or bad? Git checks out the middle of the remaining range. You test again. Repeat.

With 400 commits, you're done in about 9 steps. That's `log₂(400) ≈ 8.6`, rounded up. Compare that to the potentially 400 steps of checking commits one by one.

It's basically the algorithm you learned in CS101 applied to your broken codebase. Except your codebase, unlike a sorted array, probably smells like technical debt and broken dreams.

## The Basic Workflow 🚀

Here's the core flow:

```bash
# Start the bisect session
git bisect start

# Tell git: the current commit is bad (broken)
git bisect bad

# Tell git: this old tag/commit was good (working)
git bisect good v2.1.0

# Git now checks out a middle commit...
# Test your code. Did it work?

git bisect good   # if it worked at this commit
# OR
git bisect bad    # if it was already broken here

# Git checks out another middle commit...
# Keep going until git prints:
# "abc123 is the first bad commit"

# Clean up when done
git bisect reset
```

That's it. Git picks the commits. You just say good or bad. Binary search does the rest.

**Balancing work and open source taught me:** the most valuable debugging skills aren't the flashy ones. Nobody tweets about `git bisect`. But I've watched it collapse a 3-hour debugging session into 8 minutes more times than I can count.

## A Real Story From Contributing to a Laravel Package 🧪

A few months ago, I was working on a pull request for a Laravel security utility package I contribute to. A test that had been passing for months suddenly started failing on the `main` branch.

The test checked how the package validated HMAC signatures on incoming webhook payloads. Critical security stuff — not the kind of thing you want to debug by guessing.

```bash
git log --oneline main | wc -l
# 847
```

847 commits. The last release tag where tests passed was 6 weeks ago.

Instead of panicking, I ran:

```bash
git bisect start
git bisect bad HEAD
git bisect good v1.8.2

# Git immediately told me:
# "Bisecting: 423 revisions left to test after this
#  (roughly 9 steps)"
```

Nine steps to check. I ran the failing test at each bisect checkpoint. Each check took maybe 10 seconds — `php artisan test --filter=HmacSignatureTest`.

Eight iterations later:

```
e7f3a91 is the first bad commit
Author: [contributor name]
Date:   Mon Feb 12 14:23:01

    refactor: extract string comparison helper
```

There it was. A refactoring commit that extracted a string comparison utility — and accidentally changed from a constant-time comparison (`hash_equals()`) to a direct equality check (`===`). For HMAC validation, that's a **timing attack vulnerability**.

**In the security community**, timing attacks are real. The switch from `hash_equals()` to `===` was a security regression dressed up as a refactor. `git bisect` found it in 8 steps.

I opened a PR with the fix and referenced the exact commit in my PR description. The maintainer merged it within hours.

## Automating Bisect: The Really Cool Part 🤖

Here's where `git bisect` goes from "useful" to "unreasonably powerful."

If you can write a script that exits with 0 for a good state and non-zero for a bad state, git can run the entire bisect automatically:

```bash
git bisect start
git bisect bad HEAD
git bisect good v2.1.0

# Hand it a test script and walk away
git bisect run php artisan test --filter=HmacSignatureTest
```

Git runs your test at each checkpoint, interprets the exit code, and narrows down automatically until it finds the first bad commit. No human interaction required.

You can run `git bisect run` and go make coffee. When you come back, git has already printed the culprit.

For open source projects with automated test suites (which you should have), this is absolutely wild. You're automating forensics.

```bash
# For a Node.js project
git bisect run npm test -- --grep "webhook signature"

# For a Rust project
git bisect run cargo test hmac_validation

# For a Python project
git bisect run pytest tests/test_security.py::test_hmac

# For a shell check
git bisect run ./scripts/smoke-test.sh
```

The script just needs to:
- Return 0 if the commit is good
- Return 1-127 (but not 125) if the commit is bad
- Return 125 if the commit can't be tested (git skips it)

**As a full-time developer who contributes to open source**, that 125 exit code is gold. Sometimes you're bisecting through commits that don't even compile. `exit 125` tells git "skip this one, it can't be tested" and git continues the search around the untestable commits.

## The Skip Command: Handling Broken Builds in History 🛑

Not every commit in your history compiles cleanly. Maybe someone pushed a work-in-progress. Maybe a dependency changed and the middle of your history has a temporarily broken state.

```bash
# This commit is untestable (won't compile, wrong env, etc.)
git bisect skip

# Or skip a range of commits
git bisect skip v2.2.0..v2.3.0
```

Git works around the skipped commits and gives you a result like:

```
There are only 'skip'ped commits left to test.
The first bad commit could be any of:
abc123
def456
ghi789
```

Less precise, but still way better than manual investigation.

## Using bisect to Find a Regression in an Open Source Repo You Don't Own 👀

Here's a workflow I use constantly when filing high-quality bug reports for projects I contribute to.

When a user reports "this broke between v2.1.0 and v2.4.0" on a project I maintain, I use bisect to find the exact commit. But I also use bisect when I'm a *user* who wants to file a precise bug report.

A precise bug report that says "this regression was introduced in commit `e7f3a91`" gets fixed a hundred times faster than "this stopped working sometime recently."

Maintainers LOVE when you do the bisect work for them. It's one of the most valuable contributions you can make that doesn't involve writing code.

The workflow:

```bash
# Clone (or use your existing clone) of the project
git clone https://github.com/some-project/cool-library.git
cd cool-library

git bisect start
git bisect bad HEAD            # current version is broken
git bisect good v2.1.0        # this version worked

# ... bisect away ...

# Include the result in your issue:
# "The regression was introduced in commit e7f3a91:
#  'refactor: extract string comparison helper'"
```

**Balancing work and open source taught me:** the quality of your bug report determines how quickly it gets fixed. A bisected bug report is a first-class contribution even if you don't know how to fix the underlying issue.

## Visualizing the Bisect History 📊

Want to see what git is doing? `git bisect log` shows the full session:

```bash
git bisect log

# Output:
# git bisect start
# # bad: [current HEAD sha]
# git bisect bad HEAD
# # good: [v2.1.0 sha]
# git bisect good v2.1.0
# # good: [middle commit sha]
# git bisect good
# # bad: [closer commit sha]
# git bisect bad
# ...
# # first bad commit: [e7f3a91 sha]
```

You can save this log and replay it with `git bisect replay` — useful if you want to verify your findings or share the investigation with a maintainer.

## When to Reach for git bisect 🎯

I use bisect whenever:

- **A regression appeared** between two known-good commits
- **A test started failing** and I don't know why
- **A user reports** "this worked in version X, broken in version Y"
- **A performance degradation** appeared somewhere in recent history
- **A security behavior changed** unexpectedly

I don't use bisect for:
- Debugging a bug I introduced today (just use `git diff` and your brain)
- Finding when a file was last changed (`git log -p -- filename` is better)
- Understanding the history of a feature (`git log --follow` is your friend)

## Real Projects Where This Has Saved Me 🌟

**Laravel Framework** — when a middleware behavior changed between minor versions, bisect found the commit in the `src/Illuminate/Http` code in under 10 steps. Filed a detailed issue. Got a response from a core contributor within a day.

**A PHP JWT validation library** — a timing vulnerability crept in during a "performance refactor." Bisect found it. The fix was a one-line change back to `hash_equals()`. The maintainer credited the bisect trace in the security advisory.

**My own packages** — I've caught my own regressions with bisect before merging PRs. Running `git bisect run` against my test suite on a suspect feature branch has saved me from shipping broken code more than once.

## The Three Commands You'll Use 95% of the Time 🔑

```bash
# 1. Start, mark bad and good
git bisect start
git bisect bad
git bisect good <tag-or-sha>

# 2. After testing each checkpoint
git bisect good   # or: git bisect bad

# 3. Clean up when done (ALWAYS do this)
git bisect reset
```

And the power move:

```bash
# Fully automated
git bisect run <your-test-command>
```

Seriously, that's the whole tool. Ten minutes of learning, a lifetime of painful debugging sessions avoided.

## TL;DR 🏁

- `git bisect` does a **binary search through your commit history** to find which commit introduced a bug
- You only need `log₂(N)` checks — 400 commits = ~9 checks, not 400
- `git bisect run <script>` fully automates it if you have a reproducible test
- `git bisect skip` handles commits that can't be tested
- **Filing a bisected bug report** is a high-value open source contribution even without code
- `git bisect reset` cleans up — don't forget this or you'll wonder why HEAD is pointing somewhere weird
- This tool has been in git since forever and somehow nobody talks about it

The next time a regression appears and you feel the urge to stare at 200 commits hoping inspiration strikes — run `git bisect start` instead.

Binary search. Nine steps. Done.

---

**Spotted a regression in an open source project with git bisect?** Share which project — I'd love to hear the story. Find me on [GitHub](https://github.com/kpanuragh) or [LinkedIn](https://www.linkedin.com/in/anuraghkp).

*Now go find who broke production. (Spoiler: it was a refactor that "should have been a no-op.")*  🕵️
