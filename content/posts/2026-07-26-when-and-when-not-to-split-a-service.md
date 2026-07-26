---
title: "When (and When NOT) to Split a Service 🪓"
date: 2026-07-26
excerpt: "Splitting a service is a one-way door that trades a bad afternoon debugging a stack trace for a bad week debugging a distributed system. Here's how to tell the difference between a real signal and a whiteboard fantasy."
tags:
  - backend
  - architecture
  - microservices
  - distributed-systems
  - design-patterns
featured: true
---

Every few months, someone on a team opens a PR that adds a new folder called `services/`, and by Friday there's a diagram with boxes, arrows, and a message queue nobody asked for. The stated reason is usually "separation of concerns." The real reason, if you squint, is that splitting a service *feels* like progress. It's concrete. It's a decision you can point to in a retro. Refactoring the tangled 400-line controller nobody wants to touch is not nearly as satisfying.

I've been on both sides of this. I've split services that should have stayed put, and I've watched teams stall for a year debating a split that was obviously overdue. The annoying truth is that the right call almost never comes from a gut feeling about "clean architecture" — it comes from a small number of boring, measurable signals. Let's go through them.

## The question nobody asks first: what does the split actually cost?

Before any conversation about *why* to split, you need to be honest about the toll it takes. A function call becomes a network call. A network call can time out, retry, and fail partially in ways a function call never does. A single SQL transaction across two tables becomes two transactions across two databases, which means you now need to think about the [outbox pattern](/blog/outbox-pattern-reliable-event-publishing) or sagas just to keep data consistent. Your one deploy pipeline becomes two, with two sets of secrets, two on-call rotations to eventually staff, and a new failure mode: the two services disagreeing about the shape of the contract between them.

None of that is fatal. But it is a real, ongoing tax — paid by every engineer who touches the system, forever, whether or not the split was worth it. So the bar for splitting shouldn't be "this would be cleaner." It should be "we are actively paying a cost right now that a split removes, and that cost is bigger than the tax."

## Signals that actually justify a split

**Independent scaling need, with real numbers behind it.** Not "this could get big someday" — an actual, current mismatch. If your image-resizing endpoint burns 10x the CPU of everything else in the monolith and you're scaling ten replicas of the whole app just to keep that one path warm, you're paying real money for coupling that buys you nothing.

**Deployment cadence is genuinely blocked.** If the payments team needs to ship a fix twice a day and it's stuck behind a release train gated by the catalog team's flaky end-to-end suite, that's not a style preference, that's a throughput problem with a name.

**Data ownership has already split, informally.** If nobody outside the `orders` module is supposed to touch the orders tables, and everyone already respects that in practice, a service boundary just makes an existing boundary enforceable instead of aspirational — a much smaller leap than it looks like on paper.

**Blast radius needs a wall.** A memory leak in a background job shouldn't be able to take down the checkout API. If two workloads have wildly different reliability requirements and they currently share a process, you're one bad deploy away from an incident report you didn't need to write.

## Signals that are lying to you

**"It'll be cleaner."** Cleanliness is a code organization problem. You can enforce module boundaries inside a single deployable with linting and ownership rules — no network hop required. If the actual complaint is "people keep importing things they shouldn't," the fix is a lint rule, not a Helm chart.

**Team topology, alone.** Conway's Law is real, but "we have two teams" isn't the same as "we have two independently deployable domains." I've seen orgs split a service purely to match an org chart, only to end up with two teams that still have to coordinate every release because the domains were never actually separable — now they coordinate over a network boundary instead of a pull request, which is strictly worse.

**Resume-driven architecture.** I'm not going to pretend this doesn't happen. Microservices are a more interesting line item than "maintained a monolith," and that pull is real even when nobody says it out loud. It's worth naming in a design review, because it's the one motivation that never survives being said aloud.

**A slow test suite.** This is almost always a testing problem wearing an architecture costume. Splitting a service to make CI faster is like moving houses because you can't find your keys — technically you'll stop losing them in that house, but you've paid a huge price to dodge a small fix (parallelize your suite, cut integration tests down to the boundary, cache aggressively).

## A decision check that's saved me from bad splits

Before greenlighting a split at Cubet, I make the team answer this out loud, in the design doc, not just in the meeting:

```text
1. What specific, measured cost are we paying today because
   this code lives in the monolith? (not hypothetical)
2. Does the data for this domain already have a clean seam,
   or will we be inventing one under time pressure?
3. Who owns the on-call burden for the new service, starting
   the week it ships — not "eventually," this week?
4. If we're wrong, what does rolling this back look like?
```

Question four is the one people skip, and it's the one that matters most. Splitting a monolith is easy. Un-splitting two services that have each grown their own data model, their own auth quirks, and their own on-call rotation is a multi-quarter project that nobody schedules — it just becomes permanent because reversing it is too expensive to justify on its own. Every split is a one-way door dressed up as a two-way one. Walk through it because you measured the cost of staying, not because the diagram looked nicer with more boxes.

## If you're not sure, don't

The safest default when the signals are mixed is to stay a monolith and enforce boundaries with tooling instead of infrastructure. You can always split later, once the seams are proven by real usage instead of guessed at on a whiteboard. Splitting early costs you the same distributed-systems tax whether or not you needed it — the only difference is whether you got anything in return.

Next time someone proposes a new `-service` in your architecture review, ask them to point at the specific cost it removes. If the answer is a feeling instead of a number, that's your answer too.
