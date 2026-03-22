---
title: "Kubernetes Resource Limits: Stop Getting Evicted at 3am 😴💀"
date: "2026-03-22"
excerpt: "Your pod keeps getting OOMKilled and you have no idea why? After being paged at 3am three times in one week, I finally learned how Kubernetes resource requests and limits actually work — and how to set them without guessing."
tags: ["devops", "kubernetes", "docker", "deployment"]
featured: true
---

# Kubernetes Resource Limits: Stop Getting Evicted at 3am 😴💀

Let me paint you a picture. It's 3:17am. Your phone is screaming. PagerDuty says production is down. You stumble to your laptop, squint at the screen, and see:

```
Status: OOMKilled
Exit Code: 137
Reason: OOMKilled
```

Your pod got evicted. Again. For the third time this week.

You set the memory limit to `256Mi` because that *seemed* fine. Spoiler: it was not fine.

Welcome to the resource limits rabbit hole — the Kubernetes feature everyone sets wrong, nobody talks about, and absolutely everyone gets paged over at least once.

## Requests vs. Limits: They're Not the Same Thing 🤔

This is the #1 confusion I see. They sound similar but do completely different jobs:

- **Request**: The amount of CPU/memory Kubernetes *reserves* for your pod when scheduling it. The scheduler uses this to decide which node to place the pod on.
- **Limit**: The *maximum* amount your pod is allowed to use. Hit it, and bad things happen.

Think of it like a restaurant reservation (request) vs. a fire code maximum occupancy (limit). The reservation guarantees you a table. The fire code will literally remove people from the building if you exceed it.

Here's what a proper resource spec looks like:

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "1000m"
```

That `250m` CPU means 250 millicores — one quarter of a single CPU core. Think of it as 25% of one CPU's time.

## The Three Ways You're Doing This Wrong 💥

**1. Setting limits without requests (the classic)**

If you only set limits and skip requests, Kubernetes assumes your request equals your limit. Now you've accidentally told the scheduler "this pod needs 2GB to even start" and half your nodes say they're full when they're not. Your deployments slow to a crawl.

**2. Setting CPU limits too low**

CPU throttling is silent and sneaky. Unlike memory (which OOMKills you dramatically), CPU limits just... slow your pod down. Your API starts returning in 800ms instead of 80ms. You spend two days performance profiling before someone checks `kubectl top pods` and sees CPU throttled at 100%.

Remove CPU limits if your workload is bursty. Seriously. CPU requests are enough for scheduling — limits just create artificial bottlenecks.

**3. The "I'll figure it out later" empty spec**

```yaml
# No resources defined — I'll add them later
containers:
  - name: my-app
    image: my-app:latest
```

"Later" never comes. Your pod gets a `BestEffort` QoS class, meaning Kubernetes will evict it *first* when nodes get memory pressure. You are the sacrificial lamb.

## Finding the Right Numbers Without Guessing 🎯

Here's the actual process I use when sizing a new service:

**Step 1: Deploy without limits first (in a non-prod environment)**

```bash
kubectl run load-test --image=my-app:latest --restart=Never
```

**Step 2: Hammer it with realistic load**

Use k6, hey, or whatever load testing tool you prefer. Simulate real traffic patterns, not just "curl 100 times".

**Step 3: Watch the actual usage**

```bash
# Real-time resource usage
kubectl top pods --containers

# Or get fancy with watching
watch -n 2 kubectl top pods
```

Take the peak memory you observed, then add **20-30% headroom** for that as your limit. Set your request to the *average* usage under normal load.

For a Node.js service that peaks at 380MB under load and sits at 120MB at idle, I'd configure:

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    # No CPU limit — let it burst when needed
```

## Quality of Service Classes: Kubernetes Picks Its Favorites 🏆

Kubernetes assigns every pod a QoS class, and this determines eviction order when a node runs low:

| Class | When you get it | Eviction priority |
|-------|----------------|-------------------|
| `Guaranteed` | requests == limits for all containers | Evicted last |
| `Burstable` | requests < limits, or only some set | Middle |
| `BestEffort` | No requests or limits set | Evicted first |

For critical services, aim for `Guaranteed`. For background jobs that can handle occasional restarts, `Burstable` is fine. `BestEffort` is only acceptable for truly throwaway workloads.

Check what class your pods have right now:

```bash
kubectl get pod my-pod -o jsonpath='{.status.qosClass}'
```

If anything critical comes back as `BestEffort`, you've found your 3am pager duty culprit.

## The Vertical Pod Autoscaler: Let Kubernetes Figure It Out

If you're running in GKE, EKS, or AKS, VPA can automatically recommend (or even apply) resource settings based on actual usage history. It's not magic, but it's pretty close:

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: "Off"  # Start with "Off" to just get recommendations
```

After a few days, check what it recommends:

```bash
kubectl describe vpa my-app-vpa
```

It'll show you the actual min/max/target values based on real traffic. Use `"Off"` mode first — you want recommendations, not surprise restarts in production.

## Lessons Learned the Hard Way 📚

After three 3am pages and one very uncomfortable postmortem, here's what I wish someone had told me:

1. **Always set requests.** Always. Even rough ones. BestEffort pods are accidents waiting to happen.
2. **Skip CPU limits for API services.** CPU throttling is silent suffering. Requests handle scheduling; limits just hurt performance.
3. **Memory limits should be generous but real.** 2x your average is a reasonable starting point. 10x means you haven't actually measured anything.
4. **Namespace LimitRanges are your safety net.** Set cluster-level defaults so no one can accidentally deploy without resource specs.
5. **Monitor CPU throttling explicitly.** Add `container_cpu_cfs_throttled_seconds_total` to your dashboards. You'll be shocked what you find.

## Your Next 30 Minutes

1. Run `kubectl top pods --all-namespaces` right now and look for anything suspicious
2. Check `kubectl get pod <name> -o jsonpath='{.status.qosClass}'` on your most critical services
3. For anything returning `BestEffort`, add resource requests today — not "later"
4. Set up a VPA in recommendation mode for your highest-traffic services

Getting evicted at 3am is a choice — and it's one you can stop making.

Your on-call rotations will thank you. Your sleep schedule will thank you. And that one teammate who always seems to get paged at the worst times? They'll send you a gift basket.

---

*Got a resource limits horror story? Found a better way to size containers? Drop it in the comments — I collect these war stories like trading cards.* 👇
