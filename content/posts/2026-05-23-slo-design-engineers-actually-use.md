---
title: "📐 SLO Design That Engineers Actually Use (Not the Kind That Gathers Dust)"
date: "2026-05-23"
excerpt: "Most SLOs die in a Confluence page nobody reads. Here's how to design service level objectives that your team will actually monitor, defend, and care about."
tags:
  - reliability
  - slo
  - sre
  - observability
  - devops
featured: true
---

# 📐 SLO Design That Engineers Actually Use (Not the Kind That Gathers Dust)

Here's a scene I've witnessed more times than I'd like to admit: a team spends two sprints defining SLOs, puts them in a dashboard, presents them in the quarterly review, gets applause — and then absolutely nobody looks at them again until the next quarterly review.

The SLOs exist. They're just... decorative.

This post is about the other kind: SLOs that engineers check on Mondays, that drive on-call decisions, and that actually change the conversation when something breaks.

---

## Why Most SLOs Fail Before They're Even Written

The failure usually starts with the question itself. Teams ask: *"What availability SLO should we set?"* and someone confidently says **"99.9%"** — because it sounds professional and nobody wants to be the person who proposed 99%.

But 99.9% of what? Measured how? Over what window? With what exclusions?

The number is picked before any of those questions are answered, and the SLO becomes meaningless — a target chosen to be met, not a signal designed to surface real degradation.

The root problem: **SLOs are often designed for management, not for engineers**. They're written to satisfy a post-mortem action item, not to guide daily operational decisions.

---

## Start With the User Journey, Not the Service Graph

The most useful SLOs map to something a real user experiences, not an internal metric your team happens to have.

Bad SLO (service-centric):
> 99.5% of API requests return HTTP 2xx.

Better SLO (user journey-centric):
> 99.5% of checkout completions succeed within 3 seconds.

The difference matters when you have five microservices in the checkout path. The first SLO goes green the moment the API gateway is healthy, even if the payment service is timing out and half your users are silently failing at the last step. The second SLO captures the actual outcome.

At Cubet, we started mapping SLOs to *critical user journeys* (CUJs) — login, data submission, report generation — and immediately found three services that looked healthy by their own metrics but were quietly degrading the journeys that mattered.

---

## Choose Your Error Budget Windows Deliberately

The rolling window you pick changes the SLO's *behavior*, not just its math.

- **28-day rolling window**: smooths over incidents but lets bad weeks hide in averages. Great for reporting; not great for operations.
- **7-day rolling window**: more sensitive. An incident this Tuesday burns 1/7th of your weekly budget immediately. Engineers *feel* budget consumption.
- **calendar month**: predictable for business reviews, but an incident on the 1st gives you all month to recover, while an incident on the 28th is catastrophic.

For operational SLOs — the ones on-call engineers should act on — a **28-day rolling window with a 1-hour burn rate alert** is usually the sweet spot. The burn rate alert catches fast-moving incidents before the rolling window absorbs them.

---

## The Error Budget: Your Most Underused Feature

An error budget is the amount of unreliability your SLO *allows*. A 99.9% SLO on a 30-day window gives you ~43 minutes of downtime budget per month.

Most teams track this and stop there. The teams that get real value from SLOs use the budget as a **negotiation tool**.

When the budget is healthy: ship faster, experiment more, deploy risky changes.  
When the budget is burning: freeze releases, do reliability work, fix the debt.

This is the insight from Google's SRE book that teams often read but rarely implement. Here's a lightweight version in a Prometheus-based stack:

```yaml
# prometheus/rules/slo_checkout.yml
groups:
  - name: checkout_slo
    rules:
      # 5-minute error rate
      - record: job:checkout_errors:rate5m
        expr: |
          sum(rate(http_requests_total{job="checkout", code=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{job="checkout"}[5m]))

      # 1-hour burn rate (target: 99.5% → budget = 0.5%)
      # Burn rate > 14.4x means budget exhausted in 2 hours
      - alert: CheckoutSLOFastBurn
        expr: job:checkout_errors:rate5m > (14.4 * 0.005)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Checkout SLO burning fast — budget exhausted in ~2h at current rate"
```

That `14.4` multiplier isn't magic: if your error budget window is 30 days (720 hours), burning it in 2 hours means you're consuming it at 360× the sustainable rate. Divide 720 by 2 hours = 360, then express as "how many times faster than the budget allows" = `360 / 24 ≈ 14.4`. The burn rate alert fires before your rolling window SLO even flinches.

---

## Error Budget Policies: The Missing Piece

An SLO without a policy is an observation, not a commitment. Write down — in plain text, in your runbook or your CLAUDE.md equivalent — what happens at different budget states:

```markdown
## Checkout Service — Error Budget Policy

**Budget remaining > 50%**  
Normal operations. Deployments proceed. Experiments allowed.

**Budget remaining 20–50%**  
No new experiments. All deployments require a second on-call review.
Focus one sprint on reliability improvements before next feature work.

**Budget remaining < 20%**  
Release freeze. No deployments except hotfixes.
Engineering lead notified. Reliability sprint starts immediately.

**Budget exhausted**  
Incident review required before any new work is approved.
SLA review with product stakeholders.
```

When we rolled out something like this at Cubet, the first month felt bureaucratic. By the third month, engineers started *checking* the budget before picking up tickets — not because they were told to, but because the policy gave the number meaning.

---

## The Tiered SLO: Don't Treat Everything the Same

Not all services deserve a 99.9% SLO. Applying the same bar to your internal admin panel as your payment API is how you burn engineering time on the wrong things.

A rough tier model:

| Tier | Example | Availability Target | Response Target |
|------|---------|-------------------|-----------------|
| 0 — Critical | Payment, Auth | 99.95% | 500ms p99 |
| 1 — Core | Dashboard, Search | 99.5% | 1s p99 |
| 2 — Supporting | Internal tools, Batch jobs | 99% | Best effort |

Tier 0 services get burn rate alerts, error budget policies, and on-call escalation. Tier 2 services get a weekly rollup. The distinction alone reduces alert fatigue and focuses reliability investment where users actually feel it.

---

## The Gut-Check Before You Ship Your SLO

Before you finalize any SLO, ask your team three questions:

1. **If this SLO breaches, does someone wake up?** If no — it's not operational, it's decorative.
2. **Can we measure this today?** An SLO on data you don't have is a promissory note, not an objective.
3. **Would a 0.1% miss cause a conversation?** If everyone would shrug, the target is too loose. If everyone would panic, it's too tight.

The best SLOs sit in the uncomfortable zone — where a miss is noticeable but not catastrophic, and where staying above the line requires actual effort.

---

## Start Small, Make It Real

You don't need to SLO every service at once. Pick one critical user journey, instrument it, set a deliberately achievable target for the first 90 days, and actually respond to budget burn. Then expand.

The teams I've seen build reliable systems rarely started with perfect SLOs — they started with *honest* ones and tightened over time as they understood their system's actual behavior.

SLOs aren't a reliability feature. They're a *communication* feature. The metric tells engineers what matters; the budget tells them how much margin they have; the policy tells them what to do about it.

Get all three right and the dashboard stops being a decoration.

---

*What's your error budget policy look like? Or are your SLOs currently in a Confluence page nobody's opened since Q3? Either way — the comments are open.*
