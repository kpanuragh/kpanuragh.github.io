---
title: "🧨 PodDisruptionBudgets: The Setting That Turns a Routine Node Drain Into a 3AM Page"
date: "2026-09-01"
excerpt: "A node drain is supposed to be boring. Then someone sets minAvailable: 100% on a 2-replica deployment, and now cluster upgrades hang forever while your on-call chases a ghost. Here's how PodDisruptionBudgets actually work, and how to stop them from fighting your own maintenance."
tags: ["kubernetes", "devops", "reliability", "cloud", "sre"]
featured: true
---

Node drains are supposed to be the boring part of running Kubernetes. Cloud provider says "hey, this node needs a kernel patch," the cluster autoscaler or your upgrade tooling cordons it, evicts the pods, they reschedule somewhere healthy, node dies, nobody notices. That's the pitch, anyway.

Then one Tuesday your cluster upgrade — the one you scheduled during a quiet maintenance window specifically so nobody would notice — just... stops. `kubectl drain` hangs. The node won't cordon out. Your upgrade tooling times out after twenty minutes and leaves the cluster half-migrated. And somewhere in a `PodDisruptionBudget` object nobody has looked at since it was created eight months ago, there's a single line quietly holding your entire rollout hostage: `minAvailable: 100%`.

Welcome to the PDB landmine. Let's talk about how it gets planted, and how to defuse it before it's your on-call shift.

## What a PDB Actually Promises

A `PodDisruptionBudget` (PDB) exists to protect you from *voluntary* disruptions — node drains, cluster upgrades, `kubectl delete pod`, cluster-autoscaler scale-downs. It has no opinion on *involuntary* disruptions like a node dying unexpectedly; nothing can stop that, budget or not. The whole point is to tell Kubernetes "don't evict pods for maintenance if doing so would drop me below this threshold."

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: checkout-api-pdb
  namespace: checkout
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: checkout-api
```

That looks reasonable. It says "always keep at least 2 pods of `checkout-api` running during voluntary evictions." The trap isn't in this YAML — it's in what happens when someone later scales the deployment down to 2 replicas total and forgets the PDB exists. Now `minAvailable: 2` means **zero pods are ever evictable**. The eviction API will reject every drain attempt, forever, until either a human intervenes or a third replica shows up.

## The Percentage Trap Is Worse

Absolute numbers are at least visible in a `kubectl describe`. Percentages hide the same landmine behind math that changes as your deployment scales:

```yaml
spec:
  minAvailable: 100%
```

Someone wrote this thinking "never let this service go below full capacity during a drain" — a reasonable-sounding instinct for something critical like a payments service. What it actually means: **this PDB permits zero disruptions, period**, no matter how many replicas you're running. A node drain that touches even one pod of this deployment will hang indefinitely, because there is mathematically no way to evict a pod without violating "100% available."

I ran into a milder version of this at Cubet during a routine GKE node pool upgrade — a service someone had pinned to `minAvailable: 100%` "just to be safe" turned a 40-minute node pool rotation into a 3-hour stuck upgrade, because the automation kept retrying the same undrainable node instead of failing loudly. The fix was trivial once we found it — `maxUnavailable: 1` instead — but finding it meant digging through PDBs across a dozen namespaces while the upgrade clock kept ticking.

## Prefer maxUnavailable, and Match It to Real Replica Counts

`maxUnavailable` tends to age better than `minAvailable` because it describes disruption tolerance directly, and it doesn't silently break when someone changes the replica count:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: checkout-api-pdb
  namespace: checkout
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: checkout-api
```

With 5 replicas, this tolerates one node draining a pod at a time — slow but non-blocking. With 2 replicas, it still permits exactly one eviction, which is the difference between "drain proceeds, one pod briefly unavailable" and "drain hangs forever." The failure mode degrades gracefully instead of turning into a hard lock.

The rule of thumb that's saved me repeatedly: **for any deployment with 3 or fewer replicas, do the arithmetic by hand before setting a PDB.** `minAvailable` on a low-replica-count service is where good intentions go to become an incident. If you genuinely can't tolerate any disruption on a 2-replica service, the actual fix is running 3+ replicas, not restricting Kubernetes' ability to ever touch it.

## Catching This Before It Pages Someone

Don't wait for a stuck drain to discover a bad PDB. A quick audit script catches the worst offenders — any PDB where `minAvailable` mathematically equals or exceeds the deployment's replica count:

```bash
kubectl get pdb -A -o json | jq -r '
  .items[] |
  select(.status.disruptionsAllowed == 0) |
  "\(.metadata.namespace)/\(.metadata.name): 0 disruptions allowed"
'
```

Anything that returns from this query *right now, with no drain in progress* is a landmine sitting in your cluster. `disruptionsAllowed: 0` at rest means the very next node drain that touches those pods will stall — that's your worklist, not a hypothetical.

## The Takeaway

PDBs are one of those Kubernetes primitives that are genuinely correct in design — "protect availability during voluntary disruption" is exactly the right guarantee to want — but easy to misconfigure into their own inverse: a mechanism that protects availability so aggressively it blocks the maintenance that keeps the cluster healthy in the first place. Audit yours today, especially anything using `minAvailable` as a percentage or on a low-replica deployment. Your future on-call self will thank you the next time a routine node drain doesn't turn into a 3am page.
