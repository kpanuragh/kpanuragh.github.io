---
title: "The Art of Writing PRs That Maintainers Actually Merge 🎯🚀"
date: "2026-03-07"
excerpt: "You spent 3 days writing the perfect feature. You opened a PR. Then... silence. Two weeks later, it gets closed with 'not aligned with project goals'. Here's how to stop that from happening."
tags: ["\\\"open-source\\\"", "\\\"github\\\"", "\\\"community\\\"", "\\\"contributing\\\""]
featured: "true"
---

# The Art of Writing PRs That Maintainers Actually Merge 🎯🚀

**Confession time:** My first open source pull request got closed in 4 minutes.

Not 4 days. Not 4 hours. **4 MINUTES.** ⏱️

I'd spent an entire Saturday refactoring a popular Laravel package — improving readability, adding clever abstractions, making the code "cleaner." Proud of myself, I opened the PR with the confidence of someone who definitely knows what they're doing.

The response? "Thanks, but this changes the public API. We don't accept breaking changes. Closing."

Reader, I wanted to delete my GitHub account. 😭

**But here's the thing:** That wasn't bad luck. I broke basically every unwritten rule of open source contribution. And once I figured out those rules? My merge rate went from 0% to consistently getting PRs merged into projects with thousands of stars.

Let me save you the Saturday (and the dignity).

## Why 80% of PRs Never Get Merged 💀

As a full-time developer who contributes to open source, I've been on BOTH sides of this. I've had PRs rejected, and as a co-maintainer on a few smaller projects, I've had to reject PRs from others.

**Here's what the graveyard looks like:**

```
❌ "Refactored everything for consistency"
   → Maintainer: "We didn't ask for this"

❌ "Added feature X!" (no issue discussion first)
   → Maintainer: "We're not planning to support X"

❌ 4,000 line PR touching 87 files
   → Maintainer: *closes browser tab*

❌ No tests included
   → Maintainer: "Please add tests"
   You: *never comes back*

❌ Breaks existing functionality
   → Maintainer: "This is a regression"
```

**The uncomfortable truth?**

Most rejected PRs aren't rejected because the code was bad. They're rejected because the *process* was wrong. 🤦

## The Golden Rule Nobody Talks About 🥇

**Open an issue BEFORE writing code.**

I cannot stress this enough. I learned this the hard way (see: my 4-minute PR graveyard above).

**The workflow that WORKS:**

```markdown
1. Found a bug or want a feature?
   → Search existing issues first

2. Not found?
   → Open an issue BEFORE coding

3. Describe your idea
   → Get maintainer feedback

4. Maintainer says "yes, please!"
   → NOW write the code

5. Link PR to the issue
   → Context is built in! 🎉
```

**Real story:** I wanted to add Redis support to a PHP authentication library. Instead of just doing it, I opened an issue: "Would you consider adding Redis as a session backend? I'd love to contribute this."

The maintainer replied in 3 hours: "Yes! But let's use an interface so users can plug in any backend." That feedback changed my entire implementation design. The PR sailed through review in TWO days. 🚀

**Without that issue?** I'd have shipped a Redis-only solution that the maintainer would have rejected. Classic me.

## Anatomy of a PR That Gets Merged ✨

Let me show you the exact structure I use now.

### The Title 📌

**Bad:**
```
Fix bug
Add feature
Update code
```

**Good:**
```
fix: prevent null pointer exception when user session is empty
feat: add Redis session backend with configurable TTL
docs: update installation guide for PHP 8.2+
```

