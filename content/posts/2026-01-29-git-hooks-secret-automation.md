---
title: "Git Hooks: The Secret Automation Living in Your `.git` Folder ⚡🪝"
date: "2026-01-29"
excerpt: "You commit broken code, push to main, and realize you forgot to run tests... again. Git hooks are sitting in your .git folder laughing at you. Let me show you how to automate ALL the things you keep forgetting!"
tags: ["\"git\"", "\"developer-tools\"", "\"automation\"", "\"productivity\""]
featured: "true"
---




# Git Hooks: The Secret Automation Living in Your `.git` Folder ⚡🪝

**Real talk:** I once pushed code to production with `console.log("TODO: remove this")` and `debugger` statements everywhere. My team was... not thrilled. 😅

Then I discovered git hooks. Now my computer REFUSES to let me commit stupid mistakes. It's like having a really judgy but helpful robot watching over my shoulder!

**The best part?** Git hooks have been hiding in every repo you've ever cloned. Right there in `.git/hooks/`. You just never looked! 🔍

Let me show you how to automate away all those "oops" moments!

## What Even Are Git Hooks? 🤔

**Think of them as:** Event listeners for git operations!

**The concept:**
```bash
You run: git commit
Git thinks: "Wait, let me check if there's a pre-commit hook..."
Hook runs: npm test, lint checks, whatever you want!
Hook passes: Commit succeeds! ✅
Hook fails: Commit blocked! ❌

# Automatic quality gates! 🎯
```

**Translation:** Git hooks let you run scripts automatically before/after git operations. They're literally built into git - no external tools needed!

**Why this is genius:**
- Catch mistakes BEFORE they reach the remote
- Enforce code standards automatically
- Run tests you'd otherwise forget
- Prevent embarrassing commits
- Make your team love you (or at least tolerate you)

## Where Do Git Hooks Live? 🏠

```bash
# Every git repo has them!
cd your-project
ls .git/hooks/

# You'll see:
applypatch-msg.sample
commit-msg.sample
pre-commit.sample
pre-push.sample
# ... and more!

# The .sample extension means they're disabled
# Remove .sample to activate them!
```

**The secret:** Git comes with example hooks! Just rename them and customize!

**Quick activation:**
```bash
cd .git/hooks
mv pre-commit.sample pre-commit
chmod +x pre-commit
# Now it runs before every commit! 🎉
```

## The Hooks You Actually Need 🎯

### 1. Pre-Commit: The Gatekeeper 🚪

**Runs before every commit. Most useful hook ever!**

**Example 1: Prevent debugging code**

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for console.log in staged files
if git diff --cached | grep -E "console\.(log|debug|info)"; then
  echo "❌ Error: console.log() found in staged files!"
  echo "Remove debug statements before committing."
  exit 1
fi

echo "✅ No console.log found. Committing..."
```

**What happens:**
```bash
# You try to commit:
git add .
git commit -m "Add feature"

# Hook finds console.log:
❌ Error: console.log() found in staged files!
Remove debug statements before committing.

# Commit blocked! You have to fix it! 💪
```

**Example 2: Auto-format code**

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🎨 Running Prettier..."
npx prettier --write $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$')

# Re-add formatted files
git add -u

echo "✅ Code formatted!"
```

**The magic:** Your code gets auto-formatted ON EVERY COMMIT! Never argue about formatting again! 🎉

**Example 3: Run linter**

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Running ESLint..."
npx eslint $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$')

if [ $? -ne 0 ]; then
  echo "❌ ESLint failed! Fix errors before committing."
  exit 1
fi

echo "✅ Linting passed!"
```

### 2. Commit-Msg: The Grammar Nazi 📝

**Runs after you write your commit message, before commit completes.**

**Example 1: Enforce commit message format**

```bash
#!/bin/bash
# .git/hooks/commit-msg

commit_msg=$(cat "$1")

# Require format: "type: description"
# Examples: "feat: add login", "fix: button click"
if ! echo "$commit_msg" | grep -qE "^(feat|fix|docs|style|refactor|test|chore): .+"; then
  echo "❌ Invalid commit message format!"
  echo ""
  echo "Format: <type>: <description>"
  echo "Types: feat, fix, docs, style, refactor, test, chore"
  echo ""
  echo "Example: feat: add user authentication"
  exit 1
fi

echo "✅ Commit message format is valid!"
```

**What happens:**
```bash
# Bad commit message:
git commit -m "stuff"
❌ Invalid commit message format!

# Good commit message:
git commit -m "feat: add user dashboard"
✅ Commit message format is valid!

# Your commit history stays clean! 📚
```

**Example 2: Prevent swearing (for when you're angry)**

```bash
#!/bin/bash
# .git/hooks/commit-msg

commit_msg=$(cat "$1")

