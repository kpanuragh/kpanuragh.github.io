---
title: "GitHub Issue Templates: The 5-Minute Setup That Stops 'it doesn't work' Bug Reports 🎭"
date: "2026-02-24"
excerpt: "Every open source maintainer has received a bug report that says nothing. Issue templates are the polite, automated way to stop that — and as a contributor, they make you look 10x more professional."
tags: ["open-source", "github", "developer-tools", "community", "maintainer"]
featured: true
---

# GitHub Issue Templates: The 5-Minute Setup That Stops 'it doesn't work' Bug Reports 🎭

**The bug report that broke me:**

```
Title: broken
Body: it doesnt work pls fix
```

No version. No steps to reproduce. No error message. No OS. Just vibes and despair. 🫠

As a full-time developer who contributes to open source, I've been on both sides of this. I've *sent* terrible issues when I was starting out (sorry to every maintainer who had to reply "can you please share the error message"). And I've *received* them as someone who maintains a few packages.

The fix took me less time to set up than it took to write my passive-aggressive "please provide more details" response.

Enter: **GitHub Issue Templates.** 🎉

## What Even Are Issue Templates? 🤔

When someone opens a new issue in your GitHub repository, they normally get a blank text box. Which, for users, is an invitation to type whatever half-formed thought is in their head.

Issue templates replace that blank box with a **structured form**. The user sees fields, checkboxes, dropdowns. They *have* to fill in a description, steps to reproduce, their environment. The information you actually need to help them.

Think of it as a support ticket system, but built into GitHub, free, and it takes five minutes to set up.

I discovered this properly when contributing to a mid-sized Laravel package that was getting swamped with low-quality issues. The maintainer — who was clearly at their limit — asked if I could "set up some templates." I'd seen them on bigger repos but never created them myself.

**30 minutes of research and 3 YAML files later, the quality of incoming issues improved dramatically.** Maintainers who had been ignoring their issue tracker came back. Contributors got faster responses because their reports were actually useful. Everybody won.

## Setting Them Up: It's Just YAML 📝

Create a folder: `.github/ISSUE_TEMPLATE/`

Inside, create YAML files — one per template type. Here's a real bug report template I use:

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report 🐛
description: Something is broken and you want it fixed
title: "[Bug]: "
labels: ["bug", "needs-triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill this out! The more detail you provide, the faster we can help.

  - type: input
    id: version
    attributes:
      label: Package Version
      placeholder: "e.g. 2.4.1"
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: What happened?
      description: A clear description of the bug
      placeholder: "I expected X to happen but Y happened instead..."
    validations:
      required: true

  - type: textarea
    id: reproduction
    attributes:
      label: Steps to Reproduce
      description: Minimum steps to trigger the bug
      placeholder: |
        1. Call `doSomething()` with parameter X
        2. Observe that Y happens instead of Z
    validations:
      required: true

  - type: textarea
    id: environment
    attributes:
      label: Environment
      description: PHP version, OS, any relevant packages
      placeholder: "PHP 8.2, Ubuntu 22.04, Laravel 11.x"
    validations:
      required: true

  - type: checkboxes
    id: checklist
    attributes:
      label: Pre-flight Checklist
      options:
        - label: I've searched existing issues and this isn't a duplicate
          required: true
        - label: I've read the documentation
          required: true
```

**Balancing work and open source taught me this:** the `required: true` field is your best friend. Without it, people skip the parts they find inconvenient — which is always the parts you need most.

## The Feature Request Template 💡

Separate your bug reports from feature requests. They need completely different information:

```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature Request ✨
description: Suggest something new
title: "[Feature]: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Features without a use case are just code nobody uses
      placeholder: "I'm trying to do X but currently I have to..."
    validations:
      required: true

  - type: textarea
    id: proposal
    attributes:
      label: Proposed Solution
      description: How would you like this to work?
    validations:
      required: true

  - type: dropdown
    id: willing-to-pr
    attributes:
      label: Would you like to implement this?
      options:
        - "Yes, I'd love to submit a PR"
        - "Maybe, with some guidance"
        - "No, just suggesting"
    validations:
      required: true
```

That last dropdown is sneaky useful. **In the security community**, I've seen maintainers prioritize issues from people willing to implement them. Surfacing that upfront saves a round of comments and helps everyone set expectations.

## Don't Forget the PR Template 🔀

Same idea, but for pull requests. Create `.github/PULL_REQUEST_TEMPLATE.md` (not YAML — just Markdown):

```markdown
## What does this PR do?

<!-- One sentence summary -->

## Why?

<!-- Link to the issue: Closes #123 -->

## Testing

- [ ] I've added tests that cover the changes
- [ ] All existing tests still pass (`php artisan test` / `npm test`)
- [ ] I've tested this manually

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I've updated documentation where needed
- [ ] This doesn't break backwards compatibility (or I've noted it if it does)
```

**Real story:** I submitted a PR to a PHP security library early in my open source journey. No PR template existed. I forgot to mention what tests I'd run. The maintainer spent 20 minutes asking questions that a template would have pre-answered. Embarrassing. Now I always add templates to my own projects on day one.

## The Config File That Disables Blank Issues 🚫

One more file. Create `.github/ISSUE_TEMPLATE/config.yml`:

```yaml
blank_issues_enabled: false
contact_links:
  - name: 💬 Ask a Question
    url: https://github.com/your-repo/discussions
    about: For questions, use GitHub Discussions instead of Issues
  - name: 📖 Documentation
    url: https://your-docs.com
    about: Check the docs first — your question may already be answered
