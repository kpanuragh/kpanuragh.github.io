---
title: "Build Your Own `gh` Commands: GitHub CLI Extensions Are Pure Magic 🔧✨"
date: "2026-03-20"
excerpt: "Tired of typing the same 5 GitHub commands 40 times a day? GitHub CLI extensions let you build your own `gh` subcommands. I built one on a lazy Sunday and it saved me hours every week."
tags: ["\"open-source\"", "\"github\"", "\"developer-tools\"", "\"automation\""]
featured: "true"
---

# Build Your Own `gh` Commands: GitHub CLI Extensions Are Pure Magic 🔧✨

**True story:** I once typed `gh pr list --author @me --state open` so many times in a single day that my muscle memory permanently burned those keystrokes into my fingers. My brain just stopped thinking about what the command meant. Pure automation. Human becomes robot. 🤖

Then a colleague showed me you could **build your own `gh` commands**.

I stared at my terminal for a full minute. You're telling me I could have `gh my-prs` and just... call it a day?

Reader, I immediately opened my laptop on a Saturday. No regrets.

## What Even Are GitHub CLI Extensions? 🤔

If you haven't been living in the `gh` CLI world, here's the setup: GitHub CLI (`gh`) is the official command-line tool for GitHub. It lets you manage PRs, issues, repos, releases, and more — right from your terminal, without ever touching a browser.

**But here's the part most people miss:**

`gh` has an extension system. You can install extensions built by the community, or **build your own**. Your extension becomes a real `gh` subcommand. No hacks, no aliases, no shims. A first-class command:

```bash
gh your-command-name
```

That's it. Pure GitHub CLI magic. ✨

**How it works under the hood:**

Extensions are just executables named `gh-[extension-name]` that live somewhere on your PATH. `gh` finds them automatically. They can be written in **any language** — shell script, Python, Go, Node.js, Rust, whatever you want. GitHub just calls your binary.

## My First Extension: `gh my-prs` 🚀

As a full-time developer who contributes to open source, I manage PRs across multiple repos. Work repos, personal projects, open source contributions. Every morning I'd manually check what needed attention.

The workflow was:

```bash
# Every. Single. Morning.
gh pr list --author @me --state open
gh pr list --reviewer @me --state open
gh issue list --assignee @me
```

Three commands. Every morning. Minimum. For years.

**So I built `gh my-prs`.**

Here's the full extension — it's embarrassingly simple:

```bash
#!/bin/bash
# gh-my-prs: Show all my open PRs and review requests

echo "🔄 YOUR OPEN PRs:"
echo "──────────────────"
gh pr list \
  --author "@me" \
  --state open \
  --json number,title,repository,createdAt \
  --jq '.[] | "  #\(.number) \(.title) [\(.repository.name)]"'

echo ""
echo "👀 WAITING FOR YOUR REVIEW:"
echo "────────────────────────────"
gh pr list \
  --search "review-requested:@me is:open" \
  --json number,title,repository \
  --jq '.[] | "  #\(.number) \(.title) [\(.repository.name)]"'

echo ""
echo "🎯 YOUR OPEN ISSUES:"
echo "──────────────────────"
gh issue list \
  --assignee "@me" \
  --state open \
  --json number,title,repository \
  --jq '.[] | "  #\(.number) \(.title) [\(.repository.name)]"'
```

**To install this:**

```bash
# Create the script
mkdir -p ~/.local/bin
nano ~/.local/bin/gh-my-prs  # paste the script above
chmod +x ~/.local/bin/gh-my-prs

# Now just run:
gh my-prs
```

Morning standup prep: **30 seconds** instead of 3 commands. 🎉

## The Official Way: `gh extension create` 🛠️

GitHub actually has a scaffold command for building extensions properly — especially if you want to **share them with the community** (which you should!):

```bash
# Create a new extension project
gh extension create my-extension-name

# This gives you:
# my-extension-name/
#   gh-my-extension-name  (the main script)
#   README.md
```

