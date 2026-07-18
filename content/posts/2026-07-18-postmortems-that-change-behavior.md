---
title: "Post-Mortems That Change Behavior (Not Just Get Filed) 📜"
date: "2026-07-18"
excerpt: "Most post-mortem docs get written, get a thumbs-up emoji in Slack, and then get buried in a wiki nobody opens again. Here's how to write the kind that actually changes what your team does next Tuesday."
tags:
  - devops
  - reliability
  - sre
  - incident-management
featured: true
---

Every team I've worked with has a post-mortem template. Nice headers, a timeline table, a "root cause" section, maybe even a blameless-culture disclaimer at the top. And every team I've worked with has a graveyard of these documents — dozens of them, beautifully formatted, sitting in Confluence or Notion, having changed exactly nothing about how the system actually runs.

The document isn't the point. The document is a receipt. If nothing in your system, your process, or your defaults is different a month later, you didn't do a post-mortem — you did creative writing about an outage.

## The Tell: Action Items That Are Just Vibes

Open any post-mortem's "action items" section and you'll usually find sentences like:

- "Improve monitoring for this service"
- "Add more tests around the payment flow"
- "Document the failover procedure"
- "Team to be more careful with config changes"

Every one of these is unfalsifiable. Nobody can prove they didn't "improve monitoring" — there's no line where it becomes true. Six months later you can point at the same outage class recurring and someone will say "well, we did improve monitoring, just not for *that*." The action item was written to close the incident review meeting, not to close a gap.

Contrast that with an action item that has teeth:

```yaml
# Bad — unfalsifiable, no owner accountability, no deadline
- "Improve monitoring for checkout-service"

# Good — specific, testable, owned, time-boxed
- title: "Alert on checkout-service p99 > 800ms sustained 3m"
  owner: "@priya"
  due: "2026-07-25"
  verify: "Trigger synthetic slow-dependency in staging, confirm page fires within 4m"
  blocks_next_deploy: true
```

The `verify` field is the part almost everyone skips, and it's the only part that matters. An action item without a verification step is a hope, not a fix. If you can't describe how you'd prove it worked, you don't actually know what "done" looks like — you just know what "closed" looks like, and those are different things.

## Root Cause Is a Trap — Ask for the Chain

The single biggest failure mode in post-mortems isn't laziness, it's stopping at the first plausible-sounding cause. "The database connection pool was exhausted" feels like an answer. It's actually the second sentence of a five-sentence story.

At Cubet, we switched our incident review template from a "Root Cause" field to a "Contributing Factors" list built with five-whys, and the difference in output quality was immediate — not because the technique is magic, but because a single field invites a single answer, and a list invites you to keep going until you run out of real ones.

```
Why did checkout-service 500 for 12 minutes?
→ DB connection pool exhausted

Why was the pool exhausted?
→ A retry storm from the inventory-service client during a slow query

Why did retries turn into a storm instead of backing off?
→ Retry logic used fixed-interval retry, no jitter, no circuit breaker

Why did nobody notice the slow query for 6 minutes before the storm started?
→ Query latency wasn't in the default dashboard, only total request count

Why wasn't it in the default dashboard?
→ Dashboard was scaffolded from a template built before this endpoint existed,
  and nobody owns "does this dashboard still match the code"
```

That last line is the actual finding. "Add jitter to retries" is a real fix and it'll happen — but the thing that will actually change behavior is the answer to "nobody owns dashboard drift," because that gap will produce a different outage next quarter if you leave it alone. Stopping at "exhausted connection pool, added a circuit breaker" fixes this incident and leaves the organizational gap fully loaded for the next one.

## The Follow-Up Nobody Schedules

Here's the part that separates teams that improve from teams that just accumulate documents: a scheduled re-read.

Every action item gets a due date, sure. But almost nobody schedules the *second* meeting — the one 30 or 60 days later where someone actually opens the doc again and asks "did the thing we said would prevent this, prevent this?" Not "did we close the Jira ticket" — did the actual behavior in production change.

This doesn't need to be fancy. A recurring calendar reminder tied to the incident ticket, or a bot that reopens the doc and pings the owner, is enough:

```yaml
# .github/workflows/postmortem-followup.yml (simplified)
on:
  schedule:
    - cron: "0 9 * * 1"  # every Monday
jobs:
  check-followups:
    steps:
      - name: Find postmortems with due action items this week
        run: |
          gh issue list --label postmortem-action --search "due:<=$(date -d '+7 days' +%F)" \
            --json number,title,assignees
      - name: Comment reminder on unresolved items
        run: gh issue comment $ITEM --body "Verification due — has this been confirmed in prod?"
```

The mechanism matters less than the guarantee. If there's no forcing function, "we'll revisit this" quietly becomes "we filed it," and filing isn't fixing.

## Blameless Doesn't Mean Toothless

There's a common overcorrection where "blameless" gets read as "nobody's actions are examined." That's not what blameless means — it means you examine the actions of the *system*, including the humans in it, without treating any individual as the failure mode. "The on-call engineer didn't know the runbook existed" is a perfectly legitimate, perfectly blameless finding. The fix isn't "yell at the engineer," it's "runbooks aren't discoverable during an incident, fix the discovery path." You can be specific about what a person did or didn't do while still aiming every fix at the process that put them in that position.

I've seen post-mortems get so allergic to naming specifics that they end up vague to the point of uselessness — "communication could have been better" instead of "the person paged didn't know who owned the upstream service and spent 8 minutes finding out." The second version is still blameless. It's also actually actionable, because now you know the fix is a service-ownership directory, not a vibe.

## What Actually Changes Behavior

If you want fewer post-mortems that die in a wiki, change three things about the template:

1. Every action item gets an owner, a due date, and a `verify` step describing how you'll know it worked — not "assigned," "done."
2. Ask "why" until the answer is organizational, not just technical. The technical fix ships fast; the organizational gap is what recurs.
3. Schedule the re-read. Thirty to sixty days out, someone reopens the doc and checks whether the world actually changed.

None of this requires new tooling budget or a platform team. It requires treating the document as a contract with a due date instead of a ritual with a deadline. Next incident review, try adding just the `verify` field to your action items and see how many of them turn out to be un-verifiable as written — that gap is usually where the real work was hiding.
