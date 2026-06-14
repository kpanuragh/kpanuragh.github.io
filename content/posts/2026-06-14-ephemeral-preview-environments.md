---
title: "Ephemeral Environments: Give Every PR Its Own Playground 🎪"
date: 2026-06-14
excerpt: "Staging is lying to you. Preview environments spin up a full stack per pull request so QA, designers, and stakeholders can click through real features without queuing behind twelve other devs for one shared environment."
tags:
  - devops
  - platform-engineering
  - kubernetes
  - ci-cd
  - developer-experience
featured: true
---

Let me paint you a picture. It's 3 PM on a Thursday. The designer needs to sign off on the new onboarding flow. QA is halfway through a regression run on staging. Someone from product just pushed a "quick fix" that broke the login page. And your PM is asking — with increasing urgency — why they can't just *click on the thing*.

You have one staging environment. It is shared. It is angry. And it hates you.

The answer to this chaos isn't a bigger staging server. It's **ephemeral preview environments** — short-lived, full-stack environments that spin up automatically for every pull request and die quietly when the PR is merged or closed.

## What's an Ephemeral Environment, Exactly?

Think of it as a mini production clone that exists only as long as your branch does. Open a PR, get a URL. Merge the PR, the environment evaporates. No janitor required.

Each environment gets:
- Its own subdomain (`pr-142.preview.yourdomain.com`)
- Its own database (seeded with anonymised test data)
- Its own set of environment variables pointing to preview-safe third-party services
- A link posted automatically to the PR thread

QA clicks the link. Designer clicks the link. PM clicks the link. Everyone stops asking you to "just push it to staging" because staging isn't the only option anymore.

At Cubet, we rolled this out for a client project with a particularly enthusiastic design review cycle. The number of "can you deploy this so I can see it?" Slack messages dropped by roughly 80% in the first week. The PM called it life-changing. I called it Thursday.

## The Kubernetes Approach (Namespace-per-PR)

If you're already on Kubernetes, the cheapest path is a **namespace per pull request**. Your CI pipeline creates a namespace, applies your Helm chart or Kustomize overlays, and injects the PR-specific values.

Here's a simplified GitHub Actions workflow that wires this up:

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

      - name: Set preview namespace
        run: echo "NAMESPACE=pr-${{ github.event.number }}" >> $GITHUB_ENV

      - name: Deploy preview
        run: |
          helm upgrade --install preview-${{ github.event.number }} ./helm/app \
            --namespace ${{ env.NAMESPACE }} \
            --create-namespace \
            --set image.tag=${{ github.sha }} \
            --set ingress.host=pr-${{ github.event.number }}.preview.example.com \
            --set db.name=preview_${{ github.event.number }} \
            --wait --timeout 5m

      - name: Comment preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🎪 Preview deployed: https://pr-${{ github.event.number }}.preview.example.com'
            })

  teardown-preview:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Delete preview namespace
        run: |
          helm uninstall preview-${{ github.event.number }} \
            --namespace pr-${{ github.event.number }}
          kubectl delete namespace pr-${{ github.event.number }}
```

The teardown job is the part people forget. Don't forget the teardown job. I have seen clusters with 40 forgotten preview namespaces eating enough RAM to run a small country's Jira instance.

## Database Strategy: The Tricky Part

Compute is easy. Databases are where this gets interesting.

**Option 1: Snapshot and restore.** Take a nightly snapshot of your staging DB, strip PII, and restore a copy per PR. Slow to spin up but gives realistic data. Good for apps where data shape matters for QA.

**Option 2: Schema-only with seed data.** Run migrations against an empty DB, then seed with a small, deterministic fixture set. Fast and cheap. Good enough for most feature branches.

**Option 3: Shared database, isolated schema.** Postgres supports multiple schemas in one database. Each preview gets `pr_142.users`, `pr_142.orders`, etc. Cheaper on resources, more complex to manage.

We typically default to Option 2 at Cubet — seed data is predictable, tests don't flake because someone modified a shared record, and spin-up time is under 90 seconds. Option 1 comes out only when QA specifically needs production-shaped data to reproduce a bug.

Here's a dead-simple seed script hook you can drop into your Helm post-install:

```bash
#!/bin/bash
# scripts/seed-preview.sh
set -e

echo "Running migrations..."
php artisan migrate --force

echo "Seeding preview data..."
php artisan db:seed --class=PreviewSeeder --force

echo "Preview environment ready."
```

Keep your `PreviewSeeder` small and deterministic. Ten users, three organisations, one of each order state. No randomness. If the seed is flaky, debugging a CI failure at 11 PM is a special kind of misery.

## Wildcard DNS and TLS: The Infrastructure Glue

For the `pr-*.preview.example.com` routing to work, you need:

1. **Wildcard DNS record** — `*.preview.example.com` pointing at your ingress load balancer.
2. **Wildcard TLS certificate** — issued via cert-manager with a DNS-01 challenge (HTTP-01 won't work for wildcards). Route53, Cloudflare, and most DNS providers have cert-manager solvers.
3. **Ingress controller** — NGINX or Traefik, reading the `ingress.host` value your Helm chart sets per PR.

Once this plumbing is in place, adding a new preview environment is literally just a Helm install. The DNS and TLS just work.

## Cost Controls (Because Nobody Likes a Surprise Bill)

Ephemeral environments are cheap *if* they actually die. A few guard rails:

- **Max TTL.** Kill any preview namespace older than 7 days unconditionally, even if the PR is still open. Add a label `preview/created-at` and a nightly cleanup CronJob that reaps the old ones.
- **Resource limits.** Set tight CPU/memory limits on preview workloads. A preview doesn't need 4 vCPU. It needs to be clickable.
- **Scale-to-zero.** Tools like KEDA or Knative can scale preview deployments to zero after 30 minutes of inactivity and wake them on the next HTTP request. Cold start is ~10 seconds — acceptable for a preview.

## The Real Win Isn't QA

Yes, QA loves preview environments. But the bigger win is **async review**. Your designer in a different timezone doesn't need to schedule a screen-share to see the feature. Your PM doesn't need to wait for the weekly demo. Your security reviewer can probe the actual app, not a screenshot.

Good platform teams don't just give developers faster feedback loops — they give *everyone* a way to engage with the work without blocking the person who built it. Ephemeral environments are the most direct way to do that.

## Where to Start

You don't need to build the perfect system on day one. Start scrappy:

1. Stand up one preview environment manually. Validate the DNS, TLS, and database strategy.
2. Script the Helm install/uninstall into a Makefile or shell script.
3. Wire it to CI with the GitHub Actions pattern above.
4. Add the teardown job. (Seriously. The teardown job.)
5. Add cost controls after you've confirmed the happy path works.

The first team that gets a preview link in their PR will never want to go back to "just check staging." And staging — finally — will be yours again.

---

*Running preview environments in production at Cubet changed how we demo features internally. Curious how your team handles shared staging chaos? Drop your war stories in the comments.*
