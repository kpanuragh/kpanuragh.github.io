---
title: "🎈 Ephemeral Preview Environments: Give Every PR Its Own Little Universe"
date: "2026-07-12"
excerpt: "Staging is a lie everyone agrees to tell. Ephemeral preview environments spin up a full stack per pull request and tear it down on merge - here's how to build them without setting your cloud bill on fire."
tags: ["devops", "kubernetes", "developer-experience", "ci-cd", "platform-engineering"]
featured: "true"
---

Every team has a staging environment. Every team also has a Slack channel called `#staging-issues` where someone posts "who's on staging rn" at 4:58pm on a Friday, three people say "not me," and it turns out to have been broken since Tuesday. Staging isn't an environment, it's a shared hallucination that everyone politely agrees not to question.

Ephemeral preview environments fix this by refusing to share anything. Every pull request gets its own full stack — frontend, backend, database, the works — spun up the moment the PR opens and destroyed the moment it merges or closes. No queue. No "can I deploy after you." No mystery state from three PRs ago still haunting the database.

## The pitch, in one sentence

Instead of one staging environment fought over by twenty engineers, you get twenty environments, each owned by exactly one PR, each disposable.

Vercel and Netlify made this feel normal for frontend-only projects — push a branch, get a URL. The harder (and more interesting) version is doing it for a whole system: API, worker, database, the occasional third-party mock. That's where most teams either give up or overbuild.

## The minimum viable version

You don't need a platform team and a six-month roadmap to get started. A GitHub Actions workflow that reacts to PR events and a namespace-per-PR convention in Kubernetes gets you most of the value:

```yaml
# .github/workflows/preview.yml
on:
  pull_request:
    types: [opened, synchronize, closed]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set namespace
        run: echo "NS=pr-${{ github.event.number }}" >> "$GITHUB_ENV"

      - name: Deploy preview
        if: github.event.action != 'closed'
        run: |
          kubectl create namespace $NS --dry-run=client -o yaml | kubectl apply -f -
          helm upgrade --install app-$NS ./chart \
            --namespace $NS \
            --set image.tag=${{ github.sha }} \
            --set ingress.host=$NS.preview.example.com

      - name: Tear down
        if: github.event.action == 'closed'
        run: kubectl delete namespace $NS --ignore-not-found
```

That's it. That's the whole trick: namespace isolation plus a lifecycle hook tied to PR open/close. Everything else — database seeding, secret injection, TLS certs — is detail work bolted onto this skeleton.

## The part nobody puts in the demo: the database

The database is where every ephemeral-environment pitch quietly moves the camera away. You have three real options, and they all have teeth:

1. **Fresh empty DB per PR, seeded with fixtures.** Cheap and fast, but if the bug only reproduces with production-shaped data, you'll never catch it in preview.
2. **Branched copy-on-write DB** (Neon, PlanetScale, and a few others support this natively). You get a real data snapshot in seconds without duplicating storage. This is the good option if your DB vendor supports it — and increasingly, they do.
3. **Shared DB with per-PR schema prefixes.** Works, but you've just reinvented the shared-staging problem with extra steps. Avoid it if you can.

If your database doesn't support branching, seed with a small, deliberately representative fixture set and accept that some bugs will only show up post-merge. That's a real tradeoff — say it out loud to the team instead of pretending the preview environment is a perfect prod mirror.

## Where the cloud bill quietly explodes

Here's the failure mode nobody warns you about: PRs that sit open for three weeks because review got deprioritized. Multiply that by fifteen concurrent PRs, each running a full replica set, and you've built a second staging fleet that nobody's watching. At Cubet, we had a preview cluster that crept up to running more pods than production before anyone noticed — turned out a handful of long-lived "draft" PRs had just been silently paying rent for a month.

The fix is boring but it works: a TTL on every namespace, enforced outside of GitHub's event model (because a stale bot token or a webhook outage means `closed` never fires). A cron job that lists namespaces older than N days and nukes anything not attached to an open PR closes that gap:

```bash
# reaper.sh — run hourly via CronJob
for ns in $(kubectl get ns -l app=preview -o name); do
  pr=$(kubectl get "$ns" -o jsonpath='{.metadata.labels.pr-number}')
  if ! gh pr view "$pr" --json state -q .state 2>/dev/null | grep -q OPEN; then
    kubectl delete "$ns"
  fi
done
```

Belt and suspenders beats a webhook you trust blindly.

## Scale the ambition to the team, not the hype

If you're a five-person team, don't build Backstage-style self-service portals for this — a GitHub Action and a Helm chart is plenty, and it's something you can actually debug at 2am. If you're running hundreds of services, look at purpose-built tooling (Ephemeral environments-as-a-service platforms like Signadot or Qovery exist precisely because the DIY version stops scaling around "40 services and counting"). The mistake is picking the heavyweight option on day one because a conference talk made it look effortless.

## Try it small

Pick your flakiest, most-staging-dependent service. Wire up namespace-per-PR for just that one, with the dumbest possible seed data. Watch how much faster review gets when "can you check this on staging" becomes "here's your own URL, it's already running." Then go fix your database story, because that's the part that'll actually determine whether this becomes infrastructure your team trusts — or one more thing to tear down.