# Check for inappropriate words
if echo "$commit_msg" | grep -iE "(fuck|shit|damn)"; then
  echo "❌ Profanity detected in commit message!"
  echo "Remember: your future employers will read this. 😅"
  exit 1
fi
```

**Real story:** This saved me from committing "fix: this fucking bug finally works" to a client project. Crisis averted! 😬

### 3. Pre-Push: The Last Line of Defense 🛡️

**Runs before code is pushed to remote.**

**Example 1: Run tests before push**

```bash
#!/bin/bash
# .git/hooks/pre-push

echo "🧪 Running tests before push..."
npm test

if [ $? -ne 0 ]; then
  echo "❌ Tests failed! Fix them before pushing."
  exit 1
fi

echo "✅ All tests passed! Pushing..."
```

**The safety net:**
```bash
git push origin main
🧪 Running tests before push...
❌ Tests failed! Fix them before pushing.

# Can't push broken code! 🎯
```

**Example 2: Prevent pushing to main/master**

```bash
#!/bin/bash
# .git/hooks/pre-push

branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "❌ Direct push to $branch is not allowed!"
  echo "Create a branch and open a PR instead."
  exit 1
fi

echo "✅ Pushing to $branch..."
```

**Why this rocks:** Enforces PR workflow! No more "oops, I pushed directly to main" 💀

**Example 3: Check for secrets**

```bash
#!/bin/bash
# .git/hooks/pre-push

echo "🔒 Checking for exposed secrets..."

# Check for common secret patterns
if git diff origin/main...HEAD | grep -E "(api[_-]?key|password|secret|token)" | grep -v "PASSWORD_FIELD"; then
  echo "❌ Possible secret detected!"
  echo "Review your code before pushing!"
  exit 1
fi

echo "✅ No secrets detected!"
```

### 4. Post-Commit: The Celebrator 🎉

**Runs after commit succeeds. For fun stuff!**

```bash
#!/bin/bash
# .git/hooks/post-commit

# Fun ASCII art on every commit
cat << "EOF"
    _____ ____  __  __ __  __ _____ _______ _______ ______ _____  _
   / ____/ __ \|  \/  |  \/  |_   _|__   __|__   __|  ____|  __ \| |
  | |   | |  | | \  / | \  / | | |    | |     | |  | |__  | |  | | |
  | |   | |  | | |\/| | |\/| | | |    | |     | |  |  __| | |  | | |
  | |___| |__| | |  | | |  | |_| |_   | |     | |  | |____| |__| |_|
   \_____\____/|_|  |_|_|  |_|_____|  |_|     |_|  |______|_____/(_)
EOF

echo "Nice work! Keep it up! 🚀"
```

**Because coding should be fun!** 😎

## Real-World Workflows That Actually Work 💼

### Workflow 1: The JavaScript Project

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🚀 Running pre-commit checks..."

# 1. Format code
echo "📝 Formatting..."
npx prettier --write $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx|json|css)$')

# 2. Lint
echo "🔍 Linting..."
npx eslint $(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$')
if [ $? -ne 0 ]; then
  echo "❌ Linting failed!"
  exit 1
fi

# 3. Type check (if TypeScript)
if [ -f "tsconfig.json" ]; then
  echo "📘 Type checking..."
  npx tsc --noEmit
  if [ $? -ne 0 ]; then
    echo "❌ Type errors found!"
    exit 1
  fi
fi

# 4. Re-add formatted files
git add -u

echo "✅ All checks passed!"
```

**Result:** Every commit is formatted, linted, and type-checked! 🎯

### Workflow 2: The Python Project

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🐍 Running Python checks..."

# Get staged Python files
PYTHON_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.py$')

if [ -n "$PYTHON_FILES" ]; then
  # Format with black
  echo "🎨 Running Black..."
  black $PYTHON_FILES

  # Lint with flake8
  echo "🔍 Running Flake8..."
  flake8 $PYTHON_FILES
  if [ $? -ne 0 ]; then
    echo "❌ Linting failed!"
    exit 1
  fi

  # Type check with mypy
  echo "📘 Running mypy..."
  mypy $PYTHON_FILES
  if [ $? -ne 0 ]; then
    echo "❌ Type checking failed!"
    exit 1
  fi

  # Re-add formatted files
  git add $PYTHON_FILES
fi

echo "✅ Python checks passed!"
```

### Workflow 3: The Security-Conscious Team

```bash
#!/bin/bash
# .git/hooks/pre-push

echo "🔒 Security checks..."

# 1. Check for secrets
echo "🔑 Scanning for secrets..."
if git diff origin/main...HEAD | grep -iE "(api[_-]?key|password|secret|token|aws[_-]?access)" | grep -v "PASSWORD_FIELD"; then
  echo "❌ Possible secrets detected!"
  echo "Review your changes carefully!"
  exit 1
