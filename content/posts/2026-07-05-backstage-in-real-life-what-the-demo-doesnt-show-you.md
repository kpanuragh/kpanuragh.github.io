---
title: "🎭 Backstage in Real Life: What the Demo Doesn't Show You"
date: 2026-07-05
excerpt: "The Backstage demo takes ten minutes and looks amazing. Getting a real org to actually keep catalog-info.yaml files up to date? That's the part nobody puts in the conference talk."
tags:
  - devops
  - platform-engineering
  - backstage
  - developer-experience
  - internal-tools
featured: true
---

Every Backstage conference talk follows the same script. Someone clones the starter repo, runs `npx @backstage/create-app`, and eight minutes later there's a beautiful service catalog with cards and tags and a search bar. The room nods. Someone in the back opens a Jira ticket titled "Adopt Backstage" before the talk even ends.

Then six months later that same person is in a Slack thread asking why forty percent of the catalog shows "Owner: unknown" and a service called `payments-v2-FINAL-actually-final` that was decommissioned a year ago is still marked healthy.

Backstage the software is genuinely good. Backstage the *organizational commitment* is where things get interesting, and that's the part the demo skips.

## The catalog is a mirror, not a magic trick

The single biggest misconception about Backstage is that it discovers your services. It doesn't. It renders whatever `catalog-info.yaml` files exist, and those files are only as accurate as the humans who wrote them and the process that keeps them updated.

```yaml
# catalog-info.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: checkout-api
  annotations:
    github.com/project-slug: cubet/checkout-api
    backstage.io/techdocs-ref: dir:.
spec:
  type: service
  lifecycle: production
  owner: team-payments
  system: checkout
```

That `owner: team-payments` field is load-bearing for on-call routing, ownership dashboards, and "who do I ping about this" queries across the whole org — and it's just a string someone typed once, in a PR, that may or may not get reviewed with the same rigor as the actual application code. We caught this at Cubet within the first quarter of rollout: a reorg moved a service's real owner to a different team, nobody remembered the YAML existed, and the catalog confidently pointed a very confused engineer at a team that had disbanded eight months earlier.

The fix wasn't more documentation telling people to update the file. It was a CI check on every service repo that fails the build if `catalog-info.yaml` doesn't exist, and a quarterly bot-filed PR that pings each listed owner team to confirm they still own the thing. Backstage will happily display stale data forever if nothing forces freshness.

## TechDocs is only as good as your Markdown discipline

TechDocs — Backstage's built-in docs-as-code renderer — is the plugin everyone gets excited about first, because "docs live next to the code and render automatically" sounds like the end of Confluence rot. It mostly delivers on that. What it doesn't do is stop someone from writing a `README.md` that says "TODO: add docs" and shipping it to production docs anyway.

```yaml
# mkdocs.yml — this is the entire barrier to entry for a team's docs
site_name: 'Checkout API'
nav:
  - Home: index.md
  - Architecture: architecture.md
  - Runbook: runbook.md
plugins:
  - techdocs-core
```

The plugin config is three lines. Getting a team to actually write `runbook.md` before the service that needs it pages someone at 2am is a culture problem, not a tooling problem, and Backstage can't fix culture. What it *can* do is make the empty state embarrassing — an empty runbook shows up as a visibly broken page in the catalog instead of a missing wiki link nobody notices. Public shame is an underrated adoption strategy.

## Plugins are a garden, not an app store

The Backstage plugin ecosystem looks like an app store in the marketing materials — Kubernetes plugin, cost insights plugin, PagerDuty plugin, click to install. In practice, plugins vary wildly in maintenance quality, several assume a slightly different version of the core Backstage API than the one you're running, and every plugin you add is now a thing *you* maintain, because there's no vendor SLA on a community plugin your team installed eighteen months ago.

The teams that stay sane treat plugin adoption like adding a production dependency, not like installing a browser extension: pin the version, read the changelog before bumping, and have one person on the platform team who actually understands what each installed plugin does. The teams that install everything in the catalog on day one are the same teams filing "why did Backstage break" tickets after every core version bump.

## The adoption curve nobody graphs

The uncomfortable truth is that Backstage's value is nonlinear with adoption percentage. At 20% of services registered, it's a nice-to-have a few teams use. At 60%, it's "check two places for ownership info," which is worse than checking one place consistently. It only becomes genuinely useful once it crosses roughly 90% — the point where "if it's not in Backstage, it doesn't exist" becomes a rule people actually believe, instead of an aspiration in the platform team's OKRs.

Getting from 60% to 90% is almost entirely a mandate problem, not an engineering problem: does a new service repo get a `catalog-info.yaml` in its initial scaffold, or does someone have to remember to add one? Templating it into your service-creation golden path (Backstage's own Scaffolder plugin, or whatever cookiecutter equivalent you use) is the difference between "eventually everything's in there" and "some things are in there."

## Was it worth it?

Yes — but not for the reason the demo sells you. The value isn't the pretty catalog UI. It's that Backstage forces your org to answer, in a structured and queryable way, questions it was previously answering by asking around in Slack: who owns this, what's it built with, where are the docs, is it even alive. The catalog is really a forcing function for organizational self-knowledge that happens to come with a nice frontend.

If you're mid-rollout and it feels like you're fighting stale data more than shipping features, that's not a sign it's failing — that's the actual work. The software was never the hard part.

What's the ugliest thing your Backstage catalog has told you about your own org? Mine was a service with three different "owners" across three separate YAML files, none of whom had touched the repo in over a year.
