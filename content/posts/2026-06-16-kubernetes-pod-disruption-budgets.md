---
title: "🛡️ Pod Disruption Budgets: Stop Letting Node Drains Wreck Your Uptime"
date: "2026-06-16"
excerpt: "You have 3 replicas. You feel safe. Then a node drain kills all 3 at once and your on-call phone lights up. Pod Disruption Budgets are the one YAML block that stands between you and that midnight page."
tags:
  - kubernetes
  - devops
  - reliability
  - platform-engineering
  - k8s
featured: true
---

You have three replicas of your API. You read the docs. You did the right thing. Redundancy! High availability! You feel good about yourself.

Then someone runs `kubectl drain` on a node during a cluster upgrade, and all three pods happen to live on that one node. Kubernetes evicts them simultaneously. Your API goes dark for 90 seconds. Your monitoring screams. The group chat is not kind.

Welcome to the Pod Disruption Budget gap — the thing everyone skips until it bites them in production.

## Replicas ≠ Availability During Disruptions

Here is the mental model most people have: *more replicas = more availability*. That is true for random pod crashes. It is only *sometimes* true for voluntary disruptions.

Kubernetes distinguishes between two kinds of disruption:

**Involuntary** — a node dies, OOM kills a pod, a hardware failure. You cannot predict these. Replica count and PodAntiAffinity are your tools here.

**Voluntary** — a human or automation decides to evict pods: `kubectl drain`, a cluster upgrade rolling nodes, a Cluster Autoscaler scale-down, a node maintenance window. These are *controlled* events. Kubernetes will happily honor your drain request and take down every pod on that node — including all three replicas of your API if they all landed there — unless you tell it otherwise.

Pod Disruption Budgets (PDBs) are your way of telling Kubernetes: *"during voluntary disruptions, respect this availability floor."*

## What a PDB Actually Does

A PDB is a policy object that the Kubernetes eviction API checks before evicting a pod. If evicting the pod would violate the budget, the eviction is rejected. The draining node has to wait. The Cluster Autoscaler backs off. Your service stays up.

You define the budget in one of two ways:

**`minAvailable`** — at least this many pods must be running at all times.

**`maxUnavailable`** — at most this many pods can be down at once.

Pick one. Never both. Here is the canonical example:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
  namespace: production
spec:
  minAvailable: 2          # always keep at least 2 pods running
  selector:
    matchLabels:
      app: my-api
```

With three replicas and `minAvailable: 2`, Kubernetes can only evict one pod at a time during a drain. The second eviction has to wait until the first pod is rescheduled and passes readiness checks. Your API stays at ≥ 2/3 capacity throughout the entire node drain.

You can also use percentages, which scales better as your replica count grows:

```yaml
spec:
  minAvailable: "80%"
  selector:
    matchLabels:
      app: my-api
```

## The Gotcha That Will Get You

PDBs protect you during drains. They can *also block you forever* if you configure them wrong — and this is where teams panic.

**Scenario**: you set `minAvailable: 3` and you only have 3 replicas. Now `kubectl drain` cannot evict a single pod because doing so would drop you to 2, violating the budget. The drain hangs indefinitely. Your cluster upgrade is stuck. You are Googling "how to force evict pod" at 11pm.

```yaml
# This will deadlock your drain if replicas == 3
spec:
  minAvailable: 3   # ← never set this equal to your replica count
```

The fix: `minAvailable` must always be strictly less than your replica count, or use `maxUnavailable: 1` which is naturally bounded.

At Cubet Techno Labs, we hit this during our first GKE node pool upgrade. The upgrade automation drained the nodes one by one, hit a PDB that someone had copy-pasted without adjusting the replica count, and stalled for 45 minutes before we noticed. The fix was a one-line change to the PDB — but the lesson stuck. We now lint PDBs in CI against the replica count of the matching deployment before they land in the cluster.

## Combining PDBs with PodAntiAffinity

A PDB tells Kubernetes *how much disruption is allowed*. Pod Anti-Affinity tells Kubernetes *where to spread pods*. They solve different problems and you want both.

Without anti-affinity, your scheduler might place all three replicas on the same node — making your PDB irrelevant during a single-node drain (Kubernetes can only evict one at a time, but if they are all on the same node, you are down to zero while waiting for reschedules).

```yaml
# In your Deployment spec.template.spec:
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: my-api
          topologyKey: kubernetes.io/hostname
```

Use `preferredDuring...` rather than `requiredDuring...` unless you have more nodes than replicas — the required version will block scheduling if there are not enough nodes to spread across, which is its own incident waiting to happen.

## What About Stateful Workloads?

StatefulSets benefit from PDBs even more than Deployments. Evicting a database primary without a PDB in place can cause an unplanned failover. If your StatefulSet manages a quorum-based system (etcd, Zookeeper, Kafka, Elasticsearch), losing the majority of pods simultaneously is catastrophic.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: kafka-pdb
spec:
  maxUnavailable: 1        # only one broker offline at a time
  selector:
    matchLabels:
      app: kafka
```

For a 3-broker Kafka cluster this keeps quorum intact during any voluntary disruption. Always.

## Quick Checklist Before Your Next Cluster Upgrade

1. **Do you have PDBs for every critical workload?** `kubectl get pdb -A` — if that list is empty, you are flying blind.
2. **Is `minAvailable` < replica count?** Run: `kubectl get pdb,deploy -n <ns>` side by side and compare.
3. **Do your pods have anti-affinity rules?** Check that replicas are not stacking on a single node with `kubectl get pods -o wide`.
4. **Are you using percentage-based budgets?** They age better as you scale up and down.
5. **Have you tested a drain recently?** `kubectl drain <node> --ignore-daemonsets --dry-run=client` will show you what *would* be evicted.

## The Five-Minute Fix

If your cluster has zero PDBs right now, start here — one YAML block per critical service, applied before your next maintenance window:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ service-name }}-pdb
  namespace: production
spec:
  maxUnavailable: 1
  selector:
    matchLabels:
      app: {{ service-name }}
```

`maxUnavailable: 1` is the safest default. It works regardless of replica count (as long as count > 1), scales naturally, and does not require you to do math when you change replica counts.

---

Pod Disruption Budgets are one of those Kubernetes features that feel optional right up until the moment they are absolutely critical. The good news: they are two minutes to write, apply instantly with `kubectl apply`, and require zero restarts. There is no reason not to have them.

Add PDB creation to your service scaffolding template today — alongside the Deployment and Service. Future-you, the one getting paged at midnight during a cluster upgrade, will be grateful.

Now go run `kubectl get pdb -A` and see what you find. I will wait.
