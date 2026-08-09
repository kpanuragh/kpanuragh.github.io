---
title: "🗂️ Toolchain Consolidation: The Tab Graveyard Nobody Audits"
date: "2026-08-09"
excerpt: "Every platform team accumulates tools the way a garage accumulates half-used paint cans — one purchase at a time, each one reasonable, until nobody can tell you which three actually matter. Consolidation isn't a procurement exercise. It's a deletion exercise."
tags:
  - devops
  - platform-engineering
  - developer-experience
  - tooling
featured: true
---

Open a new engineer's laptop on day one and count the tabs they need before they can ship a line of code. CI dashboard. Deploy dashboard. A separate incident tool. A separate on-call tool that isn't the incident tool. A secrets manager UI. A feature-flag UI. Two different internal docs sites, because the migration to the new one never finished. A Slack app that duplicates half of what the incident tool already does, badly.

Nobody sat down and designed that. It happened one Tuesday at a time — a team adopted a tool to solve a real, narrow problem, and never revisited whether it was still the right tool once three other things changed underneath it. Multiply that by a few years and a few reorgs, and you get what every platform team eventually inherits: a toolchain that's technically working and practically incomprehensible.

## The Cost Isn't Licensing, It's Context

The instinct when someone says "we have too many tools" is to go looking for the finance angle — cancel unused SaaS seats, consolidate contracts. That's real money, but it's not the expensive part. The expensive part is cognitive: every extra tool in the golden path is a place a new hire gets stuck, a place an on-call engineer has to remember a second login during an incident, a place your internal docs go stale because now there are two "getting started" guides instead of one.

I saw this concretely on a platform team at Cubet a while back. We ran a fifteen-minute audit: for every tool in our internal wiki's "developer tools" page, ask two questions — *when did someone last onboard using this without help*, and *is there another tool on this list that does the same job*. Out of around twenty-two entries, six had no clear owner, four were redundant with something else on the list, and two hadn't been touched by anyone but the person who set them up. That's not a tooling strategy. That's an archaeological dig.

## Consolidation Is a Deletion Exercise, Not a Selection Exercise

The natural move when tooling feels sprawling is to go shopping for the One Platform To Rule Them All — an internal developer portal, a unified CI/CD suite, whatever the vendor pitch calls it this year. Sometimes that's right. But buying a consolidator on top of an unaudited pile of tools just adds a layer; you now have the old sprawl *plus* a dashboard that promises to abstract it, and in six months engineers are back to using the old tools because the new one doesn't cover the one weird case their team relies on.

The audit has to come first, and it has to be willing to say "delete this" about things people are still quietly using out of habit. A rough scoring pass works better than a debate:

```yaml
# tool-audit.yaml — one entry per internal tool, scored by three people independently
- name: legacy-deploy-dashboard
  last_onboarded_without_help: "8 months ago"
  overlaps_with: [ci-dashboard]
  unique_capability: none
  verdict: sunset

- name: feature-flag-service
  last_onboarded_without_help: "this week"
  overlaps_with: []
  unique_capability: "per-tenant rollout, nothing else does this"
  verdict: keep

- name: internal-docs-v1
  last_onboarded_without_help: "unknown"
  overlaps_with: [internal-docs-v2]
  unique_capability: none
  verdict: sunset
```

`unique_capability: none` is the tell. If a tool's only reason to exist is "it's what we've always used," it's a deletion candidate, full stop — the migration pain is a one-time cost, and the tool tax is recurring.

## Golden Paths Beat Golden Portals

The consolidation that actually sticks isn't "buy one platform for everything." It's picking, for each *job to be done*, exactly one blessed way to do it, documenting that path loudly, and being ruthless about not letting a second way grow back next to it. Deploy has one path. Secrets have one path. Feature flags have one path. If a team needs something the golden path doesn't cover, that's a signal to extend the path, not to spin up a parallel tool for just their use case — because "just for our use case" is exactly how you end up with six things doing the same job for six different teams.

The uncomfortable part is that this requires someone with the authority to say no to a team that wants to bring in their favorite tool from a previous job, even when the tool is genuinely good. Good-but-redundant is still a tax on everyone else's context window.

## Start With the Wiki Page, Not the Budget

You don't need a platform re-architecture to start. Pull up whatever list of internal tools your org already half-maintains, and run the three-column audit above against every entry: last onboarded without help, overlaps with, unique capability. Anything that scores `none` on unique capability and has an overlap is your first deletion candidate — not your first purchase.

The goal isn't fewer line items on a vendor invoice. It's a new hire who can ship on day one without a scavenger hunt through six half-abandoned dashboards to find the one that still works.
