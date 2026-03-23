---
title: "Kubernetes Resource Limits: Stop Your Pods from Eating the Whole Buffet 🍽️💥"
date: "2026-03-11"
excerpt: "Your app is mysteriously crashing in production, random pods are getting killed, and nobody knows why. After surviving several Kubernetes cluster meltdowns, I learned that forgetting resource limits is like inviting a black hole to your birthday party."
tags: ["\\\"kubernetes\\\"", "\\\"devops\\\"", "\\\"docker\\\"", "\\\"deployment\\\""]
featured: "true"
---

# Kubernetes Resource Limits: Stop Your Pods from Eating the Whole Buffet 🍽️💥

**Real confession:** We once deployed a new analytics service to our Kubernetes cluster on a Friday afternoon (already a crime). By Monday morning, every other service on the cluster was dead. The analytics pod had consumed 14 of the 16 available CPU cores, leaving crumbs for the payment service, the auth service, and basically everything else keeping the business alive.

The on-call engineer's Slack message said it all: *"Did we... accidentally deploy a cryptocurrency miner?"*

We had not. We had just forgotten to set resource limits.

Welcome to the most boring lesson with the most dramatic consequences in all of Kubernetes. 🎭

## The Problem: Kubernetes Is a Shared Buffet 🍜

Here's the thing about Kubernetes that nobody warns you about when you're excited about "container orchestration" and "cloud-native deployments":

Every pod on a node shares the same underlying CPU and memory. Without limits, any single pod can gorge itself until other pods starve to death. Kubernetes won't intervene. It'll just watch. The scheduler is not your babysitter.

**The OOMKiller (Out Of Memory Killer)** is the cold, unfeeling process that eventually shows up to deal with the chaos. It picks the worst-offending process and kills it. Sometimes that's your bloated pod. Sometimes it's your payment service that just happened to be nearby. The OOMKiller does not care about your uptime SLA.

## Requests vs Limits: The Core Concept 🧠

Kubernetes has two knobs for resource control, and confusing them is a rite of passage:

**Requests** = "I promise I'll need at least this much." The scheduler uses this to decide which node can fit your pod.

**Limits** = "Don't give me more than this, ever." The runtime enforces this hard ceiling.

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: api
          image: my-api:latest
          resources:
            requests:
              memory: "128Mi"   # Guaranteed minimum
              cpu: "250m"       # 0.25 CPU cores, guaranteed
            limits:
              memory: "512Mi"   # Hard ceiling - exceed this = OOM kill
              cpu: "500m"       # Hard ceiling - exceed this = throttled
```

**The golden rule:** Always set both. Always. No exceptions. Pin this to your monitor. Tattoo it on your forearm. Do whatever it takes.

## What Happens When You Skip Them (Horror Stories) 💀

**Scenario A: Memory Limit Missing**

Your Node.js app has a memory leak. Normally this would be caught and the pod would restart. Without a memory limit, it just keeps growing. And growing. And growing. Until the node's memory is exhausted, the Linux kernel panics, and the OOMKiller starts executing pods at random like a malfunctioning vending machine.

**Scenario B: CPU Limit Missing**

Your machine learning inference service suddenly gets a traffic spike. It grabs 8 CPU cores to handle the load. Your auth service, your API gateway, your database proxy — they're all on the same node, now running at 2% of their normal CPU capacity. Login stops working. Users can't authenticate. Everything looks fine in your dashboards because the metrics service also got throttled and stopped reporting.

This is called a "noisy neighbor" problem, and it will ruin your weekends.

## CPU vs Memory: They're Different Beasts 🐻🐯

Here's a subtle but critical distinction:

**CPU limits** = your pod gets **throttled** (slowed down) when it hits the ceiling. It keeps running, just slower.

**Memory limits** = your pod gets **killed** (OOMKilled) when it hits the ceiling. It dies instantly.

```bash
# Check if your pods are being throttled or killed
kubectl get pods --all-namespaces
# Look for STATUS: OOMKilled - that's a memory limit hit

kubectl describe pod my-api-xyz-abc
# Look for "OOMKilled" in the last state
# Or "Reason: OOMKilled" in Events

# Check CPU throttling (requires metrics-server)
kubectl top pods
# High CPU with weird latency = probably being throttled
```

This means setting your memory limit too low is far more dangerous than setting your CPU limit too low. An over-throttled pod is slow. An over-limited pod is dead.

**Lesson learned the hard way:** Set memory limits conservatively at first, then tune up. Set CPU limits generously, then tune down. A throttled app is embarrassing. A dead app is a 3 AM incident.

## The Right Way to Set Resource Values 🎯

Don't just guess. Here's a systematic approach:

```bash
# Step 1: Run your app locally under realistic load
# Step 2: Check actual resource usage
kubectl top pods -n your-namespace

