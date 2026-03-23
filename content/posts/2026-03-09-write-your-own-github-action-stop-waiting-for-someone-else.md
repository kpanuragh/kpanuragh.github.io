---
title: "Write Your Own GitHub Action: Stop Waiting for Someone Else to Build It 🛠️🚀"
date: "2026-03-09"
excerpt: "Every time I copy-pasted the same 40-line workflow YAML into another repo, a tiny piece of my soul left. Then I learned to write my own GitHub Action. Now that pain is everyone else's to avoid too."
tags: ["\\\"open-source\\\"", "\\\"github\\\"", "\\\"developer-tools\\\"", "\\\"devops\\\""]
featured: "true"
---

# Write Your Own GitHub Action: Stop Waiting for Someone Else to Build It 🛠️🚀

**True story:** I once copy-pasted the same 40-line GitHub Actions workflow across eleven different repositories.

ELEVEN. 🙃

Every time a project lead asked "can you add the same deployment pipeline we have in repo A to repo B?" I'd open two browser tabs, highlight everything, paste, tweak the repo name, commit, and pretend I was being productive.

I was not being productive. I was being lazy in a way that was somehow ALSO time-consuming. Peak inefficiency.

The day I finally wrote my own custom GitHub Action — something reusable, publishable, and shareable — I felt like I'd unlocked a superpower I didn't know existed. And I'm baffled it took me so long.

Let me show you how it works.

## What Even IS a GitHub Action? 🤔

Before I wrote one, I thought GitHub Actions were these mystical things maintained by GitHub staff and select special contributors. Turns out? **Anyone can write one.**

A GitHub Action is just a packaged piece of automation that lives in a repo and can be referenced in any workflow. It can be:

```yaml
# Using someone else's action
- uses: actions/checkout@v4

# Using YOUR action (from your own repo)
- uses: kpanuragh/slack-deploy-notifier@v1

# Using an action from the same repo
- uses: ./.github/actions/my-local-action
```

**Three types you can build:**

```
1. JavaScript/TypeScript actions  → Most flexible, runs in Node.js
2. Composite actions              → Reusable shell scripts / workflow steps
3. Docker container actions       → Full environment control
```

For most use cases, I reach for **composite actions** first (easiest), then **JavaScript actions** when I need real logic.

## The Action That Started It All 💡

As a full-time developer who contributes to open source, I work across a lot of Laravel projects that share the same deployment checklist:

1. Run PHP CS Fixer
2. Run PHPStan
3. Run PHPUnit
4. Post a Slack notification with the result

Every. Single. Repo. Same four steps. Same configuration.

I was maintaining this in 11 repos. When we upgraded PHPStan to v2, I had to update 11 YAML files. I updated 8 of them correctly. The other 3 silently broke in ways we discovered weeks later in production.

**That was the moment.** Time to write a real action.

## Building a Composite Action in 15 Minutes ⚡

Let's build something real — a composite action that runs a standard Laravel quality check suite.

### Step 1: Create the Action Repo

```bash
# New public repo: github.com/kpanuragh/laravel-quality-check
mkdir laravel-quality-check && cd laravel-quality-check
git init
```

Your folder structure:

```
laravel-quality-check/
├── action.yml          ← The heart of it all
├── README.md
└── LICENSE
```

### Step 2: Write `action.yml`

```yaml
name: "Laravel Quality Check"
description: "Run PHP CS Fixer, PHPStan, and PHPUnit for Laravel projects"
author: "kpanuragh"

inputs:
  php-version:
    description: "PHP version to use"
    required: false
    default: "8.3"
  phpstan-level:
    description: "PHPStan analysis level (0-9)"
    required: false
    default: "5"
  run-tests:
    description: "Whether to run PHPUnit tests"
    required: false
    default: "true"

outputs:
  test-result:
    description: "Result of PHPUnit run (pass/fail)"
    value: ${{ steps.tests.outputs.result }}

runs:
  using: "composite"
  steps:
    - name: Setup PHP
      uses: shivammathur/setup-php@v2
      with:
        php-version: ${{ inputs.php-version }}
        extensions: mbstring, pdo, sqlite3

    - name: Install dependencies
      shell: bash
      run: composer install --prefer-dist --no-progress

    - name: Run PHP CS Fixer
      shell: bash
      run: ./vendor/bin/php-cs-fixer fix --dry-run --diff

    - name: Run PHPStan
      shell: bash
      run: ./vendor/bin/phpstan analyse --level=${{ inputs.phpstan-level }}

    - name: Run PHPUnit
      if: inputs.run-tests == 'true'
      id: tests
      shell: bash
      run: |
        ./vendor/bin/phpunit && echo "result=pass" >> $GITHUB_OUTPUT \
          || echo "result=fail" >> $GITHUB_OUTPUT

branding:
  icon: "check-circle"
  color: "green"
```