fi

# 2. Dependency audit
echo "📦 Auditing dependencies..."
npm audit --audit-level=high
if [ $? -ne 0 ]; then
  echo "⚠️  High severity vulnerabilities found!"
  echo "Run 'npm audit fix' to resolve."
  exit 1
fi

# 3. Run security-focused tests
echo "🧪 Running security tests..."
npm run test:security
if [ $? -ne 0 ]; then
  echo "❌ Security tests failed!"
  exit 1
fi

echo "✅ Security checks passed!"
```

## The Modern Way: Husky + lint-staged 🐕

**The problem:** Git hooks aren't shared with your team (they're in `.git/`, which is gitignored!)

**The solution:** Use Husky to manage hooks in your repo!

### Quick Setup

```bash
# Install Husky and lint-staged
npm install --save-dev husky lint-staged

# Initialize Husky
npx husky init

# Create pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"
```

**Configure in `package.json`:**

```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,css,md}": [
      "prettier --write"
    ]
  }
}
```

**What just happened:**
- Husky stores hooks in `.husky/` (version controlled!)
- lint-staged runs tools only on staged files (super fast!)
- Your whole team gets the same hooks!
- Zero configuration for new developers! 🎉

**The workflow:**
```bash
# Developer clones repo
git clone your-repo
npm install  # Husky auto-installs hooks!

# They commit code
git commit -m "feat: add feature"
# Hooks automatically run!

# No setup needed! It just works! ✨
```

## Pro Patterns You'll Love 💎

### Pattern 1: Skip Hooks When Needed

```bash
# Sometimes you NEED to commit without running hooks
git commit --no-verify -m "WIP: work in progress"

# Or skip pre-push
git push --no-verify origin feature-branch

# Use sparingly! With great power... 🕷️
```

### Pattern 2: Conditional Checks

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Only run expensive checks on CI or when ENV var is set
if [ -n "$CI" ] || [ "$RUN_FULL_CHECKS" = "1" ]; then
  echo "🧪 Running full test suite..."
  npm test
else
  echo "⚡ Running quick checks only..."
  npm run test:changed
fi
```

### Pattern 3: Parallel Execution

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run checks in parallel (faster!)
(npm run lint) &
(npm run format) &
(npm run typecheck) &

# Wait for all to complete
wait

echo "✅ All checks completed!"
```

### Pattern 4: Interactive Fixes

```bash
#!/bin/bash
# .git/hooks/pre-commit

npm run lint

if [ $? -ne 0 ]; then
  echo "❌ Linting failed!"
  echo ""
  read -p "Run 'eslint --fix' to auto-fix? (y/n) " -n 1 -r
  echo

  if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run lint:fix
    git add -u
    echo "✅ Auto-fixed! Try committing again."
  fi

  exit 1
fi
```

**User-friendly automation!** 🤝

## Common Pitfalls (Learn from My Mistakes) 🚨

### Mistake #1: Hooks Taking Forever

**Bad:**
```bash
# Running ENTIRE test suite on every commit
npm test  # Takes 5 minutes! 😭
```

**Good:**
```bash
# Run only tests for changed files
npm run test:changed  # Takes 10 seconds! ⚡
```

**Better:**
```bash
# Full tests in pre-push, quick checks in pre-commit
# pre-commit: lint, format (fast!)
# pre-push: tests (slower, but less frequent)
```

### Mistake #2: Forgetting Windows Users

**Bad:**
```bash
#!/bin/bash
# Only works on Mac/Linux
```

**Good:**
```bash
#!/usr/bin/env bash
# More portable

# Or use Node.js scripts (cross-platform!)
node scripts/pre-commit.js
```

**Better:** Use Husky! It handles cross-platform for you! 🎉

### Mistake #3: Breaking the Hooks

```bash
# If your hook script has an error, commits will fail mysteriously!

# Always test your hooks:
.git/hooks/pre-commit  # Run it manually
echo $?  # Should be 0 for success
```

### Mistake #4: Committing Without Hooks

**The trap:**
```bash
# Someone clones repo
git clone your-repo
cd your-repo

# .git/hooks is empty! No hooks installed!
# They commit without checks! 💀
```

**The fix:** Use Husky! It installs hooks automatically on `npm install`! 🎯

## Cool Tricks You Didn't Know 🎪

### Trick 1: Generate Commit Messages

```bash
#!/bin/bash
# .git/hooks/prepare-commit-msg

BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)

# If branch is "feature/ABC-123-new-feature"
# Auto-add "[ABC-123]" to commit message
if [[ $BRANCH_NAME =~ ^feature/(.*) ]]; then
  TICKET="${BASH_REMATCH[1]}"
  echo "[$TICKET] $(cat $1)" > $1
