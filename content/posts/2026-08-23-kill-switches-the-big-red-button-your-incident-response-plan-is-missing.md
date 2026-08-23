---
title: "🔴 Kill Switches: The Big Red Button Your Incident Response Plan Is Missing"
date: "2026-08-23"
excerpt: "Your runbook says 'disable the feature and investigate.' Cool — how? If the answer involves a deploy, a PR review, and a CI pipeline, you don't have a kill switch, you have a fifteen-minute delay wearing an incident-response costume."
tags:
  - security
  - incident-response
  - feature-flags
  - resilience
featured: true
---

Every incident postmortem I've ever read has some version of the same sentence: "we identified the root cause at 02:14 but couldn't mitigate until 02:31 because the fix required a deploy." Seventeen minutes doesn't sound like much until you're the one refreshing a Grafana dashboard watching error rates climb while a PR sits in a CI queue behind someone's `npm audit fix` bump.

The uncomfortable truth is that most teams have plenty of *detection*. Alerts fire, dashboards go red, Slack lights up. What's missing is a **mitigation path that doesn't route through your deploy pipeline**, because your deploy pipeline was built to ship code safely, not to stop bleeding fast. Those are different jobs with different time budgets, and treating them as the same thing is how a five-second decision turns into a fifteen-minute one.

A kill switch is the fix: a pre-built, pre-tested, boringly reliable way to turn a specific piece of behavior off — instantly, without a deploy, without a review, without anyone typing `git push`.

## Kill Switch ≠ Feature Flag (Even Though It Looks Like One)

Every team already has feature flags. The mistake is assuming they double as incident-response tooling. They mostly don't, because feature flags are optimized for gradual rollout — percentage ramps, cohort targeting, sticky bucketing — none of which matters at 2 AM when you need "OFF, everywhere, right now" and nothing else.

A kill switch is a feature flag with exactly one job and a much shorter list of requirements:

```javascript
// killSwitches.js — deliberately dumb. That's the point.
const KILL_SWITCHES = new Map();

async function isEnabled(switchName) {
  // Cached read, TTL 5s. A kill switch that takes 30s to
  // propagate isn't a kill switch, it's a suggestion.
  const cached = KILL_SWITCHES.get(switchName);
  if (cached && Date.now() - cached.fetchedAt < 5000) return cached.value;

  const value = await redis.get(`killswitch:${switchName}`);
  KILL_SWITCHES.set(switchName, { value: value !== "off", fetchedAt: Date.now() });
  return value !== "off";
}

// Usage — wraps the thing you might need to stop, not the whole request
async function chargeCard(order) {
  if (!(await isEnabled("payments.card_charging"))) {
    throw new ServiceDegradedError("card charging temporarily disabled");
  }
  return paymentProvider.charge(order);
}
```

No percentages, no cohorts, no gradual anything. One key in Redis, one `SET killswitch:payments.card_charging off`, and every instance picks it up within five seconds. That single design constraint — flip a value in a datastore your app already polls, instead of shipping new code — is what separates a real kill switch from "we'll add a config option and redeploy."

## The List of What Needs One Is Shorter Than You Think

You don't need a kill switch for everything, and trying to wrap every code path in one is how you end up with 200 flags nobody trusts and half of them stale. The candidates are the things that show up again and again in postmortems as "the thing we wished we could've just turned off":

- **Third-party integrations** — the payment gateway, the SMS provider, the fraud-scoring API. When a vendor has an outage or starts returning garbage, you want to stop calling them, not silently retry into a 500-error storm.
- **Expensive or exploitable endpoints** — bulk export, password reset, the search endpoint someone's hitting with a scraper. If it's the vector in an active abuse incident, you want to disable *that path* without taking the whole site down.
- **New code paths in their first week** — a kill switch is cheaper insurance than a rollback, and faster. If the new checkout flow starts double-charging people, "off" beats "revert, rebuild, redeploy" every time.
- **Anything with a blast radius bigger than one team can reason about at 2 AM** — background job processors, webhook delivery, anything that fans out writes across your data model.

At Cubet, we added one for outbound webhook delivery after a customer's endpoint started returning 500s in a way that made our retry logic hammer them (and, incidentally, hammer us — retry storms are symmetric like that). The postmortem action item wasn't "add smarter backoff," it was "add a switch that stops delivery to a single customer's webhook without touching anyone else's." The smarter backoff came later. The switch shipped that week, because it was ten lines of code and a Redis key.

## The Part Everyone Skips: Testing the Switch Before You Need It

A kill switch you've never flipped in anger is a hypothesis, not a control. The failure mode isn't "the switch doesn't exist," it's "the switch exists, nobody's used it since it was written eight months ago, and it turns out the code path checks a cached config value that only refreshes on deploy." You find that out during the incident, which is the single worst time to find it out.

```yaml
# .github/workflows/kill-switch-drill.yml
# Runs monthly in staging: flip every registered switch off,
# assert the fallback behavior, flip it back on, assert normal behavior.
name: Kill Switch Drill
on:
  schedule:
    - cron: "0 9 1 * *"
jobs:
  drill:
    runs-on: ubuntu-latest
    steps:
      - run: npm run drill:kill-switches -- --env=staging
      # fails the build (and pages the owning team) if any switch
      # doesn't flip within the 5s SLA, or the app doesn't degrade cleanly
```

Treat it like a fire drill because it is one. Run it somewhere that isn't production, on a schedule, unattended, and fail loudly if a switch doesn't do what it claims. The switches that get exercised monthly are the ones that actually work when someone's hand is shaking and they're `Ctrl+F`-ing a runbook for the Redis key name.

## Ship the Switch Before You Ship the Feature

The pattern that works: every new integration or high-risk endpoint gets its kill switch defined in the same PR that ships the feature — not bolted on after the first incident makes you wish you had one. It costs almost nothing at write time (a config check and a Redis key) and turns "we need to deploy a fix" into "someone with on-call access ran one command," which is the difference between a fifteen-minute outage and a ninety-second one.

If your incident runbooks say "disable X" anywhere, go check whether that's actually a button someone can press, or a polite fiction that means "open a PR, wait for CI, deploy." You'll probably find at least one. That's your first kill switch to build — this week, not during the next incident.

Got a kill switch story, a "we wish we'd had one" postmortem, or a better pattern for this? Find me on [GitHub](https://github.com/kpanuragh), [Twitter/X](https://twitter.com/anuragh_kp), or [LinkedIn](https://linkedin.com/in/anuraghkp).
