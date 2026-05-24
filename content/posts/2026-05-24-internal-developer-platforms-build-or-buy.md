---
title: "🏗️ Internal Developer Platforms: Build or Buy (Or Steal From the Open Source Gods)?"
date: "2026-05-24"
excerpt: "Every engineering team eventually hits the same wall: developers are drowning in YAML, ops is playing ticket tennis, and someone proposes building an Internal Developer Platform. But should you build it, buy it, or stitch something together from open source? Let's figure out before you accidentally commission a 2-year platform project."
tags:
  - devops
  - platform-engineering
  - developer-experience
  - kubernetes
  - backstage
featured: true
---

# 🏗️ Internal Developer Platforms: Build or Buy (Or Steal From the Open Source Gods)?

There's a moment in every growing engineering org where someone — usually a well-meaning tech lead who's one too many Jira tickets away from a career change — stands up in a meeting and says:

> "We need an Internal Developer Platform."

The room goes quiet. Some people nod enthusiastically. Others look like they've just been told they're volunteering to repaint the office. And the ops team in the back is already opening a second monitor's worth of Confluence tabs.

The idea is good. The execution is where dreams go to file P1 tickets.

---

## What Even Is an IDP?

An Internal Developer Platform (IDP) is the golden path between "developer wants to deploy something" and "infrastructure actually running that something" — without the developer needing to understand Kubernetes networking, Terraform state backends, or why the staging environment is configured differently from production by "historical reasons."

Think of it as the self-service layer for your developers. They push code, pick a service template, hit a button (or a CLI command), and out comes a running service with monitoring, logging, CI, and a URL — without ever opening a YAML file that's longer than their attention span.

The question isn't *whether* you need one. If you have more than ~15 engineers or more than one team, you need one. The question is **how you get there**.

---

## Option 1: Buy It

The SaaS IDP market has exploded. Tools like Humanitec, Port, Cortex, Harness Platform, and OpsLevel offer you a polished dashboard, pre-built integrations, and the ability to tell your CTO you "evaluated multiple vendors" without anyone suffering.

**Pros:**
- Immediate time-to-value — you can have a catalog and a self-service portal in days, not quarters.
- Someone else's engineers wake up at 3am when the platform is down.
- Compliance features, RBAC, audit logs — all included.

**Cons:**
- Vendor lock-in is real. Your "golden path" becomes someone else's product roadmap.
- Cost scales aggressively per seat or per service. At Cubet, we ran the numbers on one mid-tier IDP SaaS — once you account for 50+ services and cross-team usage, you're looking at a bill that makes your finance team invent new spreadsheet formulas.
- Deep customisation is often a paid add-on or just... not possible.

**Best for:** Teams that need something yesterday, don't have platform engineers to spare, and can tolerate the constraints.

---

## Option 2: Build It (The Brave / Possibly Foolish Path)

You say "we'll build exactly what we need." I respect the energy.

Building an IDP from scratch means you own the golden path end-to-end. Your service catalog looks the way your org actually works. Your scaffolding templates match your standards. Your workflows aren't wedged into someone else's UI.

But here's the thing nobody puts in the architecture diagram: **an IDP is a product**. It has users (your developers), it has stakeholders (your ops team, your CISO), and it needs ongoing investment. The half-built internal platform that nobody trusts because it was built over two sprints and then abandoned is worse than no platform at all.

At Cubet, we've learned this the hard way. We built a lightweight service scaffold system that got us 70% of the way there — automated repo creation, CI pipeline injection, Kubernetes namespace provisioning — and it was genuinely useful. But the remaining 30% (catalog, dependency tracking, environment promotions) kept getting deprioritised in favour of product work. The result: a semi-IDP that engineers used inconsistently and ops extended manually. Sound familiar?

---

## Option 3: Open Source + Glue (The Pragmatic Middle Ground)

This is where most real teams land, and honestly, it's the smart call.

The ecosystem has matured enormously. Backstage (Spotify's OSS IDP framework) gives you a developer portal backbone. Crossplane or Kratix handles infrastructure abstraction. ArgoCD or Flux handles GitOps deployments. Kargo manages environment promotions. Stitched together thoughtfully, you get an IDP that's genuinely powerful, with no per-seat pricing and full ownership of the golden path.

Here's a minimal Backstage `catalog-info.yaml` that represents a service in your catalog:

```yaml
# catalog-info.yaml — drop this in any service repo
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payment-service
  description: Handles checkout and payment processing
  annotations:
    github.com/project-slug: my-org/payment-service
    backstage.io/techdocs-ref: dir:.
    argocd/app-name: payment-service-prod
tags:
  - nodejs
  - payments
  - critical
spec:
  type: service
  lifecycle: production
  owner: payments-team
  system: checkout
  dependsOn:
    - component:order-service
    - resource:postgres-payments
```

And a Crossplane Composition that gives developers a one-click managed database:

```yaml
apiVersion: apiextensions.crossplane.io/v1
kind: Composition
metadata:
  name: postgres-small
spec:
  compositeTypeRef:
    apiVersion: platform.myorg.io/v1alpha1
    kind: ManagedDatabase
  resources:
    - name: rds-instance
      base:
        apiVersion: rds.aws.upbound.io/v1beta1
        kind: Instance
        spec:
          forProvider:
            region: ap-south-1
            instanceClass: db.t3.micro
            engine: postgres
            engineVersion: "16"
            autoMinorVersionUpgrade: true
            deletionProtection: true
```

A developer runs `kubectl apply -f my-database.yaml` with a `ManagedDatabase` resource and gets a Postgres instance — without touching AWS console, without filing a ticket, without knowing what an RDS parameter group is.

---

## The Decision Framework

Here's how I think about it:

| | **Buy** | **Build** | **OSS + Glue** |
|---|---|---|---|
| Time to value | Days | Months–years | Weeks–months |
| Total cost | High (scales with org) | High (eng time) | Medium (eng time, no licensing) |
| Customisation | Limited | Full | High |
| Maintenance burden | Low | Very high | Medium |
| Vendor risk | High | None | Low |
| Works for <30 eng? | ✅ | ❌ | ✅ |
| Works for 200+ eng? | Expensive | ✅ if invested | ✅ |

**My actual recommendation:** Start with OSS. Backstage is rough around the edges but it's where the ecosystem is investing. Add Crossplane for self-service infra. Wire it to your existing GitOps setup. Invest in it properly — one dedicated platform engineer is worth more than five toolchain sprawl tickets per week.

If you genuinely have zero platform capacity and need something running today, buy a SaaS IDP for six months while you figure out your strategy. Just don't let "six months" become "forever because nobody questioned the contract renewal."

---

## What Nobody Warns You About

The hardest part of an IDP isn't the tech. It's **developer adoption**.

You can build the most beautifully architected platform in the world and engineers will still `kubectl apply` their hand-rolled YAML directly to production because "it was faster this time." Platform adoption is a product problem. You need documentation, you need champions on every team, and you need the golden path to actually be the path of least resistance — not just in theory but in practice, on Monday morning when someone's trying to ship a hotfix.

The platforms that succeed treat developers as customers. The ones that fail treat them as users to be corrected.

---

## TL;DR

- IDPs are no longer optional at scale — they're the difference between developer joy and ops hell.
- Don't build from scratch unless you have dedicated platform engineering capacity and a real product mindset.
- The OSS path (Backstage + Crossplane + GitOps) gives you the best long-term flexibility.
- Whatever you choose: ship the golden path early, get feedback, iterate. An imperfect IDP used by everyone beats a perfect one used by nobody.

Now go rescue your developers from the YAML mines.
