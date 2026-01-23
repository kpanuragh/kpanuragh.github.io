---
title: "GitHub CLI: The Secret Weapon You're Not Using ⚡🚀"
date: "2026-01-23"
excerpt: "Still opening GitHub in your browser like it's 2015? The GitHub CLI will change your life. PRs in 3 seconds, issues from your terminal, and you'll look like a hacker in coffee shops."
tags: ["github", "cli", "developer-tools", "productivity"]
featured: true
---

# GitHub CLI: The Secret Weapon You're Not Using ⚡🚀

**Real talk:** If you're still clicking through GitHub's web interface to create PRs, you're living in the Stone Age. 🦕

I used to be you. Click, click, scroll, paste, type, click again. Then I discovered `gh` - GitHub's official CLI tool - and suddenly I'm creating pull requests in **3 seconds** without leaving my terminal.

It's not just faster. It's a whole different way of working. Let me show you why you need this in your life!

## What Even Is GitHub CLI? 🤔

Think of it as GitHub's web interface, but on steroids and living in your terminal.

**The magic:**
- Create PRs without touching your mouse
- Review code from the command line
- Manage issues like a boss
- Run workflows with one command
- Clone repos faster than you can say "git clone"

**Translation:** Everything you do on github.com, but 10x faster and infinitely cooler! 😎

## Why You Should Care 💡

**Before GitHub CLI:**
```bash
# The old way (7 steps!)
git add .
git commit -m "Fix bug"
git push origin feature-branch
# Open browser
# Navigate to GitHub
# Click "Compare & pull request"
# Fill out the form
# Click "Create pull request"
```

**After GitHub CLI:**
```bash
# The new way (2 commands!)
git add . && git commit -m "Fix bug" && git push
gh pr create --fill
# Done! PR created! ✨
```

**Time saved:** About 30 seconds per PR. Do this 20 times a day? That's **10 minutes saved daily**. Over a year? **60+ hours** of your life back!

Plus, you look like a hacker from a movie. Your non-technical friends will be impressed! 🎬

## Getting Started (It Takes 2 Minutes) ⚙️

### Installation

**macOS:**
```bash
brew install gh
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt install gh

# Fedora/RHEL
sudo dnf install gh
```

**Windows:**
```bash
# Using winget
winget install --id GitHub.cli

# Or use Chocolatey
choco install gh
```

### The Magic Login

```bash
# Authenticate with GitHub
gh auth login

# Follow the prompts:
# 1. Choose GitHub.com (unless you use Enterprise)
# 2. Choose HTTPS or SSH (I use HTTPS)
# 3. Authenticate in browser

# That's it! You're a CLI wizard now! 🧙‍♂️
```

**Pro tip:** The authentication works for both `gh` and regular `git` commands. One login, infinite power!

## The Commands That'll Change Your Life 🎯

### 1. Creating PRs (The Game-Changer)

**The lazy way (auto-fill everything):**
```bash
gh pr create --fill
```

**What it does:**
- Creates PR from your current branch
- Uses your commit messages as PR description
- Opens in your default branch
- **Time saved:** 30 seconds per PR!

**The detailed way:**
```bash
gh pr create --title "Add user authentication" \
             --body "Implements JWT auth with refresh tokens" \
             --reviewer alice,bob \
             --label "enhancement" \
             --assignee @me
```

**The interactive way (my favorite!):**
```bash
gh pr create

# It'll ask you:
# - Title? (suggests from commits)
# - Description? (pulls from commits)
# - Which branch? (knows your default)
# - Submit? (y/n)
```

**Real story:** I used to spend 2 minutes per PR filling out forms. Now it's literally 5 seconds. My productivity went 📈!

### 2. Checking Out PRs (Code Review on Steroids)

**Someone sent you a PR? Check it out instantly:**
```bash
# See all PRs
gh pr list

# Check out PR #42 to review it locally
gh pr checkout 42

# Now you can run it, test it, break it!
```

**The power move:**
```bash
# Review PR #42 with comments
gh pr review 42

# Approve it
gh pr review 42 --approve

# Request changes with a comment
gh pr review 42 --request-changes \
  --body "Looks good but needs tests!"
```

**Why this is awesome:** Test PRs locally BEFORE merging. No more "it worked on their machine" surprises! 🎉

### 3. Managing Issues (Like a Boss)

**Create an issue (from your terminal!):**
```bash
gh issue create --title "Button doesn't work on mobile" \
                --body "Tested on iPhone 13, button is invisible" \
                --label "bug"
```

**List issues:**
```bash
# All issues
gh issue list

# Only YOUR issues
gh issue list --assignee @me

# Only bugs
gh issue list --label bug

# Open issues in browser
gh issue list --web
```

**Close an issue:**
```bash
gh issue close 123
```

