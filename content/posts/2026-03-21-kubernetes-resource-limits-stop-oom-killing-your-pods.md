---
title: "Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM 🚀💀"
date: "2026-03-21"
excerpt: "Your pod keeps getting OOMKilled at 3am and you have no idea why? After getting paged one too many times, I learned that setting proper CPU and memory limits is the difference between a stable cluster and a production dumpster fire."
tags: ["\"devops\"", "\"kubernetes\"", "\"docker\"", "\"infrastructure\""]
featured: "true"
---

# Kubernetes Resource Limits: Stop Letting Your Pods Eat All the RAM 🚀💀

**True story:** I once deployed a Node.js service to Kubernetes without any resource limits. It worked great in staging. Then on Friday afternoon, traffic spiked, the pod started leaking memory, consumed every byte of RAM on the node, and took down *twelve other services* with it. My phone lit up at 2am. My boss called. My boss's boss called. The service was a **newsletter signup form**.

I set resource limits the next morning. I have never been paged for that service again.

Let's make sure you never have to live that story.

## What Are Resource Requests and Limits?

Kubernetes has two knobs for controlling how much CPU and memory a container can use:

- **Requests**: The amount of resources *guaranteed* to your container. The scheduler uses this to decide which node to place the pod on.
- **Limits**: The *maximum* your container can consume. Go over the memory limit? Your pod gets OOMKilled. Exceed the CPU limit? It gets throttled (no kill, just slowdown).

Here's the maddening part most tutorials skip: **requests ≠ limits, and the difference matters enormously.**

## The Minimal Config That Will Save Your Cluster

```yaml
# deployment.yaml
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
        - name: my-api
          image: my-api:latest
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
```

That `100m` CPU? That's 100 millicores — 10% of one CPU core. Kubernetes CPU is measured in millicores where `1000m = 1 core`. Yes, it's a weird unit. Yes, you'll get used to it.

**The golden rule:** Set your request to your *typical* usage and your limit to your *peak acceptable* usage. Never set them equal unless you enjoy throttled pods and angry users.

## The Three Archetypes of Resource-Limit Mistakes

**1. The Optimist (no limits at all)**

```yaml
# 🚨 Don't do this
resources: {}
```

Your pod will happily consume 100% of node resources. When it does, other pods get evicted. You get paged at 2am. We've been over this.

**2. The Overcautious Hoarder (requests too high)**

```yaml
# 🚨 Also bad
resources:
  requests:
    memory: "4Gi"
    cpu: "2000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

If your service actually uses 200Mi of RAM, you've just reserved 4Gi on a node for no reason. Your cluster "runs out of space" while nodes sit at 10% actual utilization. The scheduler sees the requests, not actual usage, and can't place new pods anywhere. Your autoscaler spins up new nodes needlessly. Your AWS bill cries.

**3. The Goldilocks Setup (just right)**

Profile your app in staging under realistic load. Use `kubectl top pods` or your metrics stack (Prometheus + Grafana is the standard). Set requests 20-30% below typical usage, and limits at the highest spike you can tolerate before things start breaking.

## Using LimitRange to Enforce Sanity Cluster-Wide

Rather than trusting every developer on the team to remember resource limits (spoiler: they won't), enforce defaults at the namespace level with a `LimitRange`:

```yaml
# limitrange.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:
        memory: "256Mi"
        cpu: "200m"
      defaultRequest:
        memory: "128Mi"
        cpu: "100m"
      max:
        memory: "2Gi"
        cpu: "2000m"
```

Apply this to your namespace and any pod deployed *without* explicit resource specs automatically gets the defaults. Any pod that tries to request more than `max` gets rejected at admission. It's the seatbelt your cluster didn't know it needed.

## Real-World Lessons the Hard Way

**Lesson 1: OOMKilled is not always a memory leak.**

Sometimes your limit is just too low. Check `kubectl describe pod <name>` and look for `OOMKilled` in the Last State section. Then check actual memory usage at peak with `kubectl top pod`. If the pod is using 240Mi and your limit is 256Mi, you're cutting it close. Bump the limit, not the code.

**Lesson 2: CPU throttling is silent and deadly.**

Unlike OOMKilled, CPU throttling doesn't crash your pod — it just makes it slower. A lot slower. Sometimes 10x slower. If your API latency suddenly doubled after a deploy, check CPU throttle metrics in Prometheus (`container_cpu_cfs_throttled_seconds_total`). Increase your CPU limit before you spend 6 hours refactoring code that was never the problem.

**Lesson 3: Vertical Pod Autoscaler (VPA) is your best friend.**

If you truly don't know what to set, deploy VPA in recommendation mode. It watches actual usage over days and suggests appropriate requests and limits. No guessing, no spreadsheets — just data.

```bash
kubectl describe vpa my-api
# Shows: Lower Bound, Target, Upper Bound for CPU and memory
# Free right-sizing advice from Kubernetes itself
```

## The Quick Checklist

Before deploying anything to production:

- [ ] Every container has explicit `requests` and `limits`
- [ ] Memory limit is at least 1.5x the typical usage
- [ ] CPU request is never more than what you actually need at idle
- [ ] A `LimitRange` exists in your namespace
- [ ] You've checked `kubectl top pods` in staging under load
- [ ] You have alerts on OOMKilled events (your future self will thank you)

## The Takeaway

Resource limits are not optional. They're not "something to add later." They're the difference between a stable production cluster and a cascading failure that takes down unrelated services on a Friday night.

Kubernetes gives you the tools. `LimitRange` gives you the guardrails. `kubectl top` gives you the data. All you have to do is actually use them.

Set your limits. Sleep through the night. Your 2am self is counting on it. 🌙

---

**Got burned by resource limits (or the lack of them)?** Drop your war story in the comments — misery loves company, and your lesson might save someone else's weekend.
