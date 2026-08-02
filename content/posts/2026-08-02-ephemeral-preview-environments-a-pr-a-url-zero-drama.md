---
title: "Ephemeral Preview Environments: One PR, One URL, Zero Drama 🌱"
date: "2026-08-02"
excerpt: "Staging is a lie everyone agreed to tell. Ephemeral preview environments replace the one shared staging box with a fresh, disposable stack per pull request — and once you've had a designer click a real URL instead of squinting at a screenshot, you don't go back."
tags:
  - devops
  - platform-engineering
  - developer-experience
  - kubernetes
featured: true
---

Every team has a "staging" environment, and every team has a group chat where someone asks "who's on staging right now?" right before deploying something that breaks it for everyone else. Staging isn't an environment. It's a shared bathroom with no lock on the door, and everyone's pretending it's fine.

Ephemeral preview environments fix this by refusing to share anything. Every pull request gets its own full stack — app, database, whatever it needs — spun up automatically, given a real URL, and torn down when the PR closes. Nobody waits in line. Nobody's migration nukes someone else's test data. The environment lives exactly as long as the conversation about the code does.

## Why "Just Use Staging" Stops Working

Staging works fine when you have three engineers and one feature in flight. It stops working the moment you have ten PRs open at once, because staging can only be in one state at a time, and ten PRs want it in ten different states simultaneously.

The symptoms are familiar: a PR that "worked on my machine" breaks in staging because someone else's branch is still deployed there. QA files a bug against the wrong commit. A designer can't get eyes on a UI change without pinging an engineer to walk them through a local build. Everyone learns to distrust staging, which means everyone stops testing there, which means the bugs staging was supposed to catch now surface in production instead.

Preview environments solve the contention problem by not sharing state at all. One PR, one namespace, one URL. If a change breaks something, it breaks in that PR's own isolated bubble — nobody else notices, and the blast radius is exactly the size of the diff.

## The Shape of It

The pattern is roughly the same regardless of platform: a CI job triggers on `pull_request`, builds an image, deploys it into a fresh namespace or environment named after the PR number, and posts the URL back as a comment. On PR close, a matching job tears it down.

On Kubernetes, that's usually a namespace-per-PR with a templated set of manifests:

```yaml
# .github/workflows/preview.yml
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  deploy-preview:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy preview namespace
        run: |
          NS="pr-${{ github.event.number }}"
          kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -
          helm upgrade --install "$NS" ./chart \
            --namespace "$NS" \
            --set image.tag="${{ github.sha }}" \
            --set ingress.host="pr-${{ github.event.number }}.preview.example.dev"
      - name: Comment preview URL
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          message: "🌱 Preview ready: https://pr-${{ github.event.number }}.preview.example.dev"

  teardown-preview:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Delete preview namespace
        run: kubectl delete namespace "pr-${{ github.event.number }}" --ignore-not-found
```

If you're not on Kubernetes, the same idea maps onto Vercel/Netlify-style per-branch deploys, or ephemeral Fly.io/Railway apps, or even just a `docker compose` stack on a shared box with a reverse proxy routing by subdomain. The infrastructure varies; the contract — "every PR gets an isolated, disposable, URL-addressable environment" — doesn't.

## Where the Automation Bites Back

The teardown job is the part people forget to actually test, and it's the part that costs money when it's broken. At Cubet, we rolled out PR-scoped preview namespaces on a shared cluster, and the deploy side worked beautifully from day one — the demo to leadership went great. What didn't get exercised until three weeks in was the *close* path. A batch of PRs got closed via a squash-merge from the GitHub UI instead of the normal merge button, which fired a slightly different webhook payload, and our teardown workflow's `if` condition didn't match it. Namespaces just... stayed. Two weeks later someone noticed the cluster had 40-something stale preview environments quietly holding onto their own database pods and load balancers, and the cloud bill had a shape nobody could explain until we went hunting.

The fix wasn't clever — a scheduled job that lists preview namespaces older than the PR's actual state and reaps anything whose PR is closed or merged, independent of whether the webhook fired correctly:

```yaml
# runs hourly as a GC backstop, independent of PR webhooks
- name: Reap orphaned previews
  run: |
    for ns in $(kubectl get ns -l type=preview -o jsonpath='{.items[*].metadata.name}'); do
      pr="${ns#pr-}"
      state=$(gh pr view "$pr" --json state -q .state 2>/dev/null || echo "GONE")
      if [ "$state" != "OPEN" ]; then
        kubectl delete namespace "$ns"
      fi
    done
```

That's the real lesson: ephemeral only stays ephemeral if teardown doesn't depend on a single event firing correctly. Treat the happy-path webhook as an optimization, and put a dumb, reliable sweep job behind it as the actual guarantee. The same logic applies to TTLs on the resources themselves — a namespace with a hard expiry label is safer than one that trusts CI to clean up after itself.

The other gotcha worth planning for up front: seed data. Nobody wants a preview environment where every PR spins up an empty database and the first thing a reviewer sees is a blank dashboard. Snapshot-and-restore a sanitized fixture dataset into each namespace at creation time, not "whatever's in dev right now" — otherwise your previews inherit whatever weird state dev happened to be in, which is just staging's problem wearing a new namespace.

## Is It Worth the Setup Cost

Yes, almost always, once you're past the "everyone can just run it locally" team size. The payoff isn't really about catching bugs earlier, though it does that too — it's about collapsing the review loop. A reviewer who can click a real URL and poke at the actual feature reviews faster and more thoroughly than one squinting at a diff and trusting the description. A designer who gets a live link stops needing a synchronous screen-share to sign off on a UI tweak. Product can sanity-check a feature before it merges instead of after it ships.

If your team is still fighting over who gets staging this week, that fight is a signal, not a scheduling problem. Give every PR its own environment, put a GC job behind the teardown so it can't quietly leak money, and let the staging group chat go quiet for good.

What's the oldest zombie environment currently rotting in your cluster? Go check — I'll wait.
