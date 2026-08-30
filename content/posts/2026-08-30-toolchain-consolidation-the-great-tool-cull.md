---
title: "🧹 Toolchain Consolidation: Marie Kondo-ing Your CI Pipeline"
date: "2026-08-30"
excerpt: "Somewhere between the third linter and the second internal CLI wrapper, your platform team stopped building a toolchain and started curating a museum. Here's how we cut a 23-tool pipeline down to 9, why nobody missed the other 14, and the one tool we cut that we very much regretted."
tags: ["devops", "developer-experience", "ci-cd", "platform-engineering"]
featured: true
---

Every toolchain starts small. One linter, one test runner, one deploy script. Then someone joins from a company that swore by a different formatter, someone else needs a "quick" bash wrapper around `kubectl` because typing namespaces is hard, and eighteen months later your `package.json` has four tools that all claim to do "code quality" and nobody can explain the difference between them without opening a Slack thread from 2024.

I inherited a pipeline like this a while back. Not a bad pipeline — every single tool in it was a reasonable choice on the day someone added it. The problem was nobody ever asked the second question: does this still need to exist? Tools don't get deprecated by decision, they get deprecated by neglect, and neglect is a much slower and more expensive process than just deleting the thing.

## The Audit Nobody Wants to Run

The first step wasn't technical, it was archaeological. We grepped every CI config, every pre-commit hook, every "helper" script in `scripts/`, and built a spreadsheet: tool name, what it claims to do, who last touched its config, and — the column that did all the work — how many minutes it adds to a clean CI run.

```bash
# quick and dirty: total wall-clock per CI step, sorted worst first
gh run view "$RUN_ID" --json jobs \
  | jq -r '.jobs[].steps[] | "\(.conclusion)\t\(.number)\t\(.name)"' \
  | while read -r status num name; do
      started=$(gh api "/repos/$REPO/actions/jobs/$JOB_ID" --jq '.steps['"$num"'-1].started_at')
      completed=$(gh api "/repos/$REPO/actions/jobs/$JOB_ID" --jq '.steps['"$num"'-1].completed_at')
      echo "$name: $(( $(date -d "$completed" +%s) - $(date -d "$started" +%s) ))s"
    done | sort -t: -k2 -rn
```

The results were humbling. We had three tools doing dependency vulnerability scanning — one from a security mandate two reorgs ago, one that came bundled with a GitHub Action someone copy-pasted, and one that a contractor set up and then left. All three ran on every PR. All three occasionally disagreed with each other, which meant engineers had learned to just... ignore all three, because arguing with three different bots about the same CVE is nobody's idea of a good Tuesday.

## The Cull

We didn't try to pick "the best" tool for each category in one sitting — that turns into a six-week bikeshed. Instead we used a blunter rule: if two tools overlap by more than 70%, the one with fewer active maintainers on the team loses, full stop, no appeal. It felt almost too simple, but simple rules are the only kind that survive contact with a room full of engineers who all have a favorite linter.

What actually got cut:

- Two of the three vulnerability scanners (kept the one with actual triage workflows wired to Jira, not just a red X on the PR).
- A homegrown "deploy helper" CLI that wrapped `kubectl` and `helm` in ways nobody remembered the reasons for. Turned out `helm` alone did 90% of it.
- A separate changelog generator, because our commit convention already fed one via `semantic-release` — we were running two tools to produce one artifact.
- An internal Backstage-adjacent service catalog that had one page nobody updated since its creator left.

We went from 23 distinct tools invoked somewhere in CI/CD to 9. Median PR time-to-green dropped by about 40%, mostly from removing redundant network calls to registries and scanners that were fetching the same metadata three different ways.

## The One We Regretted

Not every cut was a clean win. We killed a small internal tool that auto-tagged Slack threads with the relevant on-call rotation based on which service a deploy touched. It looked like classic "nobody uses this" clutter — low usage numbers, no docs, one contributor. Two months later, during an actual incident, the on-call engineer spent nine minutes figuring out who owned the service that broke, because the tagging that used to do that automatically was gone and the team directory it replaced had rotted in the meantime. We rebuilt it in an afternoon, properly documented this time, but it was a good reminder that usage metrics measure *frequency*, not *value* — a tool that fires twice a month during incidents will always look unused right up until the month it saves you.

At Cubet, we now run a lightweight version of that audit spreadsheet every quarter rather than waiting for the pipeline to visibly rot again — it's a recurring calendar invite, not a heroic one-time cleanup, and that alone has kept the tool count from creeping back past a dozen.

## The Actual Lesson

Toolchain sprawl isn't a tooling problem, it's an ownership problem. Every tool that lacks a name next to it in "who owns this" is a tool that will outlive its usefulness, because removing something with no owner requires someone to volunteer for the political cost of deleting a colleague's old project. Give every tool in your pipeline an owner and an expiration review date when you add it, and you'll never need a dramatic 23-to-9 cull again — you'll just have a pipeline that quietly stays honest.

If your CI config is longer than the application code it's testing, it might be time to run your own audit. Go find the tool nobody remembers adding. I promise it's in there.
