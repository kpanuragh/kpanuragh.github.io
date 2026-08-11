---
title: "🚧 Pod Disruption Budgets: The YAML That Stands Between You and a 3AM Page"
date: "2026-08-11"
excerpt: "Node upgrades and cluster autoscaler scale-downs are supposed to be boring. Without a PodDisruptionBudget, Kubernetes is happy to evict every replica of your app at once to get there. Here's how PDBs actually work, where they quietly do nothing, and the mistakes that turn a routine drain into an incident."
tags: ["kubernetes", "reliability", "devops", "platform-engineering", "sre"]
featured: true
---

Somewhere in your cluster right now, a `Deployment` with three replicas is running on three different nodes, and you're trusting that Kubernetes will never take down all three at the same time. That trust is not backed by anything unless you've told it otherwise. `kubectl drain` doesn't ask your app for permission — it evicts pods to clear a node, and by default it's perfectly willing to empty every node your app lives on in the same five minutes if that's how the scheduler laid things out.

This is the gap a `PodDisruptionBudget` (PDB) closes. It's one of those objects that's three lines of YAML, does almost nothing in the happy path, and then quietly saves you the one time a node drain, a cluster autoscaler scale-down, or a Kubernetes version upgrade lines up badly with your deployment topology.

## Voluntary vs involuntary — the distinction that actually matters

Kubernetes splits pod disruptions into two buckets, and a PDB only has a say in one of them.

**Involuntary disruptions** — a node's kernel panics, the underlying VM gets reclaimed by the cloud provider, someone `rm -rf`'d the wrong thing — PDBs cannot prevent these. Nothing asks permission when hardware dies.

**Voluntary disruptions** — `kubectl drain`, the cluster autoscaler consolidating underutilized nodes, a managed Kubernetes control plane rotating node pools during a version upgrade — these all go through the Eviction API, and the Eviction API checks your PDB before acting. This is the entire value proposition: PDBs protect you from Kubernetes' own routine maintenance, not from disasters.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: checkout-api-pdb
  namespace: payments
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: checkout-api
```

With `minAvailable: 2` on a 3-replica deployment, the eviction API will let a drain take one pod at a time, wait for a replacement to become Ready, and only then allow the next eviction. Try to evict a second pod while you're already down to 2 available, and the API server returns `429 Too Many Requests` — the drain just stalls on that pod until capacity recovers. That stall is the feature working correctly, not a bug. It's also the part people find surprising in production: a node drain that "hangs" isn't broken, it's respecting the budget you set.

## `minAvailable` vs `maxUnavailable` — pick the one that scales with you

Both fields do variations of the same job, and the difference matters more once your replica count changes over time (hello, HPA).

```yaml
# fixed floor — good for a small, stable replica count
spec:
  minAvailable: 2

# proportional — good when HPA scales you between, say, 4 and 40 replicas
spec:
  maxUnavailable: 25%
```

`minAvailable: 2` on a fleet that autoscales from 4 pods to 40 during peak traffic means during peak you're allowed to lose 38 pods at once — technically compliant, practically useless. `maxUnavailable: 25%` scales with you: 1 pod out of 4, or 10 pods out of 40. For anything sitting behind an HPA, percentage-based budgets age a lot better than a number you picked while staring at today's replica count.

## The single-replica trap

The mistake I see most — including one I made myself early on while helping a team at Cubet migrate a batch of internal services onto a shared cluster — is writing `minAvailable: 1` on something that only ever runs 1 replica.

```yaml
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: internal-reporting-worker  # replicas: 1
```

`minAvailable: 1` on a 1-replica workload means the Eviction API can never legally evict that pod voluntarily — "available" would drop to 0, which violates the budget. In practice this doesn't make your pod immortal; it just means the *voluntary* path is permanently blocked, so a node drain either hangs on it forever or the node gets force-drained anyway after a timeout, and now you've had an ungraceful kill instead of a clean one. If a workload genuinely can't tolerate any downtime, the fix is more replicas, not a stricter PDB — a budget can't manufacture availability that doesn't exist. If it genuinely can tolerate brief downtime, `maxUnavailable: 1` (rather than `minAvailable`) at least lets the eviction proceed.

## Checking who's actually covered

PDBs are opt-in per workload via label selector, which means it's trivially easy to have gaps you don't notice until an upgrade goes sideways. Before your next cluster version bump, it's worth a quick audit:

```bash
kubectl get deploy -A -o json | jq -r '.items[] | .metadata.namespace + "/" + .metadata.name' > all-deploys.txt
kubectl get pdb -A -o json | jq -r '.items[] | .spec.selector.matchLabels | to_entries[] | .value' | sort -u
```

Cross-reference the two and you'll usually find at least one namespace — often something unglamorous like a metrics exporter or a cron-adjacent worker — that nobody bothered to protect because it "doesn't really matter." Right up until it's the one dependency three other services quietly call synchronously.

## The takeaway

A PodDisruptionBudget doesn't make your app more available — it just tells Kubernetes' own maintenance machinery how much unavailability you're willing to tolerate on purpose, so a routine node drain or autoscaler consolidation doesn't accidentally become an incident. Fifteen minutes auditing PDB coverage against your actual replica counts and HPA ranges, before your next cluster upgrade, is a lot cheaper than debugging a stalled drain — or worse, an outage — while it's happening.

Go check: does your production Deployment have a PDB, and does the number in it still make sense for how many replicas you actually run today?
