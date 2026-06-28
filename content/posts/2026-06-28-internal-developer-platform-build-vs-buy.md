---
title: "🏗️ Internal Developer Platforms: Build vs Buy (And Why You'll Probably Do Both)"
date: "2026-06-28"
excerpt: "Every engineering team eventually faces the IDP question: do you stitch together Backstage, Argo, and a dozen other tools, or pay for something that just works? Spoiler — the answer is messier than a vendor's pricing page."
tags:
  - devops
  - platform-engineering
  - developer-experience
  - backstage
  - internal-developer-platform
featured: true
---

There's a moment in every growing engineering org when someone in a Slack channel types "we need a developer portal" and the room divides into two camps faster than you can say "Kubernetes." One camp immediately starts a Confluence page listing seventeen open-source tools they want to wire together. The other camp starts a spreadsheet comparing vendor pricing. Both camps are wrong, and both camps are right. Welcome to the Internal Developer Platform decision.

## What Is an IDP, Actually?

An Internal Developer Platform (IDP) is the paved road your engineers drive on to ship software — self-service infrastructure provisioning, service catalogues, deploy pipelines, secret management, environment creation, all bundled into something a developer can use without filing a ticket to the platform team. When it works, it's invisible. When it doesn't, it's the thing your engineers complain about on team retrospectives.

The goal is reducing cognitive load. A developer should be able to go from "I have a service to deploy" to "it's deployed and observable" without knowing which S3 bucket the terraform state lives in or why the staging ECS cluster has 17 different security group rules.

## The Build Path: Freedom With a Side of Pain

Building an IDP usually starts with Backstage (Spotify's open-source developer portal) as the frontend, then bolting on whatever your team already uses — Argo CD for GitOps, Crossplane or Terraform for infra, Vault for secrets, and PagerDuty for "I hope this doesn't page me at 3am."

Here's a simplified Backstage catalog entry that registers a service and wires up its docs and CI:

```yaml
# catalog-info.yaml — lives at the root of your service repo
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payment-service
  description: Handles all payment processing and reconciliation
  annotations:
    github.com/project-slug: acme/payment-service
    backstage.io/techdocs-ref: dir:.
    argocd/app-name: payment-service-prod
  tags:
    - backend
    - payments
    - critical
spec:
  type: service
  lifecycle: production
  owner: team-payments
  system: checkout
  dependsOn:
    - component:fraud-detection-service
    - resource:postgres-payments-db
```

This sounds clean. It is clean — until you have 80 services and the team that owns the Backstage plugins is stretched thin and the ArgoCD plugin breaks on a minor Argo update and nobody has time to fix it because a production incident is happening. Building gives you full control and zero excuses.

The honest number: a credible self-built IDP is a 6–12 month investment for a small dedicated platform team, and it never stops needing maintenance. If you don't have that team, you're not building an IDP — you're building tech debt with a nice UI.

## The Buy Path: Speed With a Side of Lock-In

Vendor IDPs — Cortex, Port, OpsLevel, Humanitec, and a growing list of others — let you skip the plumbing and start configuring instead. You connect your GitHub, your Kubernetes clusters, your PagerDuty, and within days you have a service catalogue, health scorecards, and a deployment workflow.

At Cubet, we evaluated two commercial offerings when our platform team was one person (me, juggling three other hats). The time-to-value argument is real: I got a working service catalogue with ownership mapping and dependency graphs in two afternoons. That same outcome in Backstage would've been a two-week project.

The tradeoff shows up fast: vendor lock-in on your workflow definitions, pricing that scales with engineers rather than usage, and the occasional "we're sunsetting this feature" email. One platform we trialled baked their own deployment model that didn't quite match our GitOps flow — adapting to it would've meant changing how 40 repositories managed their deploy configs. We passed.

## The Honest Answer: It's Usually Both

Most mature platform teams end up layering. They buy the service catalogue and developer portal (Cortex, Port) for fast time-to-value and low maintenance, then build the workflow automation layer themselves because vendor workflow builders are always either too opinionated or too flexible in the wrong directions.

Here's a lightweight custom action pattern — a simple CLI wrapper your platform team ships so developers don't need to know which Terraform module provisions an RDS instance:

```bash
#!/usr/bin/env bash
# platform create-db — wraps terraform so devs don't touch it
set -euo pipefail

SERVICE=$1
ENVIRONMENT=${2:-staging}
DB_SIZE=${3:-db.t3.medium}

echo "🗄️  Provisioning ${SERVICE} database in ${ENVIRONMENT}..."

terraform -chdir=infra/modules/rds apply \
  -var="service_name=${SERVICE}" \
  -var="environment=${ENVIRONMENT}" \
  -var="instance_class=${DB_SIZE}" \
  -var="team=$(git config user.email | cut -d@ -f1)" \
  -auto-approve

echo "✅ Database ready. Connection string in Vault at secret/${ENVIRONMENT}/${SERVICE}/db"
```

It's not glamorous. It's three lines of terraform wrapped in a bash script with a friendly emoji. But it's the thing developers actually use, and it encodes your team's conventions — naming, tagging, secret storage location — so those decisions don't live in someone's head or a Notion doc nobody reads.

## The Questions That Actually Matter

Before you start either path, answer these:

**How many developers are you serving?** Under 20, buy everything you can. Above 100, you'll need to build at least the workflow layer. Between 20 and 100, it depends on how fast you're growing.

**Do you have a dedicated platform team?** If platform engineering is a "when we have time" activity, don't build. Buy, configure, and accept the constraints. A maintained vendor tool beats an abandoned custom portal every time.

**How opinionated is your stack?** Highly custom Kubernetes setup, unusual deployment targets, exotic secret backends — these break vendor assumptions constantly. Building gives you the flexibility. Buying gives you the friction.

**What's the cost of low developer autonomy?** If senior engineers are spending two hours a week waiting on tickets to get environments or credentials, that's real money. An IDP — bought or built — has a payback period you can actually calculate.

## The Trap to Avoid

The trap is building an IDP as a prestige project when what you actually need is a documented runbook and a few bash scripts. I've seen platform teams spend six months building a beautiful Backstage portal with custom plugins, animated scaffolding workflows, and a dark mode, while developers were still manually SSHing into boxes to check logs because nobody had set up proper log aggregation. Solve the pain first. Build the portal second.

The other trap is buying a vendor tool and treating it as a finished product. IDPs require curation. Your service catalogue rots if nobody updates ownership. Your scorecards become noise if you never act on low scores. Buy the tool, then staff the process.

## Where to Start

If you're starting today: deploy Backstage with just the Software Catalog plugin and register your five most critical services. No scaffolding templates, no custom plugins, nothing fancy. Just answer the question "who owns what?" for your 10 most important services. That alone is worth more than you think.

Then expand one piece at a time — scaffolding templates next, then deploy visibility, then self-service infra. Pick the thing that generates the most support tickets for your platform team and automate that first.

The goal isn't a feature-complete IDP on day one. The goal is developers filing fewer tickets, making fewer mistakes, and shipping a little faster. Whether you buy that or build it is a business decision, not a technical one.

---

*What does your IDP stack look like — full Backstage, full vendor, or the glorious patchwork in between? I'd genuinely love to compare notes. Find me on GitHub or drop a comment below.*
