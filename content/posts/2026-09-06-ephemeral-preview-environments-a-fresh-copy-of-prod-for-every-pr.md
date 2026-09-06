---
title: "🎪 Ephemeral Preview Environments: A Fresh Copy of Prod for Every Pull Request"
date: "2026-09-06"
excerpt: "Staging is a lie everyone agreed to tell. Here's how spinning up a real, isolated environment for every PR ended arguments, killed a bottleneck, and occasionally set our cloud bill on fire."
tags: ["devops", "kubernetes", "ci-cd", "platform-engineering", "developer-experience"]
featured: true
---

There's a special kind of dread that comes from hearing "it works on staging" right before a release. Staging is the one shared environment everyone deploys to, nobody owns, and three people are quietly overwriting at any given moment. You test your feature, someone else merges theirs, and now your perfectly green PR is broken by a migration you've never seen.

The fix that actually stuck for us wasn't "be more disciplined about staging." It was: stop sharing it. Give every pull request its own throwaway environment, spun up on `opened`, torn down on `closed`. Not a mock, not a Storybook — an actual namespace with a real database, real ingress, a real URL you can hand to a designer or a PM and say "click around, it's yours."

## The moment it clicked

A reviewer asked "does this handle the empty-cart case?" on a PR. Instead of reading the diff and guessing, they opened `pr-482.preview.ourapp.dev`, added nothing to a cart, and watched it break in real time. That's the whole pitch. Preview environments turn "I think this works" into "here, look."

## The shape of it

The mechanics are almost boring once you see them: a CI job watches for PR events, and for each PR it deploys your app into its own Kubernetes namespace, templated only by the PR number.

```yaml
# .github/workflows/preview.yml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy or destroy preview
        run: |
          NS="pr-${{ github.event.pull_request.number }}"
          if [ "${{ github.event.action }}" = "closed" ]; then
            kubectl delete namespace "$NS" --ignore-not-found
          else
            kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
            helm upgrade --install app ./chart \
              --namespace "$NS" \
              --set image.tag="${{ github.sha }}" \
              --set ingress.host="pr-${{ github.event.pull_request.number }}.preview.ourapp.dev"
          fi
```

That's it. No shared state, no "who deployed to staging last." Every PR gets a URL, and closing the PR deletes the namespace — pods, services, ingress, gone.

## Where it bites you

Two things will hurt if you don't plan for them, and both cost us real money before we noticed.

**The database problem.** A fresh namespace with an empty database is useless for testing anything that depends on real-looking data. We ended up seeding each preview from an anonymized snapshot of production, refreshed nightly, restored via an init container. Skip this and every reviewer's first comment is "there's no data, I can't test this."

**The cleanup problem.** `on: closed` doesn't fire for a PR that just goes stale and gets abandoned, and a failed workflow run means the delete step never happens. We came in one Monday to forty orphaned namespaces, each with its own Postgres pod, quietly running for two weeks. The fix was a scheduled sweep, not a trust exercise:

```yaml
# runs hourly, kills anything older than 3 days regardless of PR state
- name: Reap stale previews
  run: |
    kubectl get ns -l type=preview -o json | \
      jq -r '.items[] | select(
        (now - (.metadata.creationTimestamp | fromdateiso8601)) > 259200
      ) | .metadata.name' | xargs -r -n1 kubectl delete namespace
```

At Cubet, that sweep job caught more leaked environments in its first week than we'd noticed manually in the previous three months. Nobody was being careless — the automation just had more failure modes than we'd accounted for (canceled workflows, force-pushes mid-deploy, GitHub webhook hiccups).

## The tradeoff nobody puts in the blog post

Preview environments are not free, and "ephemeral" doesn't mean "cheap." Every open PR is now a running copy of your app, database included. If your team has thirty PRs open on a lazy Friday, that's thirty Postgres pods idling. We capped it: previews auto-suspend (scale to zero) after two hours of no traffic, and wake up on the next request via a keep-warm ingress annotation. It's not instant, but a five-second cold start beats a surprise line item on the cloud bill.

The other tradeoff is trust boundaries. A preview environment pointed at a production-shaped database is a production-shaped attack surface. Ours run in a separate cluster, behind auth that isn't "guess the PR number," with secrets scoped per-namespace — not copy-pasted from a shared staging vault.

## Was it worth it?

Completely. Review cycles got shorter because "let me check locally" turned into "let me click the link." QA stopped filing bugs against staging that were actually caused by someone else's half-merged feature. And the political fights over "who broke staging" just... stopped happening, because there's no staging left to break.

If your team is still sharing one staging environment and taking turns blaming each other for it, ephemeral previews are one of the few platform investments that pays for itself in the first month. Start small — one namespace-per-PR job, no fancy database seeding yet — and let the pain points (and yes, the surprise cloud bill) tell you what to automate next.