**The workflow:**
```bash
# Morning standup routine
gh issue list --assignee @me
# See what you're working on
# Pick one, get to work
# Close it when done
# Repeat!
```

**No more context switching to your browser!** Stay in the zone! 🎮

### 4. Repo Operations (Speed Run Edition)

**Clone repos faster:**
```bash
# Old way
git clone https://github.com/facebook/react.git

# New way (shorter!)
gh repo clone facebook/react

# Even works with short syntax
gh repo clone react
# If you're in facebook's org!
```

**Create a new repo:**
```bash
# Create locally and on GitHub at the same time!
gh repo create my-awesome-project --public --source=. --remote=origin

# Translation:
# - Creates GitHub repo
# - Initializes local repo
# - Sets up remote
# - All in ONE command!
```

**Fork repos:**
```bash
# Fork and clone in one shot
gh repo fork vercel/next.js --clone

# Start contributing immediately!
```

**The magic:** No more clicking through GitHub's "New Repository" form! 🎉

### 5. GitHub Actions (CI/CD from Your Terminal)

**Watch your workflow runs:**
```bash
# See all workflow runs
gh run list

# Watch a specific run (LIVE!)
gh run watch

# See logs from the latest run
gh run view --log
```

**Re-run failed workflows:**
```bash
# Retry the latest failed run
gh run rerun

# Retry a specific run
gh run rerun 123456789
```

**Real use case:**
```bash
# Push code
git push

# Immediately watch the CI run
gh run watch

# See it pass in real-time
# Or catch failures FAST!
```

**Why I love this:** No more refreshing the Actions tab! Live updates in your terminal! 🔥

## The Power User Moves 💪

### Aliases (Make It Your Own)

```bash
# Create shortcuts for common commands
gh alias set prc 'pr create --fill'
gh alias set prv 'pr view --web'
gh alias set issues 'issue list --assignee @me'

# Now use them
gh prc      # Create PR instantly
gh prv      # View current PR in browser
gh issues   # See your issues
```

**My personal favorites:**
```bash
# Quick PR
gh alias set quickpr '!git push && gh pr create --fill'

# Today's work
gh alias set today 'issue list --assignee @me --label "in-progress"'

# Latest actions
gh alias set ci 'run watch'
```

### Combined Workflows (The Real Magic)

**The "Push and PR" one-liner:**
```bash
git add . && git commit -m "Add feature" && git push && gh pr create --fill
```

**The "Review and Approve" speedrun:**
```bash
gh pr checkout 42 && npm test && gh pr review 42 --approve
```

**The "Issue to Branch" workflow:**
```bash
# Create a branch from an issue
gh issue develop 123 --checkout

# Work on it, push
git push

# Create PR that closes the issue
gh pr create --fill --body "Closes #123"
```

**Mind = Blown!** 🤯

## Cool Tricks You Didn't Know Existed 🎪

### 1. Interactive Modes

```bash
# Browse issues interactively
gh issue list --web

# Browse PRs interactively
gh pr list --web

# Choose from a list with arrow keys!
```

### 2. Output as JSON (For Script Nerds)

```bash
# Get PR data as JSON
gh pr list --json number,title,author

# Pipe it to jq for processing
gh pr list --json title,number | jq '.[] | .title'

# Build custom dashboards!
```

### 3. GitHub Codespaces (From CLI!)

```bash
# Create a codespace
gh codespace create

# Connect to it
gh codespace ssh

# Code in the cloud from your terminal!
```

### 4. The Secret `gh browse` Command

```bash
# Open current repo in browser
gh browse

# Open specific PR
gh browse 42

# Open issues page
gh browse -- issues

# Open Actions page
gh browse -- actions
```

**Use case:** Terminal workflow, but need the browser for ONE thing? `gh browse`! 🎯

## The Cheat Sheet You'll Bookmark 📋

```bash
# PRs
gh pr create --fill           # Create PR
gh pr list                    # List PRs
gh pr checkout 42             # Check out PR #42
gh pr review 42 --approve     # Approve PR
gh pr merge 42                # Merge PR
gh pr view 42                 # View PR details

# Issues
gh issue create               # Create issue
gh issue list                 # List issues
gh issue close 123            # Close issue
gh issue view 123             # View issue

# Repos
gh repo clone user/repo       # Clone repo
gh repo create my-repo        # Create repo
gh repo fork user/repo        # Fork repo
gh repo view                  # View current repo

# Actions
gh run list                   # List workflow runs
gh run watch                  # Watch live run
gh run view --log             # View logs

# Auth
gh auth login                 # Login
gh auth status                # Check status

# Help
gh help                       # General help
gh pr --help                  # PR-specific help
```

**Print this, tape it to your monitor, become unstoppable!** 💪

## When GitHub CLI Really Shines ⭐

### Use Case 1: Rapid Development