That's it. That's the whole action. 🎉

### Step 3: Tag and Release

```bash
git add .
git commit -m "feat: initial laravel quality check action"
git tag -a v1.0.0 -m "v1.0.0 - Initial release"
git push origin main --tags
```

### Step 4: Use It Everywhere

Now in every Laravel repo:

```yaml
# .github/workflows/quality.yml
name: Quality Check

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: kpanuragh/laravel-quality-check@v1
        with:
          php-version: "8.3"
          phpstan-level: "6"

      - name: Check test result
        run: |
          if [ "${{ steps.check.outputs.test-result }}" == "fail" ]; then
            echo "Tests failed!"
            exit 1
          fi
```

Went from 40 lines duplicated across 11 repos to **8 lines** that stay in sync automatically. 🙌

## Level Up: JavaScript Actions for Real Logic 🧠

Composite actions are great, but sometimes you need actual programming logic. That's when you reach for JavaScript actions.

**My real-world example:** I built a small action that posts a formatted Slack notification when a Laravel deployment completes — including environment name, version tag, who triggered it, and whether tests passed.

```typescript
// src/index.ts
import * as core from "@actions/core";
import * as github from "@actions/github";
import { WebClient } from "@slack/web-api";

async function run(): Promise<void> {
  try {
    const token = core.getInput("slack-token", { required: true });
    const channel = core.getInput("channel", { required: true });
    const status = core.getInput("status", { required: true });

    const client = new WebClient(token);
    const context = github.context;

    const emoji = status === "success" ? "✅" : "❌";
    const color = status === "success" ? "#36a64f" : "#ff0000";

    await client.chat.postMessage({
      channel,
      attachments: [
        {
          color,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${emoji} *Deployment ${status}*\n*Repo:* ${context.repo.repo}\n*Ref:* ${context.ref}\n*Actor:* ${context.actor}`,
              },
            },
          ],
        },
      ],
    });

    core.setOutput("message-sent", "true");
  } catch (error) {
    core.setFailed(`Action failed: ${error}`);
  }
}

run();
```

```yaml
# action.yml for JS action
runs:
  using: "node20"
  main: "dist/index.js"    # ← Compiled output, committed to repo
```

**The gotcha with JS actions:** You need to commit the compiled `dist/` folder. Use `@vercel/ncc` to bundle everything into a single file:

```bash
npm install --save-dev @vercel/ncc @actions/core @actions/github
npx ncc build src/index.ts -o dist
git add dist/
git commit -m "build: compiled action bundle"
```

## The Community Superpower: Publish to GitHub Marketplace 🌍

This is where it gets really fun.

**Publishing your action is free and takes 3 steps:**

1. Your repo must have a top-level `action.yml`
2. Go to your repo → Click "Draft a release"
3. Check "Publish this Action to the GitHub Marketplace"

Done. Your action is now searchable by 100 million+ GitHub users.

**Balancing work and open source taught me** that the highest-leverage contributions aren't always PRs to other projects. Sometimes it's building the tool that other contributors need. My Slack deploy notifier has been starred by teams I've never met who use Laravel in completely different industries. That feeling? Addictive. 🤩

## What Makes a Great Action ✨

After publishing a few and using hundreds more, here's what separates the good ones from the ones I stop using after one bad experience:

```markdown
✅ Clear inputs with sensible defaults
   → Users shouldn't need to read 200 lines of docs

✅ Useful outputs
   → Let downstream steps react to what happened

✅ Pinnable to a version (tags, not just "latest")
   → actions/checkout@v4, not actions/checkout@latest
   → Security 101 in the supply chain era

✅ Works on ubuntu-latest, macos-latest, windows-latest
   → Or clearly documents which runners it supports

