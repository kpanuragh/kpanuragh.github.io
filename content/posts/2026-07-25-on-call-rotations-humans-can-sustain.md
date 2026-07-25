---
title: "On-Call Rotations Humans Can Sustain (Not Just Survive) 🌙"
date: "2026-07-25"
excerpt: "Most on-call rotations are designed for coverage, not for the humans covering them. Here's how to build a rotation that doesn't quietly burn through your best engineers one 3 AM page at a time."
tags:
  - sre
  - devops
  - reliability
  - on-call
featured: true
---

Every on-call schedule I've ever inherited was built the same way: someone opened a spreadsheet, listed the engineers, and dragged a "primary" and "secondary" column across the next twelve weeks. Coverage: solved. Humans: not consulted.

Then six months later, your best engineer quietly starts interviewing elsewhere, and nobody connects it to the fact that they've been paged at 2 AM on four of the last six Tuesdays. On-call burnout doesn't show up as a dramatic resignation letter. It shows up as someone getting slightly worse at their job, slightly less willing to volunteer for the hard project, slightly more likely to say "not my problem" — and then, eventually, gone.

Rotations don't fail because people are soft. They fail because they're designed for coverage math, not human math.

## Coverage Math vs. Human Math

Coverage math asks: "who's awake to answer a page at any given minute?" That's the easy part — you can solve it with a calendar and enough engineers.

Human math asks a much harder question: "how many consecutive nights of broken sleep can this person absorb before their judgment, their patience, and eventually their health start degrading — and how do we make sure nobody quietly hits that number alone?"

Most orgs never write down an answer to the second question. So it gets answered implicitly, by whoever burns out first.

A few numbers that actually matter and rarely get tracked:

- **Pages per shift, not just pages per week.** A rotation with 3 pages/week sounds fine until you learn they all land on the same person's Saturday night, every fourth week, like clockwork.
- **Time-to-acknowledge creep.** If your median ack time is drifting upward, that's not people getting lazy — it's people getting numb, or exhausted, or both.
- **Shift-to-shift recovery gap.** Was there at least 24 hours of daytime, no-pager time between "I was up all night" and "I'm on call again"?

At Cubet, we started pulling these three numbers into a monthly review alongside the usual incident metrics. The first month we did it, one engineer had absorbed 60% of all pages across the quarter — not because of a rotation bug, but because they were the only one who knew the payments service well enough to be trusted with it. The schedule was "fair" by the spreadsheet. It was not fair by any measure that matters.

## Fix #1: Rotate the Knowledge, Not Just the Pager

You can't sustainably rotate on-call for a system only one person understands. That's not a scheduling problem, it's a bus-factor problem wearing a scheduling costume. If pages for a service always escalate to the same name, the fix isn't "be more disciplined about the rotation" — it's pairing that person with a shadow on their next few shifts until someone else can hold the pager without a Slack DM lifeline.

## Fix #2: Design the Handoff, Not Just the Shift

A rotation that just swaps who's holding the pager at midnight is missing the actual expensive part: context transfer. A five-minute async handoff note saves the incoming engineer from re-discovering context the outgoing one already has.

```yaml
# .github/oncall-handoff-template.yml
handoff:
  outgoing: "@priya"
  incoming: "@devon"
  open_items:
    - service: checkout-api
      status: "p2 latency alert flapping since 14:00 UTC, not yet root-caused"
      link: "https://runbook.internal/checkout-latency-2026-07-25"
    - service: payments-webhook
      status: "deploy freeze until 09:00 UTC — vendor maintenance window"
  known_noisy_alerts:
    - "disk-usage-warn on ingest-3, self-resolves, ticket filed: OPS-4821"
  escalation_contact: "@priya (backup) until 06:00 UTC"
```

It's a small template, but the habit it forces is the real value: nobody starts a shift blind, and nobody hands off a mess without naming it.

## Fix #3: Cap the Blast Radius of a Bad Night

You cannot eliminate bad nights. You can cap what a bad night is allowed to cost the next day. The simplest version: if someone gets paged between midnight and 6 AM, their next working day starts later, no questions asked, no calendar Tetris required to make it socially acceptable.

```
# PagerDuty escalation policy snippet — auto-flag for recovery time
rules:
  - if: page_acknowledged_hour BETWEEN 00:00 AND 06:00
    then:
      - tag_incident: "night-page"
      - notify: manager_of(responder)
      - action: "suggest_calendar_block(responder, next_day_morning)"
```

This isn't about being soft on incidents. It's about recognizing that a sleep-deprived engineer making a 9 AM architecture decision is a worse outcome than that same engineer making the same decision at 1 PM after actual rest.

## Fix #4: Pay for the Pager, Literally or Otherwise

If on-call carries zero compensation — no stipend, no comp time, no acknowledgment beyond "it's part of the job" — you're telling engineers that disrupted sleep has no value to the company. They will believe you, and they will act accordingly, usually by leaving for a team that pays for the pager. This doesn't have to be complicated: a flat stipend per rotation week, or guaranteed comp time after a night page, both work. What doesn't work is pretending the 3 AM page costs nothing.

## The Rotation Is a Product, Not a Chore

Treat your on-call schedule the way you'd treat any other system with a failure mode: instrument it, review the metrics monthly, and change it when the data says it's hurting someone. A rotation nobody complains about isn't necessarily a good rotation — sometimes it just means the people getting hurt by it have stopped bothering to say so.

Go pull your pages-per-person numbers for the last quarter right now. If one name shows up more than twice as often as everyone else's, you don't have a coverage gap — you have a burnout timer, and it's already running.