If you want to publish it:

```bash
cd my-extension-name
git init
git add .
git commit -m "initial extension"
gh repo create --public
git push -u origin main

# Now anyone can install it with:
# gh extension install YOUR-USERNAME/my-extension-name
```

**That's it.** Your extension is now installable by anyone in the world. The open source part? It's built in.

## Installing Community Extensions 🌍

Before you build your own, check what's already out there. The community has built some genuinely useful stuff:

```bash
# Search for extensions
gh extension search

# Install one
gh extension install dlvhdr/gh-dash

# List installed extensions
gh extension list

# Update all extensions
gh extension upgrade --all
```

**Extensions I actually use:**

```bash
# gh-dash — a beautiful dashboard TUI for PRs and issues
gh extension install dlvhdr/gh-dash

# gh-copilot — ask GitHub Copilot right from the terminal
gh extension install github/gh-copilot

# gh-blame — annotated blame with GitHub context
gh extension install mislav/gh-blame
```

`gh-dash` deserves a special mention. It's a terminal UI that shows all your PRs and issues in a slick dashboard. Open source, community-built, hundreds of stars. If you use `gh` daily, install this immediately. 🖥️

**In the security community,** I use a custom extension that queries the GitHub Security Advisories API and cross-references with my projects' dependencies. Wrote it in about 40 minutes. Runs every morning in my terminal startup. Saved me several manual GHSA searches.

## Build a Real One: `gh stale-prs` 🧟

Here's a more practical extension. In every open source project I maintain or contribute to, **stale PRs are a problem**. PRs that nobody has looked at in weeks. PRs that need a nudge.

```bash
#!/bin/bash
# gh-stale-prs: Find PRs older than N days with no activity
# Usage: gh stale-prs [days] [--repo owner/repo]
# Default: 14 days, current repo

DAYS=${1:-14}
REPO=${2:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)}

if [ -z "$REPO" ]; then
  echo "❌ Not in a git repo. Use: gh stale-prs [days] owner/repo"
  exit 1
fi

CUTOFF=$(date -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
         date -v -${DAYS}d +%Y-%m-%dT%H:%M:%SZ)

echo "🧟 STALE PRs (no activity for ${DAYS}+ days) in ${REPO}:"
echo "──────────────────────────────────────────────────────"

gh pr list \
  --repo "$REPO" \
  --state open \
  --json number,title,author,updatedAt,url \
  --jq --arg cutoff "$CUTOFF" \
  '.[] | select(.updatedAt < $cutoff) |
   "  #\(.number) \(.title)\n  👤 \(.author.login) | Last: \(.updatedAt[:10])\n  🔗 \(.url)\n"'
```

**Using it:**

```bash
# Check current repo, stale > 14 days (default)
gh stale-prs

# Check a specific repo, stale > 30 days
gh stale-prs 30 laravel/framework

# Check your own project
gh stale-prs 7 kpanuragh/my-package
```

**Balancing work and open source taught me** that momentum matters. A PR that sits untouched for 2 weeks is a PR that might never get merged. Stale PR detection means I catch them before contributors give up and disappear.

## Go Extensions for Power Users 🦫

Shell scripts are great for simple stuff, but GitHub has a scaffold for **Go-based extensions** too, which gives you the full `go-gh` library:

```bash
# Create a Go extension
gh extension create --precompiled=go my-go-extension
cd my-go-extension
```

The `go-gh` library gives you authenticated API calls, pagination, JSON parsing — all the good stuff. For anything beyond basic shell commands, Go extensions are the move.

```go
package main

import (
    "fmt"
    "github.com/cli/go-gh/v2"
    "github.com/cli/go-gh/v2/pkg/api"
)

func main() {
    client, _ := api.DefaultRESTClient()

    var prs []struct {
        Number int    `json:"number"`
        Title  string `json:"title"`
    }

    client.Get("repos/YOUR_ORG/YOUR_REPO/pulls?state=open", &prs)

    for _, pr := range prs {
        fmt.Printf("#%d: %s\n", pr.Number, pr.Title)
    }
}
```

