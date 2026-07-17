---
title: "Alert Fatigue: The Boy Who Cried PagerDuty 🐺"
date: "2026-07-17"
excerpt: "Your on-call rotation mutes Slack, snoozes PagerDuty, and sleeps through the 3 AM page that actually mattered. Here's why alert fatigue is a design problem, not a discipline problem — and how to fix it with math, not vibes."
tags:
  - observability
  - devops
  - monitoring
  - sre
featured: true
---

Every team has that one engineer who's stopped flinching when their phone buzzes at 3 AM. Not because they're heroic. Because their brain did the math a long time ago: 40 pages last week, 39 of them were "disk at 81%, self-resolved in six minutes." The signal-to-noise ratio collapsed months ago, and now the human pattern-matcher that used to jump out of bed just... doesn't.

This is alert fatigue, and it's not a discipline problem. Nobody needs to "care more" or "check Slack faster." It's a design problem — the same way a smoke detector that goes off every time you make toast eventually gets its battery pulled out, right before the actual fire.

## The Math Nobody Runs

Alert fatigue is really a signal detection theory problem wearing an incident-response costume. Every alerting rule makes a bet between two failure modes:

- **False positive** — paging someone for nothing
- **False negative** — staying silent during a real incident

Most teams tune purely against false negatives, because a missed outage is visible and a false positive is "just annoying." So thresholds get set nervous and low — CPU > 70%, disk > 80%, latency p99 > 200ms — and every one of those thresholds individually seems reasonable. Stack twenty of them across thirty services and you get a wall of noise that trains humans to stop reading pages carefully.

The fix isn't "be less nervous." It's separating **symptom-based alerts** (page a human) from **cause-based alerts** (write it to a dashboard, look at it during business hours). Disk at 81% is a cause. It's not an emergency until it's a symptom of something a customer feels.

```yaml
# Bad: pages on a cause, at 3 AM, for something with no user impact yet
- alert: DiskSpaceWarning
  expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.2
  for: 5m
  labels:
    severity: page

# Better: pages on the symptom, gives cause-based alerts to a ticket queue instead
- alert: DiskSpaceWarning
  expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.2
  for: 5m
  labels:
    severity: ticket   # goes to Jira/Linear, not PagerDuty

- alert: APIErrorRateHigh
  expr: sum(rate(http_requests_total{status=~"5.."}[5m]))
      / sum(rate(http_requests_total[5m])) > 0.02
  for: 5m
  labels:
    severity: page      # this one actually wakes someone up
```

At Cubet, we ran this exact audit on our alerting rules after a quarter where the on-call rotation had a 92% "no action taken" rate on pages. Ninety-two percent. We weren't monitoring the system — we were just generating anxiety with extra steps. Splitting causes from symptoms cut pages by roughly two-thirds in the first month, and the ones that remained actually meant something.

## Deduplication Is Not Optional

The second big source of fatigue is one real incident fanning out into fifteen pages because fifteen services all noticed the same downstream dependency died at once. Your database goes down, and suddenly every service with a connection pool to it fires its own "can't connect to DB" alert within the same 90 seconds. The human on-call now has fifteen tabs open trying to figure out if this is one incident or fifteen.

Most alerting pipelines (Alertmanager, PagerDuty, Opsgenie) support grouping and inhibition rules for exactly this. Use them:

```yaml
# Alertmanager: group related alerts into one notification
route:
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

inhibit_rules:
  # If the DB itself is down, suppress downstream "can't connect" alerts
  - source_matchers: ['alertname="DatabaseDown"']
    target_matchers: ['alertname="ServiceDBConnectionFailed"']
    equal: ['cluster']
```

One page that says "database down, 14 dependent services affected" is a story a human can act on immediately. Fifteen separate pages is a puzzle they have to assemble at 3 AM while still half-asleep — and the assembly work is exactly the kind of thing tired brains are worst at.

## Treat Your Alert Rules Like Code, Because They Are

The teams that actually fix this don't do it with a heroic one-time cleanup. They put alerting rules in version control, review changes in PRs, and — this is the part everyone skips — **measure the pages themselves**. Track a simple ratio over time:

```
actionable_pages / total_pages
```

If that number is below 50%, your alerting isn't protecting your system, it's protecting nobody while burning out the people who are supposed to protect it. Review it monthly. Delete rules that never fire and rules that always fire — both are useless, just in opposite directions. A rule that pages every day and gets snoozed every day isn't a safety net, it's wallpaper.

## The Takeaway

Alert fatigue isn't fixed by asking humans to care harder about noise. It's fixed by making sure everything that pages a human deserves to interrupt their sleep — and everything else goes somewhere quieter. Go pull your PagerDuty or Opsgenie history for the last 30 days right now. If more than half those pages ended in "yeah, it fixed itself," you already know exactly where to start cutting. Your on-call rotation — and your actual incidents — will thank you.
