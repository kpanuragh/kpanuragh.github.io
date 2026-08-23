---
title: "🎭 Backstage in Real Life: The Developer Portal That Almost Worked"
date: "2026-08-23"
excerpt: "Everyone installs Backstage hoping for a magic service catalog. Most teams end up with a beautifully designed ghost town instead. Here's what it actually takes to make a developer portal something people open on purpose."
tags:
  - devops
  - platform-engineering
  - developer-experience
  - backstage
featured: true
---

Every platform team eventually hits the same slide in the same internal deck: "We need a single pane of glass." Someone's seen a conference talk, someone's read the Spotify engineering blog, and within a sprint you've got a Backstage instance running in a namespace called `platform` with a very shiny homepage and exactly four services registered in the catalog — three of which are stale.

I've stood up Backstage twice now, at two different companies, and both times the pattern was identical: incredible week-one demo, tumbleweed by week six. Not because Backstage is bad software — it's genuinely well built — but because a developer portal is a social problem wearing a technical costume. You can `npx @backstage/create-app` your way to a UI in twenty minutes. Getting engineers to treat it as the source of truth takes months.

## The Catalog Is Only as Good as Its Laziest Contributor

Backstage's entire value proposition rests on `catalog-info.yaml` files existing, being accurate, and staying accurate. That third part is where it dies.

```yaml
# catalog-info.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payments-api
  description: Handles payment intents and webhook reconciliation
  annotations:
    github.com/project-slug: cubet/payments-api
    pagerduty.com/service-id: PXXXXXX
spec:
  type: service
  lifecycle: production
  owner: team-payments
  system: checkout
```

This looks trivial to write once. The problem is nobody remembers to write it again when the service gets a new owner, gets deprecated, or gets split into two services during a Q3 refactor. Six months in, the catalog is a museum of org-chart decisions nobody's told the portal about. Engineers open it, see a team listed as the owner of a service that team hasn't touched in a year, lose trust, and go back to asking in Slack. Once trust goes, it doesn't come back with a design refresh.

The fix that actually worked for us wasn't more documentation nagging people to update YAML — it was making the catalog entry a required, CI-enforced part of the repo, generated from things that already had to be true:

```yaml
# .github/workflows/catalog-check.yml
- name: Validate catalog-info.yaml exists and owner is a real team
  run: |
    test -f catalog-info.yaml || (echo "::error::missing catalog-info.yaml" && exit 1)
    OWNER=$(yq '.spec.owner' catalog-info.yaml)
    curl -sf "https://api.github.com/orgs/cubet/teams/$OWNER" > /dev/null \
      || (echo "::error::owner '$OWNER' is not a real GitHub team" && exit 1)
```

Failing the PR if the owner field points at a team that doesn't exist sounds harsh, but it converts "the catalog might be stale" into "the catalog is provably not lying to you about ownership," which is a much smaller promise and much easier to keep.

## Software Templates Are the Actual Killer Feature, Not the Catalog

Here's the thing nobody tells you in the getting-started docs: the catalog is the least interesting part of Backstage. The part that actually earns its keep is Software Templates — the scaffolder that spits out a fully wired-up repo (CI, lint config, Dockerfile, catalog entry, PagerDuty hookup, the works) from a form.

```yaml
# templates/node-service/template.yaml
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: node-microservice
  title: New Node.js microservice
spec:
  parameters:
    - properties:
        name:
          type: string
        owner:
          type: string
          ui:field: OwnerPicker
  steps:
    - id: fetch
      action: fetch:template
      input:
        url: ./skeleton
        values:
          name: ${{ parameters.name }}
          owner: ${{ parameters.owner }}
    - id: publish
      action: publish:github
      input:
        repoUrl: github.com?owner=cubet&repo=${{ parameters.name }}
    - id: register
      action: catalog:register
      input:
        repoContentsUrl: ${{ steps.publish.output.repoContentsUrl }}
        catalogInfoPath: /catalog-info.yaml
```

This is the moment the portal stops being a passive directory and becomes something engineers reach for because it's genuinely the fastest path to a new service — faster than copy-pasting a sibling repo and manually stripping out the old service name from nine files (we've all done it, we've all missed one). And crucially: every service created this way is born with a correct catalog entry, so you're not fighting the staleness problem after the fact, you're preventing it at creation time.

At Cubet, once we moved the "spin up a new service" instructions from a wiki page into a scaffolder template, adoption of the catalog itself went up as a side effect — people weren't registering services out of civic duty, they were registering services because that's just what clicking the button did.

## TechDocs: Docs-as-Code, But Only If the Portal Actually Renders Them Well

The other underrated win is TechDocs — MkDocs-based docs that live in the repo next to the code and render inside Backstage. The pitch is "docs that can't drift because they're versioned with the code that they describe," which is true, but only if you resist the urge to also keep a separate Confluence space "just in case." Pick one. If engineers aren't sure where the docs live, they'll default to whichever is easier, and Confluence is always easier to half-write and abandon.

## What Actually Matters

If you're evaluating Backstage, or already regretting installing it: the catalog needs to be provably true or it's worse than useless, the scaffolder is what actually changes behavior, and the whole thing lives or dies on whether it's the *path of least resistance*, not just the *officially sanctioned* option. Nobody adopts a developer portal because leadership mandated it. They adopt it because it's genuinely less annoying than the alternative.

If your org has a Backstage instance gathering dust, don't reach for more onboarding docs first — go find the one workflow engineers do most often (usually "spin up a new service" or "find who owns this thing that's paging me") and make the portal the fastest way to do exactly that one thing. Everything else follows from there.
