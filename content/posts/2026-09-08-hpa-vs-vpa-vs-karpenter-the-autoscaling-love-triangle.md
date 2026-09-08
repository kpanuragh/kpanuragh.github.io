---
title: "📈 HPA vs VPA vs Karpenter: Kubernetes' Awkward Autoscaling Love Triangle"
date: "2026-09-08"
excerpt: "Three different things in your cluster all claim to be \"the autoscaler,\" and if you don't understand who's actually in charge, they will fight each other in production while your pods get evicted at 2am."
tags:
  - kubernetes
  - devops
  - autoscaling
  - cloud
  - infrastructure
featured: true
---

# 📈 HPA vs VPA vs Karpenter: Kubernetes' Awkward Autoscaling Love Triangle

Somewhere in your cluster right now there are probably two or three things that all think their job is "make sure we have enough capacity." None of them are talking to each other. None of them know the other exists. And if you've wired them up wrong, they're currently locked in a slow-motion tug-of-war that looks, from the outside, like your app is just "a bit flaky under load."

I learned this the fun way at Cubet, watching a Grafana dashboard where pod count and pod memory limits were both changing every few minutes, in opposite directions, for no reason anyone in the incident channel could explain. Turned out the reason was very simple: we had three autoscalers, and none of them had been introduced to each other.

So let's actually sort out who does what, because "just turn on autoscaling" is doing a lot of heavy lifting in most onboarding docs.

## HPA: more copies of the same thing

The Horizontal Pod Autoscaler is the one everyone meets first. It watches a metric - usually CPU, sometimes memory or something custom from Prometheus - and adjusts `replicas` up or down to keep that metric near a target.

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
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

HPA's whole worldview is: your app is stateless, one pod is basically identical to another pod, and the fix for "too much load" is "more pods, please." It doesn't touch how big each pod is. It just multiplies.

## VPA: a bigger version of the same thing

The Vertical Pod Autoscaler takes the opposite bet. Instead of adding pods, it watches actual usage over time and rewrites the CPU/memory requests and limits on your pod spec, so each individual pod is sized correctly instead of guessed-at by whoever wrote the YAML during onboarding three years ago.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: checkout-api-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: checkout-api
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        minAllowed:
          cpu: 100m
        maxAllowed:
          cpu: 2
          memory: 4Gi
```

This is genuinely great for stateful, hard-to-replicate, or single-instance-per-something workloads where "just add more pods" isn't really an option. The catch: in `Auto` mode, VPA resizes pods by *evicting and recreating them* with new resource requests. It is, structurally, a thing that periodically kills your pods on purpose.

## The part nobody warns you about: HPA and VPA on CPU is a fight

Here's the incident, distilled. If you point HPA at CPU utilization *and* point VPA at CPU requests on the *same* deployment, you've built a feedback loop:

1. Load goes up. CPU usage rises relative to the request.
2. HPA sees high utilization, scales out - more replicas.
3. VPA sees "hey, actual usage is higher than what I set," and bumps the CPU request up on the next resize.
4. A higher CPU request lowers utilization-as-a-percentage on the *existing* pods (same absolute usage, bigger denominator).
5. HPA sees utilization drop, scales back in.
6. Fewer, now-bigger pods take more load each, utilization climbs again, and we're back to step 2.

Nothing crashes. Nothing errors. It just... oscillates, forever, while both controllers quietly believe they're doing their job correctly. The official guidance is blunt about this: don't run HPA on CPU/memory and VPA on the same resource for the same workload. Split them - HPA on a custom metric like requests-per-second, VPA in `Off`/recommendation-only mode for a human to review, or just pick one axis per workload.

## Karpenter: neither of the above, one level up

HPA and VPA both assume nodes exist. They're arguing about how to slice up capacity that's already there. Karpenter doesn't care about pod count or pod size directly - it watches for pods stuck in `Pending` because nothing schedulable exists, and provisions *nodes* to fit them, then consolidates and removes nodes when they're underused.

```yaml
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot", "on-demand"]
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
      nodeClassRef:
        name: default
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 30s
```

This is the layer that actually makes HPA and VPA's decisions *land*. HPA can decide to scale to 30 replicas all it wants - if there's no node capacity, those pods just sit `Pending`, and your on-call gets to find out the hard way that "autoscaling" was configured but never actually tested past whatever capacity happened to already be sitting in the cluster.

The three of them form a chain, not a competition, when set up correctly: Karpenter provisions the raw compute, VPA (in recommendation mode, usually) sizes individual pods sanely, and HPA decides how many of those correctly-sized pods you need for current load. The moment two of them try to own the same decision - like CPU sizing - is the moment you get oscillation instead of elasticity.

## What actually fixed it

We moved VPA to `updateMode: "Initial"` (size new pods correctly on creation, never touch running ones) for anything HPA also managed, and let VPA run in full `Auto` only on the handful of singleton stateful workloads that had no horizontal scaling story at all. Karpenter stayed exactly as it was - it was never the problem, it was just the innocent bystander provisioning nodes for a fight it didn't start.

If you're running autoscaling in Kubernetes and you can't immediately answer "which controller resizes CPU on this workload, and is there only one," go check right now. It's a five-minute `kubectl get hpa,vpa -A` away from finding out whether you've got elasticity or a very expensive, very slow argument.
