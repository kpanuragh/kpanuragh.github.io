---
title: "💸 FinOps for Engineers: You Don't Need a Finance Degree, You Need a `git blame` for Money"
date: "2026-08-14"
excerpt: "Finance sends you a spreadsheet with a red number on it once a quarter and calls that FinOps. Real FinOps is an engineering discipline — cost as a first-class signal next to latency and error rate. Here's how to practice it without attending a single budget meeting."
tags: ["finops", "cloud-cost", "devops", "cloud", "platform-engineering"]
featured: true
---

Every quarter, the same ritual plays out. Finance exports a spreadsheet from the billing console, highlights the biggest number in red, and drops it in a Slack channel with "can engineering explain this?" Engineering opens the spreadsheet, sees a services-by-cost table with names like `prod-eks-cluster-3` and `rds-shared-2`, and has absolutely no idea which team, which feature, or which forgotten cron job is responsible. Everyone stares at the number for ten minutes, someone promises to "look into it," and the spreadsheet gets closed until next quarter.

That ritual is not FinOps. That's an autopsy. FinOps — done right — is what happens *before* the spreadsheet exists: cost treated as a metric you watch the same way you watch p99 latency, not a mystery you solve retroactively with a finance person who has never seen your architecture diagram.

## The framing that actually works

Finance thinks in dollars per month. Engineers think in requests, replicas, and gigabytes. The bridge between those two worlds is **unit cost** — cost per something that scales with your business, not cost per calendar period.

"Our AWS bill grew 40% this quarter" is a finance sentence and it's almost useless on its own — of course it grew, you shipped three features and doubled traffic. "Our cost per 1,000 API requests grew 40% this quarter, and traffic only grew 12%" is an engineering sentence. That's a regression. That's something you can actually go fix, because now it looks exactly like a performance regression — because it is one, just measured in dollars instead of milliseconds.

```
cost_per_unit = total_service_spend / business_metric

# examples that actually mean something
cost_per_1k_requests = ecs_spend / (requests / 1000)
cost_per_active_user = total_infra_spend / monthly_active_users
cost_per_build_minute = ci_runner_spend / total_build_minutes
```

Once you have a unit cost, cost stops being a finance artifact and becomes a dashboard panel next to your SLOs. It should alert the same way. "Cost per request is up 3x week-over-week" deserves a page just as much as "error rate is up 3x," because more often than not, they're the same incident — someone shipped a retry loop with no backoff, or a query without an index that's now doing ten times the compute per request.

## Tagging is the tax you pay to ever answer "who owns this"

None of the unit-cost math above works if you can't attribute spend to a team, service, or feature. This is the least glamorous part of FinOps and the part that determines whether any of it is possible at all. If your cloud resources aren't tagged consistently, every cost conversation degenerates into "well, it's probably the ML team's cluster" guesswork.

The fix isn't a finance policy, it's a CI gate:

```yaml
# terraform validate step in CI — fails the plan if required tags are missing
- name: Enforce cost allocation tags
  run: |
    terraform plan -out=tfplan
    terraform show -json tfplan | jq -e '
      .resource_changes[]
      | select(.change.actions[] != "delete")
      | select(.change.after.tags == null
          or (.change.after.tags | has("team") | not)
          or (.change.after.tags | has("service") | not))
    ' && { echo "Missing team/service tags"; exit 1; } || true
```

I've seen this exact gate save a team weeks of forensic spreadsheet work. At Cubet, we added a tag-enforcement step to the Terraform pipeline after a cost review where roughly 30% of our AWS spend sat in an "Untagged" bucket that nobody could confidently attribute to anything. Six months after adding the gate, that bucket was under 2%. Not because anyone got better at remembering — because the pipeline refused to apply the plan otherwise.

## Rightsizing is a code review comment, not a finance recommendation

The other half of engineer-driven FinOps is treating "is this instance/pod oversized" as a normal code review question, the same way you'd flag an N+1 query. Cloud providers hand you the data for free — most teams just never look at it.

```bash
# quick sanity check: are requested resources anywhere near actual usage?
kubectl top pods -n payments --containers | sort -k3 -h

# compare against what's requested
kubectl get pods -n payments -o json | \
  jq -r '.items[].spec.containers[] | "\(.name) requests.cpu=\(.resources.requests.cpu // "none")"'
```

The pattern I run into constantly: a service gets `requests.cpu: 2` and `requests.memory: 4Gi` set once, during initial launch, out of caution — then never revisited. Two years later it's still requesting the same 2 vCPUs while actually using 200m, because nobody wanted to be the person who "broke prod by shrinking the pod." Multiply that by fifty services across a cluster and you're paying for an entire phantom cluster that does nothing but sit idle and reserve capacity you never use.

The engineer-native fix isn't a finance mandate to "reduce spend by 15%" — it's adding resource utilization to the same PR checklist you already use for test coverage. If a service has run at under 20% of its CPU request for 30 days, that's not a finance problem, that's a stale config, exactly like an unused feature flag or a dependency nobody's updated.

## What actually makes this stick

None of this requires a FinOps certification or a seat in the quarterly budget meeting. It requires three habits:

1. **Unit costs on the same dashboard as your SLOs**, so a cost regression looks and feels like a performance regression, because functionally it is one.
2. **Tagging enforced in CI**, not requested nicely in a wiki page nobody reads, so attribution is never a mystery.
3. **Resource requests reviewed on a cadence**, the same way you'd review a flaky test, so "we set this two years ago and forgot" stops being the default state of your cluster.

Do those three things and the quarterly spreadsheet ritual mostly disappears — not because spend goes to zero, but because by the time finance opens the billing console, engineering already knows exactly which commit caused the bump and has either fixed it or can explain why it was worth it.

If your last cost conversation involved someone forwarding you a screenshot of a billing dashboard and asking "does this look right to you?" — that's your signal. Go add a cost panel next to your latency graphs before the next one lands in your inbox.