Build it, distribute it, let your team install it. One `gh extension install` and everyone has the same tooling. Zero setup friction. This is how you get your team to actually use the tools you build. 💪

## Publishing Your Extension to the World 🌐

Here's the thing about building a `gh` extension — publishing it is **trivially easy**, and the discoverability is real.

```bash
# Make sure your repo is named gh-[extension-name]
# (GitHub uses this naming convention for discovery)

# Tag a release
git tag v1.0.0
git push origin v1.0.0

# For precompiled extensions, use gh-release action
# or build binaries and attach to the release manually
```

**What happens next:**

Anyone can now do `gh extension search your-extension-name` and find your work. The barrier to sharing developer tools via GitHub CLI extensions is the lowest I've ever seen in any ecosystem.

I published `gh-stale-prs` on a Tuesday afternoon. By Thursday someone in the Philippines had filed an issue requesting multi-repo support. **That's open source.** You build something for yourself, share it in 20 minutes, and a stranger on the other side of the world makes it better. 🌍

**In the security community,** this is how a lot of tooling gets shared — someone builds a quick CLI extension for vulnerability scanning or dependency checking, publishes it under their name, and it spreads through word-of-mouth in developer channels. No npm publish drama. No package registry submissions. Just a GitHub repo with the right name.

## The Extensions I Want Someone to Build 👀

Since we're here, let me crowdsource:

```
✅ gh-pr-health — checks if your PR follows contribution guidelines
   (branch name, tests, conventional commit title, linked issue)

✅ gh-co-author — adds co-authors to commits from PR participants
   (git commit messages with "Co-Authored-By" lines, auto-populated)

✅ gh-mirror — syncs a repo to multiple git remotes simultaneously
   (for people who self-host AND use GitHub)

✅ gh-security-scan — cross-reference repo dependencies against
   GitHub Advisory Database and print CVE matches
```

Seriously, if you build any of these, @ me. I'll be your first star. ⭐

## Getting Started Right Now 🏃

You have zero excuses. Here's the 10-minute challenge:

```bash
# Step 1: Make sure gh is installed
gh --version

# Step 2: Think of ONE command you type constantly
# (mine was gh pr list --author @me --state open)

# Step 3: Make it an extension
mkdir -p ~/.local/bin
cat > ~/.local/bin/gh-my-shortcut << 'EOF'
#!/bin/bash
gh pr list --author "@me" --state open
EOF
chmod +x ~/.local/bin/gh-my-shortcut

# Step 4: Run it
gh my-shortcut

# Step 5: Never type that long command again
```

That's **10 minutes** to extend GitHub CLI with your own command. If you're feeling ambitious, push it to a public repo and share it.

**Your action plan:**

1. **This week:** Build one extension that wraps a command you use daily
2. **This month:** Publish it to GitHub and add a README
3. **Ongoing:** Browse `gh extension search` — amazing stuff gets built constantly

## TL;DR 📦

GitHub CLI extensions let you build `gh` subcommands in any language. Shell scripts for quick stuff, Go for power tools. Install community extensions like `gh-dash`. Publish your own with a simple git push — discoverability is built in.

Balancing work and open source taught me that the best tools start as personal scratches for personal itches. `gh my-prs` started as "I'm tired of typing." It's now something three colleagues on my team use daily.

**That's the magic of building in the open.** Your lazy Sunday afternoon project becomes someone else's daily driver. 🚀

---

**Built a `gh` extension you're proud of?** Tell me about it — I'm on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and [GitHub](https://github.com/kpanuragh).

**Want to explore more CLI magic?** Check out the [official gh extensions docs](https://cli.github.com/manual/gh_extension) and the community list at `gh extension search`.

*Now go automate that command you've been typing for 3 years.* 🎯