```bash
# Your flow:
# 1. Fix bug
git commit -am "Fix login bug"

# 2. Push and create PR
git push && gh pr create --fill

# 3. Watch CI
gh run watch

# 4. Merge when green
gh pr merge --auto
```

**Time per iteration:** 10 seconds. You're a machine! 🤖

### Use Case 2: Code Reviews

```bash
# Morning review routine
gh pr list

# Pick one
gh pr checkout 42

# Test it locally
npm test

# Approve if good
gh pr review 42 --approve --body "LGTM! 🚀"

# Next PR
gh pr checkout 43
```

**Review 10 PRs before your coffee gets cold!** ☕

### Use Case 3: Issue Triage

```bash
# See what's new
gh issue list --label "needs-triage"

# Quick fix? Create branch
gh issue develop 123 --checkout

# Not a bug? Close with comment
gh issue close 124 --comment "Working as designed"

# Needs more info? Label it
gh issue edit 125 --add-label "needs-info"
```

**Triage 20 issues in 5 minutes!** 🏃‍♂️

## Common Pitfalls (Learn from My Mistakes) 🚨

**Mistake #1: Forgetting to Push**

```bash
# This WON'T work
gh pr create --fill

# Error: no commits pushed yet!

# Remember to push first!
git push && gh pr create --fill
```

**Lesson:** PR creation needs your branch on GitHub!

**Mistake #2: Wrong Directory**

```bash
# Running gh commands outside a git repo
cd ~/Documents
gh pr create

# Error: not in a git repository

# Always run gh commands IN your project!
```

**Mistake #3: Not Checking PR Status**

```bash
# Creating PR when one already exists
gh pr create --fill

# Error: PR already exists!

# Check first
gh pr list
```

## The Bottom Line 🎯

GitHub CLI is like having a GitHub superpower. You're not just "using GitHub" anymore - you're **dominating** it!

**What you learned today:**
1. Create PRs in 3 seconds (`gh pr create --fill`)
2. Review PRs locally (`gh pr checkout`)
3. Manage issues without the browser (`gh issue list`)
4. Clone repos with less typing (`gh repo clone`)
5. Watch CI/CD runs live (`gh run watch`)
6. Build custom workflows with aliases
7. Look incredibly cool doing it all 😎

**The best part?** This is just scratching the surface. GitHub CLI has SO many more features:
- Releases management
- Gists from terminal
- Secrets management
- API calls
- Extensions

**Most importantly:** You'll save **hours every week** and never break your terminal flow again!

## Your Action Plan 🚀

**Today:**
1. Install GitHub CLI (`brew install gh` or equivalent)
2. Run `gh auth login`
3. Try `gh pr list` in your current project

**This Week:**
1. Create your next PR with `gh pr create --fill`
2. Review a PR with `gh pr checkout`
3. Set up 2-3 aliases for your common workflows

**This Month:**
1. Never open GitHub in browser for basic tasks
2. Share this with your team
3. Become the CLI wizard everyone admires
4. Enjoy your new superpower! 🦸‍♂️

## Pro Tips from the Trenches 💎

**Tip #1:** Combine with `fzf` for fuzzy finding:
```bash
gh pr list | fzf
# Select PR with fuzzy search!
```

**Tip #2:** Use tab completion:
```bash
# Enable it (bash)
gh completion -s bash > /usr/local/etc/bash_completion.d/gh

# Now tab-complete everything
gh pr <TAB>
```

**Tip #3:** Set your editor for PR descriptions:
```bash
export EDITOR=vim
# Or code, nano, emacs, whatever you prefer
```

**Tip #4:** Check out GitHub CLI extensions:
```bash
gh extension list
gh extension install owner/repo
# Extend gh with community plugins!
```

## The Truth About Productivity 📈

**Before GitHub CLI:**
- 5 browser tabs open for GitHub
- Constant context switching
- 2 minutes per PR
- 10 minutes of waiting for CI feedback

**After GitHub CLI:**
- Terminal stays focused
- No context switching
- 5 seconds per PR
- Real-time CI updates

**The math:** If you create 10 PRs a week, you save **20 minutes weekly** = **17+ hours yearly**!

That's time for learning, building, or just enjoying life! 🎉

## Resources You Need 📚

**Official Docs:**
- GitHub CLI: [cli.github.com](https://cli.github.com)
- Manual: [cli.github.com/manual](https://cli.github.com/manual)

**Learning:**
- `gh --help` (seriously, read it!)
- `gh pr --help` (detailed help per command)
- GitHub CLI discussions (for advanced tricks)

**Extensions:**
- [github.com/topics/gh-extension](https://github.com/topics/gh-extension)

---

**Ready to level up?** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - Share your favorite `gh` tricks!

**Want to see my CLIs in action?** Check out my [GitHub](https://github.com/kpanuragh) and follow this blog!

*Now go install `gh` and never open GitHub in a browser again!* ⚡✨