```

`blank_issues_enabled: false` is the key line. It forces users to pick a template instead of opening a blank issue. Combined with a link to Discussions for questions, it routes traffic to the right place automatically.

**As a full-time developer who contributes to open source**, I added this to a project I co-maintain and the "blank vibes" issue rate dropped to zero. Not because users suddenly became better — because the UI stopped offering them the option.

## What You Actually Get 🎁

The maintainer benefits are obvious. But here's what surprised me about the contributor side:

**Filling out a good template often solves the problem before you submit.**

I can't count how many times I've started filling out a bug template, got to "steps to reproduce," tried to write them out clearly, and realised: "Oh. OH. I see the problem. It's my own code."

The template forces you to think through the issue properly. It's rubber duck debugging, but the duck has a checklist. 🦆

## Setting These Up in Your Next Project 🚀

Your action plan:

1. Create `.github/ISSUE_TEMPLATE/` in your repo
2. Add `bug_report.yml` with required fields for version, description, steps, environment
3. Add `feature_request.yml` with problem statement and "willing to PR?" dropdown
4. Add `.github/PULL_REQUEST_TEMPLATE.md` with a testing checklist
5. Add `config.yml` to disable blank issues
6. Commit, push, watch issue quality improve while you do literally nothing else

The whole thing takes less time than replying to one bad bug report. And it compounds — every issue submitted from that day forward is better.

## TL;DR 💡

- Blank issue boxes invite terrible bug reports. Templates fix this.
- `.github/ISSUE_TEMPLATE/*.yml` — one YAML file per issue type
- Use `required: true` or people will skip the fields you need
- `blank_issues_enabled: false` in `config.yml` eliminates zero-context issues entirely
- PR templates stop your reviewers playing 20 questions about your changes
- **Filling out a template often reveals the bug is your own fault** — which is honestly the most useful feature

Your future self (who was about to type "can you share more details?") will thank you. 🎭

---

**Maintaining something and want to compare templates?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — I collect good ISSUE_TEMPLATE examples like some people collect Pokémon.

**Want to see this in action?** Check my [GitHub](https://github.com/kpanuragh) — templates live in every repo I maintain.

*Set it up once. Benefit forever.* 🎉
