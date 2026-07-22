---
title: "♻️ Stop Copy-Pasting Your CI: Reusable Workflows and Composite Actions"
date: "2026-07-22"
excerpt: "Fifteen repos, fifteen almost-identical .github/workflows/deploy.yml files, and one of them silently missing the security scan step. Here's how reusable workflows and composite actions actually cut that down — and where the abstraction bites back."
tags:
  - devops
  - ci-cd
  - github-actions
  - platform-engineering
featured: true
---

Here's a fun exercise: go count how many `.github/workflows/*.yml` files in your org contain the string `npm ci`. If you're anywhere past three repositories, I'd bet money the answer is "more than the number of people who understand all of them combined."

At Cubet, we hit this exact wall. Every service team had their own CI pipeline, and every pipeline was a photocopy of a photocopy — someone forked an old workflow file two years ago, tweaked the build command, and never looked at it again. Then a new SOC2 requirement showed up: every deploy needs a dependency vulnerability scan before it ships. Simple change, right? Add one step.

Except "one step" meant fourteen pull requests across fourteen repos, and by the time we finished the audit, we found two services where the step had been added, then silently deleted six months later during an "unrelated" YAML cleanup, and nobody noticed because CI still went green. The scan step wasn't required to pass — it was just... vibes.

That's the actual failure mode of copy-pasted CI. It's not that the YAML is ugly. It's that nobody owns it, so drift is invisible until an audit or an incident finds it for you.

## The fix isn't "write better YAML," it's "write YAML once"

GitHub Actions gives you two tools for this, and they solve different problems:

- **Composite actions** — package a sequence of steps into something you can call like a single step (`uses: ./.github/actions/setup-node-app`). Good for "these five lines always travel together."
- **Reusable workflows** — package an entire job (or set of jobs) that another workflow calls with `uses: org/repo/.github/workflows/deploy.yml@v2`. Good for "this whole pipeline shape is the same everywhere."

We used both, but the reusable workflow is what actually killed the drift problem, because it centralizes the thing people forget to update: the *required* steps.

```yaml
# .github/workflows/deploy.yml (in the shared "ci-templates" repo)
on:
  workflow_call:
    inputs:
      service-name:
        required: true
        type: string
      node-version:
        required: false
        type: string
        default: "20"
    secrets:
      NPM_TOKEN:
        required: true

jobs:
  build-and-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci
      - name: Vulnerability scan (blocking)
        run: npx audit-ci --high
      - run: npm run build
      - name: Deploy ${{ inputs.service-name }}
        run: ./scripts/deploy.sh "${{ inputs.service-name }}"
```

Every consuming repo then shrinks to something almost embarrassingly small:

```yaml
# checkout-service/.github/workflows/ci.yml
on: [push]

jobs:
  deploy:
    uses: cubet-org/ci-templates/.github/workflows/deploy.yml@v2
    with:
      service-name: checkout-service
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

When the SOC2 auditor comes back next year asking for a new SAST step, that's a one-line change in `ci-templates`, a version bump, and a rollout — not an archaeology dig across fourteen repositories hoping you find them all.

## Where this bites you if you're not careful

I want to be upfront about the sharp edges, because "just centralize everything" is the kind of advice that sounds great in a blog post and terrible three months later when nobody can debug their own pipeline.

**Versioning is not optional.** If your consuming repos point at `@main` instead of a tag, then the day you push a "small fix" to the shared workflow, you've just changed CI behavior for every team simultaneously, with zero warning, and possibly at 4:58pm on a Friday. Tag your releases (`@v1`, `@v2`), and treat bumping the version in a consumer repo as a real, reviewable PR — not an afterthought.

**Secrets don't inherit automatically.** Reusable workflows only get the secrets you explicitly pass with the `secrets:` block (or `secrets: inherit`, which is convenient but means every consumer now trusts the shared workflow with *everything* — think about whether that's actually what you want before reaching for it).

**Debuggability gets worse before it gets better.** The first time a junior dev's build fails inside a reusable workflow three repos removed from theirs, they will not know where to look. Document the shared workflows like you'd document a library — inputs, outputs, what each job actually does — because "just go read the YAML" doesn't scale once it's not *their* YAML.

**Don't centralize things that are genuinely different.** We tried, briefly, to force our Go services and Node services through the same reusable workflow with a pile of `if: inputs.language == 'go'` conditionals. It was worse than two separate files. If two pipelines diverge on more than the fill-in-the-blanks, that's a signal for two templates, not one clever one.

## The actual payoff

Six months in, the thing that sold the rest of the org wasn't the reduced line count — it was the week we needed to roll out OIDC-based cloud auth (kill the long-lived deploy keys, if you haven't already) across every service. One PR to `ci-templates`, a version bump broadcast in Slack, and it was done in an afternoon instead of a two-week tour of every repo's CI config.

If you're maintaining more than a handful of services with near-identical pipelines, the copy-paste tax is compounding whether or not you've noticed it yet. Pick your most-duplicated workflow, extract it into a reusable one, and migrate your two most annoying repos first as a proof of concept. You'll find the sharp edges early, on services you already understand — not in the middle of your next compliance audit.
