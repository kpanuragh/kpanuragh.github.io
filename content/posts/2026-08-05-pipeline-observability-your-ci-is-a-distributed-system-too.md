---
title: "📉 Pipeline Observability: Your CI Is a Distributed System Too"
date: "2026-08-05"
excerpt: "We instrument every microservice with traces and dashboards, then treat the CI/CD pipeline that ships them as an unobservable black box you just \\\"re-run and hope.\\\" Here's how to bring the same rigor to your pipelines — and what changed once we did."
tags: ["ci-cd", "observability", "devops", "platform-engineering", "developer-experience"]
featured: true
---

Here's a sentence that should embarrass all of us: we put OpenTelemetry on a function that runs for eight milliseconds, but the pipeline that takes fourteen minutes to build, test, and ship that function gets exactly one signal — green or red. That's it. That's the whole observability story for most CI/CD setups. A binary outcome for a process with a dozen stages, external dependencies, shared runners, and enough moving parts to qualify as its own distributed system.

I only really internalized this after a week where our deploy pipeline "got slower" and nobody could say why. Not failed — slower. Builds that used to take 6 minutes were taking 11. Engineers were annoyed, someone opened a ticket titled "CI feels sluggish," and we had precisely nothing to look at except a wall of green checkmarks with timestamps. Green checkmarks don't explain regressions. So we went and built the thing we should have had from day one: actual observability into the pipeline itself.

## Your pipeline already looks like a trace, you're just not treating it like one

Every CI run is a tree of spans. Checkout is a span. Dependency install is a span, usually with a cache-hit/cache-miss branch buried inside it. Test suite is a span with sub-spans per shard. Build, push, deploy — more spans, often on different runners with different network paths to the same artifact registry. The only thing missing is that nobody's exporting it anywhere. It just evaporates into your CI provider's log viewer, which is great for reading text and terrible for asking "which stage got slower, on which runner class, for which repo, over the last thirty days."

The fix isn't exotic. Most CI systems let you emit structured timing data per step. GitHub Actions, for instance, gives you step start/end via the API, or you can just wrap steps yourself:

```yaml
- name: Run test suite
  run: |
    START=$(date +%s%3N)
    npm test
    END=$(date +%s%3N)
    echo "step_duration_ms{step=\"test\"} $((END-START))" >> "$METRICS_FILE"
- name: Ship metrics
  if: always()
  run: |
    curl -s -X POST "$METRICS_ENDPOINT" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      --data-binary "@$METRICS_FILE"
```

That's a Prometheus-style exposition line for a single step, shipped to a pushgateway or your metrics backend of choice. Nothing clever. The cleverness is in doing it for *every* step, on *every* run, and keeping it long enough to see trends instead of single data points. One data point tells you a build took 11 minutes. Ninety days of data points tell you it's been creeping up 4% a week since someone added a new dependency that isn't cached properly — which, in our case, is exactly what had happened. A dependency got promoted from devDependency to a regular one, fell outside the lockfile-hash cache key we were using, and every single run was doing a cold `npm install` against the registry instead of restoring from cache. Nobody noticed because nobody was fired for their CI being slow, and nobody was looking at a graph — they were staring at a green checkmark that happened to take longer to appear.

## The four numbers that actually matter

You don't need a full observability platform to get 80% of the value. Track these four things per pipeline run, tagged by branch, repo, and step name:

1. **Queue time** — how long a job sat waiting for a runner before it started. This is invisible in most CI UIs and is usually the first thing that degrades when your fleet is under-provisioned. If queue time creeps up, more runners fixes it. If step *duration* creeps up, more runners does nothing, and I've watched teams throw money at the wrong problem because they didn't have this distinction.
2. **Step duration**, per step, not just total run time. Total run time hides which stage regressed.
3. **Cache hit rate** — dependency cache, Docker layer cache, test result cache, whatever you've got. A silent drop from 95% to 40% is almost always the actual root cause behind "the pipeline got slower," and it's a single number you can alert on.
4. **Retry/flake rate per step** — not per test (that's its own concern), but per pipeline step. If "deploy" needs a retry 1 in 5 times, that's a reliability signal about your deploy target, not your tests.

At Cubet, once we wired these four into a Grafana dashboard fed by the pushgateway pattern above, the cache-hit-rate graph made the regression obvious within about thirty seconds of looking at it — a cliff-edge drop exactly on the day the dependency change merged. What would've been an hour of guess-and-check archaeology through log timestamps became "oh, line went from 95 to 12, git blame that commit." That's the entire pitch for pipeline observability: it turns "CI feels slow" into "cache hit rate dropped on step X after commit Y," which is a ticket you can actually close.

## Traces, not just metrics, once you outgrow the dashboard

Metrics get you the "what" and "when." For the "why," some teams go a step further and emit actual OpenTelemetry spans for pipeline runs, with the whole run as a root span and each step as a child — then ship it to whatever trace backend already ingests your application traces. Buildkite, CircleCI, and GitLab all have some flavor of this either natively or via community exporters; GitHub Actions needs a bit of DIY glue, but it's the same wrapping-each-step trick, just emitting spans instead of gauge lines.

The payoff is that a genuinely gnarly pipeline problem — say, deploy step latency that only shows up when a specific upstream artifact registry is under load — becomes waterfall-visualizable instead of something you reconstruct from six different log tabs open in six browser windows at 2am.

## Where to start if you have none of this

Don't boil the ocean. Pick your single slowest or flakiest pipeline, instrument just its steps with timing, ship it somewhere you can graph over time — even a spreadsheet beats nothing for week one — and watch it for two weeks before you touch a single config. You will almost certainly find that the "slow pipeline" complaint is actually "one specific step is slow and everything after it is fine," and that's a completely different fix than "add more runners" or "rewrite the whole CI config," which is usually where people jump first out of frustration.

CI/CD is infrastructure your whole team depends on multiple times a day. It deserves the same instrumentation discipline you'd demand of a production service — because functionally, that's exactly what it is.

If your pipeline dashboards currently consist of "did it turn green," today's a fine day to add one metric. Start with cache hit rate. It's the cheapest signal to add and, in my experience, the one most likely to catch the regression before someone has to file a ticket about vibes.
