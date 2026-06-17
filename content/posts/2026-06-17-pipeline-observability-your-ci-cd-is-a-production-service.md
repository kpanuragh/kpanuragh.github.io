---
title: "Pipeline Observability: Your CI/CD Is a Production Service (Treat It Like One) 🔭"
date: "2026-06-17"
excerpt: "Your CI/CD pipeline ships every feature, hotfix, and rollback your team will ever do. But most teams monitor it with vibes and Slack notifications. Here's how to actually observe your pipeline."
tags:
  - devops
  - ci-cd
  - observability
  - github-actions
  - platform-engineering
featured: true
---

Here's an uncomfortable truth: the CI/CD pipeline is the most critical piece of infrastructure your team operates, and it's almost certainly the *least* monitored one.

Your API has dashboards. Your database has alerts. Your pipeline? You check it when someone complains that "builds are slow today." That's not observability — that's archaeology.

At Cubet, we had a pipeline that would silently bloat from 8 minutes to 22 minutes over the course of three weeks. Nobody noticed until a production hotfix sat in queue for half an hour during an incident. That was the day we started treating CI/CD like a production service.

## What "Pipeline Observability" Actually Means

Observability for CI/CD isn't "turn on build logs." Logs are the last resort. Real pipeline observability means you can answer these questions from a dashboard *without* clicking into individual build runs:

- **What's our P95 build duration this week, vs last week?**
- **Which jobs are flaky** (fail > 5% of runs on the same commit)?
- **What's the queue wait time** before a runner picks up work?
- **What's the deploy frequency and change failure rate** (your DORA metrics)?
- **Which PRs are aging in queue** because a required check keeps timing out?

If you can't answer those in under 30 seconds, your pipeline is a black box.

## The Metrics That Actually Matter

Before you reach for tooling, know what to collect. These four categories cover 90% of actionable insight:

**1. Duration metrics** — `job_duration_seconds` per job name, per branch type (main vs PR). Histograms, not averages. P99 build time tells you a very different story than mean build time.

**2. Outcome metrics** — `job_result{result="success|failure|cancelled"}`. Track *flakiness* separately from *genuine failures*: a test that fails one in ten runs on the same code is a flaky test, not a bug.

**3. Queue metrics** — time between `queued_at` and `started_at`. This is often the silent killer. Your jobs take 6 minutes, but runners are busy and jobs wait 10 minutes first. Nobody sees this without instrumentation.

**4. Throughput metrics** — deployments per day, change failure rate, mean time to restore. These are your DORA metrics and they're the board-level view of pipeline health.

## Instrumenting GitHub Actions with OpenTelemetry

GitHub Actions doesn't expose OTEL traces natively, but you can get pretty far with a few patterns. The key is treating your workflow file as code that emits telemetry.

Here's a reusable step that posts job timing to a metrics endpoint on completion:

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Record job start
        run: echo "JOB_START=$(date +%s)" >> "$GITHUB_ENV"

      - name: Run tests
        id: tests
        run: npm test

      - name: Emit pipeline metrics
        if: always()   # runs even on failure
        env:
          METRICS_TOKEN: ${{ secrets.METRICS_WRITE_TOKEN }}
        run: |
          JOB_END=$(date +%s)
          DURATION=$((JOB_END - JOB_START))
          STATUS="${{ steps.tests.outcome }}"   # success | failure | cancelled

          curl -sf -X POST "${{ vars.METRICS_ENDPOINT }}/pipeline" \
            -H "Authorization: Bearer $METRICS_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
              "job": "test",
              "repo": "${{ github.repository }}",
              "branch": "${{ github.ref_name }}",
              "run_id": "${{ github.run_id }}",
              "duration_seconds": '"$DURATION"',
              "status": "'"$STATUS"'",
              "queue_seconds": ${{ github.event.workflow_run.timing.queue_duration || 0 }}
            }'
```

You can ship this data to anything — a Prometheus pushgateway, Datadog, Grafana Cloud, or a simple SQLite database with a Grafana frontend if you're keeping it lean.

## Detecting Flaky Tests Before They Rot Your Culture

Flaky tests are a morale tax. Every engineer who reruns a build "just to see if it passes" is spending trust on your pipeline — trust that doesn't regenerate automatically.

Here's a dead-simple flakiness detector using the GitHub API. Run it as a nightly workflow:

```python
# scripts/detect_flaky_jobs.py
import os, json
from collections import defaultdict
import urllib.request

REPO = os.environ["GITHUB_REPOSITORY"]
TOKEN = os.environ["GITHUB_TOKEN"]

def gh_get(path):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"}
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

# Grab last 100 workflow runs on main
runs = gh_get(f"/repos/{REPO}/actions/runs?branch=main&per_page=100")["workflow_runs"]

job_outcomes = defaultdict(list)
for run in runs:
    jobs = gh_get(f"/repos/{REPO}/actions/runs/{run['id']}/jobs")["jobs"]
    for job in jobs:
        if job["conclusion"] in ("success", "failure"):
            job_outcomes[job["name"]].append(job["conclusion"])

print("=== Flaky Job Report ===")
for name, outcomes in job_outcomes.items():
    total = len(outcomes)
    failures = outcomes.count("failure")
    rate = failures / total
    if 0.05 < rate < 0.5:   # 5-50% failure = flaky (not broken)
        print(f"  FLAKY  {name}: {rate:.0%} failure rate ({failures}/{total} runs)")
    elif rate >= 0.5:
        print(f"  BROKEN {name}: {rate:.0%} failure rate — investigate immediately")
```

Run this nightly and post the output to a Slack channel. The first time it fires you will discover jobs that have been silently flaky for months.

## The Dashboard You Actually Need

Stop building dashboards from scratch. Here's the minimum viable setup:

1. **Grafana + Prometheus** (or Grafana Cloud free tier) — scrape a pushgateway that your workflow steps push to.
2. **Three panels on the homepage:**
   - P50/P95/P99 build duration per job (last 7 days, compared to prior 7 days)
   - Failure rate by job, last 30 days
   - Queue wait time trend
3. **One alert:** P95 build time on `main` increases by more than 20% week-over-week. This catches creeping slowdowns before they become emergencies.

At Cubet, adding these three panels surfaced something embarrassing immediately: our `lint` job was consistently the slowest step in the pipeline — slower than the full test suite — because nobody had noticed the ESLint config had grown to check 40,000 lines on every PR. Thirty minutes of refactoring later, the job went from 7 minutes to 45 seconds.

## The Mindset Shift

The biggest obstacle to pipeline observability isn't tooling — it's the assumption that pipelines are infrastructure rather than software. Nobody thinks twice about adding request latency dashboards to an API. But the pipeline that *deploys* that API runs uninstrumented.

Flip the mental model: your CI/CD pipeline has SLOs too. Maybe it's "P95 PR build under 10 minutes" and "deploy to production under 5 minutes post-merge." Define them, measure them, alert on them.

When pipelines are observable, two things happen almost immediately: slow jobs get fixed (because now you can see them), and engineers stop reflexively hitting "re-run" on flaky jobs (because now you can prove the flakiness and fix the root cause).

The pipeline is your deployment path to production. You wouldn't run production blind. Don't run your pipeline blind either.

---

**Where to start:** Add an `if: always()` step to your most-used workflow that logs job duration and outcome somewhere queryable. Even a GitHub Gist updated by a curl call is better than nothing. Once the data exists, the dashboards follow naturally.

What does your pipeline's P95 build time look like right now? If you don't know, that's the first metric to instrument.
