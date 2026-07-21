---
title: "📈 The Autoscaler That Wouldn't: HPA Gotchas Nobody Warns You About"
date: "2026-07-21"
excerpt: "You add a HorizontalPodAutoscaler, watch the demo scale beautifully from 2 to 10 pods, and ship it. Then production traffic spikes and... nothing happens. Here's why your HPA is lying to you, and the four fixes that actually matter."
tags:
  - kubernetes
  - devops
  - platform-engineering
  - autoscaling
featured: true
---

Every Kubernetes onboarding deck has the same slide: traffic goes up, HPA notices, pods scale out, traffic goes down, pods scale back in. Smooth curve, happy graph, everyone claps. Nobody shows you the slide where the HPA sits there for six minutes doing absolutely nothing while your p99 latency climbs into the stratosphere and someone in the incident channel is typing "is autoscaling even on???"

I've now debugged that exact scenario at least four separate times, for four different reasons. None of them were "Kubernetes is broken." All of them were "the default HPA config is a trap for anyone who copy-pasted it from the docs and moved on."

## Gotcha 1: CPU is a lagging indicator, and metrics-server is slower than you think

The stock HPA setup looks like this:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: checkout-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: checkout-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

Looks reasonable. Here's the problem: `metrics-server` scrapes kubelets every 15 seconds by default, and the HPA controller only re-evaluates every 15 seconds on top of that. So from "traffic actually spikes" to "HPA decides to act," you're realistically 30-45 seconds behind reality — and that's before the new pod schedules, pulls its image, and passes its readiness probe. If your traffic spike is a payment-flow burst that lasts 90 seconds, your autoscaler finishes reacting to it right around the time it's already over.

CPU also just isn't the right signal for a lot of workloads. An API that's I/O-bound waiting on a slow downstream service can have gorgeous, healthy-looking CPU usage while its request queue is on fire. We had this exact thing happen on a service at Cubet — CPU utilization sat at a smug 35% the entire time a dependency was timing out, because the pods were mostly blocked on network calls, not computing anything. The HPA saw a bored, idle-looking deployment and never scaled a single replica.

## Gotcha 2: the default scale-down behavior fights you

Even when scale-up works, the default stabilization window for scaling down is 5 minutes, and it's greedy about it — it takes the *highest* recommendation seen in that window before scaling down. That sounds sensible until you have a genuinely spiky workload (think: cron-triggered batch jobs waking up every few minutes), where the HPA just... never scales down, because there's always been a recent-enough spike to justify staying big. You end up paying for peak capacity permanently and wondering why the node autoscaler bill doesn't match the traffic graph.

The fix is being explicit about both directions instead of trusting the defaults:

```yaml
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 120
      policies:
        - type: Percent
          value: 25
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Pods
          value: 4
          periodSeconds: 30
```

This says: scale up aggressively and immediately (no need to "confirm" a spike, just react), but scale down cautiously, shedding at most a quarter of pods per minute. Fast up, slow down — the opposite of what a lot of people accidentally configure.

## Gotcha 3: you're scaling on the wrong metric entirely

CPU and memory are what the HPA supports out of the box, but they're rarely what actually predicts load for a queue worker, a websocket gateway, or anything event-driven. If your service's real bottleneck is "messages waiting in SQS" or "open connections," scaling on CPU is just guessing.

This is where custom and external metrics come in — either via the Prometheus Adapter feeding `autoscaling/v2` external metrics, or via [KEDA](https://keda.sh), which has become the pragmatic default for anything queue-shaped:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaler
spec:
  scaleTargetRef:
    name: order-worker
  minReplicaCount: 1
  maxReplicaCount: 20
  triggers:
    - type: aws-sqs-queue
      metadata:
        queueURL: https://sqs.us-east-1.amazonaws.com/xxxx/orders
        queueLength: "5"
```

Now the scaling decision is tied to the thing you actually care about — backlog depth — instead of a CPU number that only loosely correlates with it. KEDA also scales to zero, which the stock HPA fundamentally can't do, so it's worth adopting even just for burst workers that should cost nothing at 3am.

## Gotcha 4: PodDisruptionBudgets and HPA can deadlock each other

Last one, and it's nasty because it only shows up during node maintenance. If your `minReplicas` is 2 and your `PodDisruptionBudget` requires `minAvailable: 2`, a voluntary node drain has literally no room to evict anything — the eviction request just hangs, the drain stalls, and whoever's running the maintenance is left staring at a `kubectl drain` that never finishes. The HPA and the PDB are both individually "correct," but together they've painted you into a corner. The fix is boring but necessary: keep `minReplicas` at least one higher than your PDB's `minAvailable` floor, so there's always slack for planned disruption.

## The actual takeaway

None of these are exotic. They're all things that show up the first time your autoscaler meets real, messy production traffic instead of a load-testing demo. If you're running an HPA right now, go check three things: what metric it's actually watching, whether you've customized the scale-up/scale-down behavior, and whether your PDB leaves it any room to breathe during a drain. Odds are decent at least one of those is still on the defaults — and defaults, in this case, were tuned for "don't crash the cluster," not "match your traffic pattern."

If you've been burned by an HPA gotcha that isn't on this list, I'd genuinely like to hear it — reply or open an issue, autoscaling war stories are my favorite kind of war story.