✅ Fails fast with helpful error messages
   → core.setFailed("Missing required input: api-key.
      See README for setup.") beats a cryptic stack trace

✅ Has a test workflow in the repo itself
   → Dogfood your own action. Trust me.
```

**In the security community,** pinning actions to a specific SHA (not just a tag) is increasingly recommended for sensitive workflows:

```yaml
# Tag (good)
- uses: kpanuragh/laravel-quality-check@v1

# SHA pin (best for security-sensitive contexts)
- uses: kpanuragh/laravel-quality-check@a1b2c3d4e5f6...
```

Tags can be force-pushed. SHAs cannot. Worth knowing.

## Actions Worth Contributing To 🤝

If you want to contribute to existing GitHub Actions instead of building from scratch, these projects have excellent contributor experiences:

**GitHub's own actions (great first contributions):**
- **actions/checkout** — Core checkout action, PHP/Node/Go fixes welcome
- **actions/cache** — Caching strategies, always room for improvement
- **actions/setup-node** — Node.js setup, active development

**Community favorites that welcome PRs:**
- **shivammathur/setup-php** — The PHP setup action, Shivammathur is an incredibly responsive maintainer
- **softprops/action-gh-release** — Release automation, well-documented contribution guide
- **peter-evans/create-pull-request** — Lots of edge cases to handle, detailed issue tracker

**My personal playground:** I've contributed bug fixes to `shivammathur/setup-php` when I found edge cases with specific PHP extension combinations in Laravel projects. The maintainer usually reviews within 48 hours. Phenomenal experience.

## The Five-Minute Starter 🏃

You don't need to build something complex. **Start with what you copy-paste.**

Right now, go look at your `.github/workflows/` directories. Find the block of steps you see repeated. That's your action waiting to be born.

```bash
# Create a local action in any repo
mkdir -p .github/actions/my-action
cat > .github/actions/my-action/action.yml << 'EOF'
name: "My Reusable Steps"
description: "The thing I keep copy-pasting"
runs:
  using: "composite"
  steps:
    # Paste your repeated steps here
    - shell: bash
      run: echo "No more copy-pasting!"
EOF
```

Use it in the same repo:

```yaml
- uses: ./.github/actions/my-action
```

**This alone** — just extracting repeated steps into a local action — is a huge quality-of-life improvement. Then, when you realize other people might need it, extract it into its own repo and publish.

## The Real Win 🏆

I'm going to be honest with you: writing my first GitHub Action was a bit scary. It felt like "real" open source infrastructure, not just a library tweak.

But here's the thing — the feedback loop is incredibly fast. You push a tag, update the `@v1` reference in one workflow, watch the CI run, and in 5 minutes you know if it works. No deploy pipeline. No staging environment. Just: does the thing work when GitHub runs it?

**What I've shipped:**
- Laravel quality check suite (used in 11 repos, now in one place)
- Slack deployment notifier (saves me 3 Slack messages per deploy)
- A simple action that checks if PHP files changed before running expensive analysis (saved ~4 minutes per push)

None of these are revolutionary. All of them make my week measurably less annoying.

**That's the secret to sustainable open source contribution:** solve your own problems in public, and let others find the solution.

## Your Challenge This Week 🎯

1. Find one thing you copy-paste between GitHub workflows
2. Move it into a composite action in the same repo (`.github/actions/`)
3. Verify it works
4. If it passes, extract it to a standalone repo
5. Add the `action.yml` branding block
6. Create a v1.0.0 tag and publish to Marketplace

Six steps. Weekend project. Actual impact.

---

**Already published a GitHub Action?** I'd genuinely love to see it — drop it in the comments or find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) or [GitHub](https://github.com/kpanuragh).

**Want to see my action repos in progress?** Check my [GitHub profile](https://github.com/kpanuragh) — some are polished, some are barely-documented experiments. All of them solved a real problem.

*Go write the action someone else is Googling for right now.* 🛠️

---

**TL;DR:**
- GitHub Actions aren't just for GitHub employees — you can write and publish your own
- Composite actions = reusable shell steps, zero compilation needed
- JavaScript actions = full logic, TypeScript support, publish to Marketplace
- The best action you'll ever write is the one that eliminates YOUR copy-paste
- Pin to SHAs in security-sensitive workflows
- Contribute to `shivammathur/setup-php` if you use PHP — best maintainer response times I've ever seen