**The pattern:** Use [Conventional Commits](https://www.conventionalcommits.org) format. Most maintainers know it. It signals that you're experienced and thoughtful.

`type: short description` where type is `fix`, `feat`, `docs`, `test`, `refactor`, `chore`.

### The Description 📝

**The template I actually use:**

```markdown
## What does this PR do?
[2-3 sentences max. What problem does it solve?]

## Why is this needed?
[Link to the issue, or explain the motivation]

## How does it work?
[Brief explanation of the approach]

## Testing
- [ ] Existing tests pass
- [ ] Added tests for new behavior
- [ ] Manually tested on [environment]

## Breaking changes?
- [ ] No breaking changes
- OR: [List what breaks and migration path]

Closes #[issue number]
```

**Why this matters:** Maintainers review dozens of PRs. A clear description means they spend 30 seconds understanding your change instead of 30 minutes. **Guess which PRs get reviewed first?** 🤔

### The Size 📏

**The single biggest mistake I see:**

```
Files changed: 87
Additions: +4,232
Deletions: -1,891
```

Nobody is reviewing that. Not today. Probably not this year.

**The sweet spot:**
```
Files changed: 3-8
Additions: +50-200
Deletions: varies
```

**How to keep PRs small:**

1. **One concern per PR.** Bug fix? That's it. Don't also refactor while you're there.
2. **Feature too big?** Break it into a series of PRs.
3. **Refactoring needed before feature?** Separate PR first.

**Balancing work and open source taught me this:** I get maybe 90 minutes on weekends for OSS. A 50-line PR I can review in 10 minutes. A 3,000-line PR requires 3+ focused hours. I simply don't have that. Most maintainers don't either. ⏰

## The Test Question 🧪

Here's a filter that separates good contributors from great ones:

**Did you write tests?**

```bash
# The mindset shift
Before: "I'll add tests if they ask"
After: "No tests = no PR"
```

**What good test coverage looks like:**

```php
// You fixed a bug where empty input crashed the parser
// BEFORE (just fixing the bug):
public function parse(string $input): array
{
    if (empty($input)) {
        return [];  // your fix
    }
    // ...
}

// AFTER (with tests - what maintainers LOVE):
public function testParseReturnsEmptyArrayForEmptyInput(): void
{
    $parser = new Parser();
    $this->assertSame([], $parser->parse(''));
}

public function testParseReturnsEmptyArrayForWhitespace(): void
{
    $parser = new Parser();
    $this->assertSame([], $parser->parse('   '));
}
```

**In my Laravel contributions,** I always check if there's an existing test file for the component I'm touching. If there is, I add tests right alongside the existing ones. If there isn't, I create one. Maintainers notice this. It tells them "this person cares about quality." 🙏

## The Code Style Trap ⚠️

**Scenario that plays out constantly:**

```bash
You:       Use 4-space indentation everywhere
Project:   Uses 2-space indentation

Result:    Every line shows as modified
           PR diff is unreadable
           Maintainer is annoyed before reading a word
```

**Before writing a single line of code:**

```bash
# Read the contribution guide
cat CONTRIBUTING.md

# Check if there's a linter config
ls .eslintrc .phpcs.xml .rubocop.yml .editorconfig

# Run the project's linter on your changes
npm run lint
composer run-script phpcs

# Check existing tests pass
npm test
./vendor/bin/phpunit
```

**Pro tip:** Install EditorConfig in your editor. Most projects have an `.editorconfig` file that auto-formats to the project's standards. Zero effort, huge impact. 🎯

**In the security community,** style consistency isn't just aesthetics — inconsistent formatting can hide malicious code changes in noisy diffs. Maintainers of security tools are especially sensitive to this. Keep your diffs clean.

## The Branch Name Nobody Cares About (But You Should) 🌿

**Bad:**
```
fix
my-changes
patch-1
test123
```

**Good:**
```
fix/null-pointer-in-session-parser
feat/redis-session-backend
docs/php82-installation-guide
```

**Why?** Maintainers often work on multiple open PRs simultaneously. A descriptive branch name means when they see `fix/null-pointer-in-session-parser` in their branch list, they immediately know what they're looking at. Small thing. Big signal.

## Handling Review Feedback Like a Pro 🎭

Getting your first round of review comments feels like this:

```
Maintainer: "The approach here is different from what we discussed"
Internal monologue: "WHY WON'T YOU JUST MERGE IT"
```

**What actually matters:**

### When they request changes ✅

```markdown
DO:
- Reply to each comment (even just "Fixed!" or "Good catch, done!")
- Explain your reasoning if you disagree
- Ask clarifying questions respectfully
- Push fixes promptly (don't let it sit for weeks)
- Say "Ready for re-review" when you're done

DON'T:
- Argue aggressively
- Push fixes silently with no response
- Disappear for 3 weeks
- Mark every conversation as "Resolved" without engaging
```

**The magic phrase when you disagree:** "I see your point. My concern is [X]. Would [alternative approach] work, or would you prefer I go with your suggestion?"

That single sentence has saved 3 of my PRs from being closed. It signals that you're collaborative, not defensive. 💪

### When they close it without merging ✅

First — don't panic. This happens to everyone, including experienced contributors.

**Read the reason carefully:**

```markdown
"Not aligned with project direction"
→ Next time: open an issue first, get buy-in

"Too large to review"
→ Next time: break into smaller PRs

"Missing tests"
→ Next time: write tests first

"API breaking change"
→ Next time: check CHANGELOG for stability guarantees
```

**The move:** Thank them for their time. Seriously. Maintainers are usually volunteers. A genuine "Thanks for taking the time to review this — I'll keep these points in mind for future contributions" goes a long way. And it puts your name in their memory as "that person who was cool about rejection." Future PRs get extra attention. 🤝

## The Secret Weapon: The Draft PR 🔒

**This changed everything for me.**

Open a **draft PR** early — even when you're just starting out. This signals:
- "I'm working on this, please don't duplicate effort"
- "I'd love early feedback before I go too far"
- "I'm committed to finishing this"

```markdown
# How to use draft PRs
1. Start working on your change
2. Push a WIP commit ("wip: initial redis backend sketch")
3. Open PR as Draft
4. Tag relevant maintainers: "@maintainer — early draft for feedback"
5. Continue developing
6. When ready: click "Ready for Review"
```

**Real example:** I was implementing a complex caching layer for a Node.js library. I opened a draft after 2 hours of work with just the interface skeleton. The maintainer spotted that I was duplicating logic that already existed in a different module — something I'd have never found browsing the docs alone. Saved me 6 hours of wasted work. 😅

## Projects Where My PRs Consistently Get Merged 🌟

These communities are exceptionally welcoming to contributors and have clear contribution guides:

**PHP/Laravel ecosystem:**
- **laravel/framework** - Solid CONTRIBUTING.md, responsive maintainers
- **spatie/\*** (any Spatie package) - Stellar contributor experience, great documentation
- **nunomaduro/collision** - Nuno is an amazing maintainer who gives detailed feedback

**Security tools (my other home):**
- **phpstan/phpstan** - Great for static analysis contributions
- **enlightn/security-checker** - Security-focused Laravel tooling

**Developer tools:**
- **charmbracelet/\*** - Beautiful terminal tools with fantastic community
- **sharkdp/bat**, **sharkdp/fd** - Sharkdp's repos are models of maintainer friendliness

**For first-time contributors:** Look for repos with **"good first issue"** or **"help wanted"** labels. Filter GitHub search by `label:"good first issue" language:php` (or your language). These issues are specifically kept for new contributors. 🎁

## The Checklist I Use Before Every PR 📋

```markdown
Pre-PR Checklist:

Research phase:
[ ] Searched for existing issues on this topic
[ ] Got maintainer agreement to accept this change
[ ] Read CONTRIBUTING.md fully
[ ] Checked open PRs for duplicates

Development phase:
[ ] Branched from main/master (not an old feature branch)
[ ] Branch name describes the change
[ ] Small, focused change (one concern)
[ ] Followed existing code style
[ ] Ran linter — zero new warnings
[ ] Ran tests — all passing
[ ] Added tests for new behavior

PR phase:
[ ] Descriptive title (Conventional Commits format)
[ ] Description explains what, why, how
[ ] Linked to relevant issue
[ ] Draft PR → early feedback → Ready for review
[ ] Responsive to review comments within 48 hours
```

**Print this. Laminate it. Stick it next to your monitor.**

## The Bottom Line 💡

Open source contribution is a skill. The code is only half of it.

**What you learned today:**

1. Issue first, code second — always
2. Small PRs beat big PRs every time
3. Tests aren't optional
4. Match the project's code style exactly
5. Draft PRs for early feedback
6. Respond to review quickly and graciously
7. Rejection is data, not failure

**The truth about merge rates:**

```
Before knowing these rules:  ~5% merge rate
After following these rules: ~75%+ merge rate
```

**That jump didn't come from writing better code.** My code quality didn't magically improve overnight. It came from understanding that contributing to open source is a *collaboration*, not a *submission*.

**Balancing work and open source taught me** that maintainers have limited bandwidth. The contributors who thrive are the ones who make reviewing their PRs *easy*. Write the PR you'd want to review.

## Your Action Plan 🚀

**This week:**

1. Find one project you use daily and read its `CONTRIBUTING.md`
2. Browse the issues, find a "good first issue" label
3. Leave a comment: "I'd like to work on this — any guidance?"
4. Wait for the green light, THEN write code

**This month:**

1. Open your first (or next) draft PR
2. Get early feedback before investing too many hours
3. Iterate based on reviewer input
4. Celebrate your first merged PR 🎉

**Ongoing:**

1. Review other contributors' PRs (you learn FAST by reviewing)
2. Help triage issues
3. Improve documentation (docs PRs merge VERY easily)
4. Build relationships with maintainers

---

**Have a PR story — the good, the bad, or the hilariously bad?** I'm on [LinkedIn](https://www.linkedin.com/in/anuraghkp) and would love to hear it.

**Want to see what a real contribution workflow looks like?** Check my [GitHub](https://github.com/kpanuragh) — you'll see the issues, draft PRs, and review conversations in action.

*Now go open that issue before you write a single line of code!* 🎯

---

**P.S.** The 4-minute PR rejection? I went back to that project six months later. Filed an issue first, had a great discussion, wrote a focused fix. Got merged in two days. Redemption arcs are real. 🌅

**P.P.S.** If you're a maintainer: templates for PR descriptions help SO much. A filled-out template is 10x easier to review than a wall of unstructured text. Your contributors will thank you. Your reviewer sanity will thank you. 🙏