# Step 3: Look at historical metrics in Grafana/Datadog

# Step 4: Set requests at ~average usage
# Step 5: Set limits at ~2-3x peak usage (for memory)
# Step 6: Leave headroom, then monitor and adjust
```

For a typical Node.js API I've deployed:

```yaml
# After profiling under load: avg 80Mi memory, peaks at 200Mi
# CPU: avg 100m, peaks at 350m
resources:
  requests:
    memory: "128Mi"   # Slightly above average
    cpu: "100m"       # Matches average
  limits:
    memory: "384Mi"   # ~2x peak (room for spikes)
    cpu: "500m"       # ~1.5x peak (throttling is acceptable)
```

The ratio that's saved me most often: **requests ~= average usage, limits ~= 2-3x peak usage**. If your peak is wildly unpredictable, that's a different problem (hello, Horizontal Pod Autoscaler).

## LimitRange: Enforcing Sanity Cluster-Wide 🚔

The best way to prevent your team from deploying limitless pods is to make limits mandatory at the namespace level. Enter `LimitRange`:

```yaml
# kubernetes/limit-range.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:             # Applied if no limit specified
        memory: "256Mi"
        cpu: "200m"
      defaultRequest:      # Applied if no request specified
        memory: "128Mi"
        cpu: "100m"
      max:                 # Nobody can exceed this
        memory: "2Gi"
        cpu: "2000m"
      min:                 # Nobody can go below this
        memory: "64Mi"
        cpu: "50m"
```

```bash
kubectl apply -f limit-range.yaml

# Now if someone deploys without resource limits, they get defaults
# And if they try to request 16GB of RAM, Kubernetes says no
```

Think of `LimitRange` as the "you must be this tall to ride" sign for your cluster. It's boring to configure and priceless when a new engineer deploys their first production pod at midnight.

## Real-World Lessons That Cost Real Money 💸

**Lesson 1: QoS Classes matter for eviction order**

Kubernetes assigns Quality of Service classes based on how you set requests/limits:
- `Guaranteed`: requests == limits (evicted last)
- `Burstable`: requests < limits (evicted second)
- `BestEffort`: no requests or limits set (evicted FIRST)

Your payment service should be `Guaranteed`. Your background analytics job can be `BestEffort`. Set them accordingly, or Kubernetes will evict your critical pods to save your log-rotation cron job. True story.

**Lesson 2: The vertical vs horizontal scaling trap**

When a pod keeps getting OOMKilled, the instinct is to raise the memory limit. Sometimes that's right. But often it's a memory leak that needs fixing, not more RAM. Throwing limits at a leaky app is like buying a bigger bucket for a sinking boat.

**Lesson 3: Namespace-level resource quotas complement limits**

```yaml
# kubernetes/resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: production
spec:
  hard:
    requests.cpu: "4"
    requests.memory: "8Gi"
    limits.cpu: "8"
    limits.memory: "16Gi"
    pods: "20"
```

This caps the entire team's namespace. Great for multi-tenant clusters where one team's runaway deployment shouldn't tank everyone else's SLA.

## Your Action Plan 🚀

**Today:**
1. Run `kubectl get pods -o json | jq '.items[].spec.containers[].resources'` — see which pods have no limits set
2. Be horrified by the results
3. Add a `LimitRange` to every namespace

**This week:**
1. Profile your top 5 services under realistic load
2. Set proper requests and limits based on actual data
3. Add resource checks to your CI/CD pipeline (fail PRs that deploy without limits)

**This month:**
1. Set up `ResourceQuota` per namespace/team
2. Monitor CPU throttling and OOMKill events in your metrics stack
3. Review limits quarterly as your traffic patterns change

---

**Got a Kubernetes horror story where missing resource limits ruined your weekend?** Find me on [LinkedIn](https://www.linkedin.com/in/anuraghkp) — misery loves company, and I want to hear it.

**Working on your first Kubernetes deployment?** Check out my [GitHub](https://github.com/kpanuragh) for real deployment manifests with proper resource configs included from day one.

*Now go set those limits before the OOMKiller comes for your favorite pod.* 🔪🐳

---

**P.S.** The analytics service from my opening story? It turned out to be running an N+1 query loop in a goroutine with no timeout. Resource limits would have contained the blast radius. Proper code review would have prevented it. We got both lessons for the price of one very bad Monday.
