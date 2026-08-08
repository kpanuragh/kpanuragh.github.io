---
title: "🧯 Toil Budgets: The SRE Metric Nobody Tracks (And The One That Actually Prevents Burnout)"
date: "2026-08-08"
excerpt: "Your error budget says the service is healthy. Your team is still exhausted. That gap exists because error budgets measure what breaks, not what people spend their week doing by hand — and toil doesn't show up on either dashboard until someone quits."
tags:
  - sre
  - devops
  - reliability
  - platform-engineering
featured: true
---

A service I inherited a while back had a beautiful error budget. Green for months. 99.95% against a 99.9% SLO, comfortable margin, nobody blocking deploys, nothing to see on the dashboard. And the two engineers who kept it that green were quietly burning out, because staying green meant one of them manually rotating a batch of expiring certs every Monday, another manually re-triggering a flaky nightly job every single night before bed, and a rotating cast of "quick favor, can you just SSH in and restart the thing" pings that never made it into any sprint.

None of that shows up in an error budget. Error budgets measure failure. They say nothing about the human labor spent *preventing* failure through repetitive manual effort. That's a different problem, and Google's SRE book actually named it decades ago: **toil**.

## Toil Isn't Just "Work You Don't Like"

Toil has a specific definition, and it's worth being precise about it, because "toil" gets used as a synonym for "annoying work" and that's not the same thing:

- **Manual** — a human has to do it, not a system
- **Repetitive** — you've done this exact thing before, and will again
- **Automatable** — a machine could do it if someone built the automation
- **Tactical** — reactive, interrupt-driven, not strategic
- **No enduring value** — the system is the same after as before; you just prevented decay

Writing a design doc is work, but it's not toil — it has enduring value. Restarting the same flaky pod for the fortieth time by hand is toil, textbook. The distinction matters because you can't error-budget your way out of toil. A service can have a perfect SLO and a team that's one bad week from quitting, and the error budget will never tell you.

## The 50% Rule, and Why It Needs Its Own Budget

The SRE book's guidance is that operational toil shouldn't exceed roughly 50% of an SRE's time — the rest goes to engineering work that actually reduces future toil or improves the system. Most teams nod at that number and then never measure against it, because unlike error budgets, nothing pages you when toil creeps up. It just shows up later, as attrition, or as "why does everything take three sprints now."

So treat it the same way you'd treat an error budget: pick a number, measure against it, and let crossing the line trigger a real consequence — not a vibe.

A cheap way to start, before building anything fancy, is just tagging time in whatever you already use for tickets:

```yaml
# toil-policy.yaml
team: platform-core
toil_budget_pct: 30          # max share of sprint capacity
measurement_window: 2_sprints
tag: "toil"                   # applied to tickets/incidents in tracker
on_budget_exceeded:
  block_new_toil_requests: true
  mandatory_automation_slot: true   # next sprint reserves capacity to kill the top offender
  escalate_to: eng_manager
```

The mechanism is the same shape as an error-budget freeze — crossing the line changes what the team is allowed to say yes to. The difference is what triggers it: not failed requests, but hours spent doing things a computer should be doing.

Measuring it doesn't require new tooling if your ticket tracker already has labels. A rough weekly pull looks like this:

```bash
#!/usr/bin/env bash
# toil-report.sh — % of closed tickets tagged "toil" in the last 14 days
TOTAL=$(linear-cli issues list --team platform-core --closed-since 14d --count)
TOIL=$(linear-cli issues list --team platform-core --closed-since 14d --label toil --count)

python3 -c "
total, toil = $TOTAL, $TOIL
pct = (toil / total * 100) if total else 0
print(f'Toil: {toil}/{total} tickets ({pct:.1f}%)')
if pct > 30:
    print('OVER BUDGET — reserve next sprint capacity for automation')
"
```

It's not elegant. It doesn't need to be. The point isn't precision, it's visibility — the same reason a rough error budget beats no error budget.

## The Part People Get Wrong

The freeze isn't the valuable part — reallocating capacity is. When we ran something like this at Cubet on a team drowning in manual environment provisioning requests, the toil percentage crossing 30% for two sprints in a row is what finally got a Terraform module funded for self-service environments instead of "we'll get to it eventually." The number turned "I'm tired of doing this by hand" — which is easy to wave off as one engineer having a bad month — into "this team is structurally over capacity," which is much harder to deprioritize in planning.

A few ways this goes sideways if you're not careful:

- **Counting all ops work as toil.** Incident response for a genuine, novel outage isn't toil — it's the job. Toil is the *repeated*, *manual*, *already-solved-in-principle* stuff.
- **Measuring without a release valve.** If crossing the budget doesn't actually free up engineering time to automate, you've just built a more precise way to watch people burn out.
- **Letting it become a blame metric.** The goal is "this system generates too much manual work," not "this engineer isn't automating fast enough." Point it at the system.

## Start Small

You don't need a toil taxonomy or a company-wide rollout. Tag toil on one team's tickets for two sprints, run the ten-line script above, and see what number comes back. If it's north of 40%, you've found your next automation project without anyone having to argue for it in a planning meeting — the number already made the case.