fi
```

**Result:**
```bash
git commit -m "Add login button"
# Saved as: "[ABC-123] Add login button"

# Automatic ticket references! 🎫
```

### Trick 2: Notify on Push

```bash
#!/bin/bash
# .git/hooks/post-push

# Send Slack notification
curl -X POST https://hooks.slack.com/... \
  -d "{\"text\": \"🚀 $(git config user.name) pushed to $(git rev-parse --abbrev-ref HEAD)\"}"

# Or send desktop notification
notify-send "Git Push Complete! ✅"
```

### Trick 3: Auto-update Dependencies

```bash
#!/bin/bash
# .git/hooks/post-merge

# After pulling changes, check if package.json changed
CHANGED_FILES=$(git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD)

if echo "$CHANGED_FILES" | grep "package.json"; then
  echo "📦 package.json changed! Running npm install..."
  npm install
fi
```

**Never forget `npm install` after pulling! 🎉**

## The Bottom Line 🎯

Git hooks are like having a quality assurance robot living in your repo!

**What you learned today:**
1. Git hooks run scripts automatically on git operations
2. They live in `.git/hooks/` (built into git!)
3. Pre-commit = quality gates before committing
4. Pre-push = safety checks before pushing
5. Husky makes hooks shareable with your team
6. lint-staged makes hooks super fast
7. Automate ALL the things you forget! 🤖

**The reality:**
- 10 minutes to set up
- Saves hours of debugging
- Prevents embarrassing commits
- Makes code review easier
- Your team will thank you! 🙏

**Before git hooks:**
```bash
git commit -m "fix bug"
git push
# Oh no, forgot to run tests!
# Build failed!
# Revert! 💀
```

**After git hooks:**
```bash
git commit -m "fix bug"
# ✅ Formatted!
# ✅ Linted!
# ✅ Typed!
git push
# ✅ Tests passed!
# Build succeeds! 🎉
```

## Your Action Plan (Do This Today!) 🚀

### Quick Start (5 minutes)

```bash
# 1. Install Husky
npm install --save-dev husky lint-staged

# 2. Initialize
npx husky init

# 3. Add pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"

# 4. Configure in package.json
{
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"]
  }
}

# Done! Try committing something! 🎉
```

### This Week

1. Add pre-commit hook for linting
2. Add pre-push hook for tests
3. Add commit-msg hook for format
4. Share hooks with your team (use Husky!)

### This Month

1. Customize hooks for your workflow
2. Add security checks
3. Optimize hook performance
4. Celebrate never pushing broken code again! 🎊

## Resources You Need 📚

**Tools:**
- [Husky](https://typicode.github.io/husky/) - Manage git hooks easily
- [lint-staged](https://github.com/okonet/lint-staged) - Run linters on staged files only
- [commitlint](https://commitlint.js.org/) - Enforce commit message format

**Git Hooks Reference:**
- [Git Hooks Documentation](https://git-scm.com/docs/githooks)
- [Atlassian Git Hooks Tutorial](https://www.atlassian.com/git/tutorials/git-hooks)

**Inspiration:**
- Check `.husky/` in popular repos
- Steal their hook configurations (it's open source!)
- Learn from the best! 🎓

## Real Success Stories 💪

### Story #1: The Accidental Production Push

```
Before hooks: Pushed broken code 3x/week
After hooks: Hasn't pushed broken code in 6 months
Impact: Saved ~20 hours of debugging
Team happiness: 📈📈📈
```

### Story #2: The Code Review Time-Saver

```
Before: 2 hours reviewing formatting/linting issues
After: Hooks auto-fix everything before commit
Now: 30 minutes reviewing actual logic
Code reviews: Actually fun now! 🎉
```

### Story #3: The Secret Leak Prevention

```
Before: Almost pushed AWS keys to GitHub
Hook: Blocked commit with secret pattern
After: Crisis averted, AWS account safe
Developer: Still has a job! 😅
```

## Final Thoughts 💭

**The truth nobody tells you:**

Git hooks are the easiest productivity win in software development. 10 minutes of setup saves you hours of "oops" moments!

**Your commits will be:**
- ✅ Properly formatted
- ✅ Linted and clean
- ✅ Type-safe
- ✅ Tested
- ✅ Free of secrets
- ✅ Following conventions

**All automatically!** No thinking required! 🤖

**The best part?** Once set up, you forget they exist. They just silently save you from yourself every single day!

So stop reading and go add some hooks! Your future self will thank you! 🙏

---

**Challenge:** Set up Husky in your current project RIGHT NOW. Takes 5 minutes. I'll wait! ⏰

**Share your hooks:** Connect with me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) - Show me your coolest git hook configurations!

**Check out my setup:** Visit my [GitHub](https://github.com/kpanuragh) and see how I use hooks in my projects!

*Now go automate all the things!* ⚡🪝✨
