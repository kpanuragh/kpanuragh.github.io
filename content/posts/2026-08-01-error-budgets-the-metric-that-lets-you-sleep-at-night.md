---
title: "Error Budgets: The Reliability Metric That Lets You Ship Faster 🎯"
date: "2026-08-01"
excerpt: "Everyone argues about reliability as a feeling. Error budgets turn it into a number both engineering and product can agree on — and that number, not a gut check, decides when to ship and when to stop."
tags:
  - sre
  - devops
  - reliability
  - observability
featured: true
---

Every team I've worked on has had some version of the same argument. Product wants to ship the new checkout flow this week. Platform wants to spend the week hardening the payment service after last month's wobble. Both sides have a point. Neither side has a number. So the argument gets settled by whoever's louder in the Friday planning meeting, or whoever escalates to the CTO first.

Error budgets exist to end that argument with math instead of volume.

## The Idea, Stripped Down

You pick an SLO — say, 99.9% of checkout requests succeed over a rolling 30 days. That 0.1% you're *allowed* to fail is your error budget. It's not a target. It's an allowance you're explicitly permitted to spend.

As long as you haven't burned through the budget, ship whatever you want, take risks, deploy on Fridays if you're feeling bold. The moment you exhaust it, the rules change automatically: no new features, no risky migrations, nothing but reliability work until the budget recovers.

The part people miss: the budget isn't a punishment mechanic. It's a *permission* mechanic. A team with 100% uptime and zero budget spent isn't necessarily doing great — they might be so conservative they're leaving velocity on the table. The budget says it's fine to fail sometimes, on purpose, in exchange for moving faster.

## Doing the Math Without a Whiteboard Argument

The formula is simpler than the politics around it:

```
error_budget = (1 - SLO) * total_requests
budget_remaining = error_budget - failed_requests_in_window
burn_rate = (failed_requests / total_requests) / (1 - SLO)
```

A burn rate of 1.0 means you're failing at exactly the rate your SLO allows — sustainable, if boring. A burn rate of 10 means you'll blow the entire month's budget in about three days if nothing changes. That's the number that should page someone, not "error count > threshold," which tells you nothing about whether it actually matters.

Here's roughly what that looks like as a Prometheus alerting rule, using the multi-window burn-rate approach Google's SRE workbook popularized:

```yaml
groups:
  - name: checkout-slo-burn
    rules:
      - alert: CheckoutFastBurn
        expr: |
          (
            sum(rate(checkout_requests_total{status="error"}[1h]))
            /
            sum(rate(checkout_requests_total[1h]))
          ) > (14.4 * 0.001)
        for: 2m
        labels:
          severity: page
        annotations:
          summary: "Checkout burning error budget 14x faster than sustainable"

      - alert: CheckoutSlowBurn
        expr: |
          (
            sum(rate(checkout_requests_total{status="error"}[6h]))
            /
            sum(rate(checkout_requests_total[6h]))
          ) > (6 * 0.001)
        for: 30m
        labels:
          severity: ticket
        annotations:
          summary: "Checkout burning error budget steadily — investigate, don't panic"
```

Two windows, two responses. The fast-burn rule catches the payment gateway falling over at 2 AM and pages a human immediately. The slow-burn rule catches the quieter problem — a bad deploy degrading things just enough that nobody notices for a day — and files a ticket instead of a page. Most teams that "try error budgets and give up" only wrote the first rule, got paged for slow, boring degradations that didn't need a human awake at 3 AM, and decided the whole idea was noisy.

## Where This Actually Bites: The Freeze

The mechanism that makes error budgets more than a dashboard decoration is the policy attached to hitting zero. Something like:

```yaml
# reliability-policy.yaml
service: checkout
slo_target: 0.999
window_days: 30
on_budget_exhausted:
  block_deploys: true
  exceptions:
    - security_patches
    - the_fix_for_the_thing_that_broke_the_budget
  require_approval_from: eng_director
  auto_lift_when: budget_remaining > 0.1
```

At Cubet, we wired something close to this into the deploy pipeline for a service that had been quietly eating its SLO for months without anyone formally noticing — every individual incident got its own postmortem, but nobody was tracking the *cumulative* damage across a rolling window. The first time the freeze actually blocked a merge, there was genuine friction. A product manager, reasonably, wanted to know why a fully-tested, low-risk feature couldn't ship. The answer — "because this service has failed its users more than we promised it would, and every deploy is additional risk on a system already in the red" — is a much easier sell than "trust me, it doesn't feel stable."

That's the real value. It's not that the freeze prevents bad deploys; plenty of freezes get overridden for good reason. It's that it forces the conversation to happen with a number attached instead of a vibe, and it forces reliability work to compete for calendar time on the same terms as feature work, instead of being the thing that happens "when we get around to it."

## The Traps

A few ways teams get this wrong, usually within the first quarter:

- **Setting the SLO from aspiration instead of data.** If your service has historically run at 99.5% and you set the SLO at 99.99%, you'll spend every month in freeze and everyone will learn to ignore it. Start from what you're actually delivering, then tighten gradually.
- **One SLO for everything.** A login endpoint and a nightly report-export job do not deserve the same reliability target. Budgets that are too coarse either over-constrain the boring stuff or under-protect the critical stuff.
- **No auto-recovery path.** If lifting the freeze requires a committee meeting, teams will find ways to route around the whole system. The `auto_lift_when` condition above matters as much as the freeze trigger itself.

## Try It on One Service First

Don't roll error budgets out org-wide on day one — pick the one service where the "should we ship or should we stabilize" argument happens most often, put a real SLO and a real freeze policy behind it, and let the next argument settle itself. The number won't always say what either side wants to hear, which is exactly why it's more useful than another Friday meeting.
