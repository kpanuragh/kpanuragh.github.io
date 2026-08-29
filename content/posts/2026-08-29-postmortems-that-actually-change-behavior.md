---
title: "🪦 Post-Mortems That Actually Change Behavior (Not Just Change the Wiki)"
date: "2026-08-29"
excerpt: "Most post-mortems die the moment the doc gets approved. Here's how to write ones that produce a different Tuesday six months later — with action items that are actually enforceable, not just well-intentioned."
tags: ["devops", "reliability", "incident-management", "sre", "culture"]
featured: true
---

Every team has a post-mortem graveyard. It's usually a Confluence space or a `docs/incidents/` folder with forty beautifully formatted documents, each one blameless, each one full of timelines and root-cause diagrams, and each one almost entirely disconnected from anything that changed afterward. You can tell it's a graveyard because the same root cause shows up in incident #12 and incident #31, eighteen months apart, with two different authors independently rediscovering "we should probably add a timeout there."

The document isn't the deliverable. The document is a receipt. The deliverable is a different Tuesday, six months from now, where the thing that broke can't break the same way again — or breaks in a way that's boring instead of a page at 3am.

## Why post-mortems die

Post-mortems fail for a boring, structural reason: the incentives around *writing* one are strong (leadership wants closure, the doc is a visible artifact of "we take this seriously") and the incentives around *following through* are weak (the action items compete with every other roadmap item, and nobody's job is to make sure they land). So you get a beautifully blameless five-page write-up with an action items table at the bottom, and that table becomes a to-do list that nobody owns.

The tell is always the same: open the action items section of an old incident doc and count how many rows say "investigate," "consider," or "explore." Those aren't action items. Those are hopes.

```md
## Action Items (the graveyard version)

- [ ] Investigate adding a circuit breaker to the payments client
- [ ] Consider alerting on p99 latency, not just error rate
- [ ] Explore whether the retry logic is too aggressive
```

Nothing in that table has an owner, a date, or a definition of done. Six months later it's still open, or it's been silently closed because someone did a related-but-different thing and nobody checked whether it actually addressed the root cause.

## Make the action item impossible to skip

The fix isn't a better template — it's making the follow-through structurally enforced instead of socially hoped for. Three things I've seen actually move the needle, both back at Acodez early in my career and more recently leading incident response at Cubet:

**1. Every action item is either a ticket with an owner and a due date, or it doesn't exist.** Not "we should look into X" — a Jira/Linear ticket, assigned, in the current or next sprint, linked back to the incident. If nobody can own it this quarter, it's not a real action item, it's a wishlist entry, and you should say so instead of pretending.

**2. Action items get reviewed at the *next* incident review meeting, not filed and forgotten.** We added a five-minute standing agenda item: "open action items from the last three incidents — status?" It's uncomfortable the first few times someone has to say "still not started." That discomfort is the point — it's cheaper than the repeat incident.

**3. At least one action item per incident should make the failure structurally harder to reproduce, not just easier to detect.** Alerting on the symptom again is fine as a stopgap, but if every action item is "add a dashboard" or "add an alert," you're just building a faster way to find out you're still broken.

## A pattern worth stealing: the "prevention class," not the fix

Instead of fixing the one bug, name the *class* of bug and ask what would prevent the whole class. If a deploy without a health check took down a service, the fix isn't "add a health check to service X" — it's "no deploy pipeline can promote to prod without a passing health check gate," enforced in CI, not in a runbook someone has to remember to follow.

```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    needs: [health-check-gate]   # deploy job literally cannot run without this
    steps:
      - run: ./scripts/wait-for-healthy.sh --timeout=120
```

That one line does more than any paragraph in a post-mortem, because it removes the failure mode from the set of things a human has to remember not to do. The best action items graduate from "a person should remember this" to "the system won't let this happen" — moving the check from a runbook into CI, an admission controller, or a linter is worth ten well-written paragraphs of prose.

## The metric that actually matters

Stop measuring post-mortem quality by page count or how blameless the tone is (both matter, but they're not the point). Measure it by **repeat-incident rate**: how often does the same root-cause category show up again within, say, twelve months? If you don't currently tag incidents by root-cause category, that's the actual first action item to take from this post — you can't tell if post-mortems are working if you can't detect the repeat.

We started doing this at Cubet after noticing three separate "ran out of DB connections under load" incidents that each got their own blameless doc and their own bespoke fix, none of which addressed the shared cause: no connection pool ceiling tied to actual instance limits. The fourth time it *didn't* happen was the first real signal the post-mortem process was working — not the quality of the document, the absence of the document.

## Try this next incident

Pick your last post-mortem with an open action item and ask three questions: does it have an owner, does it have a due date, and does it prevent a *class* of failure or just the one instance? If the answer to any of those is no, that's not a finished post-mortem — it's a well-written obituary. Fix the ticket, not the prose, and check back on it in the next incident review. That's the whole trick.
