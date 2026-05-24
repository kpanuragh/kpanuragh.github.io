---
title: "🔍 Blameless Postmortems: Stop Hunting Witches, Start Fixing Systems"
date: "2026-05-24"
excerpt: "When production burns down, the instinct is to find who lit the match. But the engineers who build the most resilient systems have learned to ask a different question: what in our system made this possible?"
tags:
  - security
  - incident-response
  - devops
  - engineering-culture
  - postmortem
featured: true
---

# 🔍 Blameless Postmortems: Stop Hunting Witches, Start Fixing Systems

It's 2:47 AM. Pagerduty is screaming. Slack is a wall of red alerts. Your CTO has just joined the incident channel (never a good sign). And somewhere in the chaos, a deploy went out three hours ago that nobody remembers approving.

Production is down. Users are angry. And when the dust finally settles at 6 AM — someone is going to ask the question that ruins careers: **"Who did this?"**

Here's the thing. That question is the wrong question. And if you're asking it, you're building a brittle organization, not a resilient one.

## The Witch Hunt Loop

The traditional post-incident review goes like this:

1. Incident happens
2. Find the person who made the last change
3. Blame them (explicitly or implicitly)
4. They write an apology doc
5. Nothing structural changes
6. Same incident happens again in six months, starring a different engineer

This is the **blame loop**, and it's how organizations stay permanently fragile. When engineers fear blame, they stop experimenting, stop taking risks, start covering their tracks, and start under-reporting near-misses. You lose the very signal you need to prevent the *next* incident.

At Cubet, we had a painful lesson early on in a microservices migration. A junior engineer pushed a config change that took down our payment service for 40 minutes. The instinct was to ask "why didn't they test this?" — but when we actually dug in, we found: no staging environment mirrored prod, the config schema had no validation, and the deploy pipeline had zero canary checks. That engineer did what the system *allowed* them to do. The system was the bug.

## What Blameless Actually Means

"Blameless" doesn't mean "no accountability." It means **accountability flows to systems, processes, and decisions — not to individuals.**

The key mental shift: assume that every engineer involved was acting rationally with the information and tools available to them at the time. Your job in a postmortem isn't to judge whether their decision was "dumb." Your job is to figure out *why a rational person made that call* — and then fix the system so the next rational person doesn't end up in the same trap.

Google's SRE book calls this the **"safe space to fail"** principle. Netflix built their entire chaos engineering culture on it. The organizations with the best uptime are the ones where engineers can say "I broke prod" without hiding under their desks.

## The Anatomy of a Good Postmortem

A solid blameless postmortem has five sections and zero finger-pointing:

**1. Incident Summary**  
What happened, when, how long it lasted, and the business impact. Keep it factual.

**2. Timeline**  
A chronological reconstruction of events. This is harder than it sounds — you're stitching together logs, alerts, Slack messages, and human memory. Tools like PagerDuty, Datadog, or even a shared incident doc help. The goal is a shared understanding of reality, not a narrative that makes anyone look bad.

**3. Root Cause Analysis**  
Use the **5 Whys** technique. Not "who" — *why*. Keep asking why until you hit a systemic answer.

```
Why did the API go down?
→ A config change removed a required environment variable.

Why could a config change remove a required variable?
→ There was no schema validation on the config file.

Why was there no schema validation?
→ The service was bootstrapped quickly and validation was "added to the backlog."

Why did it deploy without catching the missing variable?
→ The CI pipeline didn't include a startup smoke test.

Why didn't anyone catch it in review?
→ The PR had 47 files changed; nobody actually read the config diff.
```

That last "why" tells you everything. The fix isn't "review PRs better." The fix is: split large PRs, add config schema validation, add a smoke test. Systemic. Actionable.

**4. What Went Well**  
This section gets skipped constantly, and it's a mistake. Incidents always have heroes — the on-call engineer who found the rollback in three minutes, the monitoring that fired within 30 seconds, the runbook that was actually up to date. Reinforce these things so they survive.

**5. Action Items**  
Every item needs an **owner**, a **due date**, and a **severity level**. "We should probably improve our alerting someday" is not an action item. "Alice will add a startup probe to the payment service by 2026-05-31" is.

```yaml
# action-items.yml — yes, we track these in version control
action_items:
  - id: PIR-2026-05-24-001
    title: Add JSON Schema validation to all service configs
    owner: "@alice"
    due: "2026-05-31"
    severity: high
    linked_incident: "INC-2891"

  - id: PIR-2026-05-24-002
    title: Add startup smoke test to payment service CI pipeline
    owner: "@bob"
    due: "2026-06-07"
    severity: critical
    linked_incident: "INC-2891"
```

Tracking action items in version control is a minor touch with a major effect: engineers can grep for "TODO PIR" and see open items across incidents. It also makes it embarrassingly visible when items sit undone for months.

## The Postmortem Doc Template

Here's the bare-minimum template we use at Cubet — start here and evolve it:

```markdown
## Incident: [Short Description]
**Date:** YYYY-MM-DD  
**Duration:** X hours Y minutes  
**Severity:** P1 / P2 / P3  
**Status:** Resolved

### Summary
[2-3 sentences. What broke, what the impact was, how it was resolved.]

### Timeline (all times UTC)
| Time  | Event |
|-------|-------|
| 02:47 | Alert fired: payment service 5xx rate > 10% |
| 02:51 | On-call acknowledged |
| 03:22 | Root cause identified: missing env var |
| 03:28 | Rollback deployed, service recovered |

### Root Cause
[5 Whys analysis here]

### What Went Well
- Monitoring fired within 4 minutes of the issue starting
- Rollback procedure was documented and worked first try

### Action Items
| ID | Description | Owner | Due |
|----|-------------|-------|-----|
| 001 | Add config schema validation | @alice | 2026-05-31 |
```

## The Culture Is the Hard Part

The template is easy. The culture is not.

Engineers will only be honest in postmortems if leadership demonstrates — repeatedly, consistently — that honesty doesn't get you fired. This means managers shouldn't *attend* postmortems as authority figures; they should attend as learners. It means never publicly shaming someone for an incident, even casually. It means celebrating engineers who escalate near-misses *before* they become incidents.

The first time you run a blameless postmortem after a big outage and nobody gets chewed out, people will be suspicious. The second time, they'll be relieved. By the fifth time, they'll be the ones pushing for more thorough analysis because they've seen it actually change things.

That's the point. Not just better incident docs. Better systems. Built by engineers who feel safe enough to tell you what's actually broken.

## TL;DR

- Blame finds a person. Blameless reviews find a system.
- Use 5 Whys, stop at structural answers.
- Action items need owners and due dates — or they don't exist.
- The culture matters more than the template.

The next time prod goes down at 3 AM, resist the urge to find the arsonist. Find the fire hazard. Then fix it before someone else walks into it.

---

*Got thoughts on how your team runs postmortems? I'm always comparing notes — find me on [Twitter/X](https://twitter.com/kpanuragh) or [LinkedIn](https://linkedin.com/in/kpanuragh). And if you want to see what we're building at Cubet, check out the blog for more.*
