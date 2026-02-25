---
title: "Git Worktrees: Stop Stashing Your Life Away Every Time You Context-Switch 🌳💻"
date: "2026-02-25"
excerpt: "You're deep in a feature branch, three files open, half a refactor done — and your phone buzzes: 'urgent hotfix needed.' Enter git worktrees: the feature that lets you have multiple branches checked out simultaneously without the stash-and-pray ritual."
tags: ["open-source", "github", "git", "developer-tools", "community"]
featured: true
---

# Git Worktrees: Stop Stashing Your Life Away Every Time You Context-Switch 🌳💻

**Scene:** It's Tuesday afternoon. You're deep in a Laravel feature branch.

You've got four files open, a half-finished refactor, an Artisan command you're testing, and you're *this close* to getting it working. Your editor looks like a crime scene. Then Slack pings.

*"Hey, can you review this PR real quick?"*

You now have two options:

1. `git stash` — silently panic and hope you remember what you were doing later
2. `git worktree` — open the PR branch in a *separate directory* without touching your current work

I spent four years choosing option 1. Every time. Then I discovered worktrees, and I'm writing this post from a position of mild embarrassment about all the context I lost unnecessarily.

## What Even Is a Git Worktree? 🤔

A worktree is a way to check out multiple branches of a repo **at the same time, into different directories.**

Not multiple clones. The same repo, same `.git` folder, different working directories.

```bash
# Your current situation (feature branch, mid-refactor)
~/projects/myapp/          ← main worktree (feature/payment-rework)

# After adding a worktree for that urgent review
~/projects/myapp/           ← still feature/payment-rework, untouched
~/projects/myapp-hotfix/    ← new worktree on fix/critical-null-bug

# Or for reviewing a PR
~/projects/myapp-pr-491/    ← PR branch, separate directory
```

Your feature branch is still exactly where you left it. Nothing stashed. Nothing broken. Two different directories, two different branches, one git repo.

Sounds obvious once you see it. Nobody told me about it for four years.

## The Moment I Actually Started Using This 💡

As a full-time developer who contributes to open source, I was reviewing PRs against a security library I help maintain. The workflow was painful:

```bash
# Review PR #342
git stash          # save my work
git fetch origin
git checkout pr/342
# review, test, leave comments
git checkout feature/my-work
git stash pop      # pray nothing conflicts
```

Multiplied by 3-5 PRs a week. On a project where switching branches sometimes meant waiting for a full `composer install` or `npm install`.

I wasted an embarrassing amount of time on this.

Then a maintainer mentioned in our Discord: *"I just open a new worktree for each PR I review."*

Simple. Obvious in hindsight. Life-changing.

## The Commands You Need 🔧

### Adding a worktree

```bash
# Basic: create a new directory and check out a branch
git worktree add ../myapp-hotfix fix/critical-bug

# Create a new branch at the same time
git worktree add -b review/pr-491 ../myapp-pr-491 origin/pr-491

# From a specific remote branch (common for PR reviews)
git worktree add ../myapp-pr-491 origin/pr-branch-name
```

### Listing your worktrees

```bash
git worktree list

# Output:
/home/anuragh/projects/myapp          abc1234 [feature/payment-rework]
/home/anuragh/projects/myapp-hotfix   def5678 [fix/critical-bug]
/home/anuragh/projects/myapp-pr-491   ghi9012 [pr/491]
```

### Removing a worktree when done

```bash
git worktree remove ../myapp-pr-491

# Or if it has uncommitted changes you want to force-remove
git worktree remove --force ../myapp-pr-491

# Clean up stale worktree references
git worktree prune
```

That's the whole API. Three commands. You're done.

## The PR Review Workflow That Changed My Life 🔄

**Before worktrees:**

```
1. git stash (cry a little)
2. git fetch && git checkout pr-branch
3. npm install / composer install (wait 90 seconds)
4. Review, test, comment
5. git checkout feature/my-work
6. git stash pop
7. Discover conflict. Cry more.
```

**After worktrees:**

```bash
# Terminal 1: my ongoing feature work, untouched
cd ~/projects/myapp
# (still working)

# Terminal 2: PR review in isolated directory
git worktree add ../myapp-pr-491 origin/pr-branch
cd ../myapp-pr-491
npm install   # only needed once per worktree
# review, run tests, leave comments

# When done:
cd ~/projects/myapp
git worktree remove ../myapp-pr-491
```

My feature work? Never moved. Never stashed. Never conflicted.

**Balancing work and open source taught me this:** context switching is the biggest productivity killer. Not meetings (okay, also meetings). But the *mechanical overhead* of switching branches — stashing, installing, unstashing — destroys the flow you built up. Worktrees eliminate that overhead.

## The Open Source Maintainer's Setup 🌍

In the security community and Laravel ecosystem, I've seen active maintainers run 5-6 worktrees simultaneously:

```
~/projects/spatie-permission/           ← main development
~/projects/spatie-permission-pr-523/    ← reviewing security PR
~/projects/spatie-permission-pr-541/    ← second pending PR
~/projects/spatie-permission-v7/        ← major version work
~/projects/spatie-permission-docs/      ← docs branch
```

Each directory has its dependencies installed. Each is independently testable. Switch between them with `cd`, not `git stash`.

When someone submits a security fix PR, you don't disrupt your active development. You spin up a worktree, review in isolation, merge or reject, remove the worktree. Clean.

**As a full-time developer who contributes to open source**, this workflow lets me handle PR reviews during short breaks without losing the mental model of whatever I'm building. The 10-minute PR review no longer costs me 30 minutes of "where was I?"

## For Long-Running Release Branches 🚀

Worktrees shine for projects that maintain multiple release branches:

```bash
# Maintaining Laravel packages often means:
git worktree add ../pkg-laravel-10 support/laravel-10
git worktree add ../pkg-laravel-11 support/laravel-11
# main worktree: main branch (Laravel 12 compat work)

# Backport a bug fix to both:
cd ../pkg-laravel-10 && git cherry-pick abc1234
cd ../pkg-laravel-11 && git cherry-pick abc1234
```

No branch gymnastics. No stashing. No "wait which branch am I on?" accidents.

I used this exact pattern when a security issue was reported in a PHP package I maintain. The fix needed backporting to three supported versions. With worktrees, it took 20 minutes. With traditional branch switching and stashing? Easily an hour, with three opportunities to commit to the wrong branch.

## Common Gotchas (Don't Be Me) ⚠️

**You can't check out the same branch in two worktrees**

```bash
# This will fail if 'main' is already checked out
git worktree add ../myapp-main2 main
# fatal: 'main' is already checked out
```

Makes sense — two directories modifying the same branch would be chaos. Create a new branch instead.

**Dependencies aren't shared**

Each worktree is its own directory. If you `npm install` in your main worktree, the `node_modules` exist there. In a new worktree, you'll need to install again.

```bash
# Solution: symlink node_modules if you don't need isolation
ln -s ~/projects/myapp/node_modules ~/projects/myapp-pr/node_modules
# (Only do this if you're 100% sure the dependencies are identical)
```

For most PR reviews, I just install. It's worth it for the isolation.

**IDE confusion**

VS Code and most editors handle worktrees fine if you open them as separate folders. The gotcha is if your IDE stores per-project settings tied to the directory name — give worktrees sensible names so your editor picks up the right config.

**Don't forget to prune**

Over time, removed worktrees can leave ghost references:

```bash
# Run occasionally to clean up
git worktree prune
git worktree list  # verify it's clean
```

## The Workflow That Clicked for Me 🎯

After experimenting, here's what settled as my standard setup:

```bash
# Naming convention I use:
# [repo]-[purpose]-[short-identifier]
git worktree add ../myapp-review-pr491  origin/pr-branch    # PR review
git worktree add ../myapp-hotfix-null   hotfix/null-crash   # urgent fix
git worktree add ../myapp-v2-auth       feature/v2-auth     # parallel feature

# Alias for quick PR checkout (put in .bashrc/.zshrc):
alias wt-pr='git worktree add ../$(basename $PWD)-pr-$1 origin/$2'
# Usage: wt-pr 491 feature/new-auth-flow
```

Consistent naming means I always know which directory is which without running `git worktree list`.

## Projects Where This Is a Game Changer 🎮

The pattern helps most when:

**🔒 Security projects** — You need to review security-sensitive PRs carefully. Rushing through a stash-and-review means you might miss something. An isolated worktree lets you take your time without blocking your work.

**📦 Popular packages** — Projects getting 20+ PRs per week. Maintainers live in worktrees or they live in chaos.

**🏗️ Monorepos** — When a PR touches module A and you're working in module B, a worktree means zero interference.

**🔄 LTS branch maintenance** — Supporting Laravel 10, 11, and 12 simultaneously? Worktrees for each.

## TL;DR — One More Thing Git Has Been Hiding From You 📋

- **`git worktree add`** = check out a branch into a new directory without touching your current work
- Replaces the `git stash` → `git checkout` → `git stash pop` → weep cycle
- Perfect for PR reviews, hotfixes, and parallel feature work
- Same repo, multiple directories, zero conflicts between them
- Commands: `add`, `list`, `remove`, `prune` — that's the whole API
- Gotchas: can't share branches, dependencies not shared, prune regularly

The git stash is fine for quick "I'll be back in 30 seconds" switches. For anything longer — any PR review, any hotfix that takes real focus, any parallel work — use worktrees.

Your future self at 6pm, trying to remember what he was doing before the urgent review, will be deeply grateful.

---

**Do you use git worktrees?** I'd love to know your setup and naming conventions — find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh).

*In the security community, we call the `git stash` panic moment "stash and pray." Worktrees turn that into "checkout and relax." 🌳*
